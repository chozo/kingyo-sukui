// Web Audio で合成する効果音とBGM（外部音源は使わない）
const NOTE: Record<string, number> = { D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, B4: 493.88, D5: 587.33, E5: 659.25 };
// 篠笛の旋律（8分音符ごと。'-' は伸ばす、'.' は休み）。陽音階の8小節
const MELODY = [
  'A4 - B4 A4 G4 - E4 -', 'D4 - E4 G4 A4 - - .', 'B4 - D5 B4 A4 - G4 A4', 'B4 - - - A4 - . .',
  'D5 - E5 D5 B4 - A4 -', 'G4 A4 B4 - A4 - G4 E4', 'D4 - E4 - G4 A4 G4 E4', 'D4 - - - - - . .',
].join(' ').split(' ');
const TAIKO = [1, 0, 0, 1, 1, 0, 2, 2]; // 1: ドン 2: コ
const KANE = [1, 0, 1, 1, 1, 0, 1, 1]; // チャンチキ
const BPM = 112;

export class Sfx {
  ctx: AudioContext | null = null;
  enabled = true;
  private master: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private bgmTimer = 0;
  private bgmStep = 0;
  private bgmNext = 0;
  bgmOn = false;
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.8 : 0;
        this.master.connect(this.ctx.destination);
        this.bgmBus = this.ctx.createGain();
        this.bgmBus.gain.value = 0;
        this.bgmBus.connect(this.master);
      } catch { this.ctx = null; }
    }
    void this.ctx?.resume();
  }
  private get out() { return this.master!; }
  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }
  // タブを隠したら音を止める
  suspend(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend(); else void this.ctx.resume();
  }

  // ---------- BGM ----------
  startBgm() {
    const c = this.ctx; if (!c || !this.bgmBus || this.capture) return;
    this.bgmBus.gain.cancelScheduledValues(c.currentTime);
    this.bgmBus.gain.setTargetAtTime(0.42, c.currentTime, 0.3);
    if (this.bgmOn) return;
    this.bgmOn = true;
    this.bgmStep = 0;
    this.bgmNext = c.currentTime + 0.12;
    const tick = () => {
      const now = c.currentTime;
      // 止まっていた（タブ非表示など）ときは今から続ける
      if (this.bgmNext < now - 0.2) this.bgmNext = now + 0.05;
      while (this.bgmNext < now + 0.3) { this.bgmNote(this.bgmStep, this.bgmNext); this.bgmStep = (this.bgmStep + 1) % MELODY.length; this.bgmNext += 30 / BPM; }
    };
    tick();
    this.bgmTimer = window.setInterval(tick, 60);
  }
  // 正体画面の間は少し静かにする
  duckBgm(on: boolean) {
    const c = this.ctx; if (!c || !this.bgmBus || !this.bgmOn) return;
    this.bgmBus.gain.setTargetAtTime(on ? 0.16 : 0.42, c.currentTime, 0.15);
  }
  stopBgm() {
    const c = this.ctx;
    if (!this.bgmOn) return;
    this.bgmOn = false;
    clearInterval(this.bgmTimer);
    if (c && this.bgmBus) this.bgmBus.gain.setTargetAtTime(0, c.currentTime, 0.25);
  }
  private bgmNote(i: number, t: number) { bgmNote({ ctx: this.ctx!, out: this.bgmBus!, t }, i); }

  // ---------- 効果音 ----------
  // 告知動画の撮影中は鳴らさずに記録し、あとで同じ関数で書き出す（render）
  capture = false;
  private queue: { name: SfxName | 'bgm'; args: number[] }[] = [];
  cue(name: SfxName | 'bgm', args: number[]) { if (this.capture) this.queue.push({ name, args }); }
  private play(name: SfxName, ...args: number[]) {
    if (this.capture) { this.queue.push({ name, args }); return; }
    const c = this.ctx; if (!c || !this.master || !this.enabled) return;
    SFX[name]({ ctx: c, out: this.master, t: c.currentTime }, ...args);
  }
  renderSfxGain = 1; // 書き出し時の効果音の大きさ（告知動画でBGMとの釣り合いをとる）
  drain() { const q = this.queue; this.queue = []; return q; }
  // 渡された AudioContext（書き出し時は OfflineAudioContext）の時刻 when に鳴らす。'bgm' は args[0] 秒ぶんのBGM
  render(ctx: BaseAudioContext, name: SfxName | 'bgm', args: number[], when: number) {
    const out = ctx.createGain(); out.gain.value = 0.8 * (name === 'bgm' ? 1 : this.renderSfxGain); out.connect(ctx.destination);
    if (name === 'bgm') {
      const bus = ctx.createGain(); bus.gain.value = args[1] ?? 0.42; bus.connect(out);
      const beat = 30 / BPM;
      for (let i = 0, t = when; t < when + args[0]; i++, t += beat) bgmNote({ ctx, out: bus, t }, i % MELODY.length);
      return;
    }
    SFX[name]({ ctx, out, t: when }, ...args);
  }
  dip() { this.play('dip'); }
  lift() { this.play('lift'); }
  splash(big: boolean) { this.play('splash', big ? 1 : 0); }
  tear() { this.play('tear'); }
  caught(rank: number) { this.play('caught', rank); }
}

type Out = { ctx: BaseAudioContext; out: AudioNode; t: number };

function bgmNote({ ctx: c, out: bus, t }: Out, i: number) {
  const beat = 30 / BPM;
  const k = i % 8;
  // 笛
  const n = MELODY[i];
  if (n in NOTE) {
    let len = 1;
    while (MELODY[(i + len) % MELODY.length] === '-') len++;
    const f = NOTE[n], dur = len * beat;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.965, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const vib = c.createOscillator(); vib.frequency.value = 5.2;
    const vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(len > 2 ? f * 0.012 : 0, t + dur);
    vib.connect(vg); vg.connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
    g.gain.setTargetAtTime(0.11, t + 0.05, 0.1); g.gain.setTargetAtTime(0.0001, t + dur * 0.92, 0.04);
    const g2 = c.createGain(); g2.gain.value = 0.12;
    o.connect(g); o2.connect(g2).connect(g); g.connect(bus);
    for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur + 0.3); }
  }
  // 太鼓
  const tk = TAIKO[k];
  if (tk) {
    const big = tk === 1;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(big ? 110 : 170, t); o.frequency.exponentialRampToValueAtTime(big ? 52 : 95, t + 0.2);
    const g = c.createGain(); g.gain.setValueAtTime(big ? 0.55 : 0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.45 : 0.18));
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.5);
  }
  // 鉦
  if (KANE[k]) {
    const g = c.createGain(); const loud = k === 0 || k === 4;
    g.gain.setValueAtTime(loud ? 0.045 : 0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (loud ? 0.18 : 0.07));
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    hp.connect(g).connect(bus);
    for (const f of [2350, 3410, 4870]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hp); o.start(t); o.stop(t + 0.2); }
  }
}

function noise({ ctx: c, out, t }: Out, dur: number, freq: number, q: number, gain: number, sweep = 1) {
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(out); src.start(t);
}
function tone({ ctx: c, out, t }: Out, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', to = freq) {
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur);
}
const later = (o: Out, s: number): Out => ({ ...o, t: o.t + s });

const SFX = {
  dip(o: Out) { noise(o, 0.25, 900, 1.2, 0.35, 0.5); tone(o, 300, 0.12, 0.08, 'sine', 140); },
  lift(o: Out) { noise(o, 0.4, 1400, 0.8, 0.3, 0.6); },
  splash(o: Out, big = 0) { noise(o, big ? 0.6 : 0.3, big ? 500 : 1100, 0.9, big ? 0.5 : 0.25, 0.4); },
  tear(o: Out) { noise(o, 0.35, 2600, 3, 0.4, 0.5); tone(o, 180, 0.25, 0.08, 'triangle', 90); },
  caught(o: Out, rank = 0) {
    if (rank < 0) { // ハズレ：間の抜けた下がり音
      tone(o, 520, 0.22, 0.12, 'square', 380); tone(later(o, 0.2), 390, 0.4, 0.1, 'square', 200);
      return;
    }
    if (rank >= 2) { // 大物：ファンファーレ
      [523, 659, 784, 1047].forEach((f, i) => tone(later(o, i * 0.11), f, 0.3, 0.12, 'triangle'));
      SFX.splash(o, 1);
      return;
    }
    const base = [660, 740, 830, 880, 990, 1180][Math.min(5, rank)];
    tone(o, base, 0.18, 0.12, 'triangle'); tone(later(o, 0.09), base * 1.5, 0.25, 0.1, 'triangle');
  },
};
type SfxName = keyof typeof SFX;
