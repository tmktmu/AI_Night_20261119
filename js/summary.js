'use strict';

/**
 * 集計処理（F-04〜F-07）。
 * 画面には触らず、データを受け取って結果を返すだけの関数を置く。
 */

/**
 * 指定した種別のカテゴリを表示順に並べて返す
 * @param {Array} categories
 * @param {'income'|'expense'} type
 * @returns {Array}
 */
function getSortedCategories(categories, type) {
  return categories.filter((c) => c.type === type).sort((a, b) => a.order - b.order);
}

/**
 * 指定した月の収支記録だけを返す
 * @param {Array} transactions
 * @param {string} ym "YYYY-MM"
 * @returns {Array}
 */
function getTransactionsOfMonth(transactions, ym) {
  const prefix = ym + '-';
  return transactions.filter((t) => t.date.startsWith(prefix));
}

/**
 * 予算に対する状態を判定する
 * @param {number|null} budget 予算（null なら予算なし）
 * @param {number} actual 実績
 * @returns {'none'|'ok'|'warning'|'over'} none=予算なし / warning=80%以上 / over=予算超過
 */
function judgeBudgetStatus(budget, actual) {
  if (budget === null || budget === undefined) return 'none';
  if (actual > budget) return 'over';
  if (budget > 0 && actual / budget >= 0.8) return 'warning';
  return 'ok';
}

/**
 * 支出をカテゴリごとに合計する
 * @param {Array} transactions
 * @returns {Map<string, number>} カテゴリID → 合計金額
 */
function sumExpenseByCategory(transactions) {
  const totals = new Map();
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + t.amount);
  }
  return totals;
}

/**
 * F-04: 月次サマリー
 * @param {object} data
 * @param {string} ym
 * @returns {{income:number, expense:number, balance:number, budgetTotal:number|null,
 *   remaining:number|null, rate:number|null, status:string}}
 */
function calcMonthlySummary(data, ym) {
  let income = 0;
  let expense = 0;
  for (const t of getTransactionsOfMonth(data.transactions, ym)) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  const budgetTotal = typeof data.budget.total === 'number' ? data.budget.total : null;
  return {
    income,
    expense,
    balance: income - expense,
    budgetTotal,
    remaining: budgetTotal === null ? null : budgetTotal - expense,
    rate: budgetTotal ? (expense / budgetTotal) * 100 : null,
    status: judgeBudgetStatus(budgetTotal, expense),
  };
}

/**
 * F-05: カテゴリ別内訳（支出）。金額の多い順。
 * @param {object} data
 * @param {string} ym
 * @returns {{total:number, rows:Array<{categoryId:string, name:string, amount:number, ratio:number}>}}
 */
function calcCategoryBreakdown(data, ym) {
  const totals = sumExpenseByCategory(getTransactionsOfMonth(data.transactions, ym));
  const nameOf = new Map(data.categories.map((c) => [c.id, c.name]));
  let total = 0;
  for (const amount of totals.values()) total += amount;

  const rows = [...totals]
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({
      categoryId,
      name: nameOf.get(categoryId) ?? '（不明）',
      amount,
      ratio: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  return { total, rows };
}

/**
 * F-06: 予算と実績の比較。
 * 予算も実績もないカテゴリは含めない。
 * @param {object} data
 * @param {string} ym
 * @returns {Array<{categoryId:string, name:string, budget:number|null, actual:number,
 *   remaining:number|null, rate:number|null, status:string}>}
 */
function calcBudgetComparison(data, ym) {
  const totals = sumExpenseByCategory(getTransactionsOfMonth(data.transactions, ym));
  const rows = [];
  for (const c of getSortedCategories(data.categories, 'expense')) {
    const raw = data.budget.byCategory[c.id];
    const budget = typeof raw === 'number' ? raw : null;
    const actual = totals.get(c.id) || 0;
    if (budget === null && actual === 0) continue;
    rows.push({
      categoryId: c.id,
      name: c.name,
      budget,
      actual,
      remaining: budget === null ? null : budget - actual,
      rate: budget ? (actual / budget) * 100 : null,
      status: judgeBudgetStatus(budget, actual),
    });
  }
  return rows;
}

/**
 * F-07: 月ごとの推移（支出）。endYm を含めて過去 monthCount か月分。
 * 期間中に支出がないカテゴリは含めない。
 * @param {object} data
 * @param {string} endYm 最後の月 "YYYY-MM"
 * @param {number} monthCount 月数
 * @returns {{months:string[], rows:Array<{categoryId:string, name:string, values:number[], total:number}>,
 *   monthTotals:number[]}}
 */
function calcTrend(data, endYm, monthCount) {
  const months = [];
  for (let i = monthCount - 1; i >= 0; i--) months.push(addMonths(endYm, -i));
  const monthIndex = new Map(months.map((ym, i) => [ym, i]));

  const valuesByCategory = new Map();
  for (const t of data.transactions) {
    if (t.type !== 'expense') continue;
    const idx = monthIndex.get(t.date.slice(0, 7));
    if (idx === undefined) continue;
    if (!valuesByCategory.has(t.categoryId)) {
      valuesByCategory.set(t.categoryId, new Array(monthCount).fill(0));
    }
    valuesByCategory.get(t.categoryId)[idx] += t.amount;
  }

  const rows = [];
  for (const c of getSortedCategories(data.categories, 'expense')) {
    const values = valuesByCategory.get(c.id);
    if (!values) continue;
    const total = values.reduce((a, b) => a + b, 0);
    if (total > 0) rows.push({ categoryId: c.id, name: c.name, values, total });
  }

  const monthTotals = months.map((_, i) => rows.reduce((sum, r) => sum + r.values[i], 0));
  return { months, rows, monthTotals };
}
