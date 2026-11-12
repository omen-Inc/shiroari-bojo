import { newGame, type GameState, type PointId, type Side } from '../../src/core';

let uidSeq = 10_000;

/** テスト用:指定の陣営の手番で、手札を指定のカードにした状態を作る */
export function stateWithHand(side: Side, hand: string[], seed = 1): GameState {
  const s = newGame({ seed, first: side });
  s.players[side].hand = hand.map((defId) => ({ uid: uidSeq++, defId }));
  return s;
}

export function placeOnBoard(s: GameState, point: PointId, defIds: string[]): void {
  const pt = s.points.find((p) => p.id === point)!;
  for (const defId of defIds) pt.stack.push({ uid: uidSeq++, defId, owner: 'termite', turnPlaced: 0 });
}

export function uidOf(s: GameState, defId: string, side: Side = s.current): number {
  return s.players[side].hand.find((c) => c.defId === defId)!.uid;
}
