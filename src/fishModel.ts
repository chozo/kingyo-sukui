import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SpeciesId } from './config';
import { CAUSTIC_GLSL, NOISE_GLSL } from './shaders';

// 体長1で作り、表示時に縮尺する。頭が+x、尾が-x、背が+y
interface Shape {
  bodyLen: number; // 胴の長さ（全長に対する割合、残りが尾びれ）
  width: number; // 最大の半幅
  height: number; // 最大の半高
  maxAt: number; // 最も太い位置（胴の中の割合）
  head: number; // 頭の丸さ。小さいほど尖る
  neck: number; // 尾の付け根の太さ
  tailH: number; // 尾びれの半高
  fork: number; // 尾びれの切れ込み（0〜1）
  dorsal: [number, number, number]; // 背びれ 開始, 終了, 高さ
  anal: [number, number, number];
  pectoral: number; // 胸びれの長さ
  finlets: boolean;
  colors: { back: string; side: string; belly: string; fin: string };
  pattern: number; // 0無地 1更紗 2紅白 3ブリの線 4マグロ 5サンマ
  shine: number; // 銀色の強さ
}

const SHAPES: Record<SpeciesId, Shape> = {
  unagi: { bodyLen: 0.94, width: 0.04, height: 0.05, maxAt: 0.25, head: 0.45, neck: 0.55, tailH: 0.06, fork: 0, dorsal: [0.38, 1.0, 0.03], anal: [0.5, 1.0, 0.026], pectoral: 0.035, finlets: false,
    colors: { back: '#262b1a', side: '#5a5a34', belly: '#d8cc94', fin: '#33361f' }, pattern: 0, shine: 0.6 },
  kingyo: { bodyLen: 0.68, width: 0.12, height: 0.2, maxAt: 0.36, head: 0.62, neck: 0.22, tailH: 0.24, fork: 0.55, dorsal: [0.32, 0.72, 0.14], anal: [0.7, 0.88, 0.07], pectoral: 0.13, finlets: false,
    colors: { back: '#c92a0e', side: '#f0501c', belly: '#f6c69a', fin: '#f2461a' }, pattern: 1, shine: 0.25 },
  funa: { bodyLen: 0.78, width: 0.1, height: 0.17, maxAt: 0.38, head: 0.6, neck: 0.3, tailH: 0.18, fork: 0.45, dorsal: [0.3, 0.75, 0.08], anal: [0.74, 0.9, 0.06], pectoral: 0.11, finlets: false,
    colors: { back: '#4f5136', side: '#9b9468', belly: '#dcd7c0', fin: '#6b6544' }, pattern: 0, shine: 0.55 },
  koi: { bodyLen: 0.8, width: 0.11, height: 0.14, maxAt: 0.34, head: 0.66, neck: 0.32, tailH: 0.17, fork: 0.35, dorsal: [0.3, 0.8, 0.07], anal: [0.76, 0.9, 0.05], pectoral: 0.13, finlets: false,
    colors: { back: '#f3efe6', side: '#f5f1ea', belly: '#f7f3ee', fin: '#efe8de' }, pattern: 2, shine: 0.35 },
  sanma: { bodyLen: 0.88, width: 0.035, height: 0.06, maxAt: 0.42, head: 0.3, neck: 0.25, tailH: 0.09, fork: 0.85, dorsal: [0.7, 0.78, 0.04], anal: [0.72, 0.8, 0.035], pectoral: 0.05, finlets: true,
    colors: { back: '#1b2f52', side: '#8fa4bd', belly: '#eef2f6', fin: '#59657a' }, pattern: 5, shine: 1.0 },
  buri: { bodyLen: 0.82, width: 0.075, height: 0.11, maxAt: 0.4, head: 0.45, neck: 0.16, tailH: 0.17, fork: 0.85, dorsal: [0.32, 0.78, 0.04], anal: [0.62, 0.8, 0.035], pectoral: 0.08, finlets: false,
    colors: { back: '#1f4c58', side: '#9cb3b8', belly: '#eef1f2', fin: '#c8b04a' }, pattern: 3, shine: 0.85 },
  maguro: { bodyLen: 0.8, width: 0.11, height: 0.14, maxAt: 0.42, head: 0.62, neck: 0.1, tailH: 0.25, fork: 0.95, dorsal: [0.3, 0.42, 0.11], anal: [0.62, 0.7, 0.07], pectoral: 0.14, finlets: true,
    colors: { back: '#0c1630', side: '#5d6f88', belly: '#e6ebf0', fin: '#26304a' }, pattern: 4, shine: 0.8 },
};

function profile(s: Shape, u: number) {
  // u: 0=口先, 1=尾の付け根
  if (u < s.maxAt) {
    const k = u / s.maxAt;
    return Math.pow(Math.sin((k * Math.PI) / 2), s.head);
  }
  const k = (u - s.maxAt) / (1 - s.maxAt);
  return s.neck + (1 - s.neck) * Math.pow(Math.cos((k * Math.PI) / 2), 1.1);
}

// a: 全長に対する位置(0頭〜1尾先), part: 0胴 1ひれ 2目, f: ひれ内の座標
function withAttrs(g: THREE.BufferGeometry, part: number, fin: (i: number, p: THREE.Vector3) => [number, number] = () => [0, 0]) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  const a = new Float32Array(n), pt = new Float32Array(n), ff = new Float32Array(n * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    a[i] = 0.5 - v.x;
    pt[i] = part;
    const [f0, f1] = fin(i, v);
    ff[i * 2] = f0; ff[i * 2 + 1] = f1;
  }
  g.setAttribute('aAlong', new THREE.BufferAttribute(a, 1));
  g.setAttribute('aPart', new THREE.BufferAttribute(pt, 1));
  g.setAttribute('aFin', new THREE.BufferAttribute(ff, 2));
  if (g.index) g = g.toNonIndexed();
  return g;
}

function gridGeometry(nu: number, nv: number, f: (u: number, v: number) => [number, number, number], doubleSided = false) {
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const [x, y, z] = f(i / nu, j / nv);
    pos.push(x, y, z); uvs.push(i / nu, j / nv);
  }
  const row = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
    if (doubleSided) idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildGeometry(id: SpeciesId) {
  const s = SHAPES[id];
  const L = s.bodyLen;
  const x0 = 0.5; // 口先
  const xAt = (u: number) => x0 - u * L;
  const parts: THREE.BufferGeometry[] = [];

  // 胴。断面は楕円、腹側を少し膨らませる
  const body = gridGeometry(48, 28, (u, v) => {
    const th = v * Math.PI * 2;
    const p = profile(s, u);
    const tipRound = u < 0.02 ? 0.02 : 0;
    const w = s.width * p + tipRound * 0.2, h = s.height * p;
    const sy = Math.sin(th), cz = Math.cos(th);
    const belly = sy < 0 ? 1 + 0.12 * (1 - u) : 1;
    return [xAt(u), h * sy * belly - h * 0.05, w * cz];
  }, false);
  parts.push(withAttrs(body, 0, (i) => {
    const uv = body.attributes.uv as THREE.BufferAttribute;
    const th = uv.getY(i) * Math.PI * 2;
    return [uv.getX(i), Math.sin(th)]; // 胴内の位置, 背腹(-1腹〜1背)
  }));

  // 尾びれ
  const xt = xAt(1);
  const tailLen = 1 - L;
  const tail = gridGeometry(10, 16, (u, v) => {
    const t = v * 2 - 1;
    const reach = s.fork + (1 - s.fork) * Math.pow(Math.abs(t), 0.8);
    const h0 = s.height * s.neck * 0.9;
    const reachT = 1 - s.fork + s.fork * reach;
    return [xt + 0.01 - u * tailLen * reachT * (id === 'kingyo' ? 1.15 : 1), t * (h0 + (s.tailH - h0) * Math.pow(u, 0.7)), 0];
  });
  parts.push(withAttrs(tail, 1, (i) => {
    const uv = tail.attributes.uv as THREE.BufferAttribute;
    return [uv.getX(i), uv.getY(i) * 2 - 1];
  }));

  const finAlong = (spec: [number, number, number], top: boolean, lean: number) => {
    const [ua, ub, fh] = spec;
    const g = gridGeometry(10, 4, (u, v) => {
      const uu = ua + (ub - ua) * u;
      const p = profile(s, uu);
      const base = (s.height * p * (top ? 1 : -1.08)) - s.height * p * 0.05;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7) * (1 - 0.5 * u);
      return [xAt(uu) - v * lean * fh, base + (top ? 1 : -1) * v * fh * env, 0];
    });
    return withAttrs(g, 1, (i) => {
      const uv = g.attributes.uv as THREE.BufferAttribute;
      return [uv.getX(i), uv.getY(i)];
    });
  };
  parts.push(finAlong(s.dorsal, true, id === 'maguro' ? 1.2 : 0.5));
  parts.push(finAlong(s.anal, false, id === 'maguro' ? 1.2 : 0.4));

  // 胸びれ（左右）
  for (const side of [1, -1]) {
    const ua = 0.27;
    const p = profile(s, ua);
    const g = gridGeometry(6, 3, (u, v) => {
      const len = s.pectoral;
      const x = xAt(ua) - u * len * 0.9;
      const y = -s.height * p * 0.35 + (v - 0.5) * len * 0.45 * (1 - u * 0.6) - u * len * 0.2;
      const z = side * (s.width * p * 0.95 + u * len * 0.45);
      return [x, y, z];
    });
    parts.push(withAttrs(g, 1, (i) => {
      const uv = g.attributes.uv as THREE.BufferAttribute;
      return [uv.getX(i), uv.getY(i)];
    }));
  }

  // 小離鰭（マグロ・サンマ）
  if (s.finlets) {
    for (let k = 0; k < 6; k++) {
      const uu = 0.8 + k * 0.032;
      const p = profile(s, uu);
      for (const top of [1, -1]) {
        const sz = s.height * 0.22;
        const g = gridGeometry(1, 1, (u, v) => [xAt(uu) - u * sz * 0.8, top * (s.height * p * 0.95 + v * sz * (1 - u)), 0]);
        parts.push(withAttrs(g, 1, () => [0.5, 2]));
      }
    }
  }

  // 目
  for (const side of [1, -1]) {
    const ue = s.head < 0.4 ? 0.07 : 0.1;
    const p = profile(s, ue);
    const r = Math.max(0.018, s.height * 0.16);
    const g = new THREE.SphereGeometry(r, 12, 8);
    g.translate(xAt(ue), s.height * p * 0.25, side * s.width * p * 0.88);
    parts.push(withAttrs(g, 2));
  }

  const merged = mergeGeometries(parts, false)!;
  merged.computeBoundingSphere();
  return merged;
}

const geoCache = new Map<SpeciesId, THREE.BufferGeometry>();
export function fishGeometry(id: SpeciesId) {
  let g = geoCache.get(id);
  if (!g) { g = buildGeometry(id); geoCache.set(id, g); }
  return g;
}

const SWIM_VERT = /* glsl */ `
      attribute float aAlong; attribute float aPart; attribute vec2 aFin;
      uniform float uPhase, uAmp, uBend, uFlop;
      varying vec3 vN; varying vec3 vWorld; varying float vAlong; varying float vPart; varying vec2 vFin; varying vec3 vLocal;
      void main(){
        vec3 p=position; vec3 n=normal;
        float s=clamp(aAlong,0.,1.2);
        float a=uAmp*(.12+s*s*1.5);
        float k=6.2831*1.1;
        float lat=a*sin(k*s-uPhase)+uBend*s*s;
        float dlat=a*k*cos(k*s-uPhase)+2.*uBend*s;
        // 陸に上がった魚は体ごと跳ねる
        lat+=uFlop*sin(uPhase*1.7)*(s-.4)*.5;
        p.z+=lat;
        float ang=atan(dlat);
        n.xz=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*n.xz;
        vec4 wp=modelMatrix*vec4(p,1.);
        vWorld=wp.xyz; vN=normalize(mat3(modelMatrix)*n);
        vAlong=aAlong; vPart=aPart; vFin=aFin; vLocal=position;
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`;

export function makeFishMaterial(id: SpeciesId, seed: number, env: THREE.Texture) {
  const s = SHAPES[id];
  const c = (h: string) => new THREE.Color(h);
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uAmp: { value: 0.06 },
      uBend: { value: 0 },
      uFlop: { value: 0 },
      uFog: { value: 0 },
      uWet: { value: 0 },
      uSeed: { value: seed },
      uPattern: { value: s.pattern },
      uShine: { value: s.shine },
      uBack: { value: c(s.colors.back) },
      uSide: { value: c(s.colors.side) },
      uBelly: { value: c(s.colors.belly) },
      uFinCol: { value: c(s.colors.fin) },
      uEnv: { value: env },
      uLightDir: { value: new THREE.Vector3(0.25, 1, 0.35).normalize() },
      uUnder: { value: 1 },
    },
    vertexShader: SWIM_VERT,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      ${CAUSTIC_GLSL}
      uniform float uTime, uFog, uWet, uSeed, uShine, uUnder; uniform int uPattern;
      uniform vec3 uBack, uSide, uBelly, uFinCol, uLightDir; uniform sampler2D uEnv;
      varying vec3 vN; varying vec3 vWorld; varying float vAlong; varying float vPart; varying vec2 vFin; varying vec3 vLocal;
      vec3 envSample(vec3 d){ vec2 uv=vec2(atan(d.z,d.x)/6.28318+.5, asin(clamp(d.y,-1.,1.))/3.14159+.5); return texture2D(uEnv,uv).rgb; }
      void main(){
        vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
        vec3 V=normalize(cameraPosition-vWorld);
        vec3 col; float alpha=1.; float spec=0.;
        float side=vFin.y; // -1腹〜1背
        float u=vFin.x;
        if(vPart<.5){
          col=mix(uBelly,uSide,smoothstep(-.75,.05,side));
          col=mix(col,uBack,smoothstep(.15,.85,side));
          vec2 q=vec2(u*40., side*7.)+uSeed*13.;
          float nz=fbm(vec2(u*5.,side*2.)+uSeed*7.);
          if(uPattern==1){ // 更紗の白
            float wmask=smoothstep(.56,.62,fbm(vec2(u*4.,side*1.6)+uSeed*3.1));
            col=mix(col,vec3(.93,.9,.86),wmask*step(.5,fract(uSeed*3.7)));
          } else if(uPattern==2){ // 紅白
            float r=smoothstep(.47,.53,fbm(vec2(u*3.5,side*1.4)+uSeed*5.3))*smoothstep(-.3,.2,side);
            col=mix(col,vec3(.78,.12,.04),r);
          } else if(uPattern==3){ // ブリの黄色い線
            float band=exp(-pow((side-.12)/.07,2.))*smoothstep(.02,.15,u)*smoothstep(1.,.75,u);
            col=mix(col,vec3(.85,.72,.18),band*.85);
          } else if(uPattern==4){ // マグロ
            col=mix(uBelly,uSide,smoothstep(-.7,-.1,side));
            col=mix(col,uBack,smoothstep(.0+nz*.15,.3+nz*.15,side));
          } else if(uPattern==5){ // サンマ。口先が黄色い
            col=mix(uBelly,uSide,smoothstep(-.2,.15,side));
            col=mix(col,uBack,smoothstep(.22,.4,side));
            col=mix(col,vec3(.85,.62,.15),smoothstep(.03,0.,u));
          }
          // 鱗
          vec2 sc=vec2(u*(uPattern==5?90.:46.), side*(uPattern==5?6.:9.));
          sc.y+=step(1.,mod(floor(sc.x),2.))*.5;
          vec2 f=fract(sc)-.5;
          float scale=smoothstep(.25,.5,length(f*vec2(1.,1.2)));
          col*=1.-scale*.18*(1.-float(uPattern==4||uPattern==5)*.6);
          // エラ蓋の線
          col*=1.-.35*exp(-pow((u-(uPattern==5?.12:.2))/.01,2.))*smoothstep(.8,.2,abs(side));
          spec=uShine;
        } else if(vPart<1.5){
          col=uFinCol;
          float rays=.5+.5*sin(vFin.y*(uPattern==1?70.:40.));
          col*=.85+.25*rays;
          float edge=vFin.x;
          alpha=mix(.92,.55,edge)*(uPattern==1?.85:1.);
          if(uPattern==4 && vFin.y>1.5) col=vec3(.9,.75,.15); // 黄色い小離鰭
          if(uPattern==3 && vFin.y>1.5) col=vec3(.85,.7,.2);
          spec=.2;
        } else {
          col=vec3(.02); spec=1.5;
          vec3 c=vec3(.8,.6,.2)*smoothstep(.6,.9,dot(N,V))*.0;
          col+=c;
        }
        vec3 L=normalize(uLightDir);
        float diff=max(dot(N,L),0.)*.75+.35;
        // 下からの照り返しは弱く
        diff+=max(-N.y,0.)*.08;
        vec3 H=normalize(L+V);
        float sp=pow(max(dot(N,H),0.),60.)*spec;
        // 銀色の映り込み
        vec3 R=reflect(-V,N);
        vec3 refl=envSample(R)*(uUnder>.5?vec3(.55,.75,.8):vec3(1.));
        float fr=pow(1.-max(dot(N,V),0.),3.);
        vec3 lit=col*diff + sp*vec3(1.,.97,.9) + refl*uShine*(.18+.5*fr)*(vPart<.5?1.:.3);
        if(uUnder>.5){
          float cst=caustic(vWorld.xz*6.5,uTime*.9);
          lit+=col*cst*.25*max(N.y,0.);
        }
        lit+=uWet*pow(max(dot(N,H),0.),200.)*1.2;
        // 水の深さで青く沈む
        vec3 waterCol=vec3(.10,.30,.38);
        lit=mix(lit,waterCol,uFog);
        gl_FragColor=vec4(lit,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function hasFishModel(id: string): id is SpeciesId { return id in SHAPES; }

// 水中の魚影。正体がわからないよう、色を持たない暗い影として描く
export function makeShadowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uPhase: { value: 0 }, uAmp: { value: 0.06 }, uBend: { value: 0 }, uFlop: { value: 0 }, uFog: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: SWIM_VERT,
    fragmentShader: /* glsl */ `
      uniform float uFog, uOpacity;
      varying vec3 vN; varying vec3 vWorld; varying float vAlong; varying float vPart; varying vec2 vFin;
      void main(){
        vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
        vec3 V=normalize(cameraPosition-vWorld);
        // 輪郭ほど薄くしてぼかす
        float core=smoothstep(.0,.75,abs(dot(N,V)));
        float a=(vPart<.5?.85*core+.1:.28)*(1.-uFog*.55)*uOpacity;
        if(vPart>1.5) a=0.;
        gl_FragColor=vec4(vec3(.015,.03,.03),a);
      }`,
  });
}
