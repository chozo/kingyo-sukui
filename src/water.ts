import * as THREE from 'three';
import { RENDER, TANK } from './config';
import { CAUSTIC_GLSL, NOISE_GLSL } from './shaders';

const MAX_DROPS = 16;

// 屋台の裸電球の方向（水面のきらめき用）。奥の上方に並ぶ
const BULBS = Array.from({ length: 10 }, (_, i) => {
  const az = -Math.PI / 2 + (i - 4.5) * 0.16;
  const el = 0.55 + (i % 3) * 0.14;
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
});

// GPUで解く高さ場の波。R=高さ、G=速度
export class WaterSim {
  private rts: THREE.WebGLRenderTarget[];
  private idx = 0;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private drops: THREE.Vector4[] = [];
  constructor(private renderer: THREE.WebGLRenderer) {
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    this.rts = [new THREE.WebGLRenderTarget(RENDER.simW, RENDER.simH, opt), new THREE.WebGLRenderTarget(RENDER.simW, RENDER.simH, opt)];
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uTexel: { value: new THREE.Vector2(1 / RENDER.simW, 1 / RENDER.simH) },
        uDrops: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()) },
        uDropCount: { value: 0 },
        uDamping: { value: RENDER.simDamping },
        uAspect: { value: new THREE.Vector2(TANK.w, TANK.d) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uPrev; uniform vec2 uTexel; uniform vec4 uDrops[${MAX_DROPS}]; uniform int uDropCount; uniform float uDamping; uniform vec2 uAspect;
        varying vec2 vUv;
        void main(){
          vec4 c=texture2D(uPrev,vUv);
          float h=c.r, v=c.g;
          float avg=(texture2D(uPrev,vUv+vec2(uTexel.x,0.)).r+texture2D(uPrev,vUv-vec2(uTexel.x,0.)).r
                    +texture2D(uPrev,vUv+vec2(0.,uTexel.y)).r+texture2D(uPrev,vUv-vec2(0.,uTexel.y)).r)*.25;
          v+=(avg-h)*1.9; v*=uDamping; h+=v; h*=.9995;
          for(int i=0;i<${MAX_DROPS};i++){
            if(i>=uDropCount) break;
            vec4 d=uDrops[i];
            float r=length((vUv-d.xy)*uAspect)/d.z;
            if(r<1.) h+=d.w*(.5+.5*cos(r*3.14159));
          }
          gl_FragColor=vec4(h,v,0.,1.);
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
  }
  get texture() { return this.rts[this.idx].texture; }
  // 水槽座標(x,z)に波源を置く。r=半径、s=強さ（負で押し下げ）
  drop(x: number, z: number, r: number, s: number) {
    if (this.drops.length >= MAX_DROPS) return;
    this.drops.push(new THREE.Vector4(x / TANK.w + 0.5, 0.5 - z / TANK.d, r, s));
  }
  step() {
    const u = this.mat.uniforms;
    const n = this.drops.length;
    for (let i = 0; i < n; i++) (u.uDrops.value as THREE.Vector4[])[i].copy(this.drops[i]);
    u.uDropCount.value = n;
    this.drops.length = 0;
    u.uPrev.value = this.rts[this.idx].texture;
    this.idx ^= 1;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rts[this.idx]);
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(prev);
  }
}

// 高さ場から法線を作る共通部分
const HEIGHT_NORMAL_GLSL = /* glsl */ `
uniform sampler2D uHeight; uniform vec2 uSimTexel;
vec2 tankUv(vec3 wp){ return vec2(wp.x/${TANK.w.toFixed(3)}+.5, .5-wp.z/${TANK.d.toFixed(3)}); }
float hAt(vec2 uv){ return texture2D(uHeight,uv).r; }
`;

export function makeSurfaceMaterial(env: THREE.Texture, sim: WaterSim) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeight: { value: sim.texture },
      uSimTexel: { value: new THREE.Vector2(1 / RENDER.simW, 1 / RENDER.simH) },
      uRefract: { value: null as THREE.Texture | null },
      uEnv: { value: env },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0.25, 1, 0.35).normalize() },
      uBulbs: { value: BULBS },
    },
    vertexShader: /* glsl */ `
      ${HEIGHT_NORMAL_GLSL}
      varying vec3 vWorld; varying vec2 vTUv;
      void main(){
        vec4 wp=modelMatrix*vec4(position,1.);
        vTUv=tankUv(wp.xyz);
        wp.y+=hAt(vTUv);
        vWorld=wp.xyz;
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      ${HEIGHT_NORMAL_GLSL}
      ${NOISE_GLSL}
      uniform sampler2D uRefract; uniform sampler2D uEnv; uniform vec2 uRes; uniform float uTime; uniform vec3 uLightDir; uniform vec3 uBulbs[${BULBS.length}];
      varying vec3 vWorld; varying vec2 vTUv;
      vec3 envSample(vec3 d){
        vec2 uv=vec2(atan(d.z,d.x)/6.28318+.5, asin(clamp(d.y,-1.,1.))/3.14159+.5);
        vec3 c=texture2D(uEnv,uv).rgb;
        float l=dot(c,vec3(.3,.59,.11));
        return c*(1.+smoothstep(.5,1.,l)*3.); // 明るい提灯だけ強く光らせる
      }
      void main(){
        vec2 e=uSimTexel;
        float hx=hAt(vTUv+vec2(e.x,0.))-hAt(vTUv-vec2(e.x,0.));
        float hz=hAt(vTUv-vec2(0.,e.y))-hAt(vTUv+vec2(0.,e.y));
        vec3 n=normalize(vec3(-hx/(2.*e.x*${TANK.w.toFixed(3)}), 1., -hz/(2.*e.y*${TANK.d.toFixed(3)})));
        // 常に揺れている細かな波
        vec2 p=vWorld.xz*9.;
        float t=uTime;
        vec2 dn=vec2(vnoise(p+vec2(t*.6,t*.4))-vnoise(p+vec2(.13,0.)+vec2(t*.6,t*.4)),
                     vnoise(p*1.7-vec2(t*.5,t*.7))-vnoise(p*1.7+vec2(0.,.13)-vec2(t*.5,t*.7)));
        n=normalize(n+vec3(dn.x,0.,dn.y)*.28);
        vec3 V=normalize(cameraPosition-vWorld);
        float ndv=max(dot(n,V),0.);
        float F=.02+.98*pow(1.-ndv,5.);
        vec2 suv=gl_FragCoord.xy/uRes;
        vec3 refr=texture2D(uRefract, suv+n.xz*vec2(.06,-.06)).rgb;
        refr=mix(refr*vec3(.84,.96,.95),vec3(.05,.17,.18),.28); // 少し濁った水の色
        vec3 R=reflect(-V,n);
        vec3 refl=envSample(R);
        float spec=pow(max(dot(R,uLightDir),0.),420.)*3.;
        for(int i=0;i<${BULBS.length};i++) spec+=pow(max(dot(R,uBulbs[i]),0.),5000.)*2.5;
        vec3 col=mix(refr,refl,F)+spec*vec3(1.,.95,.85);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// 水槽の底と内壁。コースティクスを乗せる
export function makeInteriorMaterial(sim: WaterSim, base: THREE.Color, causticAmt: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeight: { value: sim.texture },
      uSimTexel: { value: new THREE.Vector2(1 / RENDER.simW, 1 / RENDER.simH) },
      uTime: { value: 0 },
      uBase: { value: base },
      uCaustic: { value: causticAmt },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN;
      void main(){ vec4 wp=modelMatrix*vec4(position,1.); vWorld=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `
      ${HEIGHT_NORMAL_GLSL}
      ${NOISE_GLSL}
      ${CAUSTIC_GLSL}
      uniform float uTime; uniform vec3 uBase; uniform float uCaustic;
      varying vec3 vWorld; varying vec3 vN;
      void main(){
        vec2 uv=tankUv(vWorld+vec3(-.04,0.,-.06)*(-vWorld.y)/.2);
        vec2 e=uSimTexel*2.;
        float lap=hAt(uv+vec2(e.x,0.))+hAt(uv-vec2(e.x,0.))+hAt(uv+vec2(0.,e.y))+hAt(uv-vec2(0.,e.y))-4.*hAt(uv);
        float c=caustic(vWorld.xz*6.5, uTime*.9);
        float ripple=clamp(-lap*260.,-0.6,1.6);
        float light=.72+uCaustic*(c*.38+ripple*.5);
        float depthShade=mix(1.,.72,clamp(-vWorld.y/.25,0.,1.));
        float wall=abs(vN.y)<.5?.82:1.;
        vec3 col=uBase*light*depthShade*wall;
        gl_FragColor=vec4(col,1.);
      }`,
  });
}
