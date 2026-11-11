'use strict';

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, makeData, plain, LOGIC_SCRIPTS } = require('./helpers/setup');

let app;
let ctx;
const call = (name, ...args) => plain(app.get(name)(...args));

beforeEach(() => {
  app = createApp({ scripts: LOGIC_SCRIPTS });
  ctx = makeData(app);
});

describe('getSortedCategories', () => {
  test('指定した種別だけを order 順に返す', () => {
    const { data, exp } = ctx;
    exp[0].order = 99;
    const names = call('getSortedCategories', data.categories, 'expense').map((c) => c.name);
    assert.equal(names.length, 10);
    assert.equal(names[0], '日用品');
    assert.equal(names[9], '食費');
  });
});

describe('getTransactionsOfMonth', () => {
  test('その月の記録だけを返す（月末・月初の境目を含む）', () => {
    const { data, exp, addTx } = ctx;
    addTx('expense', '2026-10-31', 1, exp[0]);
    addTx('expense', '2026-11-01', 2, exp[0]);
    addTx('expense', '2026-11-30', 3, exp[0]);
    addTx('expense', '2026-12-01', 4, exp[0]);
    addTx('expense', '2025-11-15', 5, exp[0]);
    const amounts = call('getTransactionsOfMonth', data.transactions, '2026-11').map((t) => t.amount);
    assert.deepEqual(amounts, [2, 3]);
  });
});

describe('judgeBudgetStatus', () => {
  const judge = (budget, actual) => app.get('judgeBudgetStatus')(budget, actual);
  test('予算なしは none', () => {
    assert.equal(judge(null, 100), 'none');
    assert.equal(judge(undefined, 0), 'none');
  });
  test('80%未満は ok、80%以上100%以下は warning、超えたら over', () => {
    assert.equal(judge(10000, 7999), 'ok');
    assert.equal(judge(10000, 8000), 'warning');
    assert.equal(judge(10000, 10000), 'warning');
    assert.equal(judge(10000, 10001), 'over');
  });
  test('予算0円は、使っていなければ ok、使ったら over', () => {
    assert.equal(judge(0, 0), 'ok');
    assert.equal(judge(0, 1), 'over');
  });
});

describe('calcMonthlySummary', () => {
  test('収入・支出・収支・予算の残りと消化率を計算する', () => {
    const { data, exp, inc, addTx } = ctx;
    addTx('income', '2026-11-25', 300000, inc[0]);
    addTx('income', '2026-11-10', 20000, inc[1]);
    addTx('expense', '2026-11-01', 70000, exp[3]);
    addTx('expense', '2026-11-05', 30000, exp[0]);
    addTx('expense', '2026-10-05', 99999, exp[0]); // 別の月は含めない
    data.budget.total = 200000;
    assert.deepEqual(call('calcMonthlySummary', data, '2026-11'), {
      income: 320000, expense: 100000, balance: 220000,
      budgetTotal: 200000, remaining: 100000, rate: 50, status: 'ok',
    });
  });

  test('予算オーバーは残りがマイナスになり over', () => {
    const { data, exp, addTx } = ctx;
    addTx('expense', '2026-11-01', 120000, exp[0]);
    data.budget.total = 100000;
    const s = call('calcMonthlySummary', data, '2026-11');
    assert.equal(s.remaining, -20000);
    assert.equal(s.rate, 120);
    assert.equal(s.status, 'over');
    assert.equal(s.balance, -120000);
  });

  test('予算未設定なら予算関係は null', () => {
    const s = call('calcMonthlySummary', ctx.data, '2026-11');
    assert.deepEqual([s.budgetTotal, s.remaining, s.rate, s.status], [null, null, null, 'none']);
  });

  test('総予算0円のときは消化率を null にする（0で割らない）', () => {
    ctx.data.budget.total = 0;
    const s = call('calcMonthlySummary', ctx.data, '2026-11');
    assert.equal(s.rate, null);
    assert.equal(s.remaining, 0);
  });
});

describe('calcCategoryBreakdown', () => {
  test('支出をカテゴリごとに合計し、金額の多い順に並べて割合を出す', () => {
    const { data, exp, inc, addTx } = ctx;
    addTx('expense', '2026-11-01', 30000, exp[0]);
    addTx('expense', '2026-11-02', 10000, exp[0]);
    addTx('expense', '2026-11-03', 60000, exp[3]);
    addTx('income', '2026-11-25', 999999, inc[0]); // 収入は含めない
    const result = call('calcCategoryBreakdown', data, '2026-11');
    assert.equal(result.total, 100000);
    assert.deepEqual(result.rows.map((r) => [r.name, r.amount, r.ratio]), [
      ['住居費', 60000, 60],
      ['食費', 40000, 40],
    ]);
  });

  test('支出がない月は空', () => {
    assert.deepEqual(call('calcCategoryBreakdown', ctx.data, '2026-11'), { total: 0, rows: [] });
  });
});

describe('calcBudgetComparison', () => {
  test('予算か実績のあるカテゴリだけを、カテゴリの並び順で返す', () => {
    const { data, exp, addTx } = ctx;
    addTx('expense', '2026-11-01', 45000, exp[0]); // 食費: 予算40000 → 超過
    addTx('expense', '2026-11-02', 8500, exp[4]); // 水道光熱費: 予算10000 → 85%
    addTx('expense', '2026-11-03', 3000, exp[9]); // その他: 予算なし
    data.budget.byCategory = { [exp[0].id]: 40000, [exp[3].id]: 70000, [exp[4].id]: 10000 };
    const rows = call('calcBudgetComparison', data, '2026-11');
    assert.deepEqual(rows.map((r) => [r.name, r.budget, r.actual, r.remaining, r.status]), [
      ['食費', 40000, 45000, -5000, 'over'],
      ['住居費', 70000, 0, 70000, 'ok'],
      ['水道光熱費', 10000, 8500, 1500, 'warning'],
      ['その他', null, 3000, null, 'none'],
    ]);
    assert.equal(rows[0].rate, 112.5);
    assert.equal(rows[3].rate, null);
  });

  test('予算0円のカテゴリは消化率 null', () => {
    const { data, exp, addTx } = ctx;
    addTx('expense', '2026-11-01', 500, exp[1]);
    data.budget.byCategory = { [exp[1].id]: 0 };
    const [row] = call('calcBudgetComparison', data, '2026-11');
    assert.equal(row.rate, null);
    assert.equal(row.status, 'over');
  });
});

describe('calcTrend', () => {
  test('指定した月までの n か月分を、古い順に並べる（年をまたぐ）', () => {
    const result = call('calcTrend', ctx.data, '2026-02', 6);
    assert.deepEqual(result.months, ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  test('カテゴリ別・月別に合計し、期間外と収入は含めない', () => {
    const { data, exp, inc, addTx } = ctx;
    addTx('expense', '2026-09-10', 1000, exp[0]);
    addTx('expense', '2026-09-20', 500, exp[0]);
    addTx('expense', '2026-11-01', 2000, exp[0]);
    addTx('expense', '2026-11-03', 70000, exp[3]);
    addTx('expense', '2026-05-31', 8888, exp[0]); // 期間外
    addTx('income', '2026-11-25', 300000, inc[0]); // 収入
    const result = call('calcTrend', data, '2026-11', 6);
    assert.deepEqual(result.rows.map((r) => [r.name, r.values, r.total]), [
      ['食費', [0, 0, 0, 1500, 0, 2000], 3500],
      ['住居費', [0, 0, 0, 0, 0, 70000], 70000],
    ]);
    assert.deepEqual(result.monthTotals, [0, 0, 0, 1500, 0, 72000]);
  });

  test('期間中に支出がなければ rows は空', () => {
    const result = call('calcTrend', ctx.data, '2026-11', 12);
    assert.equal(result.months.length, 12);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.monthTotals, new Array(12).fill(0));
  });
});

describe('性能（非機能要件）', () => {
  test('1万件の記録でも、集計がすべて1秒以内に終わる', () => {
    const { data, exp, addTx } = ctx;
    for (let i = 0; i < 10000; i++) {
      addTx('expense', `2026-${String(1 + (i % 11)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
        100 + i, exp[i % 10]);
    }
    const start = performance.now();
    app.get('calcMonthlySummary')(data, '2026-11');
    app.get('calcCategoryBreakdown')(data, '2026-11');
    app.get('calcBudgetComparison')(data, '2026-11');
    app.get('calcTrend')(data, '2026-11', 12);
    app.get('validateData')(data);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1000, `${elapsed.toFixed(0)}ms かかった`);
  });
});
