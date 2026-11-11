'use strict';

/**
 * localStorage の読み書きとバックアップ・復元（F-09）
 */

const STORAGE_KEY = 'kakeibo-data';
const DATA_VERSION = 1;

const DEFAULT_EXPENSE_CATEGORIES = [
  '食費', '日用品', '交通費', '住居費', '水道光熱費',
  '通信費', '娯楽', '交際費', '医療費', 'その他',
];
const DEFAULT_INCOME_CATEGORIES = ['給与', '副業', 'その他'];

/**
 * 初めて起動したときのデータ（初期カテゴリ入り）を作る
 * @returns {object}
 */
function createInitialData() {
  const categories = [];
  DEFAULT_EXPENSE_CATEGORIES.forEach((name, i) => {
    categories.push({ id: createId(), type: 'expense', name, order: i });
  });
  DEFAULT_INCOME_CATEGORIES.forEach((name, i) => {
    categories.push({ id: createId(), type: 'income', name, order: i });
  });
  return {
    version: DATA_VERSION,
    transactions: [],
    categories,
    budget: { total: null, byCategory: {} },
  };
}

/**
 * 0以上の整数か調べる
 * @param {*} v
 * @returns {boolean}
 */
function isNonNegativeInteger(v) {
  return Number.isSafeInteger(v) && v >= 0;
}

/**
 * データの形が正しいか調べる
 * @param {*} obj
 * @returns {string|null} 問題があればエラーメッセージ、なければ null
 */
function validateData(obj) {
  if (!obj || typeof obj !== 'object') return 'データの形式が正しくありません。';
  if (obj.version !== DATA_VERSION) return `対応していないデータのバージョンです（version: ${obj.version}）。`;
  if (!Array.isArray(obj.categories)) return 'categories がありません。';
  if (!Array.isArray(obj.transactions)) return 'transactions がありません。';
  if (!obj.budget || typeof obj.budget !== 'object') return 'budget がありません。';

  const categoryTypes = new Map();
  for (const c of obj.categories) {
    if (!c || typeof c.id !== 'string' || !['income', 'expense'].includes(c.type)
      || typeof c.name !== 'string' || c.name.trim() === '' || typeof c.order !== 'number') {
      return 'カテゴリのデータに誤りがあります。';
    }
    if (categoryTypes.has(c.id)) return 'カテゴリの ID が重複しています。';
    categoryTypes.set(c.id, c.type);
  }

  for (const t of obj.transactions) {
    if (!t || typeof t.id !== 'string' || !['income', 'expense'].includes(t.type)
      || !isValidDateString(t.date) || !Number.isSafeInteger(t.amount) || t.amount < 1
      || typeof t.createdAt !== 'string'
      || (t.memo !== undefined && typeof t.memo !== 'string')) {
      return '収支記録のデータに誤りがあります。';
    }
    if (categoryTypes.get(t.categoryId) !== t.type) {
      return '収支記録に存在しないカテゴリが使われています。';
    }
  }

  const { total, byCategory } = obj.budget;
  if (total !== null && !isNonNegativeInteger(total)) return '総予算の値に誤りがあります。';
  if (!byCategory || typeof byCategory !== 'object') return 'カテゴリ別予算がありません。';
  for (const [id, v] of Object.entries(byCategory)) {
    if (categoryTypes.get(id) !== 'expense' || !isNonNegativeInteger(v)) {
      return 'カテゴリ別予算の値に誤りがあります。';
    }
  }
  return null;
}

const Store = {
  /** アプリ全体のデータ */
  data: null,

  /**
   * localStorage からデータを読み込む。なければ初期データを作る。
   */
  load() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      alert('データの読み込みに失敗しました。ブラウザの設定で保存が許可されているか確認してください。');
      this.data = createInitialData();
      return;
    }

    if (raw === null) {
      this.data = createInitialData();
      this.save();
      return;
    }

    try {
      const obj = JSON.parse(raw);
      const error = validateData(obj);
      if (error) throw new Error(error);
      this.data = obj;
    } catch (e) {
      alert('保存されているデータが壊れていたため、新しいデータで開始します。\n'
        + '（元のデータは「kakeibo-data-broken」という名前でブラウザに残しています）');
      try {
        localStorage.setItem(STORAGE_KEY + '-broken', raw);
      } catch (_) { /* 残せなくても続ける */ }
      this.data = createInitialData();
      this.save();
    }
  },

  /**
   * 今のデータを localStorage に保存する
   * @returns {boolean} 成功したら true
   */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      alert('データの保存に失敗しました。ブラウザの保存容量が足りない可能性があります。');
      return false;
    }
  },

  /**
   * データを変更して保存する。保存に失敗したら変更を取り消す。
   * @param {(data: object) => void} mutator データを書き換える関数
   * @returns {boolean} 保存できたら true
   */
  commit(mutator) {
    const backup = JSON.stringify(this.data);
    mutator(this.data);
    if (!this.save()) {
      this.data = JSON.parse(backup);
      return false;
    }
    return true;
  },

  /**
   * 全データを JSON ファイルとしてダウンロードする
   */
  exportBackup() {
    const json = JSON.stringify(this.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kakeibo-backup-${todayString().replace(/-/g, '')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /**
   * JSON ファイルを読み込んで中身をチェックする（まだ上書きはしない）
   * @param {File} file
   * @returns {Promise<object>} 正しいデータ。誤りがあれば Error で reject する
   */
  async readBackupFile(file) {
    const text = await file.text();
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      throw new Error('JSON ファイルとして読み込めませんでした。');
    }
    const error = validateData(obj);
    if (error) throw new Error(error);
    return obj;
  },

  /**
   * 読み込んだデータで今のデータを上書きして保存する
   * @param {object} obj validateData を通ったデータ
   * @returns {boolean} 保存できたら true
   */
  replaceAll(obj) {
    return this.commit(() => {
      this.data = obj;
    });
  },
};
