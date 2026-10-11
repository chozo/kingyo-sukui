// SNS共有用の画像 public/ogp.png（1200×630）を作る。node tools/create-ogp.mjs（開発サーバーを起動しておく）
// ゲーム画面（魚影の水槽と、すくい上げた金魚の正体画面）を撮り、タイトルと並べる
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5190/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
  await page.goto(GAME_URL);
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: '#hud,#hint,#toasts,#sound{display:none!important}' });
  const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
  await g('start');
  await g('manual', true);
  await g('clearFish');
  // 大小の魚影を並べ、ポイを空中で構えた場面
  const shadows = [['kingyo', -0.2, -0.35, 0.4], ['funa', 0.22, -0.15, 2.6], ['maguro', 0.05, 0.12, 0.2], ['kingyo', -0.25, 0.3, 1.2], ['koi', 0.25, 0.45, 3.5], ['kingyo', 0.0, -0.55, 5.2]];
  for (const [id, x, z, h] of shadows) await g('spawn', id, x, z, h);
  await g('step', 1.2);
  await g('press', 0.15, 0.62);
  for (let i = 1; i <= 20; i++) { await g('move', 0.15 - i * 0.008, 0.62 - i * 0.012); await g('step', 1 / 30); }
  await g('drop', 0.05, 0.12, 0.12, 0.01);
  await g('step', 0.1);
  const play = await page.screenshot({ type: 'png' });
  // 金魚をすくい上げた正体画面（ほかの正体はシークレットなので載せない）
  await g('release'); await g('step', 0.3);
  await g('clearFish');
  const s = await g('state');
  await g('spawn', 'kingyo', s.poi.x, s.poi.z - 0.05, 0.3);
  await g('freezeFish', true);
  await g('step', 0.05);
  const f = (await g('state')).fish[0];
  await g('press', s.poi.x, s.poi.z); await g('move', f.ax, f.az); await g('release'); await g('step', 0.3);
  const q = (await g('state')).poi;
  await g('press', q.x, q.z); await g('release');
  await g('step', 1.6);
  await page.waitForTimeout(1300);
  const reveal = await page.screenshot({ type: 'png' });

  const img = (b) => `data:image/png;base64,${b.toString('base64')}`;
  const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await card.setContent(`<!doctype html><html lang="ja"><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{margin:0;width:1200px;height:630px;overflow:hidden;color:#fff;font-family:"Hiragino Maru Gothic ProN","Hiragino Kaku Gothic ProN",sans-serif;
      background:radial-gradient(circle at 8% 12%,#ff8a3d55,transparent 18%),radial-gradient(circle at 30% 4%,#ff5a4a44,transparent 16%),radial-gradient(circle at 52% 96%,#ffb34733,transparent 20%),radial-gradient(ellipse at 30% 60%,#123a52,#06101c 70%)}
    .lan{position:absolute;top:-14px;width:46px;height:64px;border-radius:22px;background:radial-gradient(circle at 40% 40%,#ffe2a8,#f0503c 55%,#9c1f1f);box-shadow:0 0 40px #ff7a3c99}
    .lan::after{content:"";position:absolute;left:8px;right:8px;top:24px;height:2px;background:#0003;box-shadow:0 10px 0 #0003,0 20px 0 #0003}
    .copy{position:absolute;left:64px;top:170px;width:580px}
    .brand{font-size:17px;letter-spacing:6px;color:#9fd3e6;font-weight:700;margin:0 0 18px}
    h1{font-size:104px;white-space:nowrap;line-height:1.1;margin:0;font-weight:800;letter-spacing:4px;text-shadow:0 6px 0 #a8264f,0 0 40px #f25c8a88}
    .sub{font-size:31px;white-space:nowrap;font-weight:700;color:#ffd860;margin:30px 0 0;letter-spacing:2px}
    .note{margin-top:34px;display:inline-block;border:2px solid #ffffff55;border-radius:30px;padding:10px 22px;font-size:20px;letter-spacing:2px;color:#e8f4f8}
    .shot{position:absolute;width:270px;height:480px;border-radius:26px;border:6px solid #fff;overflow:hidden;box-shadow:0 24px 50px #0009;background:#000}
    .shot img{width:100%;height:100%;object-fit:cover;display:block}
    .a{left:640px;top:96px;transform:rotate(-5deg)}
    .b{left:885px;top:66px;transform:rotate(5deg)}
    .q{position:absolute;left:590px;top:470px;font-size:68px;font-weight:800;color:#ffd860;text-shadow:0 4px 0 #8a5a10;transform:rotate(-8deg)}
  </style>
  <div class="lan" style="left:60px"></div><div class="lan" style="left:150px;top:-24px"></div><div class="lan" style="left:240px"></div><div class="lan" style="left:330px;top:-24px"></div>
  <div class="copy"><p class="brand">KINGYO SUKUI</p><h1>金魚すくい</h1><p class="sub">金魚以外がすくえることも・・・</p><p class="note">すくい上げるまで、正体はわからない</p></div>
  <div class="shot a"><img src="${img(play)}"></div>
  <div class="shot b"><img src="${img(reveal)}"></div>
  <div class="q">？</div>
  </html>`);
  await card.evaluate(() => document.fonts.ready);
  await card.waitForTimeout(200);
  await card.screenshot({ path: fileURLToPath(new URL('../public/ogp.png', import.meta.url)) });
  console.log('Created public/ogp.png (1200 × 630)');
} finally {
  await browser.close();
}
