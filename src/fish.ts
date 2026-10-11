import * as THREE from 'three';
import { ITEMS, Item, ItemId, TANK } from './config';
import { fishGeometry, makeShadowMaterial } from './fishModel';

export const APPARENT_DEPTH = 0.75;

export type ShadowState = 'swim' | 'caught' | 'drop' | 'gone';

const floorShadowMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uOpacity: { value: 0.4 }, uSoft: { value: 0.5 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uOpacity, uSoft; varying vec2 vUv;
    void main(){ vec2 p=(vUv-.5)*2.; float d=length(p); float a=1.-smoothstep(1.-uSoft,1.,d); gl_FragColor=vec4(0.,.02,.02,a*uOpacity); }`,
});

let seedCounter = 1;

// 水中を泳ぐ影。正体（item）はすくうまで見せない
export class Fish {
  sp: Item;
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  shadowMatI: THREE.ShaderMaterial;
  pos = new THREE.Vector3();
  heading = 0;
  speed: number;
  depth: number;
  targetDepth: number;
  phase = Math.random() * 10;
  bend = 0;
  state: ShadowState = 'swim';
  target = new THREE.Vector2();
  retarget = 0;
  pendingTurn: number | null = null;
  previewT = 0;
  fleeT = 0;
  rel = new THREE.Vector3();
  vy = 0;
  kg: number; // すくったときに表示する重さ
  readonly seed: number;
  private len: number;

  constructor(id: ItemId, scene: THREE.Scene, entering: boolean) {
    this.sp = ITEMS[id];
    this.seed = (seedCounter++ * 0.6180339) % 1;
    this.kg = this.sp.kg[0] + Math.random() * (this.sp.kg[1] - this.sp.kg[0]);
    // 影の長さと形には少しばらつきを持たせ、形だけで正体がわからないようにする
    this.len = this.sp.shadow * (0.88 + Math.random() * 0.24);
    this.mat = makeShadowMaterial();
    this.mesh = new THREE.Mesh(fishGeometry('funa'), this.mat);
    const slim = this.sp.slim ?? 0.8 + Math.random() * 0.5;
    this.mesh.scale.set(this.len, this.len * Math.min(1, slim + 0.2), this.len * slim);
    this.mesh.layers.set(1);
    this.mesh.renderOrder = 2;
    this.shadowMatI = floorShadowMat.clone();
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMatI);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.layers.set(1);
    this.shadow.renderOrder = 1;
    scene.add(this.mesh, this.shadow);
    this.speed = this.sp.speed * (0.8 + Math.random() * 0.4);
    this.depth = this.targetDepth = this.sp.depth[0] + Math.random() * (this.sp.depth[1] - this.sp.depth[0]);
    const mx = TANK.w / 2 - this.len * 0.45, mz = TANK.d / 2 - this.len * 0.45;
    if (entering) {
      const left = Math.random() < 0.5;
      this.pos.set(left ? -mx : mx, 0, (Math.random() - 0.5) * mz * 1.4);
      this.heading = left ? 0 : Math.PI;
    } else {
      this.pos.set((Math.random() - 0.5) * 2 * mx, 0, (Math.random() - 0.5) * 2 * mz);
      this.heading = Math.random() * Math.PI * 2;
    }
    this.pickTarget();
  }

  get length() { return this.len; }

  pickTarget() {
    const mx = TANK.w / 2 - this.len * 0.5, mz = TANK.d / 2 - this.len * 0.5;
    this.target.set((Math.random() - 0.5) * 2 * mx, (Math.random() - 0.5) * 2 * mz);
    this.retarget = 2 + Math.random() * 4;
    this.targetDepth = this.sp.depth[0] + Math.random() * (this.sp.depth[1] - this.sp.depth[0]);
  }

  // カメラから見て水面上のどこに見えているか（判定は見た目に合わせる）
  apparent(cam: THREE.Vector3) {
    const y = -this.depth * APPARENT_DEPTH;
    const t = cam.y / (cam.y - y);
    return new THREE.Vector2(cam.x + (this.pos.x - cam.x) * t, cam.z + (this.pos.z - cam.z) * t);
  }

  update(dt: number, time: number, poi: { x: number; z: number; speed: number; inWater: boolean }, others: Fish[]) {
    if (this.state !== 'swim') return;
    const sp = this.sp;
    const len = this.len;
    const mx = TANK.w / 2 - len * 0.45, mz = TANK.d / 2 - len * 0.45;
    this.retarget -= dt;
    let desired = Math.atan2(-(this.target.y - this.pos.z), this.target.x - this.pos.x);
    let speedMul = 1;
    // ポイから逃げる。速く動くほど遠くから気づく。ハズレは逃げない
    if (poi.inWater && sp.shyness > 0) {
      const dx = this.pos.x - poi.x, dz = this.pos.z - poi.z;
      const d = Math.hypot(dx, dz);
      const alarm = len * sp.shyness + Math.max(0, poi.speed - 0.12) * 0.9;
      if (d < alarm && poi.speed > 0.12) {
        this.fleeT = 0.6;
        desired = Math.atan2(-dz, dx);
      }
    }
    if (this.fleeT > 0) { this.fleeT -= dt; speedMul = 2.6; }
    for (const o of others) {
      if (o === this || o.state !== 'swim') continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz), min = (len + o.len) * 0.35;
      if (d < min && d > 1e-4) { this.pos.x += (dx / d) * (min - d) * 0.5 * dt * 4; this.pos.z += (dz / d) * (min - d) * 0.5 * dt * 4; }
    }
    const ahead = len * 0.8;
    const ax = this.pos.x + Math.cos(this.heading) * ahead, az = this.pos.z - Math.sin(this.heading) * ahead;
    if (Math.abs(ax) > mx || Math.abs(az) > mz) { this.pickTarget(); desired = Math.atan2(this.pos.z, -this.pos.x); }
    if (this.retarget < 0 || Math.hypot(this.target.x - this.pos.x, this.target.y - this.pos.z) < len) this.pickTarget();

    let diff = Math.atan2(Math.sin(desired - this.heading), Math.cos(desired - this.heading));
    if (this.fleeT <= 0 && Math.abs(diff) > 1.2 && this.pendingTurn === null) { this.pendingTurn = desired; this.previewT = 0.4; }
    let bendTarget = THREE.MathUtils.clamp(diff, -1, 1) * 0.35;
    if (this.pendingTurn !== null) {
      this.previewT -= dt;
      const pd = Math.atan2(Math.sin(this.pendingTurn - this.heading), Math.cos(this.pendingTurn - this.heading));
      bendTarget = Math.sign(pd) * 0.5;
      if (this.previewT > 0) { diff = 0; speedMul *= 0.6; } else { diff = pd; if (Math.abs(pd) < 0.2) this.pendingTurn = null; }
    }
    const junk = sp.kind !== 'fish'; // ハズレと宝箱は漂うだけ
    if (junk) bendTarget *= 0.3;
    const maxTurn = sp.turn * (this.fleeT > 0 ? 1.8 : 1) * dt;
    this.heading += THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);
    this.bend += (bendTarget - this.bend) * Math.min(1, dt * 6);
    const v = this.speed * speedMul * (0.85 + 0.15 * Math.sin(time * 0.7 + this.seed * 20));
    this.pos.x = THREE.MathUtils.clamp(this.pos.x + Math.cos(this.heading) * v * dt, -mx, mx);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z - Math.sin(this.heading) * v * dt, -mz, mz);
    this.depth += (this.targetDepth - this.depth) * dt * 0.4;
    // 生き物でない物は尾を振らずに漂う（よく見れば見分けられる）
    this.phase += dt * (junk ? 1.2 : (5 + 9 * (v / len)) * (len > 0.3 ? 0.6 : 1));
    this.mat.uniforms.uAmp.value = junk ? 0.012 : 0.035 + Math.min(0.05, (v / len) * 0.02);
  }

  sync() {
    const m = this.mesh;
    const under = this.state === 'swim' || (this.state === 'drop' && this.pos.y < 0);
    m.position.set(this.pos.x, this.state === 'swim' ? -this.depth * APPARENT_DEPTH : this.pos.y, this.pos.z);
    if (this.state === 'swim') m.rotation.set(0, this.heading, 0);
    const u = this.mat.uniforms;
    u.uPhase.value = this.phase;
    u.uBend.value = this.bend;
    u.uFog.value = under ? THREE.MathUtils.clamp(this.depth / 0.2, 0, 1) : 0;
    m.layers.set(under ? 1 : 0);
    const floorY = -TANK.depth;
    this.shadow.visible = under;
    this.shadow.position.set(this.pos.x + 0.04 * (TANK.depth - this.depth), floorY + 0.002, this.pos.z + 0.06 * (TANK.depth - this.depth));
    const h = (TANK.depth - this.depth) / TANK.depth;
    this.shadow.rotation.z = this.heading;
    this.shadow.scale.set(this.len * (0.95 + h * 0.5), this.len * (0.28 + h * 0.3), 1);
    this.shadowMatI.uniforms.uOpacity.value = 0.35 - h * 0.15;
    this.shadowMatI.uniforms.uSoft.value = 0.5 + h * 0.45;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh, this.shadow);
    this.mat.dispose();
    this.shadowMatI.dispose();
    this.shadow.geometry.dispose();
  }
}
