// 実際のマウス操作でゲームの流れと操作性を確かめる。node tools/e2e.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const URL = process.env.GAME_URL || 'http://127.0.0.1:5190/';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const errors = [];
const report = {};
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(500);
  const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
  const st = () => g('state');
  const { POI } = await page.evaluate(() => window.__game.config);
  const R = POI.radius * POI.catchRadiusRatio;

  const screenOf = (x, z) => g('toScreen', x, 0, z);
  // マウスで、今のポイの位置から (tx,tz) まで speed（水槽単位/秒）で運ぶ。指はポイの少し手前を押す
  async function mouseDrag(tx, tz, speed, fromScreen) {
    const s = await st();
    const start = fromScreen ?? (await screenOf(s.poi.x, s.poi.z + 0.25));
    const p0 = await screenOf(s.poi.x, s.poi.z), p1 = await screenOf(tx, tz);
    const dist = Math.hypot(tx - s.poi.x, tz - s.poi.z);
    const n = Math.max(2, Math.ceil((dist / speed) * 30));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(start.x + ((p1.x - p0.x) * i) / n, start.y + ((p1.y - p0.y) * i) / n);
      await g('step', 1 / 30);
    }
    await g('step', 0.2);
  }
  async function tap() {
    const s = await st();
    const p = await screenOf(s.poi.x, s.poi.z + 0.25);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up();
  }
  // 運んで、離して水に入れ、タップしてすくう
  async function aimDipScoop(tx, tz) {
    await mouseDrag(tx, tz, 0.6); await page.mouse.up(); await g('step', 0.3);
    await tap(); await g('step', 0.6);
  }
  async function only(id, x, z) {
    await g('clearFish');
    await g('spawn', id, x, z, 0);
    await g('freezeFish', true);
    await g('step', 0.05);
    return (await st()).fish[0];
  }
  async function closeReveal() { await g('step', 0.6); await g('next'); await g('step', 0.3); }

  // 実時間で動かしたときの描画速度。BGMはタイトルでは鳴らさず、はじめると流れる
  assert.equal((await g('sound')).bgm, false, 'タイトルではBGMを鳴らさない');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.waitForTimeout(3000);
  report.fpsHeadless = await g('fps');
  assert.equal((await g('sound')).bgm, true, 'はじめるとBGMが流れる');
  // 音ボタンで消し、再読み込み後も消えたまま。もう一度押すと戻る
  await page.locator('#sound').click();
  assert.equal((await g('sound')).enabled, false, '音を消せる');
  await page.reload(); await page.waitForTimeout(500);
  assert.equal((await g('sound')).enabled, false, '音の設定を覚えている');
  assert.match(await page.locator('#sound').getAttribute('class'), /off/);
  await page.locator('#sound').click();
  assert.equal((await g('sound')).enabled, true, '音を戻せる');
  await page.getByRole('button', { name: 'はじめる' }).click();

  await g('start');
  await g('manual', true);
  await g('step', 0.05);

  // 1) どこを押してもドラッグで空中を動かせる。空中では紙は減らない
  let s = await st();
  const before = { ...s.poi, strength: s.strength };
  await mouseDrag(before.x - 0.2, before.z - 0.3, 1.5, await screenOf(-0.35, 0.6)); // 離れた所を押して速く動かす
  s = await st();
  assert.equal(s.poiState, 'aim', '空中で狙っている');
  assert.ok(s.poi.y > 0, 'ポイは水面より上');
  assert.ok(Math.hypot(s.poi.x - (before.x - 0.2), s.poi.z - (before.z - 0.3)) < 0.05, '指の移動量だけ動く');
  await g('step', 5);
  assert.equal((await st()).strength, before.strength, '空中では速く動かしても待っても紙が減らない');

  // 2) 離すと水に入る。何もいなければタップで空振りし、その場で待機
  await page.mouse.up();
  await g('step', 0.3);
  assert.equal((await st()).poiState, 'water', '離すと水に入る');
  await g('clearFish');
  await tap();
  await g('step', 0.6);
  s = await st();
  assert.equal(s.mode, 'play');
  assert.equal(s.poiState, 'ready', '空振りしたらその場で待機');

  // 3) 魚の真上へ運び、離して入れ、タップですくう
  const fish = await only('kingyo', 0, -0.1);
  await mouseDrag(fish.ax, fish.az, 0.6);
  await page.mouse.up();
  await g('step', 0.3);
  s = await st();
  assert.equal(s.poiState, 'water');
  const miss = Math.hypot(s.poi.x - fish.ax, s.poi.z - fish.az);
  assert.ok(miss < 0.06, `狙った場所に入る ${miss}`);
  await page.screenshot({ path: 'artifacts/e2e-before-scoop.png' });
  await tap();
  await g('step', 0.5);
  s = await st();
  assert.equal(s.mode, 'reveal', 'すくうと正体画面に切り替わる');
  assert.equal(s.reveal.id, 'kingyo');
  await page.locator('#reveal').click(); // 表示直後のタップは無視される
  assert.equal((await st()).mode, 'reveal');
  await g('step', 0.6);
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/e2e-reveal.png' });
  assert.equal(await page.locator('#rv-name').innerText(), '金魚');
  await page.locator('#reveal').click();
  await g('step', 0.3);
  s = await st();
  assert.equal(s.mode, 'play');
  assert.equal(s.poiState, 'ready', 'すくった後はその場で待機');
  assert.equal(s.score, 10);
  report.firstCatch = { aimMiss: +miss.toFixed(3), strengthAfter: +s.strength.toFixed(1) };

  // 4) 水中でドラッグして追える。速く動かすと紙が早く弱る
  await g('clearFish');
  s = await st();
  await mouseDrag(s.poi.x, s.poi.z - 0.05, 0.5);
  await page.mouse.up();
  await g('step', 0.3);
  s = await st();
  const sBefore = s.strength;
  const h = await screenOf(s.poi.x, s.poi.z + 0.25);
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (let i = 0; i < 30; i++) { await page.mouse.move(h.x + (i % 2 ? -120 : 120), h.y - 80); await g('step', 1 / 15); }
  s = await st();
  report.fastInWater = { drained: +(sBefore - s.strength).toFixed(1), state: s.poiState };
  assert.ok(sBefore - s.strength > 2 * POI.wetDrainPerSec + 15, '水中で速いと余計に減る');
  await page.mouse.up();
  await g('step', 0.6);
  if ((await st()).mode === 'reveal') await closeReveal();

  // 5) 判定に2つ入ったら、近いほうだけをすくう
  await g('clearFish');
  await g('spawn', 'can', -0.05, -0.1, 0);
  await g('spawn', 'kingyo', 0.05, -0.1, 0);
  await g('freezeFish', true);
  await g('step', 0.05);
  s = await st();
  {
    const [canF, kinF] = s.fish;
    const tx = kinF.ax + (canF.ax - kinF.ax) * 0.2, tz = kinF.az + (canF.az - kinF.az) * 0.2;
    assert.ok(Math.hypot(canF.ax - tx, canF.az - tz) < R, '空き缶も判定の中にいる');
    await aimDipScoop(tx, tz);
    s = await st();
    assert.equal(s.reveal.id, 'kingyo', '近いほうをすくう');
    assert.equal(s.reveal.total, 1, '1回に1つだけ');
    await closeReveal();
    assert.ok((await st()).fish.some((f) => f.id === 'can' && f.state === 'swim'), '遠いほうは水に残る');
  }

  // 6) ハズレ（空き缶）は0点
  {
    const c = await only('can', 0.1, -0.2);
    const sc = (await st()).score;
    await aimDipScoop(c.ax, c.az);
    assert.equal((await st()).reveal.id, 'can');
    assert.match(await page.locator('#rv-pts').innerText(), /ハズレ/);
    await closeReveal();
    assert.equal((await st()).score, sc, 'ハズレは0点');
  }

  // 7) 弱った紙でマグロをすくうと破れ、正体だけ見せて逃げる（新しいゲームで確かめる）
  await g('start'); await g('step', 0.05);
  {
    const m = await only('maguro', 0, -0.2);
    await mouseDrag(m.ax, m.az, 0.6); await page.mouse.up(); await g('step', 0.3);
    for (let i = 0; i < 40 && (await st()).strength >= 70; i++) await g('step', 0.5);
    s = await st();
    assert.equal(s.poiState, 'water');
    assert.ok(s.strength < 75 && s.strength > 0, `紙が弱っている ${s.strength}`);
    const left = s.poiLeft;
    // 待つ間に途中から入ってきた影に押されることがあるので、ゆっくり寄せ直してから離してすくう
    const mg = s.fish.find((f) => f.id === 'maguro');
    if (Math.hypot(mg.ax - s.poi.x, mg.az - s.poi.z) > 0.02) { await mouseDrag(mg.ax, mg.az, 0.2); await page.mouse.up(); }
    else await tap();
    await g('step', 0.6);
    s = await st();
    assert.equal(s.reveal.escaped, true, '破れたときも正体を見せる');
    assert.match(await page.locator('#rv-label').innerText(), /逃げられた/);
    await closeReveal(); await g('step', 1);
    s = await st();
    assert.equal(s.poiLeft, left - 1, '重さで破れてポイが減る');
    assert.equal(s.poiState, 'ready', '新しいポイですぐ狙える');
    assert.equal(s.fish.find((f) => f.id === 'maguro').state, 'swim', 'マグロは水へ戻る');
  }
  // 8) 新しい紙ならマグロもすくえる
  {
    const m = await only('maguro', 0, -0.2);
    await mouseDrag(m.ax, m.az, 0.6); await page.mouse.up(); await g('step', 0.3);
    await tap(); await g('step', 0.35);
    await page.screenshot({ path: 'artifacts/e2e-maguro-lift.png' });
    await g('step', 0.3);
    s = await st();
    assert.equal(s.reveal.id, 'maguro');
    assert.equal(s.reveal.escaped, false, '新しい紙ならマグロもすくえる');
    await closeReveal();
    report.maguro = { score: (await st()).score, strengthAfter: +(await st()).strength.toFixed(1) };
  }

  // 9) 水中のまま時間切れになったら、その場ですくってから結果画面
  {
    const k = await only('kingyo', 0.1, 0.1);
    await mouseDrag(k.ax, k.az, 0.6); await page.mouse.up(); await g('step', 0.3);
    await g('step', 70);
    s = await st();
    if (s.mode === 'reveal') { await closeReveal(); s = await st(); }
    assert.equal(s.mode, 'end');
    assert.equal((await g('sound')).bgm, false, '結果画面ではBGMを止める');
    assert.ok(await page.locator('#result').isVisible());
    assert.match(await page.locator('#result-list').innerText(), /マグロ/);
    await page.screenshot({ path: 'artifacts/e2e-result.png' });
  }

  for (const [width, height] of [[360, 640], [390, 844], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'はみ出さない');
  }
  await page.getByRole('button', { name: 'もう一度' }).click();
  assert.equal((await st()).mode, 'play');
  assert.equal((await g('sound')).bgm, true, 'もう一度でBGMが再開');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, ...report }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ passed: false, ...report, errors }, null, 2));
  throw e;
} finally {
  await browser.close();
}
