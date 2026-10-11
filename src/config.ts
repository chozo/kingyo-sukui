// 調整値はここにまとめる。数値は試作の初期値。

export const TANK = {
  w: 1.0, // 水槽の内寸（横）
  d: 1.5, // 水槽の内寸（奥行き）
  depth: 0.24, // 水深
  wall: 0.03, // 壁の厚み
  rim: 0.035, // 水面から縁の上端まで
};

export const GAME = {
  duration: 60,
  poiCount: 3,
};

export const POI = {
  radius: 0.13, // 紙の半径
  strength: 150,
  wetDrainPerSec: 5, // 水中で毎秒減る
  fastSpeed: 0.3, // 水槽幅/秒。これを超えると追加で減る
  fastDrainPerSec: 20,
  catchRadiusRatio: 0.85, // 魚の中心がこの範囲に入っていればすくえる
  follow: 22, // 指への追従の速さ
  dipTime: 0.14,
  liftTime: 0.32,
  hoverY: 0.035, // 狙っている間の高さ
  waterY: -0.012,
};

// 魚の体形モデルで描くもの
export type SpeciesId = 'kingyo' | 'funa' | 'koi' | 'sanma' | 'buri' | 'maguro' | 'unagi';
// 個別の立体で描くもの
export type PropId = 'tako' | 'can' | 'boot' | 'bike' | 'takara';
export type ItemId = SpeciesId | PropId;

export interface Item {
  id: ItemId;
  kind: 'fish' | 'junk' | 'treasure'; // 生き物・ハズレ・当たり
  name: string;
  sub: string; // 正体画面の小見出し
  desc: string;
  kg: [number, number]; // 実際の重さの範囲（表示用）
  points: number;
  cost: number; // すくうときに消費する紙の強さ
  shadow: number; // 魚影の長さ（水槽単位）
  speed: number; // 巡航速度（水槽単位/秒）
  turn: number; // 最大旋回速度（rad/秒）
  depth: [number, number]; // 泳ぐ深さの範囲
  shyness: number; // ポイから逃げる距離（影の長さに対する倍率）。0なら逃げない
  pool: number; // 補充で出てくる重み（合計100なので、そのまま出現率%）
  slim?: number; // 魚影の太さの倍率（細長い影）
}

export const ITEMS: Record<ItemId, Item> = {
  kingyo: { id: 'kingyo', kind: 'fish', name: '金魚', sub: '和金', desc: '金魚すくいの定番。もとは中国でフナの変わりものから生まれた。', kg: [0.005, 0.03], points: 10, cost: 10, shadow: 0.1, speed: 0.09, turn: 3.2, depth: [0.03, 0.09], shyness: 1.6, pool: 38 },
  funa: { id: 'funa', kind: 'fish', name: 'フナ', sub: 'ギンブナ', desc: '池や川でおなじみの魚。金魚のご先祖さまの仲間。', kg: [0.05, 0.4], points: 20, cost: 18, shadow: 0.15, speed: 0.1, turn: 2.6, depth: [0.05, 0.14], shyness: 1.8, pool: 18 },
  koi: { id: 'koi', kind: 'fish', name: '鯉', sub: '錦鯉（紅白）', desc: '泳ぐ宝石とも呼ばれる。お祭りの水槽にいるはずがない。', kg: [1.5, 8], points: 50, cost: 32, shadow: 0.22, speed: 0.08, turn: 1.6, depth: [0.05, 0.12], shyness: 1.2, pool: 9.5 },
  sanma: { id: 'sanma', kind: 'fish', name: 'サンマ', sub: '秋刀魚', desc: '秋の味覚。ふだんは外洋を群れで泳ぐ。塩焼きにしたい。', kg: [0.1, 0.18], points: 60, cost: 26, shadow: 0.25, speed: 0.2, turn: 2.2, depth: [0.03, 0.08], shyness: 1.5, pool: 8, slim: 0.75 },
  buri: { id: 'buri', kind: 'fish', name: 'ブリ', sub: '出世魚', desc: '関東ではワカシ→イナダ→ワラサ→ブリと名前が変わる。', kg: [6, 12], points: 120, cost: 55, shadow: 0.32, speed: 0.15, turn: 1.4, depth: [0.07, 0.15], shyness: 1.1, pool: 5 },
  maguro: { id: 'maguro', kind: 'fish', name: 'マグロ', sub: 'クロマグロ', desc: '海のスピードスター。300kgを超えるものもいる。', kg: [80, 250], points: 300, cost: 75, shadow: 0.45, speed: 0.18, turn: 1.0, depth: [0.08, 0.16], shyness: 0.9, pool: 2 },
  unagi: { id: 'unagi', kind: 'fish', name: 'ウナギ', sub: 'ニホンウナギ', desc: 'はるか南、マリアナ諸島の近くの海で生まれて川へやってくる。', kg: [0.2, 0.8], points: 100, cost: 22, shadow: 0.3, speed: 0.12, turn: 2.4, depth: [0.06, 0.15], shyness: 1.4, pool: 4, slim: 0.5 },
  tako: { id: 'tako', kind: 'fish', name: 'タコ', sub: 'マダコ', desc: '8本の腕には吸盤がびっしり。危なくなると墨を吐く。', kg: [1, 3.5], points: 80, cost: 35, shadow: 0.2, speed: 0.05, turn: 1.5, depth: [0.08, 0.16], shyness: 1.0, pool: 5 },
  takara: { id: 'takara', kind: 'treasure', name: '宝箱', sub: '大当たり', desc: 'ずっしり重い。中には金貨と宝石がぎっしり！', kg: [8, 20], points: 500, cost: 70, shadow: 0.26, speed: 0.015, turn: 0.4, depth: [0.12, 0.17], shyness: 0, pool: 1.5 },
  can: { id: 'can', kind: 'junk', name: '空き缶', sub: 'ハズレ', desc: 'ジュースの空き缶。ごみはごみ箱へ。', kg: [0.015, 0.02], points: 0, cost: 8, shadow: 0.1, speed: 0.025, turn: 0.6, depth: [0.06, 0.14], shyness: 0, pool: 5 },
  boot: { id: 'boot', kind: 'junk', name: '長靴', sub: 'ハズレ', desc: '片方だけ。もう片方はどこへ……。', kg: [0.7, 1.1], points: 0, cost: 30, shadow: 0.2, speed: 0.02, turn: 0.5, depth: [0.08, 0.16], shyness: 0, pool: 3 },
  bike: { id: 'bike', kind: 'junk', name: '壊れた自転車', sub: '大ハズレ', desc: 'なぜ水槽に。前輪がぐにゃりと曲がっている。', kg: [11, 15], points: 0, cost: 95, shadow: 0.42, speed: 0.015, turn: 0.4, depth: [0.1, 0.17], shyness: 0, pool: 1 },
};

export const MAX_SHADOWS = 12;
// 開始時の影の数。正体は補充の重みで決める（大物は出さない）
export const START_SHADOWS = 10;
// 決まった時刻に入ってくる大物
export const EVENTS: { t: number; id: ItemId; msg: string }[] = [
  { t: 20, id: 'maguro', msg: '大きな魚影が入ってきた…！' },
  { t: 35, id: 'bike', msg: 'また大きな影が…？' },
  { t: 45, id: 'takara', msg: '底のほうに何か沈んでいる…？' },
];

export const RENDER = {
  maxDpr: 2,
  refractScale: 0.75, // 水中描画の解像度倍率
  simW: 128,
  simH: 192,
  simDamping: 0.985,
};
