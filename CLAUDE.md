# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

自分用の家計簿アプリ。ビルドなし・サーバーなしの素の HTML/CSS/JavaScript で、`index.html` を Chrome でファイルとして直接開いて使う。データはブラウザの localStorage にだけ保存される。仕様は `SPEC.md`（機能 ID F-01〜F-09、スコープ外の一覧あり）が正。ドキュメント・コメント・UI 文言はすべて日本語。

## コマンド

```bash
npm install                     # テスト用の devDependencies（jsdom, istanbul）を入れる
npm test                        # 全テスト（node --test "tests/**/*.test.js"）
node --test tests/ui.test.js    # 1ファイルだけ
node --test --test-name-pattern="予算オーバー" tests/ui.test.js   # テスト名で絞る
npm run test:coverage           # js/ のカバレッジ。表を表示し coverage/index.html を作る
```

Node 22 では `node --test tests/` のようにディレクトリを渡せないので、glob で指定する。lint・ビルドの仕組みはない。

## アーキテクチャ

### スクリプトの読み込みとグローバル共有
- `file://` で開いても動かすため ES Modules は使わず、`index.html` 末尾の `<script>` タグで順番に読み込む：`lib/chart.umd.min.js` → `utils` → `storage` → `summary` → `charts` → `transactions` → `budget` → `categories` → `app`。
- 各ファイルのトップレベルの `const` オブジェクト（`Store`, `Charts`, `Transactions`, `Budget`, `Categories`, `App`）と関数は、classic script のグローバルスコープで互いに参照し合う。新しいファイルを足すときは、`index.html` と `tests/helpers/setup.js` の `ALL_SCRIPTS` の両方に、依存順を守って追加する。
- 起動は `app.js` 最終行の `App.init()`。

### データの流れ
- 状態は `Store.data` ただ1つ（`{ version: 1, transactions, categories, budget }`）。localStorage のキー `kakeibo-data` に JSON で保存する。形は `SPEC.md` の 5 章のとおり。
- データの変更は必ず `Store.commit(mutator)` を通す。保存に失敗すると変更を巻き戻して `false` を返す。
- 変更のあとは `App.refreshAll()` で画面全体を描き直す（月ラベル、カテゴリの選択肢、一覧、サマリー、カテゴリ管理。分析タブを表示中なら分析も）。
- `Budget.render()` は `refreshAll` に含まれない（入力中の予算が消えないようにするため）。カテゴリや予算そのものが変わったとき（カテゴリ変更、予算保存、復元）だけ明示的に呼ぶ。
- `validateData()`（storage.js）は、localStorage からの読み込みとバックアップ復元の両方で使う唯一のスキーマチェック。データの形を変えるなら `DATA_VERSION` とここを一緒に直す。

### 層の分け方
- `summary.js` は DOM に触らない純粋な集計関数だけを置く（データと `"YYYY-MM"` を受け取って結果を返す）。集計ロジックはここに足す。
- 表示中の月 `App.currentMonth` は、ホームと分析のタブで共通。
- 分析タブのグラフは、タブが表示されてから描く（非表示の canvas では Chart.js の大きさが決まらないため）。描き直す前に、前の Chart インスタンスを `destroy()` する。

### グラフの色のルール（charts.js）
- 色は CSS 変数 `--series-1`〜`--series-8` / `--series-other`（style.css、ライト／ダークの両方）から実行時に読む。
- 支出カテゴリの**並び順（order）**で 1〜8 番目に固定の色を割り当てる。金額の順位では色を変えない。
- 9 番目以降はグレーにして、グラフでは1系列にまとめる（`foldedLabel`）。表には全カテゴリを出す。
- 予算の状態（予算内／注意 80% 以上／超過）は、色だけでなく必ずアイコンと文字（`STATUS_LABELS`）を付けて表示する。

## テストの仕組み

- `tests/helpers/setup.js` の `createApp()` が、jsdom に `index.html` を読み込み、アプリの JS をインライン `<script>` として実行する。
  - `eval` ではなく `<script>` にしているのは、各ファイルの `'use strict'` があるとトップレベルの宣言がグローバルにならないため。
  - アプリ内の値は `app.get('Store.data')` のように取り出す。
- `alert` / `confirm`（`app.control.confirmResult` で結果を切り替える）、`matchMedia`、ダウンロード、Chart.js は差し替えてある。Chart は描画せず、渡された設定を `app.calls.charts` に記録する。
- `createApp({ today: '2026-11-11' })` で「今日」を固定できる。`scripts: LOGIC_SCRIPTS` を渡すと、utils / storage / summary だけを読み込む（アプリは起動しない）。
- jsdom 側で作られたオブジェクトは別の realm なので、`assert.deepEqual` で比べる前に `plain()` を通す。
- jsdom の `File` には `text()` がないため、復元のテストでは Node のグローバル `File` を使う。
- カバレッジは、環境変数 `KAKEIBO_COVERAGE_DIR` があるときだけ、setup.js が istanbul で計測用コードを埋め込む。実行は `tests/run-coverage.js` が担う。

## 守ること（SPEC.md より）

- 外部ライブラリは Chart.js（`lib/` に同梱、4.4.7）だけ。CDN は使わない（オフラインで動かすため）。
- 関数には日本語の JSDoc を付ける。
- 対象は PC の Chrome。スマホ対応、ログイン、サーバーへの保存、月ごとに違う予算はスコープ外。
