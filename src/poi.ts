import * as THREE from 'three';
import { POI } from './config';
import { NOISE_GLSL } from './shaders';

// ポイ：枠・紙・持ち手。紙は濡れ・ひび・破れをシェーダーで描く
export class PoiModel {
  group = new THREE.Group();
  frame: THREE.Mesh;
  paper: THREE.Mesh;
  handle: THREE.Group;
  paperMat: THREE.ShaderMaterial;
  constructor(env: THREE.Texture) {
    const R = POI.radius;
    const plastic = new THREE.MeshStandardMaterial({ color: '#f25c8a', roughness: 0.35, metalness: 0 });
    this.frame = new THREE.Mesh(new THREE.TorusGeometry(R + 0.006, 0.0075, 10, 72), plastic);
    this.frame.rotation.x = Math.PI / 2;
    this.paperMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        uWet: { value: 0 }, uDamage: { value: 0 }, uTear: { value: 0 }, uFade: { value: 1 }, uSeed: { value: Math.random() * 10 }, uEnv: { value: env },
        uLightDir: { value: new THREE.Vector3(0.25, 1, 0.35).normalize() },
      },
      vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.); vWorld=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: /* glsl */ `
        ${NOISE_GLSL}
        uniform float uWet, uDamage, uTear, uSeed, uFade; uniform vec3 uLightDir;
        varying vec2 vUv; varying vec3 vWorld;
        void main(){
          vec2 p=(vUv-.5)*2.;
          float r=length(p);
          float ang=atan(p.y,p.x);
          // 破れ：中心から不規則に広がる穴
          float jag=fbm(vec2(ang*3.,uSeed)+p*4.)*.55+fbm(p*14.+uSeed)*.2;
          float hole=uTear*(1.25-jag);
          if(r<hole) discard;
          // 傷んだ紙に開く小さな穴
          float pin=fbm(p*9.+uSeed*3.);
          if(uDamage>.55 && pin<(uDamage-.55)*.55) discard;
          float fiber=fbm(p*40.+uSeed)*.5+fbm(vec2(p.x*120.,p.y*12.))*.25;
          vec3 dry=vec3(.97,.96,.93)*(.92+.08*fiber);
          vec3 wet=vec3(.62,.74,.78)*(.9+.1*fiber);
          vec3 col=mix(dry,wet,uWet);
          // ひび：ノイズの等高線を細い線にする
          float cr=abs(fbm(p*5.+uSeed*1.7)-.5);
          float crack=(1.-smoothstep(.0,.012+.02*uDamage,cr))*smoothstep(.15,.6,uDamage);
          col=mix(col,vec3(.55,.6,.62),crack*.8);
          float a=mix(.96,.2,uWet)+crack*.35;
          // 破れた縁はささくれて白い
          float rim=1.-smoothstep(0.,.06,r-hole);
          col=mix(col,vec3(1.),rim*uTear*.6);
          a=max(a,rim*uTear*.9);
          float l=max(dot(vec3(0.,1.,0.),normalize(uLightDir)),0.)*.6+.5;
          gl_FragColor=vec4(col*l,a*uFade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.paper = new THREE.Mesh(new THREE.CircleGeometry(R, 72), this.paperMat);
    this.paper.rotation.x = -Math.PI / 2;
    this.paper.renderOrder = 3;
    // 持ち手は手前（+z）へ伸び、上へ傾く
    this.handle = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.2), plastic);
    stem.position.set(0, 0, 0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
    grip.position.set(0, 0.002, 0.15);
    this.handle.add(stem, grip);
    this.handle.position.set(0, 0, R + 0.002);
    this.handle.rotation.x = -0.35;
    this.group.add(this.frame, this.paper, this.handle);
    this.group.traverse((o) => o.layers.enable(1));
  }
  // fade: 狙っている間は紙を透かして、下の影を見えるようにする
  setState(wet: number, damage: number, tear: number, fade = 1) {
    const u = this.paperMat.uniforms;
    u.uWet.value = wet; u.uDamage.value = damage; u.uTear.value = tear; u.uFade.value = fade;
  }
  newPaper() {
    this.paperMat.uniforms.uSeed.value = Math.random() * 10;
    this.setState(0, 0, 0);
  }
}
