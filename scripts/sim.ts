// npm run sim -- --games 1000 --out <path> [--seed <seed>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { formatSummary, runSimulation } from '../src/core/sim';

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '1000' },
    out: { type: 'string' },
    seed: { type: 'string', default: '1' },
  },
});

const games = Number(values.games);
if (!Number.isInteger(games) || games <= 0) {
  console.error('--games には正の整数を指定してください');
  process.exit(1);
}
const seed = /^\d+$/.test(values.seed!) ? Number(values.seed) : values.seed!;

const t0 = performance.now();
const result = runSimulation({ games, seed });
const elapsed = (performance.now() - t0) / 1000;

if (values.out) {
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, JSON.stringify(result, null, 2) + '\n');
}
console.log(formatSummary(result));
console.log(`  所要時間:${elapsed.toFixed(2)}秒${values.out ? ` / 出力:${values.out}` : ''}`);
