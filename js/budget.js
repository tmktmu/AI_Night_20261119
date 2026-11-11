'use strict';

/**
 * 予算設定（F-03）。予算は毎月共通。
 */

const Budget = {
  el: {},

  init() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      total: $('budget-total'),
      errTotal: $('err-budget-total'),
      list: $('budget-category-list'),
      sum: $('budget-category-sum'),
      save: $('budget-save'),
      message: $('budget-message'),
    };
    this.el.save.addEventListener('click', () => this.save());
    this.el.list.addEventListener('input', () => this.updateSum());
  },

  /** 保存されている予算を入力欄に表示する */
  render() {
    const { total, byCategory } = Store.data.budget;
    this.el.total.value = total === null ? '' : String(total);
    this.el.total.classList.remove('is-invalid');
    this.el.errTotal.textContent = '';
    this.el.list.innerHTML = getSortedCategories(Store.data.categories, 'expense').map((c) => {
      const value = typeof byCategory[c.id] === 'number' ? String(byCategory[c.id]) : '';
      const inputId = `budget-cat-${c.id}`;
      return `<tr>
        <th scope="row"><label for="${escapeHtml(inputId)}">${escapeHtml(c.name)}</label></th>
        <td>
          <span class="input-suffix">
            <input type="text" inputmode="numeric" id="${escapeHtml(inputId)}"
              data-category-id="${escapeHtml(c.id)}" value="${value}" placeholder="予算なし">円
          </span>
          <span class="field-error"></span>
        </td>
      </tr>`;
    }).join('');
    this.updateSum();
  },

  /** カテゴリ別予算の合計を表示する */
  updateSum() {
    let sum = 0;
    for (const input of this.el.list.querySelectorAll('input')) {
      const v = parseAmount(input.value);
      if (v !== null) sum += v;
    }
    this.el.sum.textContent = formatYen(sum);
  },

  /** 入力された予算をチェックして保存する */
  save() {
    let ok = true;

    const totalText = this.el.total.value.trim();
    const total = totalText === '' ? null : parseAmount(totalText);
    this.el.total.classList.remove('is-invalid');
    this.el.errTotal.textContent = '';
    if (totalText !== '' && total === null) {
      this.el.total.classList.add('is-invalid');
      this.el.errTotal.textContent = '0以上の数字で入力してください';
      ok = false;
    }

    const byCategory = {};
    let categorySum = 0;
    for (const input of this.el.list.querySelectorAll('input')) {
      const error = input.parentElement.nextElementSibling;
      input.classList.remove('is-invalid');
      error.textContent = '';
      const text = input.value.trim();
      if (text === '') continue;
      const v = parseAmount(text);
      if (v === null) {
        input.classList.add('is-invalid');
        error.textContent = '0以上の数字で入力してください';
        ok = false;
        continue;
      }
      byCategory[input.dataset.categoryId] = v;
      categorySum += v;
    }

    if (!ok) {
      showMessage(this.el.message, '入力に誤りがあります。赤い欄を確認してください。', 'error');
      return;
    }

    const saved = Store.commit((data) => {
      data.budget = { total, byCategory };
    });
    if (!saved) return;

    this.render();
    App.refreshAll();
    if (total !== null && categorySum > total) {
      showMessage(this.el.message,
        `保存しました。ただし、カテゴリ別予算の合計（${formatYen(categorySum)}）が総予算（${formatYen(total)}）を超えています。`,
        'warning', 0);
    } else {
      showMessage(this.el.message, '保存しました', 'success');
    }
  },
};
