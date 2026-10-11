// 告知動画の台本。npm run promo（確認用: PROMO_EVERY=15 npm run promo）
// すくって正体を見せるのは金魚・フナ・空き缶・鯉だけ。ほかの正体はシークレットなので映さない
// （水槽に泳がせる影も、すくう物以外は金魚・フナ・鯉の影にする。最後の大きな影はすくわない）。

export const config = {
  slug: 'kingyo-sukui',
  url: 'https://game.chozo.net/kingyo-sukui/',
  orientation: 'portrait',
  game: { width: 390, height: 693 },
  serveDir: 'dist',
  gamePath: '/kingyo-sukui/',
  music: false, // BGMはゲーム本体の祭囃子を audio.cue('bgm') で入れる
  loudness: -18, // BGMを小さめに聞かせるため、全体を -14 より控えめにする（BGMが鳴り続けるので全体の音量はほぼBGMで決まる）
};

const BG_KINDS = ['kingyo', 'funa', 'kingyo', 'koi', 'kingyo', 'funa'];
const SPOTS = [[-0.32, -0.55], [0.3, -0.5], [-0.3, 0.05], [0.32, 0.1], [-0.28, 0.5], [0.3, 0.55], [0, -0.62], [0.05, 0.62]];

export default async function scenario(p) {
  await p.seed(5);
  const st = () => p.state();
  const scr = (x, z) => p.call('toScreen', x, 0, z);

  // 狙う物を (x, z) に止めて置き、周りには金魚・フナ・鯉の影だけを泳がせる
  async function setup(id, x, z, heading = 0.4) {
    await p.call('clearFish');
    await p.call('spawn', id, x, z, heading);
    await p.call('holdFish', 0);
    let k = 0;
    for (const [sx, sz] of SPOTS) {
      if (Math.hypot(sx - x, sz - z) < 0.42) continue;
      await p.call('spawn', BG_KINDS[k % BG_KINDS.length], sx, sz, k * 1.7);
      k++;
    }
    await p.skip(0.05);
  }
  // 指をポイの少し手前に置き、狙う物の真上まで空中で運んで離す（離すと水に入る）
  async function aim(dur) {
    const s = await st();
    const f = s.fish[0];
    const p0 = await scr(s.poi.x, s.poi.z), p1 = await scr(f.ax, f.az);
    const g = await scr(s.poi.x, s.poi.z + 0.22);
    const mid = [g.x + (p1.x - p0.x) * 0.55, g.y + (p1.y - p0.y) * 0.45 - 12];
    await p.drag([[g.x, g.y], mid, [g.x + p1.x - p0.x, g.y + p1.y - p0.y]], dur);
  }
  // 判定に入っている一番近い物が狙った物か確かめてからタップですくう
  async function scoop() {
    const s = await st();
    const near = s.fish.map((f, i) => ({ i, id: f.id, d: Math.hypot(f.ax - s.poi.x, f.az - s.poi.z) })).filter((f) => f.d < 0.11).sort((a, b) => a.d - b.d)[0];
    if (!near || near.i !== 0) console.warn(`\n  ⚠ すくう物がずれています: ${JSON.stringify(near)}`);
    const g = await scr(s.poi.x, s.poi.z + 0.22);
    await p.tap(g.x, g.y, 0.04);
  }
  async function showReveal(sec) {
    await p.until((s) => s.mode === 'reveal', { max: 3 });
    await p.wait(sec);
    await p.call('next');
  }

  p.on('dip', () => p.fx('ちゃぽん', { x: 0.62, y: 0.6, size: 46, color: '#bfefff', stroke: '#06324a', dur: 0.6 }));
  p.on('reveal', (e) => {
    if (e.kind === 'junk') { p.fx('ハズレ…', { x: 0.5, y: 0.3, size: 70, color: '#c9d3dc', stroke: '#222', rot: -6, dur: 1.2 }); return; }
    if (e.id === 'koi') { p.flash({ strength: 0.8 }); p.shake(10, 0.3); p.fx('鯉！？', { x: 0.5, y: 0.28, size: 96, rot: -8, dur: 1.4 }); return; }
    p.fx(`+${e.points}点`, { x: 0.66, y: 0.3, size: 60, dur: 1 });
  });

  // 効果音は控えめにし、BGM（ゲームの祭囃子）を小さめに敷く
  await p.call('audio.mix', 0.4);

  // 0〜2秒 つかみ: 影を持ち上げる瞬間をスローで。正体は見せずに切る
  await p.call('start');
  await setup('koi', 0.02, -0.05, 0.6);
  await p.skip(0.4);
  // BGMは撮影するコマで入れる（p.skip の間に入れた音は捨てられる）
  await p.call('audio.cue', 'bgm', 34, 0.2);
  await aim(0.01);
  await p.skip(0.5);
  p.caption('この影の正体は…？', { y: 0.16, dur: 2.2, size: 50 });
  await p.wait(0.6);
  p.zoom(1.35, 0.6, { x: 0.5, y: 0.5 });
  await scoop();
  p.speed(0.3, { badge: false });
  await p.wait(0.9);
  p.speed(1, { badge: false });
  p.flash({ dur: 0.4, strength: 1 });
  await p.call('start'); // 正体画面に入る前に切り替える
  p.zoom(1, 0.01);

  // 2〜5.5秒 タイトル
  await setup('kingyo', -0.12, -0.18, 0.2);
  p.title({ title: '金魚すくい', sub: '金魚以外が\nすくえることも・・・', dur: 3.5 });
  await p.wait(3.8);

  // 6〜21秒 プレイ: 金魚 → フナ → ハズレ → 鯉
  p.caption('影を狙って', { y: 0.16, dur: 1.2 });
  await aim(1.0);
  p.caption('そっと入れて…', { y: 0.16, dur: 1.0 });
  await p.wait(0.6);
  p.caption('すくう！', { y: 0.16, dur: 0.9, size: 56 });
  await scoop();
  await p.until((s) => s.mode === 'reveal', { max: 3 });
  await p.wait(1.0);
  p.cover(); // 表紙は金魚の正体画面
  await showReveal(1.0);

  await setup('funa', 0.18, -0.35, 2.4);
  p.caption('すくうまで\n正体はわからない', { y: 0.16, dur: 2.8 });
  await aim(0.8);
  await p.wait(0.4);
  await scoop();
  await showReveal(1.8);

  await setup('can', -0.15, 0.12, 1.2);
  await aim(0.7);
  await p.wait(0.4);
  await scoop();
  await showReveal(1.9);

  await setup('koi', 0.1, -0.15, 0.8);
  p.caption('大きな影…！', { y: 0.16, dur: 1.4 });
  await aim(0.8);
  await p.wait(0.5);
  p.zoom(1.25, 0.4, { x: 0.5, y: 0.5 });
  await scoop();
  p.speed(0.4);
  await p.wait(0.7);
  p.speed(1);
  p.zoom(1, 0.2);
  await showReveal(2.2);

  // 21〜24秒 早送りでもう1匹
  await setup('kingyo', -0.2, -0.3, 3.5);
  p.speed(2);
  await aim(0.5);
  await p.wait(0.25);
  await scoop();
  await p.until((s) => s.mode === 'reveal', { max: 3 });
  await p.wait(0.6);
  await p.call('next');
  p.speed(1);

  // 24〜28秒 クライマックス: もっと大きな影の上でポイを構えたまま終える（すくわない・正体は見せない）
  await p.call('clearFish');
  for (const [id, x, z, h] of [['maguro', 0.12, -0.12, 2.6], ['kingyo', -0.32, 0.45, 0.4], ['funa', 0.3, 0.5, 2], ['kingyo', -0.35, -0.5, 5]]) await p.call('spawn', id, x, z, h);
  await p.call('holdFish', 0);
  await p.skip(0.1);
  p.caption('もっと大きな\n影も…？', { y: 0.16, dur: 4.2, size: 52 });
  p.zoom(1.18, 4.0, { x: 0.5, y: 0.45 });
  {
    const s = await st();
    const f = s.fish[0];
    const p0 = await scr(s.poi.x, s.poi.z), p1 = await scr(f.ax, f.az);
    const g = await scr(s.poi.x, s.poi.z + 0.22);
    await p.call('touchDown', g.x, g.y);
    const n = 75;
    for (let i = 1; i <= n; i++) {
      const k = 1 - Math.pow(1 - i / n, 3);
      await p.call('touchMove', g.x + (p1.x - p0.x) * k, g.y + (p1.y - p0.y) * k);
      await p.wait(1 / 30);
    }
    await p.wait(1.8);
  }
  p.zoom(1, 0.2);

  // 27〜30秒 エンドカード
  p.endCard({ title: '金魚すくい', sub: '金魚以外が\nすくえることも・・・', dur: 3.2 });
  await p.wait(3.2);
}
