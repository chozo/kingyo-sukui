import * as THREE from 'three';
import { TANK } from './config';
import { makeInteriorMaterial, WaterSim } from './water';

// 夏祭りの夜空と提灯を描いた正距円筒図（水面と魚体の映り込みに使う）
export function makeEnvTexture() {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b1230');
  sky.addColorStop(0.38, '#26244a');
  sky.addColorStop(0.5, '#5a3b4a');
  sky.addColorStop(0.53, '#1a1414');
  sky.addColorStop(1, '#0a0808');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // 屋台の白い天幕と裸電球（真上付近）
  for (let i = 0; i < 9; i++) {
    const x = (i / 9) * W + 30;
    const grd = g.createRadialGradient(x, 70, 0, x, 70, 70);
    grd.addColorStop(0, 'rgba(255,248,225,1)'); grd.addColorStop(0.15, 'rgba(255,236,200,0.9)'); grd.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = grd; g.fillRect(x - 70, 0, 140, 140);
  }
  // 提灯の列
  const rnd = (s: number) => { const x = Math.sin(s * 91.7) * 4375.85; return x - Math.floor(x); };
  for (let row = 0; row < 3; row++) {
    const y = 150 + row * 42;
    for (let i = 0; i < 26; i++) {
      const x = ((i + row * 0.5) / 26) * W;
      const r = 13 - row * 2.5;
      const red = rnd(i + row * 30) < 0.6;
      const grd = g.createRadialGradient(x, y, 0, x, y, r * 3);
      grd.addColorStop(0, red ? 'rgba(255,200,140,1)' : 'rgba(255,250,230,1)');
      grd.addColorStop(0.3, red ? 'rgba(235,70,40,0.95)' : 'rgba(255,230,180,0.9)');
      grd.addColorStop(1, 'rgba(120,30,20,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, r * 3, r * 3.4, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // 人影のような暗い帯
  g.fillStyle = 'rgba(10,8,12,0.85)';
  for (let i = 0; i < 40; i++) { const x = rnd(i * 7) * W, w = 20 + rnd(i * 3) * 40, h = 30 + rnd(i * 5) * 50; g.fillRect(x, 262 - h, w, h + 6); }
  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function buildTank(scene: THREE.Scene, sim: WaterSim) {
  const { w, d, depth, wall, rim } = TANK;
  const interiors: THREE.ShaderMaterial[] = [];
  const blue = new THREE.Color('#4aa6c4');
  const floorMat = makeInteriorMaterial(sim, blue.clone().multiplyScalar(1.05), 1);
  const wallMat = makeInteriorMaterial(sim, blue.clone().multiplyScalar(0.9), 0.08);
  interiors.push(floorMat, wallMat);
  // 内側（水中パスで描く）
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -depth;
  const mk = (gw: number, gh: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), wallMat);
    m.position.set(x, -depth / 2 + rim / 2, z); m.rotation.y = ry; return m;
  };
  const walls = [mk(w, depth + rim, 0, -d / 2, 0), mk(w, depth + rim, 0, d / 2, Math.PI), mk(d, depth + rim, -w / 2, 0, Math.PI / 2), mk(d, depth + rim, w / 2, 0, -Math.PI / 2)];
  for (const m of [floor, ...walls]) { m.layers.set(1); scene.add(m); }

  // 外側と縁（水上パス）
  const plastic = new THREE.MeshStandardMaterial({ color: '#4fb3dc', roughness: 0.28, metalness: 0, envMapIntensity: 1.2 });
  const outerH = depth + rim + 0.01;
  const ow = w + wall * 2, od = d + wall * 2;
  const rimY = rim;
  const parts: [number, number, number, number, number][] = [
    [ow, wall, 0, -(d / 2 + wall / 2), 0], [ow, wall, 0, d / 2 + wall / 2, 0],
    [wall, d, -(w / 2 + wall / 2), 0, 0], [wall, d, w / 2 + wall / 2, 0, 0],
  ];
  for (const [bx, bz, x, z] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bx, outerH, bz), plastic);
    m.position.set(x, rimY - outerH / 2, z);
    scene.add(m);
  }
  // 内壁の水面より上の部分（水上パスでも見える）
  const upperWall = new THREE.MeshStandardMaterial({ color: '#5cc0e6', roughness: 0.3, envMapIntensity: 1.2 });
  const up = (gw: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(gw, rim), upperWall);
    m.position.set(x, rim / 2, z); m.rotation.y = ry; scene.add(m);
  };
  up(w, 0, -d / 2 + 0.0005, 0); up(w, 0, d / 2 - 0.0005, Math.PI); up(d, -w / 2 + 0.0005, 0, Math.PI / 2); up(d, w / 2 - 0.0005, 0, -Math.PI / 2);

  // 台（赤い布）
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#7a1418'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,120,110'},${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const clothTex = new THREE.CanvasTexture(cv); clothTex.colorSpace = THREE.SRGBColorSpace; clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping; clothTex.repeat.set(6, 6);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.95 }));
  table.rotation.x = -Math.PI / 2; table.position.y = -depth - 0.01;
  scene.add(table);
  return { interiors };
}
