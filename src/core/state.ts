// 状態の複製と、効果・進行から使う小さな変更関数。
// applyAction は「複製してから変更」するので、外から見ると純粋関数になる。

import { nextRandom } from './rng';
import { POINT_BY_ID } from './points';
import type { CardInstance, GameState, PlayerState, PointId, PointState, Side } from './types';

export function cloneState(s: GameState): GameState {
  const clonePlayer = (p: PlayerState): PlayerState => ({
    ...p,
    deck: p.deck.slice(),
    hand: p.hand.slice(),
    discard: p.discard.slice(),
    placedPoints: p.placedPoints.slice(),
  });
  return {
    ...s,
    players: { termite: clonePlayer(s.players.termite), pest: clonePlayer(s.players.pest) },
    points: s.points.map((pt) => ({ ...pt, stack: pt.stack.slice() })),
    log: s.log.slice(),
    stats: {
      termite: { drawn: { ...s.stats.termite.drawn }, played: { ...s.stats.termite.played } },
      pest: { drawn: { ...s.stats.pest.drawn }, played: { ...s.stats.pest.played } },
    },
  };
}

export function opponent(side: Side): Side {
  return side === 'termite' ? 'pest' : 'termite';
}

export function random(s: GameState): number {
  const [v, n] = nextRandom(s.rng);
  s.rng = n;
  return v;
}

export function log(s: GameState, side: Side, text: string): void {
  if (s.config.keepLog) s.log.push({ turn: s.turn, side, text });
}

export function getPoint(s: GameState, id: PointId): PointState {
  const p = s.points.find((pt) => pt.id === id);
  if (!p) throw new Error(`unknown point: ${id}`);
  return p;
}

/** 山札の上から n 枚引く。山札が尽きても捨て札は混ぜ直さない */
export function draw(s: GameState, side: Side, n: number): CardInstance[] {
  const p = s.players[side];
  const drawn: CardInstance[] = [];
  for (let i = 0; i < n && p.deck.length > 0; i++) {
    const c = p.deck.shift()!;
    p.hand.push(c);
    drawn.push(c);
    s.stats[side].drawn[c.defId] = (s.stats[side].drawn[c.defId] ?? 0) + 1;
  }
  return drawn;
}

/** 完全侵食に必要な枚数 */
export function infestationThreshold(s: GameState, id: PointId): number {
  // TODO(issue): 庭の枯れ木は4枚必要。庭の枯れ木が倒れたら、全ポイントの必要枚数を3→2にする
  void POINT_BY_ID[id];
  return s.config.infestationThreshold;
}

export function destroyedCount(s: GameState): number {
  return s.points.filter((p) => p.destroyed).length;
}

export function pointLabel(id: PointId): string {
  return POINT_BY_ID[id].name;
}
