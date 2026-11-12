// CPU の思考。エンジンの合法手列挙(legalActions)の上に作る。
// 方針:「出せる手からランダム + 少しの賢さ」
//  - シロアリ側:完全侵食に近いポイントへ優先して置く(あと1枚で完全侵食なら最優先)
//  - 防除業者側:完全侵食に近いポイントを優先して薬剤散布する
//  - 効果が未実装のカードは、他に出す手がないときに使って手札を回す
//  - 1枚も使えなかったターンは、手詰まり防止で「今後も使えないカード」を捨てて引き直す
//  - epsilon の確率で合法手からランダムに選ぶ
// TODO(issue): 相手の手札・山札を見ずに考える(現状は状態をすべて見ている)
// TODO(issue): 難易度設定(epsilon や評価の重みを変える)

import { effectFor } from '../effects';
import { applyAction, legalActions } from '../engine';
import type { Rng } from '../rng';
import { POINT_BY_ID } from '../points';
import { infestationThreshold } from '../state';
import type { Action, GameState } from '../types';

export interface AiOptions {
  /** ランダムに選ぶ確率 */
  epsilon: number;
}

export const DEFAULT_AI: AiOptions = { epsilon: 0.1 };

/** そのカードを今後も使えない見込みか(置けるポイントがすべて完全侵食済みのシロアリカード) */
function isDeadCard(s: GameState, defId: string): boolean {
  const def = s.defs[defId];
  if (def.kind !== 'termite' || !def.species) return false;
  return s.points.every((p) => p.destroyed || !POINT_BY_ID[p.id].allowed.includes(def.species!));
}

export function scoreAction(s: GameState, a: Action, rng: Rng): number {
  const side = s.current;
  if (a.type === 'endTurn') {
    if (a.discardUid === undefined) return 0;
    // 手詰まり防止:今後も使えないカードがあれば、それを捨てて引き直す
    const card = s.players[side].hand.find((c) => c.uid === a.discardUid)!;
    return isDeadCard(s, card.defId) ? 0.5 + rng.next() * 0.1 : -1;
  }
  const card = s.players[side].hand.find((c) => c.uid === a.uid)!;
  const def = s.defs[card.defId];
  const eff = effectFor(def);
  const noise = rng.next() * 5;
  if (eff.status === 'todo') return 1 + rng.next();
  if (!a.target) return 5 + noise;
  const pt = s.points.find((p) => p.id === a.target)!;
  const need = infestationThreshold(s, pt.id);
  const n = pt.stack.length;
  if (side === 'termite') {
    let score = 10 + n * 10 + noise;
    if (n + 1 >= need) score += 100;
    return score;
  }
  // 防除業者側(薬剤散布)
  let score = 10 + n * 15 + noise;
  if (n + 1 >= need) score += 100;
  return score;
}

export function chooseAction(s: GameState, rng: Rng, opts: AiOptions = DEFAULT_AI): Action {
  const actions = legalActions(s);
  if (actions.length === 0) throw new Error('no legal actions');
  if (actions.length > 1 && rng.next() < opts.epsilon) {
    // ランダムな手(ターン終了はランダム枠では選ばない)
    const plays = actions.filter((a) => a.type === 'play');
    if (plays.length > 0) return plays[rng.int(plays.length)];
  }
  let best = actions[0];
  let bestScore = -Infinity;
  for (const a of actions) {
    const sc = scoreAction(s, a, rng);
    if (sc > bestScore) {
      best = a;
      bestScore = sc;
    }
  }
  return best;
}

/** 現在の手番が終わるまで CPU に指させ、途中の状態をすべて返す(UI の演出用) */
export function playTurn(s: GameState, rng: Rng, opts: AiOptions = DEFAULT_AI): GameState[] {
  const states: GameState[] = [];
  const side = s.current;
  let cur = s;
  let guard = 0;
  while (!cur.finished && cur.current === side && guard++ < 100) {
    cur = applyAction(cur, chooseAction(cur, rng, opts));
    states.push(cur);
  }
  return states;
}
