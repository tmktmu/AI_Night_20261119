'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, LOGIC_SCRIPTS } = require('./helpers/setup');

const app = createApp({ scripts: ['utils'] });
const fn = (name) => app.get(name);

describe('pad2', () => {
  test('1桁は0埋めし、2桁はそのまま', () => {
    assert.equal(fn('pad2')(3), '03');
    assert.equal(fn('pad2')(12), '12');
  });
});

describe('formatYen / formatNumber', () => {
  test('3桁ごとにカンマを入れて「円」を付ける', () => {
    assert.equal(fn('formatYen')(0), '0円');
    assert.equal(fn('formatYen')(1234567), '1,234,567円');
  });
  test('マイナスもカンマ区切りになる', () => {
    assert.equal(fn('formatYen')(-4200), '-4,200円');
  });
  test('小数は四捨五入する', () => {
    assert.equal(fn('formatNumber')(1234.6), '1,235');
  });
});

describe('escapeHtml', () => {
  test('HTML の特殊文字をエスケープする', () => {
    assert.equal(fn('escapeHtml')(`<b class="x">'&'</b>`),
      '&lt;b class=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;');
  });
  test('数値も文字列にする', () => {
    assert.equal(fn('escapeHtml')(42), '42');
  });
});

describe('addMonths', () => {
  test('月を足し引きできる', () => {
    assert.equal(fn('addMonths')('2026-05', 1), '2026-06');
    assert.equal(fn('addMonths')('2026-05', -2), '2026-03');
  });
  test('年をまたいでも正しく計算する', () => {
    assert.equal(fn('addMonths')('2026-12', 1), '2027-01');
    assert.equal(fn('addMonths')('2026-01', -1), '2025-12');
    assert.equal(fn('addMonths')('2026-11', -11), '2025-12');
    assert.equal(fn('addMonths')('2026-11', 0), '2026-11');
  });
});

describe('formatYearMonth', () => {
  test('"YYYY-MM" を「YYYY年M月」にする（月の0は取る）', () => {
    assert.equal(fn('formatYearMonth')('2026-01'), '2026年1月');
    assert.equal(fn('formatYearMonth')('2026-11'), '2026年11月');
  });
});

describe('isValidDateString', () => {
  test('実在する日付は true', () => {
    assert.equal(fn('isValidDateString')('2026-11-11'), true);
    assert.equal(fn('isValidDateString')('2028-02-29'), true); // うるう年
  });
  test('実在しない日付や形式違いは false', () => {
    for (const s of ['2026-02-29', '2026-13-01', '2026-04-31', '2026/11/11', '2026-1-1', '', 'abc']) {
      assert.equal(fn('isValidDateString')(s), false, s);
    }
  });
  test('文字列以外は false', () => {
    assert.equal(fn('isValidDateString')(null), false);
    assert.equal(fn('isValidDateString')(20261111), false);
  });
});

describe('parseAmount', () => {
  test('半角の整数を数値にする', () => {
    assert.equal(fn('parseAmount')('1200'), 1200);
    assert.equal(fn('parseAmount')('0'), 0);
  });
  test('前後の空白・カンマ・全角数字・全角カンマを受け付ける', () => {
    assert.equal(fn('parseAmount')(' 1,200 '), 1200);
    assert.equal(fn('parseAmount')('１２００'), 1200);
    assert.equal(fn('parseAmount')('１，２００'), 1200);
  });
  test('数字でないもの・マイナス・小数・空は null', () => {
    for (const s of ['', '   ', 'abc', '-5', '1.5', '12円', '1e3']) {
      assert.equal(fn('parseAmount')(s), null, s);
    }
  });
  test('大きすぎる数（安全な整数を超える）は null', () => {
    assert.equal(fn('parseAmount')('99999999999999999999'), null);
  });
});

describe('createId', () => {
  test('毎回ちがう ID を作る', () => {
    const ids = new Set(Array.from({ length: 100 }, () => fn('createId')()));
    assert.equal(ids.size, 100);
  });
  test('crypto.randomUUID がなくても ID を作れる', () => {
    const noCrypto = createApp({ scripts: LOGIC_SCRIPTS });
    noCrypto.window.eval('Object.defineProperty(window, "crypto", { value: undefined })');
    const id = noCrypto.get('createId()');
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 8);
  });
});

describe('todayString / currentYearMonth', () => {
  test('今日の日付を "YYYY-MM-DD" で返す', () => {
    const fixed = createApp({ scripts: ['utils'], today: '2026-03-07' });
    assert.equal(fixed.get('todayString()'), '2026-03-07');
    assert.equal(fixed.get('currentYearMonth()'), '2026-03');
  });
});
