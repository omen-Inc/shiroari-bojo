// cards.json(Notion のカード一覧の写し)から、エンジンが使うカード定義を作る。

import { identifyCard } from './cardIds';
import type { CardDef, CardKind, CardRecord, CardSide, CardsFile } from './types';

export function kindOf(category: string): CardKind {
  if (category === 'シロアリ') return 'termite';
  if (category.startsWith('イベント')) return 'event';
  if (category === '中立') return 'neutral';
  if (category === '防除') return 'control';
  if (category === '駆除') return 'extermination';
  return 'unknown';
}

export function sideOf(category: string, counts: CardRecord['counts']): CardSide {
  const kind = kindOf(category);
  if (kind === 'termite') return 'termite';
  if (kind === 'event') return category.includes('防除') ? 'pest' : 'termite';
  if (kind === 'control' || kind === 'extermination') return 'pest';
  if (kind === 'neutral') return 'neutral';
  if (counts.termite > 0 && counts.pest > 0) return 'neutral';
  return counts.pest > 0 ? 'pest' : 'termite';
}

/** ステータス「没」は除外する */
export function buildCardDefs(file: CardsFile): Record<string, CardDef> {
  const defs: Record<string, CardDef> = {};
  for (const rec of file.cards) {
    if (rec.status === '没') continue;
    const ident = identifyCard(rec.name);
    const id = rec.id || ident.id;
    defs[id] = {
      id,
      name: rec.name,
      category: rec.category,
      kind: kindOf(rec.category),
      side: sideOf(rec.category, rec.counts),
      status: rec.status,
      cost: rec.cost,
      counts: rec.counts,
      effect: rec.effect,
      species: ident.species,
      caste: ident.caste,
    };
  }
  return defs;
}
