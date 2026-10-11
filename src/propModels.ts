import * as THREE from 'three';
import { PropId } from './config';

// ハズレの立体。どれも長さがおよそ1になるように作る

function canLabel() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#d8262b'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#f3f0e8';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(80 + i * 170, 128, 46, 90, 0.3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#d8262b'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center';
  for (let i = 0; i < 3; i++) g.fillText('SODA', 80 + i * 170, 146);
  // 水あかと傷
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '60,50,30' : '255,255,255'},${Math.random() * 0.15})`; g.fillRect(Math.random() * 512, Math.random() * 256, 3, 1 + Math.random() * 3); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildCan() {
  const group = new THREE.Group();
  const r = 0.17, h = 0.62;
  const body = new THREE.CylinderGeometry(r, r, h, 48, 24, true);
  // 真ん中あたりを片側だけへこませる
  const p = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ang = Math.atan2(z, x);
    const dent = Math.exp(-Math.pow((y - 0.05) / 0.12, 2)) * Math.max(0, Math.cos(ang - 0.6)) * 0.07;
    const k = 1 - dent / r;
    p.setXYZ(i, x * k, y, z * k);
  }
  body.computeVertexNormals();
  const label = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ map: canLabel(), metalness: 0.6, roughness: 0.35 }));
  const metal = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.9, roughness: 0.3 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r, 0.04, 48), metal);
  top.position.y = h / 2 + 0.02;
  const bottom = top.clone(); bottom.rotation.x = Math.PI; bottom.position.y = -h / 2 - 0.02;
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 8, 20), metal);
  tab.rotation.x = Math.PI / 2; tab.position.set(0.05, h / 2 + 0.045, 0);
  group.add(label, top, bottom, tab);
  group.rotation.z = Math.PI / 2; // 横倒し
  const wrap = new THREE.Group(); wrap.add(group);
  return wrap;
}

function buildBoot() {
  const rubber = new THREE.MeshStandardMaterial({ color: '#23302a', roughness: 0.55, metalness: 0 });
  const sole = new THREE.MeshStandardMaterial({ color: '#2b1d14', roughness: 0.9 });
  const group = new THREE.Group();
  // 筒（少し前に傾け、上をすぼめる）
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.62, 32, 1, true), rubber);
  shaft.position.set(-0.12, 0.38, 0);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 10, 32), rubber);
  rim.rotation.x = Math.PI / 2; rim.position.set(-0.12, 0.69, 0);
  // 足の部分
  const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 8, 24), rubber);
  foot.rotation.z = Math.PI / 2; foot.scale.set(1, 1, 0.82);
  foot.position.set(0.08, 0.1, 0);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), rubber);
  heel.scale.set(1, 0.9, 0.85); heel.position.set(-0.13, 0.12, 0);
  const soleM = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 16), sole);
  soleM.rotation.z = Math.PI / 2; soleM.scale.set(0.35, 1, 1.15);
  soleM.position.set(0.05, -0.05, 0);
  // 足首の黄色い線
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.163, 0.012, 8, 32), new THREE.MeshStandardMaterial({ color: '#d6b73a', roughness: 0.5 }));
  stripe.rotation.x = Math.PI / 2; stripe.position.set(-0.12, 0.6, 0);
  group.add(shaft, rim, foot, heel, soleM, stripe);
  group.position.y = -0.3;
  const wrap = new THREE.Group(); wrap.add(group);
  return wrap;
}

function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function wheel(rust: THREE.Material, tire: THREE.Material, bent: number) {
  const g = new THREE.Group();
  const R = 0.3;
  const tireGeo = new THREE.TorusGeometry(R, 0.028, 10, 64);
  const rimGeo = new THREE.TorusGeometry(R - 0.03, 0.012, 8, 64);
  // 曲がった車輪：円をゆがめ、面の外へねじる
  for (const geo of [tireGeo, rimGeo]) {
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(y, x);
      p.setXYZ(i, x * (1 - bent * 0.25 * Math.max(0, Math.cos(a - 0.8))), y, z + bent * 0.18 * Math.sin(a * 2));
    }
    geo.computeVertexNormals();
  }
  g.add(new THREE.Mesh(tireGeo, tire), new THREE.Mesh(rimGeo, rust));
  for (let i = 0; i < 12; i++) {
    if (bent > 0 && i % 4 === 1) continue; // 折れたスポーク
    const a = (i / 12) * Math.PI * 2;
    const end = new THREE.Vector3(Math.cos(a) * (R - 0.04) * (1 - bent * 0.25 * Math.max(0, Math.cos(a - 0.8))), Math.sin(a) * (R - 0.04), bent * 0.18 * Math.sin(a * 2));
    g.add(tube(new THREE.Vector3(0, 0, 0), end, 0.004, rust));
  }
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12).rotateX(Math.PI / 2), rust));
  return g;
}

function buildBike() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#3f6e8c'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${120 + Math.random() * 60},${50 + Math.random() * 30},20,${0.4 + Math.random() * 0.5})`; c.beginPath(); c.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 7, 0, 7); c.fill(); }
  const rustTex = new THREE.CanvasTexture(cv); rustTex.colorSpace = THREE.SRGBColorSpace; rustTex.wrapS = rustTex.wrapT = THREE.RepeatWrapping;
  const frameMat = new THREE.MeshStandardMaterial({ map: rustTex, metalness: 0.4, roughness: 0.7 });
  const rust = new THREE.MeshStandardMaterial({ color: '#8a5a32', metalness: 0.5, roughness: 0.75 });
  const tire = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.85 });
  const g = new THREE.Group();
  const rear = wheel(rust, tire, 0); rear.position.set(-0.52, 0, 0);
  const front = wheel(rust, tire, 1); front.position.set(0.52, 0, 0); front.rotation.y = 0.35;
  const V = (x: number, y: number) => new THREE.Vector3(x, y, 0);
  const bb = V(-0.05, -0.02), seat = V(-0.18, 0.4), head = V(0.38, 0.38), headLow = V(0.42, 0.24);
  g.add(rear, front,
    tube(bb, seat, 0.022, frameMat), tube(seat, head, 0.02, frameMat), tube(bb, headLow, 0.024, frameMat),
    tube(bb, V(-0.52, 0), 0.014, frameMat), tube(seat, V(-0.52, 0), 0.012, frameMat),
    tube(head, V(0.52, 0), 0.018, frameMat), tube(head, V(0.36, 0.52), 0.016, rust));
  // ハンドル（ずれている）
  const bar = tube(new THREE.Vector3(0.34, 0.52, -0.2), new THREE.Vector3(0.38, 0.55, 0.2), 0.013, rust);
  bar.rotation.z += 0.3;
  const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 6, 12), new THREE.MeshStandardMaterial({ color: '#2a1a12', roughness: 0.8 }));
  saddle.rotation.z = Math.PI / 2; saddle.position.set(-0.2, 0.46, 0); saddle.rotation.y = 0.4;
  const crank = tube(V(-0.12, -0.1), V(0.02, 0.06), 0.012, rust);
  // からまった水草
  const weed = new THREE.MeshStandardMaterial({ color: '#4d6b2a', roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.25, 1, 6), weed);
    const pos = s.geometry.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j < pos.count; j++) pos.setX(j, pos.getX(j) + Math.sin(pos.getY(j) * 14 + i) * 0.03);
    s.position.set(-0.4 + i * 0.2, 0.1 - (i % 2) * 0.2, 0.03);
    s.rotation.z = (i - 2) * 0.3;
    g.add(s);
  }
  g.add(bar, saddle, crank);
  g.scale.setScalar(0.9);
  return g;
}

function spotTexture(base: string, spot: string, n: number) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) {
    g.fillStyle = spot; g.globalAlpha = 0.25 + Math.random() * 0.4;
    g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 7, 2 + Math.random() * 5, Math.random() * 3, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 腕などの先細りの管。曲線に沿って太さを r0 から r1 へ変える
function taperTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, mat: THREE.Material, seg = 40) {
  const radial = 10;
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, c);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function buildTako() {
  const skin = new THREE.MeshStandardMaterial({ map: spotTexture('#b8462e', '#6e1f14', 260), roughness: 0.42, metalness: 0 });
  const pale = new THREE.MeshStandardMaterial({ color: '#f0c9b0', roughness: 0.5 });
  const g = new THREE.Group();
  // 頭（胴）。後ろへ少し傾ける
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), skin);
  mantle.scale.set(1, 1.35, 1.05); mantle.position.set(-0.04, 0.3, 0); mantle.rotation.z = 0.35;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 28, 20), skin);
  face.scale.set(1.05, 0.85, 1.1); face.position.set(0.04, 0.08, 0);
  g.add(mantle, face);
  // 目
  for (const z of [0.1, -0.1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ color: '#e8d9a0', roughness: 0.3 }));
    eye.position.set(0.11, 0.13, z);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.03), new THREE.MeshStandardMaterial({ color: '#111' }));
    pupil.position.set(0.142, 0.13, z);
    g.add(eye, pupil);
  }
  // 8本の腕。根元から外へ広がり、先は丸まる
  const arms: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const curl = 0.08 + (i % 3) * 0.03;
    const pts = [
      new THREE.Vector3(0.03, -0.02, 0).addScaledVector(dir, 0.06),
      new THREE.Vector3(0.03, -0.12, 0).addScaledVector(dir, 0.2),
      new THREE.Vector3(0.03, -0.2, 0).addScaledVector(dir, 0.38),
      new THREE.Vector3(0.03, -0.18, 0).addScaledVector(dir, 0.54).addScaledVector(side, curl),
      new THREE.Vector3(0.03, -0.08, 0).addScaledVector(dir, 0.6).addScaledVector(side, curl * 2.2),
      new THREE.Vector3(0.03, -0.02, 0).addScaledVector(dir, 0.52).addScaledVector(side, curl * 2.8),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const arm = new THREE.Group();
    arm.add(taperTube(curve, 0.055, 0.008, skin));
    // 吸盤（腕の下側）
    for (let k = 1; k < 9; k++) {
      const t = k / 10;
      const pnt = curve.getPointAt(t);
      const sucker = new THREE.Mesh(new THREE.SphereGeometry(0.014 * (1 - t * 0.7), 8, 6), pale);
      sucker.position.copy(pnt).add(new THREE.Vector3(0, -0.035 * (1 - t * 0.8), 0));
      sucker.scale.y = 0.5;
      arm.add(sucker);
    }
    arms.push(arm);
    g.add(arm);
  }
  g.position.y = 0.0;
  g.scale.setScalar(0.82);
  g.userData.update = (t: number) => {
    arms.forEach((arm, i) => { arm.rotation.x = Math.sin(t * 3 + i) * 0.08; arm.rotation.z = Math.sin(t * 2.4 + i * 1.7) * 0.06; });
    mantle.scale.set(1 + Math.sin(t * 3) * 0.04, 1.35 - Math.sin(t * 3) * 0.04, 1.05);
  };
  const wrap = new THREE.Group(); wrap.add(g);
  wrap.userData.update = g.userData.update;
  return wrap;
}

function woodTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#6b3f1f'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) { g.fillStyle = '#3e220f'; g.fillRect(0, y, 256, 3); }
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,20,8' : '150,95,50'},${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * 256;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + 6, 170, y - 6, 256, y + 2); g.stroke();
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,90,50,${Math.random() * 0.35})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 14, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildTakara() {
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e0b240', metalness: 1, roughness: 0.28 });
  const coinMat = new THREE.MeshStandardMaterial({ color: '#ffd45a', metalness: 1, roughness: 0.2, emissive: '#7a5200', emissiveIntensity: 0.5 });
  const W = 0.72, D = 0.44, H = 0.36;
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wood);
  base.position.y = H / 2;
  g.add(base);
  // 金の帯と角金具
  for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, H + 0.01, D + 0.02), gold);
    band.position.set(x, H / 2, 0); g.add(band);
  }
  const rimBand = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.04, D + 0.02), gold);
  rimBand.position.y = H - 0.02; g.add(rimBand);
  // 中身：金貨の山と宝石
  for (let i = 0; i < 70; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 16), coinMat);
    const r = Math.random();
    coin.position.set((Math.random() - 0.5) * (W - 0.1), H - 0.01 + (1 - r * r) * 0.09 * Math.random() + 0.02, (Math.random() - 0.5) * (D - 0.1));
    coin.rotation.set(Math.random() * 0.8, Math.random() * 3, Math.random() * 0.8);
    g.add(coin);
  }
  const gemColors = ['#e0203a', '#20c060', '#3060ff', '#c040e0'];
  for (let i = 0; i < 6; i++) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), new THREE.MeshStandardMaterial({ color: gemColors[i % 4], metalness: 0.2, roughness: 0.05, emissive: gemColors[i % 4], emissiveIntensity: 0.35 }));
    gem.position.set((Math.random() - 0.5) * (W - 0.2), H + 0.07, (Math.random() - 0.5) * (D - 0.15));
    gem.scale.y = 1.4;
    g.add(gem);
  }
  // こぼれた金貨
  for (let i = 0; i < 5; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 16), coinMat);
    coin.position.set(-0.2 + i * 0.1, 0.04 + i * 0.03, D / 2 + 0.02); coin.rotation.x = 1.2;
    g.add(coin);
  }
  // ふた（半円柱）。奥の辺を軸に開く
  const lid = new THREE.Group();
  const lidGeo = new THREE.CylinderGeometry(D / 2, D / 2, W, 32, 1, false, 0, Math.PI);
  lidGeo.rotateZ(Math.PI / 2); // 軸を横向きにし、半円を上に向ける
  const lidMesh = new THREE.Mesh(lidGeo, wood);
  lidMesh.position.z = D / 2;
  lid.add(lidMesh);
  for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(D / 2 + 0.006, 0.02, 8, 24, Math.PI), gold);
    arc.rotation.y = Math.PI / 2; arc.position.set(x, 0, D / 2); lid.add(arc);
  }
  lid.position.set(0, H, -D / 2);
  lid.rotation.x = -1.1;
  g.add(lid);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.02), gold);
  lock.position.set(0, H - 0.07, D / 2 + 0.01); g.add(lock);
  // 中から漏れる光
  const glow = new THREE.PointLight('#ffcf60', 2.5, 1.5);
  glow.position.set(0, H + 0.25, 0.05); g.add(glow);
  g.position.y = -0.2;
  g.userData.update = (t: number) => { lid.rotation.x = -1.1 - Math.abs(Math.sin(t * 2.2)) * 0.12 * Math.max(0, 1 - t * 0.4); glow.intensity = 2.2 + Math.sin(t * 5) * 0.5; };
  const wrap = new THREE.Group(); wrap.add(g);
  wrap.userData.update = g.userData.update;
  return wrap;
}

export function buildProp(id: PropId) {
  if (id === 'tako') return buildTako();
  if (id === 'takara') return buildTakara();
  if (id === 'can') return buildCan();
  if (id === 'boot') return buildBoot();
  return buildBike();
}
