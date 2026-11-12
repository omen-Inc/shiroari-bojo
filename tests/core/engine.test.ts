import { describe, expect, it } from 'vitest';
import {
  applyAction,
  buildDeck,
  DEFAULT_CARD_DEFS,
  handOptions,
  legalActions,
  newGame,
  type Action,
  type PointId,
} from '../../src/core';
import { placeOnBoard, stateWithHand, uidOf } from './helpers';

const targetsOf = (s: ReturnType<typeof newGame>, defId: string) =>
  handOptions(s).find((o) => o.defId === defId)!.targets.slice().sort();

describe('山札と初期状態', () => {
  it('陣営別の山札はカード一覧の枚数どおり(各50枚、女王アリは入らない)', () => {
    const termite = buildDeck(DEFAULT_CARD_DEFS, 'termite');
    const pest = buildDeck(DEFAULT_CARD_DEFS, 'pest');
    expect(termite).toHaveLength(50);
    expect(pest).toHaveLength(50);
    expect(termite.filter((c) => c.defId === 'worker-ie')).toHaveLength(12);
    expect(pest.filter((c) => c.defId === 'spray')).toHaveLength(15);
    expect(pest.filter((c) => c.defId === 'reinforce')).toHaveLength(7);
    expect(termite.some((c) => c.defId === 'queen')).toBe(false);
  });

  it('初期手札は5枚、山札は45枚、手番の行動力は3', () => {
    const s = newGame({ seed: 42 });
    for (const side of ['termite', 'pest'] as const) {
      expect(s.players[side].hand).toHaveLength(5);
      expect(s.players[side].deck).toHaveLength(45);
    }
    expect(s.players[s.current].ap).toBe(3);
    expect(s.turn).toBe(1);
  });

  it('同じシードなら同じ結果、違うシードなら違う山札', () => {
    const a = newGame({ seed: 7 });
    const b = newGame({ seed: 7 });
    const c = newGame({ seed: 8 });
    expect(a.players.termite.deck).toEqual(b.players.termite.deck);
    expect(a.first).toBe(b.first);
    expect(a.players.termite.deck.map((x) => x.defId)).not.toEqual(c.players.termite.deck.map((x) => x.defId));
  });

  it('先攻はコイントスで両方ありうる', () => {
    const firsts = new Set(Array.from({ length: 20 }, (_, i) => newGame({ seed: i }).first));
    expect(firsts).toEqual(new Set(['termite', 'pest']));
  });
});

describe('ポイントと置ける種類', () => {
  it('ヤマトは水回りだけ、カンザイは上部だけ、イエはどこでも', () => {
    const s = stateWithHand('termite', ['worker-yamato', 'worker-kanzai', 'worker-ie']);
    expect(targetsOf(s, 'worker-yamato')).toEqual(['bath', 'kitchen']);
    expect(targetsOf(s, 'worker-kanzai')).toEqual(['attic', 'beam']);
    expect(targetsOf(s, 'worker-ie')).toHaveLength(8);
  });

  it('シロアリカードは1ターンに同じポイントへ1枚まで', () => {
    let s = stateWithHand('termite', ['worker-ie', 'worker-ie']);
    const [a, b] = s.players.termite.hand;
    s = applyAction(s, { type: 'play', uid: a.uid, target: 'kitchen' });
    expect(() => applyAction(s, { type: 'play', uid: b.uid, target: 'kitchen' })).toThrow(/illegal/);
    s = applyAction(s, { type: 'play', uid: b.uid, target: 'bath' });
    expect(s.points.find((p) => p.id === 'bath')!.stack).toHaveLength(1);
  });

  it('次のターンには同じポイントへまた置ける', () => {
    let s = stateWithHand('termite', ['worker-ie']);
    s = applyAction(s, { type: 'play', uid: uidOf(s, 'worker-ie'), target: 'deck' });
    s = applyAction(s, { type: 'endTurn' });
    s = applyAction(s, { type: 'endTurn' });
    expect(s.current).toBe('termite');
    expect(s.players.termite.placedPoints).toEqual([]);
  });
});

describe('行動力とコスト', () => {
  it('コストを行動力から払い、足りなければ使えない', () => {
    let s = stateWithHand('termite', ['worker-ie', 'worker-ie', 'soldier-ie']);
    const [a, b, c] = s.players.termite.hand;
    s = applyAction(s, { type: 'play', uid: a.uid, target: 'bath' });
    s = applyAction(s, { type: 'play', uid: b.uid, target: 'kitchen' });
    expect(s.players.termite.ap).toBe(1);
    expect(handOptions(s).find((o) => o.uid === c.uid)!.usable).toBe(false);
  });

  it('余った行動力は持ち越さない', () => {
    let s = stateWithHand('termite', ['worker-ie']);
    s = applyAction(s, { type: 'endTurn' });
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players.termite.ap).toBe(3);
  });
});

describe('薬剤散布', () => {
  it('最後に置かれたカードを1枚除去し、シロアリ側の捨て札へ', () => {
    const s0 = stateWithHand('pest', ['spray']);
    placeOnBoard(s0, 'kitchen', ['worker-ie', 'worker-yamato']);
    const s = applyAction(s0, { type: 'play', uid: uidOf(s0, 'spray'), target: 'kitchen' });
    const kitchen = s.points.find((p) => p.id === 'kitchen')!;
    expect(kitchen.stack.map((c) => c.defId)).toEqual(['worker-ie']);
    expect(s.players.termite.discard.map((c) => c.defId)).toContain('worker-yamato');
    expect(s.players.pest.discard.map((c) => c.defId)).toContain('spray');
    expect(s.players.pest.ap).toBe(2);
  });

  it('シロアリのいないポイント・完全侵食されたポイントには使えない', () => {
    const s = stateWithHand('pest', ['spray']);
    placeOnBoard(s, 'bath', ['worker-ie']);
    placeOnBoard(s, 'attic', ['worker-ie', 'worker-ie', 'worker-ie']);
    s.points.find((p) => p.id === 'attic')!.destroyed = true;
    expect(targetsOf(s, 'spray')).toEqual(['bath']);
  });

  it('連続で使える', () => {
    let s = stateWithHand('pest', ['spray', 'spray']);
    placeOnBoard(s, 'bath', ['worker-ie', 'worker-ie']);
    for (const c of s.players.pest.hand.slice()) s = applyAction(s, { type: 'play', uid: c.uid, target: 'bath' });
    expect(s.points.find((p) => p.id === 'bath')!.stack).toHaveLength(0);
  });
});

describe('完全侵食と勝利条件', () => {
  it('3枚で完全侵食になり、以降は対象外', () => {
    let s = stateWithHand('termite', ['worker-ie']);
    placeOnBoard(s, 'deck', ['worker-ie', 'worker-ie']);
    s = applyAction(s, { type: 'play', uid: uidOf(s, 'worker-ie'), target: 'deck' });
    expect(s.points.find((p) => p.id === 'deck')!.destroyed).toBe(true);
    const s2 = stateWithHand('termite', ['worker-ie']);
    s2.points = s.points;
    expect(targetsOf(s2, 'worker-ie')).not.toContain('deck');
  });

  it('5ポイント完全侵食でシロアリ側の勝ち', () => {
    let s = stateWithHand('termite', ['worker-ie']);
    const done: PointId[] = ['bath', 'kitchen', 'underfloor', 'entrance'];
    for (const id of done) {
      placeOnBoard(s, id, ['worker-ie', 'worker-ie', 'worker-ie']);
      s.points.find((p) => p.id === id)!.destroyed = true;
    }
    placeOnBoard(s, 'beam', ['worker-ie', 'worker-ie']);
    s = applyAction(s, { type: 'play', uid: uidOf(s, 'worker-ie'), target: 'beam' });
    expect(s.finished).toBe(true);
    expect(s.winner).toBe('termite');
    expect(s.winReason).toBe('infestation');
    expect(legalActions(s)).toEqual([]);
  });

  it('シロアリ山札が尽きたら防除業者側の勝ち(シロアリ側のターン終わりに判定)', () => {
    let s = stateWithHand('termite', ['worker-ie']);
    s.players.termite.deck = [{ uid: 99_999, defId: 'worker-ie' }];
    s = applyAction(s, { type: 'play', uid: uidOf(s, 'worker-ie'), target: 'bath' });
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players.termite.deck).toHaveLength(0);
    expect(s.winner).toBe('pest');
    expect(s.winReason).toBe('deckOut');
  });
});

describe('補充と進行', () => {
  it('ターンの終わりに5枚まで補充する(5枚以上なら引かない)', () => {
    let s = stateWithHand('termite', ['worker-ie', 'worker-ie']);
    const deckBefore = s.players.termite.deck.length;
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players.termite.hand).toHaveLength(5);
    expect(s.players.termite.deck).toHaveLength(deckBefore - 3);
    expect(s.current).toBe('pest');
    expect(s.turn).toBe(2);

    let t = stateWithHand('pest', ['spray', 'spray', 'spray', 'spray', 'spray', 'spray']);
    const pestDeck = t.players.pest.deck.length;
    t = applyAction(t, { type: 'endTurn' });
    expect(t.players.pest.hand).toHaveLength(6);
    expect(t.players.pest.deck).toHaveLength(pestDeck);
  });

  it('applyAction は元の状態を変更しない', () => {
    const s = stateWithHand('termite', ['worker-ie']);
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: 'play', uid: uidOf(s, 'worker-ie'), target: 'bath' });
    applyAction(s, { type: 'endTurn' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('不正な行動は例外', () => {
    const s = stateWithHand('termite', ['worker-yamato']);
    const bad: Action = { type: 'play', uid: uidOf(s, 'worker-yamato'), target: 'attic' };
    expect(() => applyAction(s, bad)).toThrow();
  });
});

describe('未実装カード', () => {
  it('効果未実装のカードはコストを払って捨て札になるだけ', () => {
    let s = stateWithHand('pest', ['barrier']);
    s = applyAction(s, { type: 'play', uid: uidOf(s, 'barrier') });
    expect(s.players.pest.ap).toBe(1);
    expect(s.players.pest.discard.map((c) => c.defId)).toEqual(['barrier']);
  });

  it('兵アリ・羽アリは1枚分として置ける(特殊効果は未実装)', () => {
    let s = stateWithHand('termite', ['soldier-kanzai']);
    s = applyAction(s, { type: 'play', uid: uidOf(s, 'soldier-kanzai'), target: 'beam' });
    expect(s.points.find((p) => p.id === 'beam')!.stack).toHaveLength(1);
    expect(s.players.termite.ap).toBe(1);
  });
});

describe('手詰まり防止', () => {
  it('1枚も使わなかったターンは、補充の前に手札を1枚捨てて1枚引ける', () => {
    let s = stateWithHand('termite', ['worker-yamato', 'worker-ie']);
    const yamato = uidOf(s, 'worker-yamato');
    const deckBefore = s.players.termite.deck.length;
    expect(legalActions(s)).toContainEqual({ type: 'endTurn', discardUid: yamato });
    s = applyAction(s, { type: 'endTurn', discardUid: yamato });
    expect(s.players.termite.discard.map((c) => c.uid)).toEqual([yamato]);
    expect(s.players.termite.hand).toHaveLength(5);
    // 2枚 → 1枚捨てて1枚引く(2枚)→ 補充で3枚引く(5枚)
    expect(s.players.termite.deck).toHaveLength(deckBefore - 4);
  });

  it('1枚でも使ったターンは使えない', () => {
    let s = stateWithHand('termite', ['worker-ie', 'worker-ie']);
    const [a, b] = s.players.termite.hand;
    s = applyAction(s, { type: 'play', uid: a.uid, target: 'bath' });
    expect(() => applyAction(s, { type: 'endTurn', discardUid: b.uid })).toThrow(/illegal/);
  });
});
