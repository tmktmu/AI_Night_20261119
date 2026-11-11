'use strict';

/**
 * 画面操作のテスト。jsdom 上でアプリを起動し、ボタンや入力欄を操作して結果を確かめる。
 * 「今日」は 2026-11-11 に固定する。
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, makeData, flush, plain, LOGIC_SCRIPTS } = require('./helpers/setup');

const TODAY = '2026-11-11';

/**
 * サンプルデータ入りでアプリを起動する
 * @param {(ctx: object) => void} [prepare] 起動前にデータを用意する関数
 */
function startApp(prepare) {
  const base = createApp({ scripts: LOGIC_SCRIPTS });
  const ctx = makeData(base);
  if (prepare) prepare(ctx);
  const app = createApp({ seed: ctx.data, today: TODAY });
  return { app, ctx };
}

/** カテゴリ名からカテゴリIDを探す */
function categoryId(app, type, name) {
  return app.get('Store.data.categories').find((c) => c.type === type && c.name === name).id;
}

/** 収支の登録フォームに入力して送信する */
function submitTx(app, { type = 'expense', date, amount = '', category = '', memo = '' }) {
  const { $ } = app;
  const radio = app.document.querySelector(`input[name="tx-type"][value="${type}"]`);
  if (!radio.checked) {
    radio.checked = true;
    radio.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  }
  if (date) $('tx-date').value = date;
  $('tx-amount').value = amount;
  $('tx-category').value = category ? categoryId(app, type, category) : '';
  $('tx-memo').value = memo;
  $('tx-submit').click();
}

/** 一覧の表の行を [日付, 種別, カテゴリ, 金額, メモ] の配列で返す */
function listRows(app) {
  return [...app.$('tx-list').querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('td')].slice(0, 5).map((td) => td.textContent.trim()));
}

const click = (el) => el.click();

describe('起動', () => {
  test('今月を表示し、日付の初期値は今日、カテゴリは支出のものが並ぶ', () => {
    const { app } = startApp();
    assert.equal(app.document.querySelector('.month-label').textContent, '2026年11月');
    assert.equal(app.$('tx-date').value, TODAY);
    const options = [...app.$('tx-category').options].map((o) => o.textContent);
    assert.equal(options[0], '選択してください');
    assert.equal(options.length, 11);
    assert.ok(app.document.querySelector('.month-today').hidden, '今月なら「今月へ」は出さない');
    assert.equal(app.$('tx-empty').hidden, false);
  });

  test('初めて起動したときは初期データを保存する', () => {
    const app = createApp({ today: TODAY });
    assert.equal(app.stored().categories.length, 13);
  });
});

describe('F-01 収支の登録', () => {
  test('正しく入力すると保存し、一覧とサマリーに反映する', () => {
    const { app } = startApp();
    submitTx(app, { amount: '1,200', category: '食費', memo: '昼食' });
    assert.equal(app.stored().transactions.length, 1);
    const tx = app.stored().transactions[0];
    assert.deepEqual([tx.type, tx.date, tx.amount, tx.memo], ['expense', TODAY, 1200, '昼食']);
    assert.deepEqual(listRows(app), [['11/11', '支出', '食費', '1,200円', '昼食']]);
    assert.equal(app.$('sum-expense').textContent, '1,200円');
    assert.equal(app.$('tx-message').textContent, '登録しました');
  });

  test('登録後は金額・カテゴリ・メモを空にし、日付と種別はそのまま', () => {
    const { app } = startApp();
    submitTx(app, { type: 'income', date: '2026-11-05', amount: '300000', category: '給与', memo: '11月分' });
    assert.equal(app.$('tx-amount').value, '');
    assert.equal(app.$('tx-category').value, '');
    assert.equal(app.$('tx-memo').value, '');
    assert.equal(app.$('tx-date').value, '2026-11-05');
    assert.equal(app.document.querySelector('input[name="tx-type"]:checked').value, 'income');
  });

  test('収入を選ぶとカテゴリが収入用に切り替わる', () => {
    const { app } = startApp();
    const radio = app.document.querySelector('input[name="tx-type"][value="income"]');
    radio.checked = true;
    radio.dispatchEvent(new app.window.Event('change', { bubbles: true }));
    const options = [...app.$('tx-category').options].map((o) => o.textContent);
    assert.deepEqual(options, ['選択してください', '給与', '副業', 'その他']);
  });

  test('金額とカテゴリが空なら、エラーを出して保存しない', () => {
    const { app } = startApp();
    submitTx(app, {});
    assert.equal(app.$('err-amount').textContent, '金額を入力してください');
    assert.equal(app.$('err-category').textContent, 'カテゴリを選択してください');
    assert.ok(app.$('tx-amount').classList.contains('is-invalid'));
    assert.equal(app.stored().transactions.length, 0);
  });

  test('金額が数字以外・0 のときはエラー', () => {
    const { app } = startApp();
    submitTx(app, { amount: 'abc', category: '食費' });
    assert.equal(app.$('err-amount').textContent, '金額は数字で入力してください');
    submitTx(app, { amount: '0', category: '食費' });
    assert.equal(app.$('err-amount').textContent, '金額は1円以上で入力してください');
    assert.equal(app.stored().transactions.length, 0);
  });

  test('日付が空ならエラー', () => {
    const { app } = startApp();
    app.$('tx-date').value = '';
    submitTx(app, { amount: '100', category: '食費' });
    assert.equal(app.$('err-date').textContent, '日付を入力してください');
  });

  test('エラーを直して登録すると、エラー表示が消える', () => {
    const { app } = startApp();
    submitTx(app, {});
    submitTx(app, { amount: '500', category: '日用品' });
    assert.equal(app.$('err-amount').textContent, '');
    assert.equal(app.$('err-category').textContent, '');
    assert.equal(app.stored().transactions.length, 1);
  });

  test('表示中と別の月の日付で登録すると、どの月の記録かを知らせる', () => {
    const { app } = startApp();
    submitTx(app, { date: '2026-10-31', amount: '800', category: '食費' });
    assert.equal(app.$('tx-message').textContent, '登録しました（2026年10月の記録）');
    assert.deepEqual(listRows(app), []);
  });

  test('メモに HTML を入れても、文字としてそのまま表示する', () => {
    const { app } = startApp();
    submitTx(app, { amount: '100', category: '食費', memo: '<img src=x onerror=alert(1)>' });
    assert.equal(app.$('tx-list').querySelector('img'), null);
    assert.equal(listRows(app)[0][4], '<img src=x onerror=alert(1)>');
  });
});

describe('F-02 収支の一覧・編集・削除', () => {
  const prepare = ({ exp, inc, addTx }) => {
    addTx('expense', '2026-11-03', 1000, exp[0], 'A');
    addTx('income', '2026-11-25', 300000, inc[0], '給与');
    addTx('expense', '2026-11-03', 2000, exp[1], 'B'); // 同じ日付で後から登録
    addTx('expense', '2026-10-15', 5000, exp[0], '先月');
  };

  test('選んだ月の記録を、日付の新しい順（同じ日は後に登録した順）に表示する', () => {
    const { app } = startApp(prepare);
    assert.deepEqual(listRows(app), [
      ['11/25', '収入', '給与', '+300,000円', '給与'],
      ['11/3', '支出', '日用品', '2,000円', 'B'],
      ['11/3', '支出', '食費', '1,000円', 'A'],
    ]);
  });

  test('前月・翌月ボタンで月を切り替え、「今月へ」で戻れる', () => {
    const { app } = startApp(prepare);
    click(app.document.querySelector('.month-prev'));
    assert.equal(app.document.querySelector('.month-label').textContent, '2026年10月');
    assert.deepEqual(listRows(app).map((r) => r[4]), ['先月']);
    assert.equal(app.document.querySelector('.month-today').hidden, false);

    click(app.document.querySelector('.month-next'));
    click(app.document.querySelector('.month-next'));
    assert.equal(app.document.querySelector('.month-label').textContent, '2026年12月');
    assert.equal(app.$('tx-empty').hidden, false);
    assert.equal(app.$('tx-table').hidden, true);

    click(app.document.querySelector('.month-today'));
    assert.equal(app.document.querySelector('.month-label').textContent, '2026年11月');
  });

  test('ホームと分析の月表示はそろって切り替わる', () => {
    const { app } = startApp(prepare);
    click(app.document.querySelectorAll('.month-prev')[1]);
    const labels = [...app.document.querySelectorAll('.month-label')].map((el) => el.textContent);
    assert.deepEqual(labels, ['2026年10月', '2026年10月']);
  });

  test('「編集」でフォームに値を読み込み、「更新」で書き換える', () => {
    const { app } = startApp(prepare);
    click(app.$('tx-list').querySelector('button[data-action="edit"][data-id="tx-2"]'));
    assert.equal(app.$('tx-form-title').textContent, '収支の編集');
    assert.equal(app.$('tx-submit').textContent, '更新');
    assert.equal(app.$('tx-cancel').hidden, false);
    assert.equal(app.document.querySelector('input[name="tx-type"]:checked').value, 'income');
    assert.equal(app.$('tx-date').value, '2026-11-25');
    assert.equal(app.$('tx-amount').value, '300000');
    assert.equal(app.$('tx-category').value, categoryId(app, 'income', '給与'));
    assert.equal(app.$('tx-memo').value, '給与');

    app.$('tx-date').value = '2026-11-24';
    app.$('tx-amount').value = '310000';
    app.$('tx-memo').value = '昇給';
    click(app.$('tx-submit'));

    const tx = app.stored().transactions.find((t) => t.id === 'tx-2');
    assert.deepEqual([tx.date, tx.amount, tx.memo], ['2026-11-24', 310000, '昇給']);
    assert.equal(app.stored().transactions.length, 4, '件数は増えない');
    assert.equal(app.$('tx-submit').textContent, '登録');
    assert.equal(app.$('tx-cancel').hidden, true);
    assert.equal(app.$('tx-message').textContent, '更新しました');
  });

  test('編集で収入を支出に変えられる', () => {
    const { app } = startApp(prepare);
    click(app.$('tx-list').querySelector('button[data-action="edit"][data-id="tx-2"]'));
    submitTx(app, { type: 'expense', amount: '4000', category: '娯楽' });
    const tx = app.stored().transactions.find((t) => t.id === 'tx-2');
    assert.deepEqual([tx.type, tx.categoryId], ['expense', categoryId(app, 'expense', '娯楽')]);
  });

  test('「キャンセル」で編集をやめると、データは変わらない', () => {
    const { app } = startApp(prepare);
    click(app.$('tx-list').querySelector('button[data-action="edit"][data-id="tx-1"]'));
    app.$('tx-amount').value = '99999';
    click(app.$('tx-cancel'));
    assert.equal(app.stored().transactions.find((t) => t.id === 'tx-1').amount, 1000);
    assert.equal(app.$('tx-amount').value, '');
    assert.equal(app.$('tx-form-title').textContent, '収支の登録');
  });

  test('「削除」は確認してから削除し、キャンセルすれば残す', () => {
    const { app } = startApp(prepare);
    app.control.confirmResult = false;
    click(app.$('tx-list').querySelector('button[data-action="delete"][data-id="tx-1"]'));
    assert.equal(app.stored().transactions.length, 4);
    assert.match(app.calls.confirm[0], /2026\/11\/03 食費 1,000円/);

    app.control.confirmResult = true;
    click(app.$('tx-list').querySelector('button[data-action="delete"][data-id="tx-1"]'));
    assert.equal(app.stored().transactions.length, 3);
    assert.equal(app.$('tx-message').textContent, '削除しました');
  });

  test('編集中の記録を削除すると、編集状態も終わる', () => {
    const { app } = startApp(prepare);
    click(app.$('tx-list').querySelector('button[data-action="edit"][data-id="tx-1"]'));
    click(app.$('tx-list').querySelector('button[data-action="delete"][data-id="tx-1"]'));
    assert.equal(app.get('Transactions.editingId'), null);
    assert.equal(app.$('tx-submit').textContent, '登録');
  });
});

describe('F-04 月次サマリー', () => {
  test('予算が未設定なら、設定をうながす文を出す', () => {
    const { app } = startApp();
    assert.match(app.$('sum-budget').textContent, /予算が未設定です/);
  });

  test('収入・支出・収支と、予算の残り・消化率を表示する', () => {
    const { app } = startApp(({ data, exp, inc, addTx }) => {
      addTx('income', '2026-11-25', 280000, inc[0]);
      addTx('expense', '2026-11-01', 150000, exp[3]);
      data.budget.total = 200000;
    });
    assert.equal(app.$('sum-income').textContent, '280,000円');
    assert.equal(app.$('sum-expense').textContent, '150,000円');
    assert.equal(app.$('sum-balance').textContent, '+130,000円');
    const text = app.$('sum-budget').textContent.replace(/\s+/g, ' ');
    assert.match(text, /予算 200,000円/);
    assert.match(text, /残り 50,000円/);
    assert.match(text, /75%/);
    assert.match(text, /予算内/);
  });

  test('予算オーバーは赤字で「◯◯円オーバー」、収支マイナスも赤字', () => {
    const { app } = startApp(({ data, exp, addTx }) => {
      addTx('expense', '2026-11-01', 230000, exp[3]);
      data.budget.total = 200000;
    });
    const over = app.$('sum-budget').querySelector('.text-over');
    assert.equal(over.textContent, '30,000円オーバー');
    assert.match(app.$('sum-budget').textContent, /超過/);
    assert.equal(app.$('sum-balance').textContent, '-230,000円');
    assert.ok(app.$('sum-balance').classList.contains('is-negative'));
    const fill = app.$('sum-budget').querySelector('.rate-fill');
    assert.equal(fill.style.width, '100%', 'バーは100%で止める');
  });
});

describe('タブの切り替え', () => {
  test('タブを押すと、その画面だけを表示する', () => {
    const { app } = startApp();
    for (const name of ['analysis', 'settings', 'home']) {
      click(app.document.querySelector(`.tab[data-tab="${name}"]`));
      for (const panel of app.document.querySelectorAll('.tab-panel')) {
        assert.equal(panel.hidden, panel.id !== `tab-${name}`, `${name}: ${panel.id}`);
      }
      assert.equal(app.document.querySelector('.tab.is-active').dataset.tab, name);
    }
  });
});

describe('分析タブ（F-05〜F-07）', () => {
  const prepare = ({ data, exp, addTx }) => {
    addTx('expense', '2026-11-01', 70000, exp[3]); // 住居費
    addTx('expense', '2026-11-05', 45000, exp[0]); // 食費
    addTx('expense', '2026-11-06', 3000, exp[8]); // 医療費（9番目）
    addTx('expense', '2026-11-07', 2000, exp[9]); // その他（10番目）
    addTx('expense', '2026-09-07', 40000, exp[0]);
    data.budget = { total: 100000, byCategory: { [exp[0].id]: 40000, [exp[4].id]: 10000 } };
  };
  const openAnalysis = (app) => click(app.document.querySelector('.tab[data-tab="analysis"]'));
  const lastChart = (app, type) => app.calls.charts.filter((c) => c.config.type === type).at(-1);

  test('分析タブを開くまではグラフを描かない', () => {
    const { app } = startApp(prepare);
    assert.equal(app.calls.charts.length, 0);
    openAnalysis(app);
    assert.ok(lastChart(app, 'doughnut'));
    assert.ok(lastChart(app, 'bar'));
  });

  test('F-05 内訳表は金額の多い順で、割合と合計を出す', () => {
    const { app } = startApp(prepare);
    openAnalysis(app);
    const rows = [...app.$('breakdown-list').querySelectorAll('tr')]
      .map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    assert.deepEqual(rows, [
      ['住居費', '70,000円', '58.3%'],
      ['食費', '45,000円', '37.5%'],
      ['医療費', '3,000円', '2.5%'],
      ['その他', '2,000円', '1.7%'],
    ]);
    assert.match(app.$('breakdown-total').textContent, /120,000円/);
  });

  test('F-05 円グラフでは9番目以降のカテゴリを1つにまとめる', () => {
    const { app } = startApp(prepare);
    openAnalysis(app);
    const chart = lastChart(app, 'doughnut');
    assert.deepEqual(plain(chart.config.data.labels), ['住居費', '食費', '医療費・その他']);
    assert.deepEqual(plain(chart.config.data.datasets[0].data), [70000, 45000, 5000]);
    const label = chart.config.options.plugins.tooltip.callbacks.label({ label: '食費', parsed: 45000 });
    assert.equal(label, ' 食費: 45,000円（37.5%）');
  });

  test('F-06 予算と実績を並べ、超過・注意・予算なしを表示し分ける', () => {
    const { app } = startApp(({ data, exp, addTx }) => {
      prepare({ data, exp, addTx });
      addTx('expense', '2026-11-08', 8500, exp[4]); // 水道光熱費 85%
    });
    openAnalysis(app);
    const rows = [...app.$('compare-list').querySelectorAll('tr')]
      .map((tr) => [...tr.children].map((td) => td.textContent.replace(/\s+/g, '')));
    assert.deepEqual(rows, [
      ['食費', '40,000円', '45,000円', '-5,000円', '113%✕超過'],
      ['住居費', '予算なし', '70,000円', '—', '—'],
      ['水道光熱費', '10,000円', '8,500円', '1,500円', '85%▲注意'],
      ['医療費', '予算なし', '3,000円', '—', '—'],
      ['その他', '予算なし', '2,000円', '—', '—'],
    ]);
    const total = app.$('compare-total').textContent.replace(/\s+/g, '');
    assert.match(total, /合計（総予算）100,000円128,500円-28,500円129%✕超過/);
  });

  test('F-07 推移は表示中の月までの6か月分を表とグラフで出す', () => {
    const { app } = startApp(prepare);
    openAnalysis(app);
    const chart = lastChart(app, 'bar');
    assert.deepEqual(plain(chart.config.data.labels), ['6月', '7月', '8月', '9月', '10月', '11月']);
    assert.deepEqual(plain(chart.config.data.datasets.map((d) => d.label)),
      ['食費', '住居費', '医療費・その他']);
    assert.deepEqual(plain(chart.config.data.datasets[0].data), [0, 0, 0, 40000, 0, 45000]);
    const footer = chart.config.options.plugins.tooltip.callbacks.footer([{ dataIndex: 5 }]);
    assert.equal(footer, '合計: 120,000円');
    const head = [...app.$('trend-table').querySelectorAll('thead th')].map((th) => th.textContent);
    assert.equal(head.length, 7);
  });

  test('F-07 表示期間を12か月にすると12か月分になる', () => {
    const { app } = startApp(prepare);
    openAnalysis(app);
    app.$('trend-months').value = '12';
    app.$('trend-months').dispatchEvent(new app.window.Event('change'));
    const chart = lastChart(app, 'bar');
    assert.equal(chart.config.data.labels.length, 12);
    assert.equal(chart.config.data.labels[0], '12月');
  });

  test('描き直すときは前のグラフを破棄する', () => {
    const { app } = startApp(prepare);
    openAnalysis(app);
    const first = lastChart(app, 'doughnut');
    click(app.document.querySelectorAll('.month-next')[1]);
    click(app.document.querySelectorAll('.month-prev')[1]);
    assert.equal(first.destroyed, true);
  });

  test('支出がない月は「支出はありません」と表示し、グラフを消す', () => {
    const { app } = startApp(prepare);
    openAnalysis(app);
    const pie = lastChart(app, 'doughnut');
    click(app.document.querySelectorAll('.month-next')[1]); // 12月
    assert.equal(app.$('breakdown-empty').hidden, false);
    assert.equal(app.$('breakdown-content').hidden, true);
    assert.equal(pie.destroyed, true);
    assert.equal(app.get('Charts.pieChart'), null);
  });

  test('予算も支出もない月は「予算と実績」に案内を出す', () => {
    const { app } = startApp();
    openAnalysis(app);
    assert.equal(app.$('compare-empty').hidden, false);
    assert.equal(app.$('trend-empty').hidden, false);
  });
});

describe('F-03 予算設定', () => {
  const openSettings = (app) => click(app.document.querySelector('.tab[data-tab="settings"]'));
  const budgetInput = (app, name) => app.$(`budget-cat-${categoryId(app, 'expense', name)}`);

  test('支出カテゴリごとの入力欄を出し、保存済みの予算を表示する', () => {
    const { app } = startApp(({ data, exp }) => {
      data.budget = { total: 200000, byCategory: { [exp[0].id]: 40000 } };
    });
    openSettings(app);
    assert.equal(app.$('budget-total').value, '200000');
    assert.equal(app.$('budget-category-list').querySelectorAll('input').length, 10);
    assert.equal(budgetInput(app, '食費').value, '40000');
    assert.equal(budgetInput(app, '日用品').value, '');
    assert.equal(app.$('budget-category-sum').textContent, '40,000円');
  });

  test('入力すると、カテゴリ別予算の合計がすぐ変わる', () => {
    const { app } = startApp();
    budgetInput(app, '食費').value = '30,000';
    budgetInput(app, '娯楽').value = '１００００';
    app.$('budget-category-list').dispatchEvent(new app.window.Event('input'));
    assert.equal(app.$('budget-category-sum').textContent, '40,000円');
  });

  test('保存すると、空欄は「予算なし」として保存し、ホームにも反映する', () => {
    const { app } = startApp();
    app.$('budget-total').value = '180,000';
    budgetInput(app, '食費').value = '40000';
    click(app.$('budget-save'));
    assert.deepEqual(app.stored().budget, {
      total: 180000, byCategory: { [categoryId(app, 'expense', '食費')]: 40000 },
    });
    assert.equal(app.$('budget-message').textContent, '保存しました');
    assert.match(app.$('sum-budget').textContent, /予算 180,000円/);
  });

  test('総予算を空にすると、予算なしに戻せる', () => {
    const { app } = startApp(({ data }) => { data.budget.total = 100000; });
    app.$('budget-total').value = '';
    click(app.$('budget-save'));
    assert.equal(app.stored().budget.total, null);
  });

  test('マイナスや数字以外はエラーにして保存しない', () => {
    const { app } = startApp();
    app.$('budget-total').value = '-100';
    budgetInput(app, '食費').value = 'たくさん';
    click(app.$('budget-save'));
    assert.equal(app.$('err-budget-total').textContent, '0以上の数字で入力してください');
    assert.ok(budgetInput(app, '食費').classList.contains('is-invalid'));
    assert.equal(app.$('budget-message').className, 'message message-error');
    assert.deepEqual(app.stored().budget, { total: null, byCategory: {} });
  });

  test('カテゴリ別予算の合計が総予算を超えたら、警告を出す（保存はする）', () => {
    const { app } = startApp();
    app.$('budget-total').value = '50000';
    budgetInput(app, '食費').value = '40000';
    budgetInput(app, '住居費').value = '70000';
    click(app.$('budget-save'));
    assert.equal(app.stored().budget.total, 50000);
    assert.equal(app.$('budget-message').className, 'message message-warning');
    assert.match(app.$('budget-message').textContent, /110,000円.*50,000円/);
  });
});

describe('F-08 カテゴリ管理', () => {
  const addForm = (app, type) => app.document.querySelector(`.cat-add[data-type="${type}"]`);
  const addCategory = (app, type, name) => {
    const form = addForm(app, type);
    form.querySelector('input').value = name;
    form.querySelector('button').click();
  };
  const rowOf = (app, type, name) => app.$(`cat-list-${type}`)
    .querySelector(`li[data-id="${categoryId(app, type, name)}"]`);

  test('カテゴリを追加すると、一覧の最後と登録フォーム・予算設定に出る', () => {
    const { app } = startApp();
    addCategory(app, 'expense', '  サブスク  ');
    const names = [...app.$('cat-list-expense').querySelectorAll('input')].map((i) => i.value);
    assert.equal(names.at(-1), 'サブスク');
    assert.equal(app.$('cat-message').textContent, '「サブスク」を追加しました');
    assert.equal(addForm(app, 'expense').querySelector('input').value, '', '入力欄は空にする');
    const options = [...app.$('tx-category').options].map((o) => o.textContent);
    assert.ok(options.includes('サブスク'));
    assert.equal(app.$('budget-category-list').querySelectorAll('input').length, 11);
    const saved = app.stored().categories.find((c) => c.name === 'サブスク');
    assert.deepEqual([saved.type, saved.order], ['expense', 10]);
  });

  test('空の名前・同じ種別で同じ名前は追加できない（別の種別ならよい）', () => {
    const { app } = startApp();
    addCategory(app, 'expense', '   ');
    assert.equal(app.$('cat-message').textContent, 'カテゴリ名を入力してください');
    addCategory(app, 'expense', '食費');
    assert.equal(app.$('cat-message').textContent, '「食費」はすでにあります');
    assert.equal(app.stored().categories.length, 13);
    addCategory(app, 'income', '食費');
    assert.equal(app.stored().categories.length, 14);
  });

  test('名前を変更でき、一覧の表示にも反映する', () => {
    const { app } = startApp(({ exp, addTx }) => { addTx('expense', '2026-11-01', 500, exp[6]); });
    const row = rowOf(app, 'expense', '娯楽');
    row.querySelector('input').value = '趣味';
    row.querySelector('button[data-action="rename"]').click();
    assert.equal(app.$('cat-message').textContent, '「娯楽」を「趣味」に変更しました');
    assert.ok(app.stored().categories.some((c) => c.name === '趣味'));
    assert.equal(listRows(app)[0][2], '趣味');
  });

  test('名前の入力欄で Enter を押しても変更できる', () => {
    const { app } = startApp();
    const input = rowOf(app, 'income', '副業').querySelector('input');
    input.value = 'ボーナス';
    input.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.ok(app.stored().categories.some((c) => c.type === 'income' && c.name === 'ボーナス'));
  });

  test('ほかのカテゴリと同じ名前・空の名前には変更できない', () => {
    const { app } = startApp();
    const row = rowOf(app, 'expense', '娯楽');
    row.querySelector('input').value = '食費';
    row.querySelector('button[data-action="rename"]').click();
    assert.equal(app.$('cat-message').textContent, '「食費」はすでにあります');
    row.querySelector('input').value = '';
    row.querySelector('button[data-action="rename"]').click();
    assert.equal(app.$('cat-message').textContent, 'カテゴリ名を入力してください');
    assert.ok(app.stored().categories.some((c) => c.name === '娯楽'));
  });

  test('記録で使われているカテゴリは削除できない', () => {
    const { app } = startApp(({ exp, addTx }) => {
      addTx('expense', '2026-11-01', 500, exp[0]);
      addTx('expense', '2026-10-01', 500, exp[0]);
    });
    rowOf(app, 'expense', '食費').querySelector('button[data-action="delete"]').click();
    assert.equal(app.$('cat-message').textContent, '「食費」は2件の記録で使われているため削除できません');
    assert.equal(app.calls.confirm.length, 0);
    assert.equal(app.stored().categories.length, 13);
  });

  test('使われていないカテゴリは確認してから削除し、その予算と並び順も整える', () => {
    const { app } = startApp(({ data, exp }) => {
      data.budget.byCategory = { [exp[1].id]: 5000, [exp[0].id]: 30000 };
    });
    const id = categoryId(app, 'expense', '日用品');
    rowOf(app, 'expense', '日用品').querySelector('button[data-action="delete"]').click();
    assert.match(app.calls.confirm[0], /日用品/);
    const saved = app.stored();
    assert.equal(saved.categories.some((c) => c.id === id), false);
    assert.equal(id in saved.budget.byCategory, false);
    assert.equal(Object.keys(saved.budget.byCategory).length, 1);
    const orders = saved.categories.filter((c) => c.type === 'expense').map((c) => c.order).sort((a, b) => a - b);
    assert.deepEqual(orders, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(app.get('validateData')(saved), null);
  });

  test('削除の確認でキャンセルすれば削除しない', () => {
    const { app } = startApp();
    app.control.confirmResult = false;
    rowOf(app, 'expense', '日用品').querySelector('button[data-action="delete"]').click();
    assert.equal(app.stored().categories.length, 13);
  });
});

describe('F-09 バックアップ・復元（画面操作）', () => {
  /** ファイル選択欄でファイルを選んだことにする */
  const chooseFile = async (app, content, name = 'backup.json') => {
    const input = app.$('backup-file');
    const file = new File([content], name);
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new app.window.Event('change'));
    await flush();
    await flush();
  };

  test('「バックアップ」でファイルをダウンロードし、完了を知らせる', () => {
    const { app } = startApp();
    click(app.$('backup-export'));
    assert.equal(app.calls.downloads[0].filename, 'kakeibo-backup-20261111.json');
    assert.equal(app.$('backup-message').textContent, 'バックアップファイルをダウンロードしました');
  });

  test('正しいファイルを選ぶと、確認してから上書きし、画面を更新する', async () => {
    const { app } = startApp();
    const other = createApp({ scripts: LOGIC_SCRIPTS });
    const backup = makeData(other);
    backup.addTx('expense', '2026-11-02', 4321, backup.exp[0], '復元データ');
    backup.data.budget.total = 99000;

    await chooseFile(app, JSON.stringify(backup.data));
    assert.match(app.calls.confirm[0], /記録 1 件/);
    assert.equal(app.$('backup-message').textContent, '復元しました');
    assert.equal(app.stored().transactions[0].memo, '復元データ');
    assert.equal(listRows(app)[0][4], '復元データ');
    assert.equal(app.$('budget-total').value, '99000');
  });

  test('確認でキャンセルすれば上書きしない', async () => {
    const { app } = startApp(({ exp, addTx }) => { addTx('expense', '2026-11-01', 100, exp[0], '元データ'); });
    app.control.confirmResult = false;
    const other = makeData(createApp({ scripts: LOGIC_SCRIPTS }));
    await chooseFile(app, JSON.stringify(other.data));
    assert.equal(app.stored().transactions[0].memo, '元データ');
  });

  test('形式の正しくないファイルはエラーを出して読み込まない', async () => {
    const { app } = startApp(({ exp, addTx }) => { addTx('expense', '2026-11-01', 100, exp[0], '元データ'); });
    await chooseFile(app, '{"version":1}');
    assert.match(app.$('backup-message').textContent, /^復元できませんでした：/);
    assert.equal(app.$('backup-message').className, 'message message-error');
    assert.equal(app.calls.confirm.length, 0);
    assert.equal(app.stored().transactions[0].memo, '元データ');
  });
});
