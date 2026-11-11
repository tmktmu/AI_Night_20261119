'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, makeData, plain, LOGIC_SCRIPTS } = require('./helpers/setup');

const newApp = (options = {}) => createApp({ scripts: LOGIC_SCRIPTS, ...options });

describe('createInitialData', () => {
  test('初期カテゴリ（支出10・収入3）と空の記録・予算を作る', () => {
    const app = newApp();
    const data = app.get('createInitialData()');
    const names = (type) => data.categories.filter((c) => c.type === type).map((c) => c.name);
    assert.equal(data.version, 1);
    assert.deepEqual(plain(names('expense')),
      ['食費', '日用品', '交通費', '住居費', '水道光熱費', '通信費', '娯楽', '交際費', '医療費', 'その他']);
    assert.deepEqual(plain(names('income')), ['給与', '副業', 'その他']);
    assert.equal(data.transactions.length, 0);
    assert.deepEqual(plain(data.budget), { total: null, byCategory: {} });
  });

  test('作ったデータは validateData を通る', () => {
    const app = newApp();
    assert.equal(app.get('validateData(createInitialData())'), null);
  });
});

describe('validateData', () => {
  /** 正しいデータを作ってから一部を壊し、エラーになることを確かめる */
  const expectError = (breakIt) => {
    const app = newApp();
    const { data, exp, inc, addTx } = makeData(app);
    addTx('expense', '2026-11-01', 1000, exp[0]);
    addTx('income', '2026-11-25', 2000, inc[0]);
    data.budget = { total: 5000, byCategory: { [exp[0].id]: 3000 } };
    assert.equal(app.get('validateData')(data), null, '壊す前は正しいデータ');
    breakIt(data, { exp, inc });
    const error = app.get('validateData')(data);
    assert.equal(typeof error, 'string');
    return error;
  };

  test('null や配列でないものはエラー', () => {
    const app = newApp();
    for (const v of [null, undefined, 1, 'x']) assert.ok(app.get('validateData')(v));
  });
  test('バージョン違いはエラー', () => {
    assert.match(expectError((d) => { d.version = 2; }), /バージョン/);
  });
  test('categories / transactions / budget がないとエラー', () => {
    expectError((d) => { delete d.categories; });
    expectError((d) => { d.transactions = {}; });
    expectError((d) => { d.budget = null; });
  });
  test('カテゴリ名が空・種別が不正・ID重複はエラー', () => {
    expectError((d) => { d.categories[0].name = '  '; });
    expectError((d) => { d.categories[0].type = 'other'; });
    expectError((d) => { d.categories[1].id = d.categories[0].id; });
  });
  test('金額が0・小数・文字列はエラー', () => {
    expectError((d) => { d.transactions[0].amount = 0; });
    expectError((d) => { d.transactions[0].amount = 1.5; });
    expectError((d) => { d.transactions[0].amount = '1000'; });
  });
  test('日付が不正・メモが文字列以外・createdAt なしはエラー', () => {
    expectError((d) => { d.transactions[0].date = '2026-02-30'; });
    expectError((d) => { d.transactions[0].memo = 123; });
    expectError((d) => { delete d.transactions[0].createdAt; });
  });
  test('存在しないカテゴリや、種別の合わないカテゴリを使った記録はエラー', () => {
    expectError((d) => { d.transactions[0].categoryId = 'nothing'; });
    expectError((d, { inc }) => { d.transactions[0].categoryId = inc[0].id; });
  });
  test('予算がマイナス・小数、収入カテゴリへの予算はエラー', () => {
    expectError((d) => { d.budget.total = -1; });
    expectError((d, { exp }) => { d.budget.byCategory[exp[0].id] = 0.5; });
    expectError((d, { inc }) => { d.budget.byCategory[inc[0].id] = 100; });
  });
  test('メモなしの記録・総予算0円は正しいデータ', () => {
    const app = newApp();
    const { data, exp, addTx } = makeData(app);
    delete addTx('expense', '2026-11-01', 1000, exp[0]).memo;
    data.budget.total = 0;
    assert.equal(app.get('validateData')(data), null);
  });
});

describe('Store.load', () => {
  test('データがないときは初期データを作って保存する', () => {
    const app = newApp();
    app.get('Store.load()');
    assert.equal(app.get('Store.data.categories.length'), 13);
    assert.equal(app.stored().categories.length, 13);
    assert.equal(app.calls.alert.length, 0);
  });

  test('保存されている正しいデータを読み込む', () => {
    const base = newApp();
    const { data, exp, addTx } = makeData(base);
    addTx('expense', '2026-11-01', 1000, exp[0], 'ランチ');
    const app = newApp({ seed: data });
    app.get('Store.load()');
    assert.equal(app.get('Store.data.transactions[0].memo'), 'ランチ');
  });

  test('壊れた JSON のときは知らせて新しいデータで始め、元のデータを残す', () => {
    const app = newApp({ seed: '{壊れたデータ' });
    app.get('Store.load()');
    assert.equal(app.calls.alert.length, 1);
    assert.equal(app.window.localStorage.getItem('kakeibo-data-broken'), '{壊れたデータ');
    assert.equal(app.stored().categories.length, 13);
  });

  test('形の正しくないデータも壊れたデータとして扱う', () => {
    const app = newApp({ seed: { version: 1, transactions: 'x' } });
    app.get('Store.load()');
    assert.equal(app.calls.alert.length, 1);
    assert.equal(app.get('Store.data.transactions.length'), 0);
  });

  test('localStorage が使えないときは知らせて、メモリ上の初期データで動く', () => {
    const app = newApp();
    app.window.Storage.prototype.getItem = () => { throw new Error('denied'); };
    app.get('Store.load()');
    assert.equal(app.calls.alert.length, 1);
    assert.equal(app.get('Store.data.categories.length'), 13);
  });
});

describe('Store.save / Store.commit', () => {
  test('commit はデータを書き換えて保存する', () => {
    const app = newApp();
    app.get('Store.load()');
    const ok = app.get('Store.commit((d) => { d.budget.total = 1234; })');
    assert.equal(ok, true);
    assert.equal(app.stored().budget.total, 1234);
  });

  test('保存に失敗したら知らせて false を返し、変更を取り消す', () => {
    const app = newApp();
    app.get('Store.load()');
    app.window.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    const ok = app.get('Store.commit((d) => { d.budget.total = 9999; })');
    assert.equal(ok, false);
    assert.equal(app.calls.alert.length, 1);
    assert.equal(app.get('Store.data.budget.total'), null);
  });
});

describe('バックアップ・復元', () => {
  test('exportBackup は全データを kakeibo-backup-YYYYMMDD.json として書き出す', async () => {
    const app = newApp({ today: '2026-11-11' });
    app.get('Store.load()');
    app.get('Store.exportBackup()');
    assert.equal(app.calls.downloads.length, 1);
    const { blob, filename } = app.calls.downloads[0];
    assert.equal(filename, 'kakeibo-backup-20261111.json');
    const text = await new Promise((resolve) => {
      const reader = new app.window.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
    assert.deepEqual(JSON.parse(text), plain(app.get('Store.data')));
  });

  test('readBackupFile は正しいファイルを読み込む', async () => {
    const app = newApp();
    const { data } = makeData(app);
    const file = new File([JSON.stringify(data)], 'backup.json');
    const obj = await app.get('Store').readBackupFile(file);
    assert.equal(obj.categories.length, 13);
  });

  test('readBackupFile は JSON でないファイルをエラーにする', async () => {
    const app = newApp();
    const file = new File(['not json'], 'x.json');
    await assert.rejects(app.get('Store').readBackupFile(file), /JSON ファイルとして読み込めませんでした/);
  });

  test('readBackupFile は形の正しくないデータをエラーにする', async () => {
    const app = newApp();
    const file = new File([JSON.stringify({ version: 1 })], 'x.json');
    await assert.rejects(app.get('Store').readBackupFile(file), /categories/);
  });

  test('replaceAll で今のデータを上書きして保存する', () => {
    const app = newApp();
    app.get('Store.load()');
    const { data, exp, addTx } = makeData(app);
    addTx('expense', '2026-11-01', 777, exp[0]);
    assert.equal(app.get('Store').replaceAll(data), true);
    assert.equal(app.get('Store.data.transactions[0].amount'), 777);
    assert.equal(app.stored().transactions[0].amount, 777);
  });
});
