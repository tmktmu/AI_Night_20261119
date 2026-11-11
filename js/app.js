'use strict';

/**
 * 起動処理・タブ切り替え・月の切り替え・ホームと分析画面の表示
 */

const STATUS_LABELS = {
  ok: { icon: '●', text: '予算内' },
  warning: { icon: '▲', text: '注意' },
  over: { icon: '✕', text: '超過' },
};

const App = {
  /** 表示している月 "YYYY-MM"（ホームと分析で共通） */
  currentMonth: currentYearMonth(),
  currentTab: 'home',

  init() {
    Store.load();

    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    });
    document.querySelectorAll('.month-prev').forEach((b) => b.addEventListener('click', () => this.changeMonth(-1)));
    document.querySelectorAll('.month-next').forEach((b) => b.addEventListener('click', () => this.changeMonth(1)));
    document.querySelectorAll('.month-today').forEach((b) => b.addEventListener('click', () => {
      this.currentMonth = currentYearMonth();
      this.refreshAll();
    }));
    document.getElementById('trend-months').addEventListener('change', () => this.renderAnalysis());
    this.initBackup();

    // OS のライト／ダーク切り替えに合わせてグラフの色を描き直す
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      Categories.render();
      if (this.currentTab === 'analysis') this.renderAnalysis();
    });

    Transactions.init();
    Budget.init();
    Categories.init();

    Budget.render();
    this.refreshAll();
  },

  /**
   * タブを切り替える
   * @param {'home'|'analysis'|'settings'} name
   */
  showTab(name) {
    this.currentTab = name;
    document.querySelectorAll('.tab').forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== `tab-${name}`;
    });
    // グラフは表示されてから描かないと大きさが決まらない
    if (name === 'analysis') this.renderAnalysis();
  },

  /**
   * 表示する月を前後に動かす
   * @param {number} delta
   */
  changeMonth(delta) {
    this.currentMonth = addMonths(this.currentMonth, delta);
    this.refreshAll();
  },

  /** データが変わったときなどに、画面全体を描き直す */
  refreshAll() {
    const label = formatYearMonth(this.currentMonth);
    document.querySelectorAll('.month-label').forEach((el) => { el.textContent = label; });
    const isThisMonth = this.currentMonth === currentYearMonth();
    document.querySelectorAll('.month-today').forEach((el) => { el.hidden = isThisMonth; });

    Transactions.renderCategoryOptions();
    Transactions.render();
    this.renderHomeSummary();
    Categories.render();
    if (this.currentTab === 'analysis') this.renderAnalysis();
  },

  /** F-04: ホームの月次サマリー */
  renderHomeSummary() {
    const s = calcMonthlySummary(Store.data, this.currentMonth);
    document.getElementById('sum-income').textContent = formatYen(s.income);
    document.getElementById('sum-expense').textContent = formatYen(s.expense);
    const balance = document.getElementById('sum-balance');
    balance.textContent = (s.balance > 0 ? '+' : '') + formatYen(s.balance);
    balance.classList.toggle('is-negative', s.balance < 0);

    const box = document.getElementById('sum-budget');
    if (s.budgetTotal === null) {
      box.innerHTML = '<p class="hint">予算が未設定です。「設定」タブで月の予算を決めると、ここに残りの予算が表示されます。</p>';
      return;
    }
    const remainingText = s.remaining >= 0
      ? `残り <strong>${formatYen(s.remaining)}</strong>`
      : `<strong class="text-over">${formatYen(-s.remaining)}オーバー</strong>`;
    box.innerHTML = `
      <div class="budget-line">
        <span>予算 ${formatYen(s.budgetTotal)}</span>
        <span>使った額 ${formatYen(s.expense)}</span>
        <span>${remainingText}</span>
      </div>
      ${this.rateBarHtml(s.rate, s.status, s.budgetTotal, s.expense)}`;
  },

  /**
   * 消化率のバーの HTML
   * @param {number|null} rate
   * @param {string} status
   * @param {number} budget
   * @param {number} actual
   * @returns {string}
   */
  rateBarHtml(rate, status, budget, actual) {
    const label = STATUS_LABELS[status];
    let rateText;
    let width;
    if (rate === null) {
      // 予算0円のとき
      rateText = actual > 0 ? '—' : '0%';
      width = actual > 0 ? 100 : 0;
    } else {
      rateText = `${Math.round(rate)}%`;
      width = Math.min(rate, 100);
    }
    return `<div class="rate">
      <div class="rate-bar" role="img" aria-label="予算${formatYen(budget)}に対して${rateText}">
        <div class="rate-fill rate-${status}" style="width:${width}%"></div>
      </div>
      <span class="rate-text">${rateText}</span>
      <span class="status status-${status}"><span aria-hidden="true">${label.icon}</span>${label.text}</span>
    </div>`;
  },

  /** 分析タブ（F-05, F-06, F-07）を描く */
  renderAnalysis() {
    this.renderBreakdown();
    this.renderBudgetComparison();
    this.renderTrend();
  },

  /** F-05: カテゴリ別内訳 */
  renderBreakdown() {
    const breakdown = calcCategoryBreakdown(Store.data, this.currentMonth);
    const hasData = breakdown.rows.length > 0;
    document.getElementById('breakdown-content').hidden = !hasData;
    document.getElementById('breakdown-empty').hidden = hasData;
    if (!hasData) {
      if (Charts.pieChart) {
        Charts.pieChart.destroy();
        Charts.pieChart = null;
      }
      return;
    }

    const theme = Charts.getTheme();
    document.getElementById('breakdown-list').innerHTML = breakdown.rows.map((r) => `
      <tr>
        <td><span class="swatch" style="background:${Charts.colorOf(r.categoryId, Store.data.categories, theme)}"></span>${escapeHtml(r.name)}</td>
        <td class="num">${formatYen(r.amount)}</td>
        <td class="num">${r.ratio.toFixed(1)}%</td>
      </tr>`).join('');
    document.getElementById('breakdown-total').innerHTML = `
      <tr><th>合計</th><td class="num">${formatYen(breakdown.total)}</td><td class="num">100%</td></tr>`;
    Charts.renderPie(document.getElementById('pie-chart'), breakdown, Store.data.categories);
  },

  /** F-06: 予算と実績の比較 */
  renderBudgetComparison() {
    const rows = calcBudgetComparison(Store.data, this.currentMonth);
    const summary = calcMonthlySummary(Store.data, this.currentMonth);
    const hasData = rows.length > 0;
    document.getElementById('compare-table').hidden = !hasData;
    document.getElementById('compare-empty').hidden = hasData;
    if (!hasData) return;

    const theme = Charts.getTheme();
    const rowHtml = (name, swatchColor, r) => {
      const swatch = swatchColor ? `<span class="swatch" style="background:${swatchColor}"></span>` : '';
      if (r.budget === null) {
        return `<tr>
          <td>${swatch}${escapeHtml(name)}</td>
          <td class="num muted">予算なし</td>
          <td class="num">${formatYen(r.actual)}</td>
          <td class="num muted">—</td>
          <td class="muted">—</td>
        </tr>`;
      }
      const remaining = r.remaining >= 0
        ? formatYen(r.remaining)
        : `<span class="text-over">${formatYen(r.remaining)}</span>`;
      return `<tr>
        <td>${swatch}${escapeHtml(name)}</td>
        <td class="num">${formatYen(r.budget)}</td>
        <td class="num">${formatYen(r.actual)}</td>
        <td class="num">${remaining}</td>
        <td>${this.rateBarHtml(r.rate, r.status, r.budget, r.actual)}</td>
      </tr>`;
    };

    document.getElementById('compare-list').innerHTML = rows
      .map((r) => rowHtml(r.name, Charts.colorOf(r.categoryId, Store.data.categories, theme), r))
      .join('');
    document.getElementById('compare-total').innerHTML = rowHtml('合計（総予算）', null, {
      budget: summary.budgetTotal,
      actual: summary.expense,
      remaining: summary.remaining,
      rate: summary.rate,
      status: summary.status,
    });
  },

  /** F-07: 月ごとの推移 */
  renderTrend() {
    const monthCount = Number(document.getElementById('trend-months').value);
    const trend = calcTrend(Store.data, this.currentMonth, monthCount);
    const hasData = trend.rows.length > 0;
    document.getElementById('trend-content').hidden = !hasData;
    document.getElementById('trend-empty').hidden = hasData;
    if (!hasData) {
      if (Charts.trendChart) {
        Charts.trendChart.destroy();
        Charts.trendChart = null;
      }
      return;
    }

    const theme = Charts.getTheme();
    const head = trend.months.map((ym) => `<th class="num">${Number(ym.slice(5))}月</th>`).join('');
    const body = trend.rows.map((r) => `
      <tr>
        <th scope="row"><span class="swatch" style="background:${Charts.colorOf(r.categoryId, Store.data.categories, theme)}"></span>${escapeHtml(r.name)}</th>
        ${r.values.map((v) => `<td class="num">${v > 0 ? formatNumber(v) : '<span class="muted">0</span>'}</td>`).join('')}
      </tr>`).join('');
    const foot = trend.monthTotals.map((v) => `<td class="num">${formatNumber(v)}</td>`).join('');
    document.getElementById('trend-table').innerHTML = `
      <thead><tr><th>カテゴリ（円）</th>${head}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><th scope="row">合計</th>${foot}</tr></tfoot>`;

    Charts.renderTrend(document.getElementById('trend-chart'), trend, Store.data.categories);
  },

  /** F-09: バックアップ・復元のボタン */
  initBackup() {
    const message = document.getElementById('backup-message');
    const fileInput = document.getElementById('backup-file');

    document.getElementById('backup-export').addEventListener('click', () => {
      Store.exportBackup();
      showMessage(message, 'バックアップファイルをダウンロードしました', 'success');
    });
    document.getElementById('backup-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      let obj;
      try {
        obj = await Store.readBackupFile(file);
      } catch (e) {
        showMessage(message, `復元できませんでした：${e.message}`, 'error', 0);
        return;
      }
      const ok = confirm(`「${file.name}」の内容で今のデータを上書きします。\n`
        + `（記録 ${obj.transactions.length} 件）\n\nよろしいですか？`);
      if (!ok) return;
      if (!Store.replaceAll(obj)) return;
      Transactions.cancelEdit();
      Budget.render();
      this.refreshAll();
      showMessage(message, '復元しました', 'success');
    });
  },
};

App.init();
