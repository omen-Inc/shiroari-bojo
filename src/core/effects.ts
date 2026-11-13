// カードごとの効果。カードID(src/core/cardIds.ts)で対応づける。
//  status: implemented = 実装済み / partial = 一部のみ / todo = 未実装(使うとコストを払って捨て札になるだけ)

import { POINT_BY_ID } from './points';
import { destroyedCount, getPoint, infestationThreshold, log, pointLabel } from './state';
import type { CardDef, CardInstance, GameState, PlacedCard, PointId, PointState, Side } from './types';

export type EffectStatus = 'implemented' | 'partial' | 'todo';

export interface CardEffect {
  status: EffectStatus;
  /** 対象のポイントが必要なカードは true */
  needsTarget: boolean;
  /** 対象の候補(needsTarget のときだけ使う) */
  targets(s: GameState, side: Side, def: CardDef): PointId[];
  /** 対象以外の使用条件 */
  canUse(s: GameState, side: Side, def: CardDef): boolean;
  /** 効果の解決。s は複製済みの状態なので変更してよい。カードの移動(手札→場/捨て札)も行う */
  resolve(s: GameState, side: Side, card: CardInstance, def: CardDef, target?: PointId): void;
}

const always = () => true;
const noTargets = () => [] as PointId[];

function toDiscard(s: GameState, side: Side, card: CardInstance): void {
  s.players[side].discard.push(card);
}

/** シロアリカードを置ける場所:種類の対応表に合う・完全侵食されていない・このターンまだ置いていない */
function termitePlacementTargets(s: GameState, side: Side, def: CardDef): PointId[] {
  if (side !== 'termite' || !def.species) return [];
  const placed = s.players[side].placedPoints;
  return s.points
    .filter((p) => !p.destroyed && POINT_BY_ID[p.id].allowed.includes(def.species!) && !placed.includes(p.id))
    // TODO(issue): バリア工法が有効なポイントには置けない
    .map((p) => p.id);
}

function placeTermite(s: GameState, side: Side, card: CardInstance, def: CardDef, target?: PointId): void {
  if (!target) throw new Error('target required');
  const pt = getPoint(s, target);
  pt.stack.push({ ...card, owner: side, turnPlaced: s.turn });
  s.players[side].placedPoints.push(target);
  log(s, side, `${def.name} を ${pointLabel(target)} に置いた(${pt.stack.length}/${infestationThreshold(s, target)})`);
  if (pt.stack.length >= infestationThreshold(s, target)) {
    pt.destroyed = true;
    log(s, side, `${pointLabel(target)} が完全侵食された(${destroyedCount(s)}/${s.config.pointsToWin})`);
  }
}

const workerEffect: CardEffect = {
  status: 'implemented',
  needsTarget: true,
  targets: termitePlacementTargets,
  canUse: always,
  resolve: placeTermite,
};

// 兵アリ — 置く処理は職アリと同じ。いるポイントへの薬剤散布を1回無効化する(兵アリ1枚につき1回)。
//          無効化の判定は sprayEffect.resolve から guardIndex を使って行う。ベイト工法は防げない(soldierGuardBlocks)。
const soldierEffect: CardEffect = { ...workerEffect, status: 'implemented' };

/** 兵アリの無効化が効く除去の種類 */
export type RemovalKind = 'spray' | 'bait';

/**
 * 兵アリの無効化がその除去に効くか。薬剤散布には効き、ベイト工法には効かない。
 * ベイト工法の除去処理を実装するときは、兵アリの無効化を確認せずにそのまま除去する(この関数が false を返す)。
 */
export function soldierGuardBlocks(kind: RemovalKind): boolean {
  return kind === 'spray';
}

/** 無効化をまだ使っていない兵アリか */
export function hasGuard(s: GameState, c: PlacedCard): boolean {
  return s.defs[c.defId]?.caste === 'soldier' && !c.guardUsed;
}

/** 無効化をまだ使っていない兵アリのうち、最後に置かれたものの添字(いなければ -1) */
export function guardIndex(s: GameState, pt: PointState): number {
  for (let i = pt.stack.length - 1; i >= 0; i--) if (hasGuard(s, pt.stack[i])) return i;
  return -1;
}

/** ポイントに残っている無効化の回数 */
export function guardCount(s: GameState, pt: PointState): number {
  return pt.stack.filter((c) => hasGuard(s, c)).length;
}

// TODO(issue): 羽アリ — 次の自分のターン開始時に女王アリと入れ替わり(羽アリは捨て札へ)、同種の職アリを山札から2枚手札に加える。
//              女王アリになる前に駆除されたら女王アリにならない。現状は「1枚分として置ける」だけ。
const wingedEffect: CardEffect = { ...workerEffect, status: 'partial' };

// 女王アリは山札に入らず、手札から出さない(羽アリが成ったときだけ場に出る)
const queenEffect: CardEffect = {
  status: 'todo',
  needsTarget: false,
  targets: noTargets,
  canUse: () => false,
  resolve: () => {
    throw new Error('女王アリは手札から使えない');
  },
};

const sprayEffect: CardEffect = {
  status: 'implemented',
  needsTarget: true,
  targets(s) {
    // 完全侵食されたポイントは対象外。シロアリカードがないポイントには撒けない(解釈)
    // TODO(issue): 大量発生が有効なポイントには置けない
    return s.points.filter((p) => !p.destroyed && p.stack.length > 0).map((p) => p.id);
  },
  canUse: always,
  resolve(s, side, card, def, target) {
    if (!target) throw new Error('target required');
    const pt = getPoint(s, target);
    // 無効化をまだ使っていない兵アリがいれば、最後に置かれた1枚の無効化を消費して除去しない
    const gi = soldierGuardBlocks('spray') ? guardIndex(s, pt) : -1;
    if (gi >= 0) {
      const soldier = pt.stack[gi];
      // stack の要素は複製元と共有しているので、書き換えずに新しいオブジェクトに差し替える
      pt.stack[gi] = { ...soldier, guardUsed: true };
      log(
        s,
        side,
        `${def.name} は ${pointLabel(target)} の ${s.defs[soldier.defId]?.name ?? soldier.defId} に無効化された(残り無効化 ${guardCount(s, pt)} 回)`,
      );
      toDiscard(s, side, card);
      return;
    }
    const removed = pt.stack.pop();
    if (removed) {
      s.players[removed.owner].discard.push({ uid: removed.uid, defId: removed.defId });
      log(s, side, `${def.name} で ${pointLabel(target)} の ${s.defs[removed.defId]?.name ?? removed.defId} を除去した`);
    }
    toDiscard(s, side, card);
  },
};

/** 効果が未実装のカード:コストを払って捨て札になるだけ */
function todoEffect(note: string): CardEffect {
  return {
    status: 'todo',
    needsTarget: false,
    targets: noTargets,
    canUse: always,
    resolve(s, side, card, def) {
      toDiscard(s, side, card);
      log(s, side, `${def.name} を使った(効果は未実装:${note})`);
    },
  };
}

export const EFFECTS: Record<string, CardEffect> = {
  'worker-yamato': workerEffect,
  'worker-ie': workerEffect,
  'worker-kanzai': workerEffect,
  'soldier-yamato': soldierEffect,
  'soldier-ie': soldierEffect,
  'soldier-kanzai': soldierEffect,
  'winged-yamato': wingedEffect,
  'winged-ie': wingedEffect,
  'winged-kanzai': wingedEffect,
  queen: queenEffect,
  spray: sprayEffect,
  // TODO(issue): バリア工法 — 指定ポイントに3ターンの間、シロアリカードを置けなくする
  barrier: todoEffect('バリア工法'),
  // TODO(issue): ベイト工法 — 置いてから2回目の自分のターン開始時に、指定ポイントのヤマト・イエをすべて除去(カンザイは対象外)。同じポイントへの重ね置き不可
  bait: todoEffect('ベイト工法'),
  // TODO(issue): 大量発生 — 指定ポイントに、シロアリ側の次のターン開始時まで防除・駆除カードを置けなくする
  swarm: todoEffect('大量発生'),
  // TODO(issue): 輸入家具購入 — 山札からカンザイシロアリを1枚手札に加える(なければ空振り。仮:山札で最初に見つかったもの)
  'import-furniture': todoEffect('輸入家具購入'),
  // TODO(issue): 増援 — 自分の山札から2枚ドローする
  reinforce: todoEffect('増援'),
  // TODO(issue): 偵察 — 相手の手札を全て確認する(相手の手札がないときは使えない)
  scout: todoEffect('偵察'),
  // TODO(issue): 妨害 — 相手の手札をランダムに1枚捨てさせる(相手の手札がないときは使えない)
  disrupt: todoEffect('妨害'),
  // TODO(issue): 予知 — 自分の山札の上3枚から1枚を手札に加え、残りを好きな順で山札の下に置く
  foresight: todoEffect('予知'),
};

/** 対応表にないカード(Notion で新しく追加されたもの)は未実装として扱う */
export function effectFor(def: CardDef): CardEffect {
  return EFFECTS[def.id] ?? todoEffect(def.name);
}
