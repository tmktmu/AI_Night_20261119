'use strict';

/**
 * 共通の小さな関数をまとめたファイル。
 * 画面を操作しない関数だけを置く。
 */

/**
 * 数字を2桁の文字列にする（例: 3 → "03"）
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 金額をカンマ区切り＋「円」で表示する（例: 12345 → "12,345円"）
 * @param {number} amount
 * @returns {string}
 */
function formatYen(amount) {
  return formatNumber(amount) + '円';
}

/**
 * 数値をカンマ区切りにする（例: -12345 → "-12,345"）
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  return Math.round(n).toLocaleString('ja-JP');
}

/**
 * HTML に埋め込む文字列をエスケープする
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const table = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, (c) => table[c]);
}

/**
 * 今日の日付を "YYYY-MM-DD" で返す
 * @returns {string}
 */
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 今月を "YYYY-MM" で返す
 * @returns {string}
 */
function currentYearMonth() {
  return todayString().slice(0, 7);
}

/**
 * "YYYY-MM" に月数を足す（マイナスも可）
 * @param {string} ym "YYYY-MM"
 * @param {number} n 足す月数
 * @returns {string} "YYYY-MM"
 */
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * "YYYY-MM" を "2026年11月" の形にする
 * @param {string} ym
 * @returns {string}
 */
function formatYearMonth(ym) {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}

/**
 * "YYYY-MM-DD" が実在する日付か調べる
 * @param {string} s
 * @returns {boolean}
 */
function isValidDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * 入力された金額の文字列を数値にする。
 * 全角数字・カンマも受け付ける。0以上の整数でなければ null を返す。
 * @param {string} text
 * @returns {number|null}
 */
function parseAmount(text) {
  const s = String(text)
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * 一意な ID を作る
 * @returns {string}
 */
function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * メッセージ欄に一定時間メッセージを表示する
 * @param {HTMLElement} el 表示先の要素
 * @param {string} text 表示する文字
 * @param {'success'|'error'|'warning'} kind 種類
 * @param {number} [ms=4000] 表示しておく時間（ミリ秒）。0 なら消さない
 */
function showMessage(el, text, kind, ms = 4000) {
  el.textContent = text;
  el.className = `message message-${kind}`;
  clearTimeout(el._timerId);
  if (ms > 0) {
    el._timerId = setTimeout(() => {
      el.textContent = '';
      el.className = 'message';
    }, ms);
  }
}
