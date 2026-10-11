import * as THREE from 'three';
import { ItemId, PropId } from './config';
import { fishGeometry, hasFishModel, makeFishMaterial } from './fishModel';
import { buildProp } from './propModels';

function backdrop(kind: 'normal' | 'escaped' | 'gold') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 512;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(128, 190, 10, 128, 220, 320);
  if (kind === 'escaped') { grd.addColorStop(0, '#3a3f4a'); grd.addColorStop(1, '#07080b'); }
  else if (kind === 'gold') { grd.addColorStop(0, '#a8792a'); grd.addColorStop(0.45, '#4a3010'); grd.addColorStop(1, '#0d0804'); }
  else { grd.addColorStop(0, '#2f6f8f'); grd.addColorStop(0.45, '#123047'); grd.addColorStop(1, '#05080f'); }
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 正体画面用のスタジオ風の映り込み（上に大きな白い照明）
function studioEnv() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#f4f7fa'); grd.addColorStop(0.35, '#9fb4c4'); grd.addColorStop(0.55, '#4a6274'); grd.addColorStop(1, '#151c24');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(40, 30, 120, 50); g.fillRect(300, 40, 160, 40);
  const t = new THREE.CanvasTexture(cv);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dropSprite() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(26, 24, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(200,235,255,0.8)'); grd.addColorStop(1, 'rgba(160,210,240,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
  return new THREE.CanvasTexture(cv);
}

// すくった物の正体を見せる場面
export class Showcase {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 9 / 16, 0.1, 50);
  private holder = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private fishMat: THREE.ShaderMaterial | null = null;
  private drops: THREE.Points;
  private dropVel: Float32Array;
  private t = 0;
  private prop = false;
  private bg = { normal: backdrop('normal'), escaped: backdrop('escaped'), gold: backdrop('gold') };
  private dropMat: THREE.PointsMaterial;

  private env: THREE.Texture;
  constructor(renderer: THREE.WebGLRenderer) {
    this.env = studioEnv();
    this.scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(this.env).texture;
    this.camera.position.set(0, 0, 3.4);
    this.camera.lookAt(0, -0.15, 0);
    const key = new THREE.DirectionalLight('#fff4e0', 2.6); key.position.set(1, 2, 3);
    const rim = new THREE.DirectionalLight('#7fd0ff', 1.6); rim.position.set(-2, 1, -2);
    this.scene.add(key, rim, new THREE.AmbientLight('#8098b0', 0.6), this.holder);
    this.holder.position.y = 0.25;
    const n = 120;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dropVel = new Float32Array(n * 3);
    this.dropMat = new THREE.PointsMaterial({ map: dropSprite(), size: 0.07, transparent: true, opacity: 0.9, depthWrite: false });
    this.drops = new THREE.Points(geo, this.dropMat);
    this.scene.add(this.drops);
  }

  show(id: ItemId, escaped: boolean, gold = false) {
    if (this.model) { this.holder.remove(this.model); }
    this.fishMat?.dispose();
    this.fishMat = null;
    this.prop = !hasFishModel(id);
    if (!hasFishModel(id)) {
      this.model = buildProp(id as PropId);
    } else {
      this.fishMat = makeFishMaterial(id, Math.random(), this.env);
      const u = this.fishMat.uniforms;
      u.uUnder.value = 0; u.uWet.value = 1; u.uFlop.value = escaped ? 0 : 1; u.uFog.value = 0;
      u.uLightDir.value = new THREE.Vector3(0.3, 0.7, 0.8).normalize();
      if (id === 'unagi') u.uAmp.value = 0.11; // 体をくねらせる
      this.model = new THREE.Mesh(fishGeometry(id), this.fishMat);
    }
    this.holder.add(this.model);
    this.scene.background = escaped ? this.bg.escaped : gold ? this.bg.gold : this.bg.normal;
    // 宝箱は水しぶきの代わりに金色の光が舞う
    this.dropMat.color.set(gold && !escaped ? '#ffd860' : '#ffffff');
    this.t = 0;
    // 水しぶき
    const p = this.drops.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, (Math.random() - 0.5) * 0.8, 0.1 + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4);
      this.dropVel.set([(Math.random() - 0.5) * 2.4, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 1.2], i * 3);
    }
    p.needsUpdate = true;
    this.update(0);
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    // 下から勢いよく現れて、少し行き過ぎてから止まる
    const k = Math.min(1, t / 0.45);
    const pop = 1 + Math.sin(k * Math.PI) * 0.12;
    const rise = (1 - Math.pow(1 - k, 3));
    this.holder.position.y = -1.2 + rise * 1.45;
    this.holder.scale.setScalar(pop * (0.6 + 0.4 * rise));
    if (this.model) {
      if (this.prop) {
        this.model.rotation.set(0.25 + Math.sin(t * 0.8) * 0.1, t * 0.9, 0.15);
        (this.model.userData.update as ((t: number) => void) | undefined)?.(t);
      } else {
        // ウナギは体の横のうねりが見えるよう、背中側から見せる
        const eel = this.fishMat ? this.fishMat.uniforms.uAmp.value > 0.1 : false;
        this.model.rotation.set((eel ? 1.05 : 0) + Math.sin(t * 0.9) * 0.15, (eel ? -0.2 : -0.5) + Math.sin(t * 0.7) * (eel ? 0.25 : 0.6), 0.35);
        if (this.fishMat) this.fishMat.uniforms.uPhase.value = t * (this.fishMat.uniforms.uAmp.value > 0.1 ? 8 : 14);
      }
    }
    const p = this.drops.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      this.dropVel[i * 3 + 1] -= 6 * dt;
      p.setXYZ(i, p.getX(i) + this.dropVel[i * 3] * dt, p.getY(i) + this.dropVel[i * 3 + 1] * dt, p.getZ(i) + this.dropVel[i * 3 + 2] * dt);
    }
    p.needsUpdate = true;
    if (this.fishMat) this.fishMat.uniforms.uTime.value = t;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
