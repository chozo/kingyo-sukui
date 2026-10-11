import * as THREE from 'three';
import './style.css';
import { EVENTS, GAME, ITEMS, ItemId, MAX_SHADOWS, POI, RENDER, START_SHADOWS, TANK } from './config';
import { buildTank, makeEnvTexture } from './env';
import { Fish } from './fish';
import { PoiModel } from './poi';
import { makeSurfaceMaterial, WaterSim } from './water';
import { Showcase } from './showcase';
import { Sfx } from './audio';

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const stage = $('#stage');
const canvas = $<HTMLCanvasElement>('#c');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#120c0c');
const camera = new THREE.PerspectiveCamera(36, 9 / 16, 0.05, 20);
camera.position.set(0, 1.8, 1.72);
camera.lookAt(0, -0.12, 0.2);

const envTex = makeEnvTexture();
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromEquirectangular(envTex).texture;
scene.environment = envMap;

const hemi = new THREE.HemisphereLight('#ffe6c8', '#2a1410', 0.9);
const sun = new THREE.DirectionalLight('#fff3e0', 2.2);
sun.position.set(0.25, 1, 0.35);
for (const l of [hemi, sun]) { l.layers.enableAll(); scene.add(l); }

const sim = new WaterSim(renderer);
const tank = buildTank(scene, sim);
const surfaceMat = makeSurfaceMaterial(envTex, sim);
const surface = new THREE.Mesh(new THREE.PlaneGeometry(TANK.w, TANK.d, 100, 150), surfaceMat);
surface.rotation.x = -Math.PI / 2;
scene.add(surface);

const refractRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 0 });
surfaceMat.uniforms.uRefract.value = refractRT.texture;

const poi = new PoiModel(envTex);
scene.add(poi.group);
// 狙っている間、水面に着水する位置の輪を出す
const aimRing = new THREE.Mesh(
  new THREE.RingGeometry(POI.radius * 0.97, POI.radius * 1.05, 72),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }),
);
aimRing.rotation.x = -Math.PI / 2;
aimRing.renderOrder = 5;
scene.add(aimRing);
const HOME = new THREE.Vector3(0.18, POI.hoverY, TANK.d / 2 - POI.radius - 0.08);

const showcase = new Showcase(renderer);
const sfx = new Sfx();

// ---------- ゲーム状態 ----------
type Mode = 'title' | 'play' | 'reveal' | 'end';
// ready: 水面の上で待機 / aim: ドラッグで空中を移動中 / dip: 着水中 / water: 水中 / lift: すくい上げ中 / torn: 破れた
type PoiState = 'ready' | 'aim' | 'dip' | 'water' | 'lift' | 'torn';
interface Reveal { id: ItemId; kg: number; escaped: boolean }
const S = {
  mode: 'title' as Mode,
  time: 0,
  left: GAME.duration,
  score: 0,
  poiLeft: GAME.poiCount,
  strength: POI.strength,
  wet: 0,
  tear: 0,
  poiState: 'ready' as PoiState,
  poiT: 0,
  poiPos: HOME.clone(),
  poiFrom: new THREE.Vector3(),
  poiVel: new THREE.Vector2(),
  speed: 0, // 水槽幅/秒
  target: new THREE.Vector2(HOME.x, HOME.z),
  grabOffset: new THREE.Vector2(),
  dragging: false,
  fish: [] as Fish[],
  carried: [] as Fish[],
  log: [] as Reveal[],
  eventIdx: 0,
  respawn: [] as number[],
  lastResult: '' as '' | 'caught' | 'torn' | 'empty',
  dripT: 0,
  hinted: { water: false },
  fade: 1, // 紙の透け具合（表示用）
  reveals: [] as Reveal[],
  revealIdx: 0,
  revealT: 0,
};

function randomItem(): ItemId {
  // 大物はイベントで入ってくるまで補充に混ぜない
  const ids = (Object.keys(ITEMS) as ItemId[]).filter((id) => S.time >= 20 || (id !== 'maguro' && id !== 'bike'));
  const total = ids.reduce((a, id) => a + ITEMS[id].pool, 0);
  let r = Math.random() * total;
  for (const id of ids) { r -= ITEMS[id].pool; if (r <= 0) return id; }
  return 'kingyo';
}

function populate() {
  for (let i = 0; i < START_SHADOWS; i++) spawn(randomItem(), false);
}

function resetGame() {
  for (const f of S.fish) f.dispose(scene);
  S.fish = []; S.carried = [];
  Object.assign(S, { time: 0, left: GAME.duration, score: 0, poiLeft: GAME.poiCount, strength: POI.strength, wet: 0, tear: 0, poiState: 'ready', poiT: 0, eventIdx: 0, respawn: [], log: [], dragging: false, lastResult: '', reveals: [], revealIdx: 0 });
  S.poiPos.copy(HOME); S.target.set(HOME.x, HOME.z);
  S.hinted.water = false;
  poi.newPaper();
}

function spawn(id: ItemId, entering: boolean) {
  const f = new Fish(id, scene, entering);
  S.fish.push(f);
  return f;
}

// ---------- 入力 ----------
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function toWorld(cx: number, cy: number) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, hit) ? new THREE.Vector2(hit.x, hit.z) : null;
}
function toScreen(v: THREE.Vector3) {
  const r = canvas.getBoundingClientRect();
  const p = v.clone().project(camera);
  return new THREE.Vector2((p.x * 0.5 + 0.5) * r.width + r.left, (-p.y * 0.5 + 0.5) * r.height + r.top);
}
function clampToTank(v: THREE.Vector2) {
  const m = POI.radius * 0.9;
  v.x = THREE.MathUtils.clamp(v.x, -TANK.w / 2 + m, TANK.w / 2 - m);
  v.y = THREE.MathUtils.clamp(v.y, -TANK.d / 2 + m, TANK.d / 2 - m);
  return v;
}

let hintTimer = 0;
function showHint(t: string) { const h = $('#hint'); h.textContent = t; h.classList.add('show'); hintTimer = 1.4; }

// 押した場所からの移動量だけポイを動かす（指でポイが隠れず、瞬間移動もしない）
function press(w: THREE.Vector2) {
  if (S.mode !== 'play' || S.dragging) return false;
  if (S.poiState !== 'ready' && S.poiState !== 'water') return false;
  S.grabOffset.set(S.poiPos.x - w.x, S.poiPos.z - w.y);
  S.target.set(S.poiPos.x, S.poiPos.z);
  S.dragging = true;
  if (S.poiState === 'ready') S.poiState = 'aim';
  return true;
}
function moveTo(w: THREE.Vector2) {
  if (!S.dragging) return;
  S.target.copy(clampToTank(w.clone().add(S.grabOffset)));
}
// 空中で離すと水に入れ、水中で離す（またはタップする）とすくう
function release() {
  if (!S.dragging) return;
  S.dragging = false;
  if (S.poiState === 'aim') { S.poiState = 'dip'; S.poiT = 0; S.poiFrom.copy(S.poiPos); }
  else if (S.poiState === 'water' || S.poiState === 'dip') scoop();
}

// 指の操作（告知動画の撮影も同じ関数を通す。座標は画面の CSS ピクセル）
function touchDown(x: number, y: number) { const w = toWorld(x, y); return !!w && press(w); }
function touchMove(x: number, y: number) { const w = toWorld(x, y); if (w) moveTo(w); }
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (touchDown(e.clientX, e.clientY)) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => touchMove(e.clientX, e.clientY));
canvas.addEventListener('pointerup', () => release());
canvas.addEventListener('pointercancel', () => release());

// ---------- すくう ----------
function scoop() {
  // 1回にすくえるのは1つ。判定に複数入ったときは、ポイの中心に一番近いもの
  const R = POI.radius * POI.catchRadiusRatio;
  let nearest: Fish | null = null, best = R;
  for (const f of S.fish) {
    if (f.state !== 'swim') continue;
    const a = f.apparent(camera.position);
    const d = Math.hypot(a.x - S.poiPos.x, a.y - S.poiPos.z);
    if (d < best) { best = d; nearest = f; }
  }
  const got = nearest ? [nearest] : [];
  const need = got.reduce((a, f) => a + f.sp.cost, 0);
  S.poiState = 'lift'; S.poiT = 0; S.poiFrom.copy(S.poiPos);
  S.dragging = false;
  sim.drop(S.poiPos.x, S.poiPos.z, POI.radius * 1.1, 0.012);
  sfx.lift();
  S.carried = got;
  emit('scoop', { hit: got.length > 0 });
  if (got.length === 0) { S.lastResult = 'empty'; return; }
  if (need > S.strength) {
    // 重さに耐えられず破れる。影は持ち上がりかけて水へ落ちる
    S.strength = 0; S.lastResult = 'torn';
    for (const f of got) { f.state = 'drop'; f.vy = 0.5; f.pos.y = POI.waterY; }
    S.reveals = got.map((f) => ({ id: f.sp.id, kg: f.kg, escaped: true }));
    return;
  }
  S.strength -= need;
  S.lastResult = 'caught';
  for (const f of got) {
    f.state = 'caught';
    const a = f.apparent(camera.position);
    f.rel.set(a.x - S.poiPos.x, 0, a.y - S.poiPos.z);
  }
  S.reveals = got.map((f) => ({ id: f.sp.id, kg: f.kg, escaped: false }));
}

// 告知動画の台本に知らせる出来事（__game.drainEvents）
let events: Record<string, unknown>[] = [];
const emit = (type: string, data: Record<string, unknown> = {}) => events.push({ type, ...data });

// 消すまでの時間はゲーム内の時間で数える（告知動画の1コマずつの撮影でもずれない）
const toasts: { el: HTMLElement; life: number }[] = [];
function toast(t: string, big: boolean) {
  const el = document.createElement('div');
  el.className = 'toast' + (big ? ' big' : '');
  el.textContent = t;
  $('#toasts').appendChild(el);
  toasts.push({ el, life: 1.4 });
  emit('toast', { text: t });
}

function tearPaper() {
  S.poiState = 'torn'; S.poiT = 0; S.dragging = false; S.strength = 0;
  sfx.tear();
  sim.drop(S.poiPos.x, S.poiPos.z, POI.radius * 0.8, -0.01);
}

function nextPoi() {
  S.poiLeft -= 1;
  if (S.poiLeft <= 0) { endGame(); return; }
  S.strength = POI.strength; S.wet = 0; S.tear = 0;
  poi.newPaper();
  S.poiState = 'ready'; S.poiT = 0;
}

// ---------- 正体を見せる ----------
export function fmtKg(kg: number) {
  return kg < 1 ? `${Math.round(kg * 1000)}g` : `${kg.toFixed(1)}kg`;
}

function enterReveal() {
  S.mode = 'reveal';
  $('#hint').classList.remove('show'); hintTimer = 0;
  S.revealIdx = 0;
  const fl = $('#flash');
  fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  // 捕まえた影は水槽から消し、少しあとで新しい影を補充する
  for (const f of S.carried) if (f.state === 'caught') { f.state = 'gone'; S.respawn.push(S.time + 2.5); }
  S.carried = [];
  sfx.duckBgm(true);
  showReveal();
}

function showReveal() {
  const r = S.reveals[S.revealIdx];
  const it = ITEMS[r.id];
  S.revealT = 0;
  showcase.show(r.id, r.escaped, it.kind === 'treasure');
  const box = $('#reveal');
  box.hidden = false;
  box.classList.toggle('junk', it.kind === 'junk');
  box.classList.toggle('treasure', it.kind === 'treasure');
  box.classList.toggle('escaped', r.escaped);
  box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
  $('#rv-label').textContent = r.escaped ? '紙が破れて逃げられた… 正体は' : 'すくい上げたのは…';
  $('#rv-name').textContent = it.name;
  $('#rv-sub').textContent = it.sub;
  $('#rv-kg').textContent = fmtKg(r.kg);
  $('#rv-desc').textContent = it.desc;
  $('#rv-pts').textContent = r.escaped ? '0点' : it.points > 0 ? `+${it.points}点` : 'ハズレ 0点';
  $('#rv-count').textContent = S.reveals.length > 1 ? `${S.revealIdx + 1} / ${S.reveals.length}` : '';
  emit('reveal', { id: r.id, kind: it.kind, escaped: r.escaped, points: r.escaped ? 0 : it.points });
  if (!r.escaped) {
    S.score += it.points;
    S.log.push(r);
    sfx.caught(it.kind === 'junk' ? -1 : Math.min(5, Math.floor(it.points / 50)));
  } else {
    sfx.tear();
  }
}

function nextReveal() {
  if (S.mode !== 'reveal' || S.revealT < 0.5) return;
  S.revealIdx++;
  if (S.revealIdx < S.reveals.length) { showReveal(); return; }
  $('#reveal').hidden = true;
  const torn = S.lastResult === 'torn';
  S.reveals = [];
  S.mode = 'play';
  sfx.duckBgm(false);
  if (torn) nextPoi();
  else { S.poiState = 'ready'; S.poiT = 0; S.lastResult = ''; }
  if (S.mode === 'play' && S.left <= 0) endGame();
}
$('#reveal').addEventListener('click', () => nextReveal());

// ---------- 更新 ----------
const ease = (t: number) => t * t * (3 - 2 * t);
function updatePoi(dt: number) {
  const st = S.poiState;
  S.poiT += dt;
  const prev = new THREE.Vector2(S.poiPos.x, S.poiPos.z);
  if (st === 'aim' || st === 'dip' || st === 'water') {
    const k = 1 - Math.exp(-POI.follow * dt);
    S.poiPos.x += (S.target.x - S.poiPos.x) * k;
    S.poiPos.z += (S.target.y - S.poiPos.z) * k;
  }
  if (st === 'dip') {
    const t = Math.min(1, S.poiT / POI.dipTime);
    S.poiPos.y = THREE.MathUtils.lerp(S.poiFrom.y, POI.waterY, ease(t));
    if (t >= 1) {
      S.poiState = 'water';
      sim.drop(S.poiPos.x, S.poiPos.z, POI.radius * 1.15, -0.01);
      sfx.dip();
      emit('dip');
      if (!S.hinted.water) { S.hinted.water = true; showHint('もう一度タップするとすくう'); }
    }
  } else if (st === 'water') {
    S.poiPos.y = POI.waterY;
    S.wet = Math.min(1, S.wet + dt / 1.2);
    let drain = POI.wetDrainPerSec;
    if (S.speed > POI.fastSpeed) drain += POI.fastDrainPerSec * Math.min(2.5, S.speed / POI.fastSpeed);
    S.strength -= drain * dt;
    const vx = S.poiVel.x, vz = S.poiVel.y;
    const sp = Math.hypot(vx, vz);
    if (sp > 0.01) {
      sim.drop(S.poiPos.x + (vx / sp) * POI.radius, S.poiPos.z + (vz / sp) * POI.radius, 0.05, 0.0009 * Math.min(sp, 2));
      sim.drop(S.poiPos.x - (vx / sp) * POI.radius, S.poiPos.z - (vz / sp) * POI.radius, 0.05, -0.0009 * Math.min(sp, 2));
    }
    if (S.strength <= 0) tearPaper();
  } else if (st === 'lift') {
    const t = Math.min(1, S.poiT / POI.liftTime);
    S.poiPos.y = THREE.MathUtils.lerp(POI.waterY, POI.hoverY + 0.06, ease(t));
    S.dripT -= dt;
    if (S.dripT < 0) { S.dripT = 0.05; sim.drop(S.poiPos.x + (Math.random() - 0.5) * 0.2, S.poiPos.z + (Math.random() - 0.5) * 0.2, 0.012, 0.004); }
    if (S.lastResult === 'torn') S.tear = Math.min(1, t * 1.6);
    if (t >= 1) {
      if (S.reveals.length) { enterReveal(); return; }
      S.poiState = 'ready'; S.poiT = 0; S.lastResult = '';
    }
  } else if (st === 'ready' || st === 'aim') {
    // 水面のすぐ上に浮かせる。高いと着水位置とのずれが大きく見える
    S.poiPos.y += (POI.hoverY - S.poiPos.y) * Math.min(1, dt * 10);
  } else if (st === 'torn') {
    S.tear = Math.min(1, S.tear + dt * 3);
    S.poiPos.y = THREE.MathUtils.lerp(S.poiPos.y, POI.hoverY, Math.min(1, dt * 4));
    if (S.poiT > 0.8) nextPoi();
  }
  const cur = new THREE.Vector2(S.poiPos.x, S.poiPos.z);
  if (dt > 0) {
    const v = cur.clone().sub(prev).divideScalar(dt);
    S.poiVel.lerp(v, Math.min(1, dt * 12));
    S.speed = S.poiVel.length() / TANK.w;
  }
}

function updateFish(dt: number) {
  const poiInfo = { x: S.poiPos.x, z: S.poiPos.z, speed: S.speed, inWater: S.poiState === 'water' };
  for (const f of S.fish) {
    f.update(dt, S.time, poiInfo, S.fish);
    if (f.state === 'caught') {
      // 持ち上げ中は黒い影のまま。正体は画面を切り替えてから見せる
      f.pos.set(S.poiPos.x + f.rel.x, S.poiPos.y + 0.012, S.poiPos.z + f.rel.z);
      f.phase += dt * 14;
      f.mesh.rotation.set(0, f.heading, Math.sin(f.phase * 0.9) * 0.25);
    } else if (f.state === 'drop') {
      f.vy -= 9.8 * 0.25 * dt;
      f.pos.y += f.vy * dt;
      if (f.pos.y > 0.12) f.vy = Math.min(f.vy, 0);
      if (f.pos.y < -0.01 && f.vy < 0) {
        sim.drop(f.pos.x, f.pos.z, f.length * 0.6, -0.014); sfx.splash(f.length > 0.3);
        f.state = 'swim'; f.fleeT = 1; f.depth = 0.04;
      }
      f.mesh.rotation.set(0, f.heading, Math.sin(S.time * 20) * 0.3);
    }
    if (f.state === 'swim' && f.depth < 0.035 && f.sp.kind === 'fish' && Math.random() < dt * 3) sim.drop(f.pos.x, f.pos.z, 0.02, 0.0012);
    f.sync();
  }
  for (const f of S.fish.filter((f) => f.state === 'gone')) f.dispose(scene);
  S.fish = S.fish.filter((f) => f.state !== 'gone');
}

function updateSpawns() {
  while (S.eventIdx < EVENTS.length && EVENTS[S.eventIdx].t <= S.time) {
    const ev = EVENTS[S.eventIdx++];
    spawn(ev.id, true);
    toast(ev.msg, true);
  }
  const due = S.respawn.filter((t) => t <= S.time);
  S.respawn = S.respawn.filter((t) => t > S.time);
  for (let i = 0; i < due.length; i++) if (S.fish.length < MAX_SHADOWS) spawn(randomItem(), true);
}

let simAcc = 0;
function step(dt: number) {
  if (S.mode === 'reveal') {
    S.revealT += dt;
    showcase.update(dt);
    return;
  }
  S.time += dt;
  if (S.mode === 'play') {
    S.left = Math.max(0, GAME.duration - S.time);
    updateSpawns();
    updatePoi(dt);
    if (S.left <= 0 && S.mode === 'play') {
      // 時間切れ。水中にあるポイはその場ですくう
      if (S.poiState === 'water' || S.poiState === 'dip') { S.dragging = false; scoop(); }
      else if (S.poiState === 'ready' || S.poiState === 'aim') endGame();
    }
  }
  updateFish(dt);
  simAcc += dt;
  let n = 0;
  while (simAcc >= 1 / 60 && n < 4) { sim.step(); simAcc -= 1 / 60; n++; }
  if (n === 4) simAcc = 0;
  for (let i = toasts.length - 1; i >= 0; i--) if ((toasts[i].life -= dt) <= 0) { toasts[i].el.remove(); toasts.splice(i, 1); }
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('#hint').classList.remove('show'); }
}

function endGame() {
  if (S.mode === 'end' || S.mode === 'title') return;
  S.mode = 'end';
  S.dragging = false;
  sfx.stopBgm();
  $('#toasts').innerHTML = ''; toasts.length = 0;
  $('#reveal').hidden = true;
  const rows = S.log.map((r) => {
    const it = ITEMS[r.id];
    return `<li class="${it.kind}"><span>${it.name}</span><span>${fmtKg(r.kg)}</span><span>${it.points}点</span></li>`;
  }).join('');
  $('#result-list').innerHTML = rows || '<li class="none">何もすくえなかった…</li>';
  $('#result-score').textContent = String(S.score);
  const fish = S.log.filter((r) => ITEMS[r.id].kind === 'fish');
  const treasure = S.log.filter((r) => ITEMS[r.id].kind === 'treasure').length;
  const heaviest = fish.sort((a, b) => b.kg - a.kg)[0];
  $('#result-best').textContent = [heaviest ? `いちばんの大物：${ITEMS[heaviest.id].name}（${fmtKg(heaviest.kg)}）` : '', treasure ? `宝箱 ×${treasure}！` : ''].filter(Boolean).join('　');
  $('#result').hidden = false;
  emit('end', { score: S.score });
}

// ---------- 描画 ----------
function syncPoi() {
  poi.group.position.copy(S.poiPos);
  const damage = 1 - Math.max(0, S.strength) / POI.strength;
  const aiming = S.poiState === 'aim' || (S.poiState === 'ready' && S.mode === 'play');
  S.fade += ((aiming ? 0.35 : 1) - S.fade) * 0.25;
  poi.setState(S.wet, damage, S.tear, S.fade);
  poi.group.rotation.x = S.poiState === 'lift' ? -0.12 : 0;
  aimRing.visible = aiming;
  aimRing.position.set(S.poiPos.x, 0.006, S.poiPos.z);
  (aimRing.material as THREE.MeshBasicMaterial).opacity = S.poiState === 'aim' ? 0.75 + Math.sin(S.time * 8) * 0.15 : 0.5;
}

function resize() {
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, RENDER.maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  showcase.resize(r.width / r.height);
  const bw = Math.floor(r.width * dpr), bh = Math.floor(r.height * dpr);
  refractRT.setSize(Math.floor(bw * RENDER.refractScale), Math.floor(bh * RENDER.refractScale));
  surfaceMat.uniforms.uRes.value.set(bw, bh);
}
new ResizeObserver(resize).observe(stage);

const underClear = new THREE.Color('#1d3a3a');
function render() {
  if (S.mode === 'reveal') {
    renderer.setRenderTarget(null);
    renderer.render(showcase.scene, showcase.camera);
    return;
  }
  syncPoi();
  surfaceMat.uniforms.uTime.value = S.time;
  surfaceMat.uniforms.uHeight.value = sim.texture;
  for (const m of tank.interiors) { m.uniforms.uTime.value = S.time; m.uniforms.uHeight.value = sim.texture; }
  // 水中パス
  poi.group.visible = S.poiPos.y < 0.02;
  camera.layers.set(1);
  renderer.setRenderTarget(refractRT);
  renderer.setClearColor(underClear, 1);
  renderer.clear();
  renderer.render(scene, camera);
  // 水上パス
  poi.group.visible = true;
  camera.layers.set(0);
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}

function updateHud() {
  $('#time').textContent = String(Math.ceil(S.left));
  $('#score').textContent = String(S.score);
  const pois = $('#pois');
  if (pois.childElementCount !== GAME.poiCount) {
    pois.innerHTML = '';
    for (let i = 0; i < GAME.poiCount; i++) { const s = document.createElement('span'); s.className = 'poi-icon'; pois.appendChild(s); }
  }
  pois.querySelectorAll('.poi-icon').forEach((el, i) => el.classList.toggle('used', i >= S.poiLeft));
  const pct = Math.max(0, S.strength) / POI.strength;
  const bar = $('#strength-bar');
  bar.style.width = `${pct * 100}%`;
  bar.classList.toggle('low', pct < 0.3);
  $('#strength').classList.toggle('fast', S.poiState === 'water' && S.speed > POI.fastSpeed);
  $('#hud').classList.toggle('hidden', S.mode !== 'play');
}

// ---------- ループ ----------
let manual = false;
let last = performance.now();
const frameTimes: number[] = [];
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  frameTimes.push(now - last);
  if (frameTimes.length > 120) frameTimes.shift();
  last = now;
  if (!manual) step(dt);
  render();
  updateHud();
  requestAnimationFrame(loop);
}

function startGame() {
  resetGame();
  populate();
  S.mode = 'play';
  $('#title').hidden = true;
  $('#result').hidden = true;
  showHint('ドラッグで狙って、離すと水に入れる');
  sfx.startBgm();
}
$('#start').addEventListener('click', () => { sfx.unlock(); startGame(); });
$('#retry').addEventListener('click', () => { sfx.unlock(); startGame(); });
$('#home').addEventListener('click', () => { sfx.stopBgm(); resetGame(); S.mode = 'title'; $('#result').hidden = true; $('#title').hidden = false; populate(); });

// 音のON/OFF（BGMと効果音をまとめて切り替え、次回も覚えておく）
const soundBtn = $('#sound');
function setSound(on: boolean) {
  sfx.setEnabled(on);
  soundBtn.classList.toggle('off', !on);
  soundBtn.setAttribute('aria-label', on ? '音を消す' : '音を出す');
  try { localStorage.setItem('kingyo-sound', on ? '1' : '0'); } catch { /* 保存できなくても遊べる */ }
}
try { setSound(localStorage.getItem('kingyo-sound') !== '0'); } catch { setSound(true); }
soundBtn.addEventListener('click', () => { sfx.unlock(); setSound(!sfx.enabled); });
document.addEventListener('visibilitychange', () => sfx.suspend(document.hidden));
// 告知動画の撮影中は音ボタンを出さない
if (new URLSearchParams(location.search).has('promo')) soundBtn.hidden = true;

// タイトル画面の背景として影を泳がせておく
populate();
resize();
requestAnimationFrame(loop);

// ---------- 確認用の入口 ----------
declare global { interface Window { __game: unknown } }
window.__game = {
  config: { POI, TANK, ITEMS, GAME },
  start: startGame,
  manual(on: boolean) { manual = on; },
  step(dt: number) { const n = Math.max(1, Math.round(dt / (1 / 60))); for (let i = 0; i < n; i++) step(dt / n); render(); updateHud(); },
  press(x: number, z: number) { return press(new THREE.Vector2(x, z)); },
  move(x: number, z: number) { moveTo(new THREE.Vector2(x, z)); },
  release,
  touchDown, touchMove, touchUp: release,
  drainEvents() { const e = events; events = []; return e; },
  audio: {
    capture(on: boolean) { sfx.capture = on; },
    drain: () => sfx.drain(),
    // 撮影中に台本からBGMなどを記録する（例: cue('bgm', 秒数)）
    mix(sfxGain: number) { sfx.renderSfxGain = sfxGain; },
    cue: (name: Parameters<Sfx['render']>[1], ...args: number[]) => sfx.cue(name, args),
    render: (ctx: BaseAudioContext, name: Parameters<Sfx['render']>[1], args: number[], when: number) => sfx.render(ctx, name, args, when),
  },
  next: nextReveal,
  spawn(id: ItemId, x?: number, z?: number, heading = 0) {
    const f = spawn(id, false);
    if (x !== undefined && z !== undefined) { f.pos.set(x, 0, z); f.heading = heading; }
    f.sync();
    return S.fish.length - 1;
  },
  holdFish(i: number) { const f = S.fish[i]; if (f) { f.speed = 0; f.targetDepth = f.depth; } },
  freezeFish(on: boolean) { for (const f of S.fish) { f.speed = on ? 0 : f.sp.speed; if (on) f.targetDepth = f.depth; } },
  clearFish() { for (const f of S.fish) f.dispose(scene); S.fish = []; },
  setCamera(px: number, py: number, pz: number, tx: number, ty: number, tz: number) { camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); },
  toScreen(x: number, y: number, z: number) { const p = toScreen(new THREE.Vector3(x, y, z)); return { x: p.x, y: p.y }; },
  drop(x: number, z: number, r: number, s: number) { sim.drop(x, z, r, s); },
  sound() { return { enabled: sfx.enabled, bgm: sfx.bgmOn, ctx: sfx.ctx?.state ?? 'none' }; },
  fps() { const avg = frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, frameTimes.length); return { avgMs: avg, fps: 1000 / avg }; },
  state() {
    return {
      mode: S.mode, time: S.time, left: S.left, score: S.score, poiLeft: S.poiLeft, strength: S.strength, poiState: S.poiState,
      poi: { x: S.poiPos.x, y: S.poiPos.y, z: S.poiPos.z }, speed: S.speed, lastResult: S.lastResult,
      log: S.log.map((r) => ({ ...r })),
      reveal: S.mode === 'reveal' ? { ...S.reveals[S.revealIdx], index: S.revealIdx, total: S.reveals.length } : null,
      fish: S.fish.map((f) => { const a = f.apparent(camera.position); return { id: f.sp.id, x: f.pos.x, z: f.pos.z, ax: a.x, az: a.y, state: f.state, depth: f.depth }; }),
    };
  },
};
