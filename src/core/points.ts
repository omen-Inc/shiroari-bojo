// 8ポイントと、置けるシロアリの種類の対応表(仕様書「ポイント」)。
// 対応表はクライアント確認前の暫定。

import type { PointId, Species } from './types';

export interface PointDef {
  id: PointId;
  name: string;
  condition: string;
  allowed: Species[];
  special?: boolean;
}

export const POINTS: PointDef[] = [
  { id: 'bath', name: '浴室・洗面所', condition: '水回り', allowed: ['yamato', 'ie'] },
  { id: 'kitchen', name: 'キッチン', condition: '水回り', allowed: ['yamato', 'ie'] },
  { id: 'underfloor', name: '床下・土台', condition: '乾燥箇所', allowed: ['ie'] },
  { id: 'entrance', name: '玄関・框', condition: '乾燥箇所', allowed: ['ie'] },
  // TODO(issue): 庭の枯れ木の特殊ルール — 完全侵食に4枚必要。倒れると全ポイントの必要枚数が3→2になる
  { id: 'garden', name: '庭の枯れ木', condition: '乾燥箇所(特殊)', allowed: ['ie'], special: true },
  { id: 'deck', name: 'ウッドデッキ', condition: '乾燥箇所', allowed: ['ie'] },
  { id: 'beam', name: '梁・柱', condition: '上部', allowed: ['ie', 'kanzai'] },
  { id: 'attic', name: '屋根裏・天井', condition: '上部', allowed: ['ie', 'kanzai'] },
];

export const POINT_BY_ID: Record<PointId, PointDef> = Object.fromEntries(POINTS.map((p) => [p.id, p])) as Record<PointId, PointDef>;

export const SPECIES_LABEL: Record<Species, string> = { yamato: 'ヤマト', ie: 'イエ', kanzai: 'カンザイ' };
