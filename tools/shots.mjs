// 見た目の確認用スクリーンショット。node tools/shots.mjs [play reveal tear title]
import { chromium } from 'playwright-core';
const URL = process.env.GAME_URL || 'http://127.0.0.1:5190/';
const only = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
await page.goto(URL);
await page.waitForTimeout(800);
const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
const want = (n) => !only.length || only.includes(n);
const shot = (n) => page.screenshot({ path: `artifacts/${n}.png` });

if (want('title')) await shot('title');

await g('start');
await g('manual', true);
await g('step', 1.5);

if (want('play')) {
  // 空中で狙っているところ（水面に着水位置の輪）
  await g('press', 0.18, 0.54);
  for (let i = 0; i < 30; i++) { await g('move', 0.18 - i * 0.006, 0.54 - i * 0.012); await g('step', 1 / 30); }
  await shot('play-aim');
  // 離して水に入れたところ
  await g('release'); await g('step', 0.6);
  await shot('play');
  const p = (await g('state')).poi;
  await g('press', p.x, p.z); await g('release'); await g('step', 0.6);
  if ((await g('state')).mode === 'reveal') { await g('step', 1); await g('next'); }
  await g('step', 1);
}

// 指定した物を真下に置いてすくい、正体画面を撮る
async function catchItem(id, name, escapedTest = false) {
  await g('clearFish');
  const s = await g('state');
  await g('spawn', id, s.poi.x, s.poi.z - 0.1, 0.3);
  await g('freezeFish', true);
  await g('step', 0.05);
  const f = (await g('state')).fish[0];
  await g('press', s.poi.x, s.poi.z);
  for (let i = 1; i <= 10; i++) { await g('move', s.poi.x + (f.ax - s.poi.x) * i / 10, s.poi.z + (f.az - s.poi.z) * i / 10); await g('step', 1 / 10); }
  await g('release'); await g('step', 0.3); // 水に入れる
  if (escapedTest) await g('step', 16);
  const q = (await g('state')).poi;
  await g('press', q.x, q.z); await g('release'); // タップですくう
  await g('step', 0.2);
  await shot(`${name}-lift`);
  await g('step', 0.3);
  await g('step', 1.2);
  await page.waitForTimeout(1200); // 光と文字の演出（実時間）を待つ
  await shot(name);
  await g('next');
  await g('step', 1);
}
if (want('reveal')) {
  for (const id of (process.env.IDS || 'kingyo,funa,koi,sanma,buri,maguro,unagi,tako,takara,can,boot,bike').split(',')) {
    // 重い物も見られるよう、毎回ポイを新しくする
    await catchItem(id, `reveal-${id}`);
    const st = await g('state');
    if (st.poiLeft < 3 || st.strength < 99) { await g('start'); await g('manual', true); await g('step', 0.1); }
  }
}
if (want('tear')) {
  await g('start'); await g('manual', true); await g('step', 0.1);
  await catchItem('maguro', 'tear-maguro', true);
}
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
