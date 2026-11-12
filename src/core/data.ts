// 既定のカードデータ(docs/spec/cards.json)。spec:sync が更新する。手で編集しない。
import cardsFile from '../../docs/spec/cards.json';
import { buildCardDefs } from './cards';
import type { CardsFile } from './types';

export const DEFAULT_CARDS_FILE = cardsFile as CardsFile;
export const DEFAULT_CARD_DEFS = buildCardDefs(DEFAULT_CARDS_FILE);
