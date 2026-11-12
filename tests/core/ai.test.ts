import { describe, expect, it } from 'vitest';
import { applyAction, createRng, newGame } from '../../src/core';
import { chooseAction } from '../../src/core/ai';
import { runSimulation } from '../../src/core/sim';
import { placeOnBoard, stateWithHand } from './helpers';

describe('CPU', () => {
  it('シロアリ側は、あと1枚で完全侵食のポイントに置く', () => {
    const s = stateWithHand('termite', ['worker-ie']);
    placeOnBoard(s, 'entrance', ['worker-ie', 'worker-ie']);
    placeOnBoard(s, 'bath', ['worker-ie']);
    const a = chooseAction(s, createRng(1), { epsilon: 0 });
    expect(a).toMatchObject({ type: 'play', target: 'entrance' });
  });

  it('防除業者側は、完全侵食目前のポイントを守る', () => {
    const s = stateWithHand('pest', ['spray']);
    placeOnBoard(s, 'bath', ['worker-ie']);
    placeOnBoard(s, 'attic', ['worker-ie', 'worker-kanzai']);
    const a = chooseAction(s, createRng(1), { epsilon: 0 });
    expect(a).toMatchObject({ type: 'play', target: 'attic' });
  });

  it('出せる手がなければターン終了', () => {
    const s = stateWithHand('pest', ['spray']);
    expect(chooseAction(s, createRng(1))).toEqual({ type: 'endTurn' });
  });

  it('CPU 同士で最後まで対戦でき、同じシードなら同じ結果', () => {
    const play = (seed: number) => {
      let s = newGame({ seed });
      const rng = createRng(seed);
      while (!s.finished) s = applyAction(s, chooseAction(s, rng));
      return { winner: s.winner, turn: s.turn };
    };
    const a = play(123);
    expect(a).toEqual(play(123));
    expect(a.turn).toBeGreaterThan(1);
  });
});

describe('シミュレーター', () => {
  it('JSON の形式と再現性', () => {
    const r = runSimulation({ games: 30, seed: 5 });
    expect(r.games).toBe(30);
    expect(r.winRate.termite + r.winRate.pest + r.draws / 30).toBeCloseTo(1, 3);
    expect(r.avgTurns).toBeGreaterThan(0);
    const spray = r.cards.find((c) => c.id === 'spray')!;
    expect(spray).toMatchObject({ name: '薬剤散布', side: 'pest' });
    expect(spray.useRate).toBeGreaterThan(0);
    expect(r.cards.some((c) => c.id === 'queen')).toBe(false);
    expect(runSimulation({ games: 30, seed: 5 })).toEqual(r);
  });
});

describe('CPU の手詰まり防止', () => {
  it('置ける場所がなくなったカードを捨てて引き直す', () => {
    const s = stateWithHand('termite', ['worker-kanzai', 'worker-kanzai']);
    for (const id of ['beam', 'attic'] as const) {
      placeOnBoard(s, id, ['worker-ie', 'worker-ie', 'worker-ie']);
      s.points.find((p) => p.id === id)!.destroyed = true;
    }
    const a = chooseAction(s, createRng(1), { epsilon: 0 });
    expect(a.type).toBe('endTurn');
    expect(a.type === 'endTurn' && a.discardUid).toBeTruthy();
  });
});
