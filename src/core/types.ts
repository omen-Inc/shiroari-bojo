// ルールエンジンの型。DOM に依存しない。

export type Side = 'termite' | 'pest';
export type CardSide = Side | 'neutral';

export type Species = 'yamato' | 'ie' | 'kanzai';
export type Caste = 'worker' | 'soldier' | 'winged' | 'queen';

/** 区分(Notion のカード一覧「区分」に対応) */
export type CardKind = 'termite' | 'event' | 'neutral' | 'control' | 'extermination' | 'unknown';

export type PointId =
  | 'bath'
  | 'kitchen'
  | 'underfloor'
  | 'entrance'
  | 'garden'
  | 'deck'
  | 'beam'
  | 'attic';

/** docs/spec/cards.json の1行 */
export interface CardRecord {
  id: string;
  name: string;
  category: string;
  status: string;
  cost: number | null;
  counts: { termite: number; pest: number; outside: number };
  effect: string;
  favored?: string;
  memo?: string;
  basis?: string;
  notionPageId?: string;
}

export interface CardsFile {
  source?: { databaseId?: string; note?: string };
  cards: CardRecord[];
}

/** エンジンが使うカード定義 */
export interface CardDef {
  id: string;
  name: string;
  category: string;
  kind: CardKind;
  side: CardSide;
  status: string;
  cost: number | null;
  counts: { termite: number; pest: number; outside: number };
  effect: string;
  species?: Species;
  caste?: Caste;
}

export interface CardInstance {
  uid: number;
  defId: string;
}

export interface PlacedCard extends CardInstance {
  owner: Side;
  turnPlaced: number;
  /** 兵アリの薬剤散布無効化(1枚につき1回)を使ったか。兵アリ以外では使わない。未設定は未使用 */
  guardUsed?: boolean;
}

export interface PointState {
  id: PointId;
  /** 置かれたシロアリカード(先頭が古い。末尾が最後に置かれたカード) */
  stack: PlacedCard[];
  destroyed: boolean;
  // TODO(issue): バリア工法 — 置いてから3ターンの間シロアリカードを置けなくする(barrierUntilTurn など)
  // TODO(issue): ベイト工法 — 置いてから2回目の自分のターン開始時に発動(bait: { placedTurn, owner } など)
  // TODO(issue): 大量発生 — シロアリ側の次のターン開始時まで防除・駆除カードを置けなくする(swarmUntilTurn など)
}

export interface PlayerState {
  side: Side;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  ap: number;
  /** このターンにシロアリカードを置いたポイント(同じポイントへ1ターン1枚) */
  placedPoints: PointId[];
  /** このターンに使ったカードの枚数(手詰まり防止ルール用) */
  playedThisTurn: number;
}

export interface SideStats {
  /** 手札に来た回数(初期手札・補充・効果によるドローを含む) */
  drawn: Record<string, number>;
  /** 使った回数 */
  played: Record<string, number>;
}

export type WinReason = 'infestation' | 'deckOut' | 'turnLimit';

export interface LogEntry {
  turn: number;
  side: Side;
  text: string;
}

export interface GameConfig {
  handSize: number;
  apPerTurn: number;
  infestationThreshold: number;
  pointsToWin: number;
  /** 無限ループ防止の安全装置。ルール上の上限ではない */
  maxTurns: number;
  keepLog: boolean;
}

export interface GameState {
  config: GameConfig;
  /** カード定義(不変。状態を複製するときは参照を共有する) */
  defs: Readonly<Record<string, CardDef>>;
  /** シード付き乱数の内部状態(uint32) */
  rng: number;
  /** 通算ターン数(片方の手番1回 = 1ターン)。1 から始まる */
  turn: number;
  first: Side;
  current: Side;
  players: Record<Side, PlayerState>;
  points: PointState[];
  winner: Side | null;
  winReason: WinReason | null;
  finished: boolean;
  nextUid: number;
  log: LogEntry[];
  stats: Record<Side, SideStats>;
}

export type Action =
  | { type: 'play'; uid: number; target?: PointId }
  /** discardUid:手詰まり防止(1枚も使わなかったターンは、補充の前に手札を1枚捨てて1枚引ける) */
  | { type: 'endTurn'; discardUid?: number };
