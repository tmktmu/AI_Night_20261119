'use strict';

/**
 * テスト用の共通セットアップ。
 * jsdom で index.html を読み込み、アプリの JavaScript をブラウザと同じ順番で実行する。
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');

/*
 * カバレッジ計測（npm run test:coverage のときだけ有効）。
 * アプリのコードは jsdom の中で動くため、読み込む前に istanbul で計測用のコードを埋め込み、
 * テストの終わりに各 window の計測結果をまとめてファイルに書き出す。
 */
const COVERAGE_DIR = process.env.KAKEIBO_COVERAGE_DIR;
const coverageWindows = [];
const instrumentedCache = new Map();

/**
 * アプリのスクリプトを読み込む（カバレッジ計測中なら計測用コードを埋め込む）
 * @param {string} name 例: "utils"
 * @returns {string}
 */
function loadScript(name) {
  const file = path.join(ROOT, 'js', `${name}.js`);
  const code = fs.readFileSync(file, 'utf8');
  if (!COVERAGE_DIR) return code;
  if (!instrumentedCache.has(file)) {
    const { createInstrumenter } = require('istanbul-lib-instrument');
    instrumentedCache.set(file, createInstrumenter({ esModules: false }).instrumentSync(code, file));
  }
  return instrumentedCache.get(file);
}

if (COVERAGE_DIR) {
  process.on('exit', () => {
    const { createCoverageMap } = require('istanbul-lib-coverage');
    const map = createCoverageMap({});
    for (const w of coverageWindows) {
      if (w.__coverage__) map.merge(JSON.parse(JSON.stringify(w.__coverage__)));
    }
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
    fs.writeFileSync(path.join(COVERAGE_DIR, `${process.pid}.json`), JSON.stringify(map.toJSON()));
  });
}
const ALL_SCRIPTS = ['utils', 'storage', 'summary', 'charts', 'transactions', 'budget', 'categories', 'app'];
const LOGIC_SCRIPTS = ['utils', 'storage', 'summary'];

/**
 * アプリを読み込んだ jsdom 環境を作る
 * @param {object} [options]
 * @param {object|string} [options.seed] 起動前に localStorage に入れておくデータ
 * @param {string[]} [options.scripts] 読み込むスクリプト（省略時は全部＝アプリを起動する）
 * @param {string} [options.today] "YYYY-MM-DD"。指定するとその日付で動かす
 * @returns {object}
 */
function createApp({ seed, scripts = ALL_SCRIPTS, today } = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;

  // ブラウザにしかない機能の代わり
  const calls = { alert: [], confirm: [], charts: [], downloads: [] };
  const control = { confirmResult: true };
  w.alert = (message) => { calls.alert.push(message); };
  w.confirm = (message) => { calls.confirm.push(message); return control.confirmResult; };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
  w.URL.createObjectURL = (blob) => { calls.downloads.push({ blob }); return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function click() {
    calls.downloads[calls.downloads.length - 1].filename = this.download;
  };

  // Chart.js の代わり（描画はせず、渡された設定を記録する）
  class FakeChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.destroyed = false;
      calls.charts.push(this);
    }
    destroy() { this.destroyed = true; }
  }
  FakeChart.defaults = { font: {} };
  w.Chart = FakeChart;

  if (today) fixToday(w, today);
  if (seed !== undefined) {
    w.localStorage.setItem('kakeibo-data', typeof seed === 'string' ? seed : JSON.stringify(seed));
  }

  if (COVERAGE_DIR) coverageWindows.push(w);
  for (const name of scripts) {
    const script = w.document.createElement('script');
    script.textContent = loadScript(name);
    w.document.body.appendChild(script);
  }

  const $ = (id) => w.document.getElementById(id);
  return {
    window: w,
    document: w.document,
    calls,
    control,
    $,
    /** アプリ内の変数・関数を取り出す（例: get('Store')） */
    get: (expr) => w.eval(expr),
    /** 保存されているデータ */
    stored: () => JSON.parse(w.localStorage.getItem('kakeibo-data')),
  };
}

/**
 * 「今日」を固定する（引数なしの new Date() と Date.now() だけを差し替える）
 * @param {Window} w
 * @param {string} today "YYYY-MM-DD"
 */
function fixToday(w, today) {
  const [y, m, d] = today.split('-').map(Number);
  const fixed = new w.Date(y, m - 1, d, 12, 0, 0).getTime();
  const RealDate = w.Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() { return fixed; }
  }
  w.Date = FixedDate;
}

/**
 * テスト用のデータを作る
 * @param {object} app createApp の戻り値（LOGIC_SCRIPTS 以上を読み込んだもの）
 * @returns {{data:object, exp:object[], inc:object[], addTx:Function}}
 */
function makeData(app) {
  const data = app.get('createInitialData()');
  const exp = app.get('getSortedCategories').call(null, data.categories, 'expense');
  const inc = app.get('getSortedCategories').call(null, data.categories, 'income');
  let seq = 0;
  const addTx = (type, date, amount, category, memo = '') => {
    seq += 1;
    const tx = {
      id: `tx-${seq}`, type, date, amount, categoryId: category.id, memo,
      createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}.000Z`,
    };
    data.transactions.push(tx);
    return tx;
  };
  return { data, exp, inc, addTx };
}

/** 非同期の処理（Promise）が終わるのを待つ */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * jsdom 側で作られたオブジェクトを、Node の assert で比べられる普通のオブジェクトにする
 * @param {*} value
 * @returns {*}
 */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { createApp, makeData, flush, plain, LOGIC_SCRIPTS, ROOT };
