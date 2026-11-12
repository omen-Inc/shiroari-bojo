// バランスシミュレーター本体(CPU 同士で N 戦)。DOM・Node のどちらにも依存しない。

import { chooseAction, DEFAULT_AI, type AiOptions } from './ai';
import { DEFAULT_CARD_DEFS } from './data';
import { applyAction, newGame } from './engine';
import { createRng, seedFrom } from './rng';
import type { CardDef, CardSide, Side } from './types';

export interface SimOptions {
  games: number;
  seed: number | string;
  defs?: Record<string, CardDef>;
  ai?: Partial<Record<Side, AiOptions>>;
}

export interface CardSimResult {
  id: string;
  name: string;
  side: CardSide;
  /** 使われた回数 ÷ 手札に来た回数(両陣営の合計)。一度も手札に来なければ null */
  useRate: number | null;
  /** そのカードを1回以上使った (試合, 陣営) について「その陣営が勝ったか(1/0) − その陣営の全体勝率」の平均。一度も使われなければ null */
  winContribution: number | null;
  drawn: number;
  played: number;
  gamesUsed: number;
}

export interface SimResult {
  games: number;
  seed: string;
  winRate: Record<Side, number>;
  draws: number;
  avgTurns: number;
  firstPlayerWinRate: number;
  cards: CardSimResult[];
}

export function runSimulation(opts: SimOptions): SimResult {
  const defs = opts.defs ?? DEFAULT_CARD_DEFS;
  const baseSeed = seedFrom(opts.seed);
  const wins: Record<Side, number> = { termite: 0, pest: 0 };
  let draws = 0;
  let totalTurns = 0;
  let firstWins = 0;
  const drawn: Record<string, number> = {};
  const played: Record<string, number> = {};
  // 使った (試合, 陣営) の記録:[cardId, side, won]
  const usages: { id: string; side: Side; won: boolean }[] = [];

  for (let g = 0; g < opts.games; g++) {
    const gameSeed = (baseSeed + Math.imul(g + 1, 0x9e3779b1)) >>> 0;
    let s = newGame({ seed: gameSeed, defs, config: { keepLog: false } });
    const aiRng = createRng(gameSeed ^ 0x5bd1e995);
    while (!s.finished) {
      const ai = { ...DEFAULT_AI, ...opts.ai?.[s.current] };
      s = applyAction(s, chooseAction(s, aiRng, ai));
    }
    totalTurns += s.turn;
    if (s.winner) {
      wins[s.winner] += 1;
      if (s.winner === s.first) firstWins += 1;
    } else draws += 1;
    for (const side of ['termite', 'pest'] as Side[]) {
      const st = s.stats[side];
      for (const [id, n] of Object.entries(st.drawn)) drawn[id] = (drawn[id] ?? 0) + n;
      for (const [id, n] of Object.entries(st.played)) {
        played[id] = (played[id] ?? 0) + n;
        if (n > 0) usages.push({ id, side, won: s.winner === side });
      }
    }
  }

  const games = Math.max(1, opts.games);
  const winRate = { termite: wins.termite / games, pest: wins.pest / games };
  const cards: CardSimResult[] = Object.values(defs)
    .filter((d) => d.counts.termite + d.counts.pest > 0)
    .map((d) => {
      const us = usages.filter((u) => u.id === d.id);
      const contribution = us.length
        ? us.reduce((acc, u) => acc + (u.won ? 1 : 0) - winRate[u.side], 0) / us.length
        : null;
      const dr = drawn[d.id] ?? 0;
      const pl = played[d.id] ?? 0;
      return {
        id: d.id,
        name: d.name,
        side: d.side,
        useRate: dr ? round(pl / dr) : null,
        winContribution: contribution === null ? null : round(contribution),
        drawn: dr,
        played: pl,
        gamesUsed: us.length,
      };
    });

  return {
    games: opts.games,
    seed: String(opts.seed),
    winRate: { termite: round(winRate.termite), pest: round(winRate.pest) },
    draws,
    avgTurns: round(totalTurns / games, 2),
    firstPlayerWinRate: round(firstWins / games),
    cards,
  };
}

function round(v: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function formatSummary(r: SimResult): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const lines = [
    `シミュレーション ${r.games}戦(seed=${r.seed})`,
    `  勝率:シロアリ側 ${pct(r.winRate.termite)} / 防除業者側 ${pct(r.winRate.pest)} / 引き分け ${r.draws}戦`,
    `  平均ターン数:${r.avgTurns}(片方の手番1回=1ターン) / 先攻の勝率 ${pct(r.firstPlayerWinRate)}`,
    '  カード別(使用率 / 勝利寄与):',
  ];
  for (const c of r.cards) {
    const use = c.useRate === null ? '-' : pct(c.useRate);
    const win = c.winContribution === null ? '-' : `${c.winContribution >= 0 ? '+' : ''}${(c.winContribution * 100).toFixed(1)}pt`;
    lines.push(`    ${c.name.padEnd(10, ' ')} ${use.padStart(6)} / ${win}`);
  }
  return lines.join('\n');
}
