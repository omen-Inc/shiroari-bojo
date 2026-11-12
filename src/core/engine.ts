// ルールエンジン本体。状態 + 行動 → 新しい状態(引数の状態は変更しない)。

import { DEFAULT_CARD_DEFS } from './data';
import { effectFor } from './effects';
import { POINTS } from './points';
import { seedFrom, shuffleInPlace } from './rng';
import { cloneState, destroyedCount, draw, log, opponent, random } from './state';
import type { Action, CardDef, CardInstance, GameConfig, GameState, PointId, Side } from './types';

export const DEFAULT_CONFIG: GameConfig = {
  handSize: 5,
  apPerTurn: 3,
  infestationThreshold: 3,
  pointsToWin: 5,
  maxTurns: 400,
  keepLog: true,
};

export interface NewGameOptions {
  seed: number | string;
  /** 先攻。省略時はコイントス(シード付き乱数) */
  first?: Side;
  defs?: Record<string, CardDef>;
  config?: Partial<GameConfig>;
}

export const SIDE_LABEL: Record<Side, string> = { termite: 'シロアリ側', pest: '防除業者側' };

/** 陣営別の山札を作る(カード一覧の「枚数(シロアリ山札)」「枚数(防除山札)」から) */
export function buildDeck(defs: Record<string, CardDef>, side: Side, startUid = 1): CardInstance[] {
  const deck: CardInstance[] = [];
  let uid = startUid;
  for (const def of Object.values(defs)) {
    const n = side === 'termite' ? def.counts.termite : def.counts.pest;
    for (let i = 0; i < n; i++) deck.push({ uid: uid++, defId: def.id });
  }
  return deck;
}

export function newGame(opts: NewGameOptions): GameState {
  const defs = opts.defs ?? DEFAULT_CARD_DEFS;
  const config = { ...DEFAULT_CONFIG, ...opts.config };
  let rng = seedFrom(opts.seed);
  const termiteDeck = buildDeck(defs, 'termite', 1);
  const pestDeck = buildDeck(defs, 'pest', termiteDeck.length + 1);
  rng = shuffleInPlace(termiteDeck, rng);
  rng = shuffleInPlace(pestDeck, rng);
  // TODO(issue): 女王アリ(山札外・種類ごとに1枚)を別の置き場に用意する

  const emptyPlayer = (side: Side, deck: CardInstance[]) => ({
    side,
    deck,
    hand: [] as CardInstance[],
    discard: [] as CardInstance[],
    ap: 0,
    placedPoints: [] as PointId[],
    playedThisTurn: 0,
  });

  const s: GameState = {
    config,
    defs,
    rng,
    turn: 1,
    first: 'termite',
    current: 'termite',
    players: { termite: emptyPlayer('termite', termiteDeck), pest: emptyPlayer('pest', pestDeck) },
    points: POINTS.map((p) => ({ id: p.id, stack: [], destroyed: false })),
    winner: null,
    winReason: null,
    finished: false,
    nextUid: termiteDeck.length + pestDeck.length + 1,
    log: [],
    stats: { termite: { drawn: {}, played: {} }, pest: { drawn: {}, played: {} } },
  };

  // 先攻・後攻はコイントス
  const first = opts.first ?? (random(s) < 0.5 ? 'termite' : 'pest');
  s.first = first;
  s.current = first;

  draw(s, 'termite', config.handSize);
  draw(s, 'pest', config.handSize);
  log(s, first, `${SIDE_LABEL[first]}が先攻`);
  startTurn(s);
  return s;
}

function startTurn(s: GameState): void {
  const p = s.players[s.current];
  p.ap = s.config.apPerTurn; // 余った行動力は持ち越さない
  p.placedPoints = [];
  p.playedThisTurn = 0;
  // TODO(issue): 「次の自分のターンまで」の効果(大量発生など)を、使った人のターン開始時に切る
  // TODO(issue): 羽アリ → 女王アリの入れ替え(シロアリ側のターン開始時)
  // TODO(issue): ベイト工法の発動(置いてから2回目の防除側ターン開始時)
  // TODO(issue): バリア工法の残りターンを減らす
}

function checkTermiteWin(s: GameState): boolean {
  if (destroyedCount(s) >= s.config.pointsToWin) {
    finish(s, 'termite', 'infestation');
    return true;
  }
  return false;
}

function finish(s: GameState, winner: Side | null, reason: GameState['winReason']): void {
  s.winner = winner;
  s.winReason = reason;
  s.finished = true;
  if (winner) log(s, winner, `${SIDE_LABEL[winner]}の勝利(${reason === 'infestation' ? '5ポイント完全侵食' : 'シロアリ山札切れ'})`);
  else log(s, s.current, 'ターン数の上限に達したため引き分け');
}

/** 手詰まり防止が使えるか:このターン1枚も使っておらず、手札と山札がある */
export function canRedraw(s: GameState, side: Side = s.current): boolean {
  const p = s.players[side];
  return !s.finished && s.current === side && p.playedThisTurn === 0 && p.hand.length > 0 && p.deck.length > 0;
}

function endTurn(s: GameState, discardUid?: number): void {
  const side = s.current;
  const p = s.players[side];
  // 手詰まり防止:1枚も使わなかったターンは、補充の前に手札を1枚捨てて1枚引ける(任意)
  if (discardUid !== undefined) {
    const idx = p.hand.findIndex((c) => c.uid === discardUid);
    const [card] = p.hand.splice(idx, 1);
    p.discard.push(card);
    log(s, side, `手詰まり防止:${s.defs[card.defId]?.name ?? card.defId} を捨てて1枚引いた`);
    draw(s, side, 1);
  }
  // 補充:手札が5枚になるまで引く。5枚を超えていれば引かない
  if (p.hand.length < s.config.handSize) draw(s, side, s.config.handSize - p.hand.length);
  // TODO(issue): 手札上限7枚 — ターン終了時に8枚以上あれば、7枚になるまで好きなカードを捨てる(捨て札へ)

  // 防除業者側の勝利:シロアリ山札がなくなるまで守りきる(シロアリ側のターン終わりの補充後に判定する。解釈)
  if (side === 'termite' && p.deck.length === 0) {
    finish(s, 'pest', 'deckOut');
    return;
  }
  if (s.turn >= s.config.maxTurns) {
    finish(s, null, 'turnLimit');
    return;
  }
  s.turn += 1;
  s.current = opponent(side);
  startTurn(s);
}

export interface PlayOption {
  uid: number;
  defId: string;
  cost: number;
  affordable: boolean;
  usable: boolean;
  needsTarget: boolean;
  targets: PointId[];
}

/** 手札の各カードについて、使えるかどうかと対象の候補を返す(UI 用) */
export function handOptions(s: GameState, side: Side = s.current): PlayOption[] {
  const p = s.players[side];
  return p.hand.map((c) => {
    const def = s.defs[c.defId];
    const eff = effectFor(def);
    const cost = def.cost ?? 0;
    const affordable = def.cost !== null && cost <= p.ap;
    const targets = eff.needsTarget ? eff.targets(s, side, def) : [];
    const usable =
      !s.finished && s.current === side && affordable && eff.canUse(s, side, def) && (!eff.needsTarget || targets.length > 0);
    return { uid: c.uid, defId: c.defId, cost, affordable, usable, needsTarget: eff.needsTarget, targets };
  });
}

/** 合法手の列挙。ターン終了は常に合法 */
export function legalActions(s: GameState): Action[] {
  if (s.finished) return [];
  const actions: Action[] = [];
  for (const o of handOptions(s)) {
    if (!o.usable) continue;
    if (o.needsTarget) for (const t of o.targets) actions.push({ type: 'play', uid: o.uid, target: t });
    else actions.push({ type: 'play', uid: o.uid });
  }
  actions.push({ type: 'endTurn' });
  if (canRedraw(s)) for (const c of s.players[s.current].hand) actions.push({ type: 'endTurn', discardUid: c.uid });
  return actions;
}

export function isLegal(s: GameState, a: Action): boolean {
  return legalActions(s).some((b) => {
    if (a.type === 'endTurn') return b.type === 'endTurn' && b.discardUid === a.discardUid;
    return b.type === 'play' && b.uid === a.uid && b.target === a.target;
  });
}

/** 状態 + 行動 → 新しい状態。不正な行動は例外を投げる */
export function applyAction(state: GameState, action: Action): GameState {
  if (state.finished) throw new Error('game is finished');
  if (!isLegal(state, action)) throw new Error(`illegal action: ${JSON.stringify(action)}`);
  const s = cloneState(state);
  if (action.type === 'endTurn') {
    endTurn(s, action.discardUid);
    return s;
  }
  const side = s.current;
  const p = s.players[side];
  const idx = p.hand.findIndex((c) => c.uid === action.uid);
  const card = p.hand[idx];
  const def = s.defs[card.defId];
  p.hand.splice(idx, 1);
  p.ap -= def.cost ?? 0;
  p.playedThisTurn += 1;
  s.stats[side].played[def.id] = (s.stats[side].played[def.id] ?? 0) + 1;
  effectFor(def).resolve(s, side, card, def, action.target);
  checkTermiteWin(s);
  return s;
}

/** 勝利に必要な残りポイント数など、表示用の要約 */
export function summary(s: GameState) {
  return {
    turn: s.turn,
    current: s.current,
    destroyed: destroyedCount(s),
    pointsToWin: s.config.pointsToWin,
    deck: { termite: s.players.termite.deck.length, pest: s.players.pest.deck.length },
    winner: s.winner,
    winReason: s.winReason,
  };
}
