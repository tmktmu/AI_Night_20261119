'use strict';

/**
 * カバレッジを計測してテストを実行し、結果を表示する。
 *   npm run test:coverage
 * 画面にはファイルごとの表を表示し、coverage/index.html に詳しいレポートを作る。
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createCoverageMap } = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'coverage', '.raw');

fs.rmSync(path.join(ROOT, 'coverage'), { recursive: true, force: true });

const result = spawnSync(process.execPath, ['--test', 'tests/**/*.test.js'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, KAKEIBO_COVERAGE_DIR: RAW_DIR },
});

const map = createCoverageMap({});
for (const file of fs.existsSync(RAW_DIR) ? fs.readdirSync(RAW_DIR) : []) {
  map.merge(JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8')));
}
fs.rmSync(RAW_DIR, { recursive: true, force: true });

const context = libReport.createContext({ dir: path.join(ROOT, 'coverage'), coverageMap: map });
console.log('\n===== カバレッジ（js/ 配下のアプリのコード） =====');
reports.create('text').execute(context);
reports.create('html').execute(context);
reports.create('json').execute(context);
console.log('詳しいレポート: coverage/index.html');

process.exit(result.status ?? 1);
