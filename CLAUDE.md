# CLAUDE.md(このリポジトリで作業する AI 向け)

シロアリボージョ(仮):シロアリ側 vs 防除業者側の CPU 対戦カードゲームのプロトタイプ(TypeScript + Vite、スマホ縦画面)。
夜間はヘッドレスの Claude が GitHub Issue を1件ずつ実装し、nightly ブランチにマージする。

## 構成
- `src/core/`:ルールエンジン。**DOM・Node API に依存しない**(window / document / fs を使わない)。純粋関数中心で、`applyAction(state, action)` は引数を変更せず新しい状態を返す。乱数は `GameState.rng`(シード付き)から取る。`Math.random` は使わない
  - `types.ts` 型 / `engine.ts` 進行・合法手 / `effects.ts` カード効果(カードIDで対応) / `points.ts` 8ポイントと置ける種類 / `cardIds.ts` カード名→ID / `state.ts` 複製と小さな変更関数 / `sim.ts` シミュレーター本体
  - `ai/`:CPU。`legalActions` の上に作る
- `src/ui/`:画面(バニラ TS + CSS)。ルールはここに書かず、`src/core` を呼ぶ
- `scripts/`:Node で動く CLI(`sim.ts`、`spec-sync.ts`、`spec/`)
- `tests/core`・`tests/spec`:Vitest / `tests/e2e`:Playwright

## 仕様
- 仕様の正は Notion の「シロアリボージョ(仮)ゲーム仕様書」とカード一覧DB
- `docs/spec/` は `npm run spec:sync` が書くスナップショット。**手で編集しない**(カードの数値も cards.json を直さず、Notion 側の変更を待つ)
- 仕様が曖昧なときは止まらず、最も自然な解釈で進め、PR と Issue に「仮定:〜」と書く

## コマンド
- `npm test`(Vitest)、`npm run test:e2e`(Playwright。初回は `npx playwright install chromium`)、`npm run build`
- `npm run sim -- --games 1000 --out <path> [--seed N]`
- 変更したらルールのユニットテストを足し、`npm test && npm run build && npm run test:e2e` を通してから PR にする

## ブランチ運用
- `main`:安定版。omen が週1回 nightly からマージする。**AI は push しない**
- `nightly`:夜間の成果のマージ先
- 作業ブランチ:`nightly-issue-<番号>`(nightly から切り、nightly へ PR)

## 禁止事項
- main への push、force push(`.githooks/pre-push` が拒否する。`--no-verify` で回避しない)
- ブランチ・ファイルの削除(不要になったファイルも消さず、Issue で相談する)
- Notion への書き込み(spec:sync は読み取り専用。書き込み API を足さない)
- リポジトリ外の変更、`.env` やトークンの出力・コミット

## 未実装(TODO)の場所
`grep -rn "TODO(issue)" src` で一覧できる。主なもの:
- `src/core/effects.ts`:兵アリ・羽アリの特殊効果、女王アリ、バリア工法、ベイト工法、大量発生、輸入家具購入、増援、偵察、妨害、予知(未実装カードは「コストを払って捨て札になるだけ」)
- `src/core/state.ts` `infestationThreshold`・`src/core/points.ts`:庭の枯れ木(4枚・倒れると全ポイント2枚)
- `src/core/engine.ts`:ターン開始時の処理(羽アリ→女王アリ、ベイト発動、効果の期限切れ)、手札上限7枚、女王アリの置き場
- `src/core/types.ts` `PointState`:バリア・ベイト・大量発生の状態
- `src/core/ai/index.ts`:相手の手札を見ない思考、難易度
