'use strict';

/**
 * グラフ描画（F-05 円グラフ / F-07 積み上げ棒グラフ）。Chart.js を使う。
 *
 * 色のルール:
 * - 支出カテゴリの表示順で、1〜8番目に固定の色を割り当てる（金額の順位では変えない）
 * - 9番目以降のカテゴリはグレーにして、グラフでは1つにまとめる（表には全部出す）
 */

const SERIES_SLOT_COUNT = 8;

/**
 * CSS 変数の値を読む
 * @param {string} name 例: "--series-1"
 * @returns {string}
 */
function readCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const Charts = {
  pieChart: null,
  trendChart: null,

  /**
   * 今のテーマ（ライト／ダーク）の色を読む
   * @returns {object}
   */
  getTheme() {
    const series = [];
    for (let i = 1; i <= SERIES_SLOT_COUNT; i++) series.push(readCssVar(`--series-${i}`));
    return {
      series,
      other: readCssVar('--series-other'),
      surface: readCssVar('--surface'),
      text: readCssVar('--text-secondary'),
      muted: readCssVar('--text-muted'),
      grid: readCssVar('--grid'),
    };
  },

  /**
   * カテゴリIDから色を返す
   * @param {string} categoryId
   * @param {Array} categories
   * @param {object} [theme]
   * @returns {string}
   */
  colorOf(categoryId, categories, theme = this.getTheme()) {
    const slot = this.getSlot(categoryId, categories);
    return slot < 0 ? theme.other : theme.series[slot];
  },

  /**
   * カテゴリの色番号（0〜7）。9番目以降や不明なカテゴリは -1
   * @param {string} categoryId
   * @param {Array} categories
   * @returns {number}
   */
  getSlot(categoryId, categories) {
    const index = getSortedCategories(categories, 'expense').findIndex((c) => c.id === categoryId);
    return index >= 0 && index < SERIES_SLOT_COUNT ? index : -1;
  },

  /**
   * まとめたカテゴリの表示名
   * @param {string[]} names
   * @returns {string}
   */
  foldedLabel(names) {
    return names.length <= 2 ? names.join('・') : `その他 ${names.length} カテゴリ`;
  },

  /** 凡例とツールチップの共通設定 */
  commonPlugins(theme) {
    return {
      legend: {
        position: 'bottom',
        labels: { color: theme.text, boxWidth: 12, boxHeight: 12, padding: 14 },
      },
      tooltip: {
        backgroundColor: 'rgba(11, 11, 11, 0.88)',
        padding: 10,
        boxPadding: 4,
      },
    };
  },

  /**
   * F-05: カテゴリ別支出の円グラフ（ドーナツ型）
   * @param {HTMLCanvasElement} canvas
   * @param {{total:number, rows:Array}} breakdown calcCategoryBreakdown の結果
   * @param {Array} categories
   */
  renderPie(canvas, breakdown, categories) {
    const theme = this.getTheme();
    const labels = [];
    const values = [];
    const colors = [];
    const folded = [];

    for (const row of breakdown.rows) {
      const slot = this.getSlot(row.categoryId, categories);
      if (slot < 0) {
        folded.push(row);
        continue;
      }
      labels.push(row.name);
      values.push(row.amount);
      colors.push(theme.series[slot]);
    }
    if (folded.length > 0) {
      labels.push(this.foldedLabel(folded.map((r) => r.name)));
      values.push(folded.reduce((sum, r) => sum + r.amount, 0));
      colors.push(theme.other);
    }

    if (this.pieChart) this.pieChart.destroy();
    const plugins = this.commonPlugins(theme);
    plugins.tooltip.callbacks = {
      label: (ctx) => {
        const ratio = breakdown.total > 0 ? (ctx.parsed / breakdown.total) * 100 : 0;
        return ` ${ctx.label}: ${formatYen(ctx.parsed)}（${ratio.toFixed(1)}%）`;
      },
    };
    this.pieChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: theme.surface,
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        animation: { duration: 300 },
        plugins,
      },
    });
  },

  /**
   * F-07: 月ごとのカテゴリ別支出（積み上げ棒グラフ）
   * @param {HTMLCanvasElement} canvas
   * @param {{months:string[], rows:Array, monthTotals:number[]}} trend calcTrend の結果
   * @param {Array} categories
   */
  renderTrend(canvas, trend, categories) {
    const theme = this.getTheme();
    const barStyle = {
      borderColor: theme.surface,
      borderWidth: 1,
      borderSkipped: false,
      maxBarThickness: 44,
    };
    const datasets = [];
    const folded = [];

    for (const row of trend.rows) {
      const slot = this.getSlot(row.categoryId, categories);
      if (slot < 0) {
        folded.push(row);
        continue;
      }
      datasets.push({ label: row.name, data: row.values, backgroundColor: theme.series[slot], ...barStyle });
    }
    if (folded.length > 0) {
      const sums = trend.months.map((_, i) => folded.reduce((sum, r) => sum + r.values[i], 0));
      datasets.push({
        label: this.foldedLabel(folded.map((r) => r.name)),
        data: sums,
        backgroundColor: theme.other,
        ...barStyle,
      });
    }

    if (this.trendChart) this.trendChart.destroy();
    const plugins = this.commonPlugins(theme);
    plugins.tooltip.mode = 'index';
    plugins.tooltip.intersect = false;
    plugins.tooltip.filter = (item) => item.parsed.y > 0;
    plugins.tooltip.callbacks = {
      title: (items) => formatYearMonth(trend.months[items[0].dataIndex]),
      label: (ctx) => ` ${ctx.dataset.label}: ${formatYen(ctx.parsed.y)}`,
      footer: (items) => `合計: ${formatYen(trend.monthTotals[items[0].dataIndex])}`,
    };
    this.trendChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: trend.months.map((ym) => `${Number(ym.slice(5))}月`),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { color: theme.grid },
            ticks: { color: theme.muted },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: theme.grid },
            border: { display: false },
            ticks: { color: theme.muted, callback: (v) => formatYen(v), maxTicksLimit: 6 },
          },
        },
        plugins,
      },
    });
  },
};
