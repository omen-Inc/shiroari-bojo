# シロアリボージョ(仮)プロトタイプ

シロアリ側と防除業者側に分かれて戦う、スマホ縦画面向けの CPU 対戦カードゲームのプロトタイプです(受託・仮題)。

## 遊ぶ

- 安定版(main):https://omen-inc.github.io/shiroari-bojo/
- 夜間の成果(nightly):https://omen-inc.github.io/shiroari-bojo/nightly/

URL パラメータ:`?seed=123` で対戦を再現、`?cpuDelay=0` で CPU が即座に指す(テスト用)。

## 開発

Node 24 以上。

```sh
npm install            # git フック(.githooks)も有効になる
npm run dev            # 開発サーバー(http://localhost:5173/shiroari-bojo/)
npm run build          # 型チェック + ビルド(dist/)。BASE_PATH で公開パスを変えられる
npm test               # Vitest(ルールエンジン・CPU・シミュレーター・仕様の同期)
npx playwright install chromium   # 初回のみ
npm run test:e2e       # Playwright(スマホ縦 375×667 / 430×932)。スクショは test-results/screenshots/
npm run sim -- --games 1000 --out logs/sim.json [--seed 1]
npm run spec:sync -- --changes logs/spec-changes.json   # 要 NOTION_TOKEN
```

### 構成

| 場所 | 内容 |
| --- | --- |
| `src/core/` | ルールエンジン(DOM 非依存の純粋関数。状態 + 行動 → 新しい状態。乱数はシード付き) |
| `src/core/effects.ts` | カードごとの効果(カードID で対応づけ) |
| `src/core/ai/` | CPU の思考(合法手の列挙の上に作る) |
| `src/core/sim.ts` / `scripts/sim.ts` | バランスシミュレーター |
| `src/ui/` | 対戦画面(バニラ TS) |
| `scripts/spec/` / `scripts/spec-sync.ts` | Notion → `docs/spec/` の同期(読み取り専用) |
| `docs/spec/` | 仕様のスナップショット(自動生成。手で編集しない) |

## バランスシミュレーター

CPU 同士で N 戦させ、JSON を書き、標準出力に要約を出します。同じ `--seed` なら同じ結果になります。

```json
{"games":1000,"seed":"1","winRate":{"termite":0.44,"pest":0.56},"draws":0,"avgTurns":37.9,"firstPlayerWinRate":0.53,
 "cards":[{"id":"spray","name":"薬剤散布","side":"pest","useRate":0.93,"winContribution":0.0,"drawn":0,"played":0,"gamesUsed":0}]}
```

| 指標 | 定義 |
| --- | --- |
| `winRate.termite` / `winRate.pest` | 全試合のうち、その陣営が勝った割合(引き分けは `draws` に別に数える) |
| `draws` | ターン数の安全上限(400ターン)に達して引き分けになった試合数。通常は 0 |
| `avgTurns` | 1試合の平均ターン数。**片方の手番1回 = 1ターン**(両者1回ずつで2ターン) |
| `firstPlayerWinRate` | 先攻(コイントスで決定)が勝った割合 |
| `cards[].useRate` | そのカードが使われた回数 ÷ 手札に来た回数(初期手札・補充・効果のドローを含む。両陣営の合計)。手札に一度も来なければ `null` |
| `cards[].winContribution` | そのカードを1回以上使った (試合, 陣営) の組ごとに「その陣営が勝ったか(1 / 0)− その陣営の全体勝率」を求めた平均。正なら、使った側が平均より勝っている。一度も使われなければ `null` |
| `cards[].drawn` / `played` / `gamesUsed` | 手札に来た回数 / 使った回数 / 使われた (試合, 陣営) の組の数 |

注意:効果が未実装のカードも「使う(コストを払って捨て札になる)」ことはできるため、使用率は出ますが勝利寄与はほぼ意味を持ちません。

## 仕様の同期(spec:sync)

`NOTION_TOKEN` を使い、Notion 公式 REST API(`Notion-Version: 2022-06-28`)で次を **読み取りのみ** で取得します。

- 仕様書ページ(`3f951e1703608149adfcf5adf3ebe51c`、子ブロックを再帰取得)→ `docs/spec/spec.md`
- カード一覧DB(`89587a8f5c2d4fa583151ddc8df62d42` を query)→ `docs/spec/cards.md`・`docs/spec/cards.json`

前回の内容との差分(例:「カード『薬剤散布』のコスト 1→2」「仕様書:『補充』節が変更」)を `--changes` のパスに `{"changes":[...]}` で書きます。トークンがない・取得に失敗したときは `{"changes":[],"error":"..."}` を書き、終了コード 1 で終わります(`docs/spec/` は変更しません)。

クライアントは許可リスト方式で、`GET /blocks/{id}/children`・`GET /pages/{id}`・`GET /databases/{id}`・`POST /databases/{id}/query` 以外は呼べません。

カード名から安定ID(`src/core/cardIds.ts`)を決めます。対応表にないカードは `card-<名前のハッシュ>` になり、エンジンでは「効果未実装」として扱います。
