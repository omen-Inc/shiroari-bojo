import { describe, expect, it } from 'vitest';
import { applyAction, EFFECTS, type GameState, type PointId } from '../../src/core';
import { guardCount, soldierGuardBlocks } from '../../src/core/effects';
import { placeOnBoard, stateWithHand } from './helpers';

const stackOf = (s: GameState, id: PointId) => s.points.find((p) => p.id === id)!.stack;

/** 手札の薬剤散布を順に target へ撒く */
function sprayAll(s: GameState, target: PointId): GameState {
  for (const c of s.players.pest.hand.filter((h) => h.defId === 'spray')) {
    s = applyAction(s, { type: 'play', uid: c.uid, target });
  }
  return s;
}

describe('兵アリ', () => {
  it('効果は実装済み', () => {
    for (const id of ['soldier-yamato', 'soldier-ie', 'soldier-kanzai']) expect(EFFECTS[id].status).toBe('implemented');
  });

  it('兵アリ1枚で薬剤散布を1回無効化する(カードは除去されず、散布は捨て札・コストは払う)', () => {
    const s0 = stateWithHand('pest', ['spray']);
    placeOnBoard(s0, 'kitchen', ['worker-ie', 'soldier-yamato']);
    const s = sprayAll(s0, 'kitchen');
    expect(stackOf(s, 'kitchen').map((c) => c.defId)).toEqual(['worker-ie', 'soldier-yamato']);
    expect(stackOf(s, 'kitchen')[1].guardUsed).toBe(true);
    expect(s.players.termite.discard).toEqual([]);
    expect(s.players.pest.discard.map((c) => c.defId)).toEqual(['spray']);
    expect(s.players.pest.ap).toBe(2);
  });

  it('兵アリが最後に置かれていなくても無効化する(除去もされない)', () => {
    const s0 = stateWithHand('pest', ['spray']);
    placeOnBoard(s0, 'bath', ['soldier-ie', 'worker-ie']);
    const s = sprayAll(s0, 'bath');
    expect(stackOf(s, 'bath').map((c) => c.defId)).toEqual(['soldier-ie', 'worker-ie']);
  });

  it('兵アリ2枚なら2回無効化する', () => {
    const s0 = stateWithHand('pest', ['spray', 'spray']);
    placeOnBoard(s0, 'bath', ['soldier-ie', 'soldier-yamato']);
    const s = sprayAll(s0, 'bath');
    expect(stackOf(s, 'bath')).toHaveLength(2);
    expect(stackOf(s, 'bath').every((c) => c.guardUsed)).toBe(true);
    expect(guardCount(s, s.points.find((p) => p.id === 'bath')!)).toBe(0);
    expect(s.players.termite.discard).toEqual([]);
  });

  it('無効化を使い切った後の散布では、最後に置かれたカードが除去される(兵アリも対象)', () => {
    const s0 = stateWithHand('pest', ['spray', 'spray', 'spray']);
    placeOnBoard(s0, 'kitchen', ['worker-ie', 'soldier-yamato']);
    const s = sprayAll(s0, 'kitchen');
    // 1回目:無効化 / 2回目:兵アリを除去 / 3回目:職アリを除去
    expect(stackOf(s, 'kitchen')).toHaveLength(0);
    expect(s.players.termite.discard.map((c) => c.defId)).toEqual(['soldier-yamato', 'worker-ie']);
    // 捨て札には場の状態(guardUsed など)を持ち込まない
    expect(s.players.termite.discard[0]).not.toHaveProperty('guardUsed');
  });

  it('applyAction は元の状態を変更しない', () => {
    const s0 = stateWithHand('pest', ['spray']);
    placeOnBoard(s0, 'kitchen', ['worker-ie', 'soldier-yamato']);
    const snapshot = JSON.stringify(s0);
    const s = sprayAll(s0, 'kitchen');
    expect(JSON.stringify(s0)).toBe(snapshot);
    expect(stackOf(s0, 'kitchen')[1].guardUsed).toBeUndefined();
    expect(stackOf(s, 'kitchen')[1].guardUsed).toBe(true);
  });

  it('無効化したときにログを出す', () => {
    const s0 = stateWithHand('pest', ['spray', 'spray']);
    placeOnBoard(s0, 'kitchen', ['soldier-ie', 'soldier-yamato']);
    const first = sprayAll(s0, 'kitchen');
    const texts = first.log.map((l) => l.text);
    expect(texts).toContain('薬剤散布 は キッチン の 兵アリ-ヤマト に無効化された(残り無効化 1 回)');
    expect(texts).toContain('薬剤散布 は キッチン の 兵アリ-イエ に無効化された(残り無効化 0 回)');
    expect(first.log.filter((l) => l.text.includes('無効化された')).every((l) => l.side === 'pest')).toBe(true);
  });

  it('ベイト工法には兵アリの無効化が効かない(判定のみ)', () => {
    expect(soldierGuardBlocks('spray')).toBe(true);
    expect(soldierGuardBlocks('bait')).toBe(false);
  });
});
