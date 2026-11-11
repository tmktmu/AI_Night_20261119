'use strict';

/**
 * カテゴリ管理（F-08）
 */

const CATEGORY_NAME_MAX = 20;

const Categories = {
  el: {},

  init() {
    this.el = {
      lists: {
        expense: document.getElementById('cat-list-expense'),
        income: document.getElementById('cat-list-income'),
      },
      message: document.getElementById('cat-message'),
    };

    document.querySelectorAll('.cat-add').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        if (this.add(form.dataset.type, input.value)) input.value = '';
      });
    });

    for (const list of Object.values(this.el.lists)) {
      list.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;
        const id = button.closest('li').dataset.id;
        if (button.dataset.action === 'rename') {
          this.rename(id, button.closest('li').querySelector('input').value);
        }
        if (button.dataset.action === 'delete') this.remove(id);
      });
      list.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('input')) {
          e.preventDefault();
          this.rename(e.target.closest('li').dataset.id, e.target.value);
        }
      });
    }
  },

  /** カテゴリ一覧を表示する */
  render() {
    for (const [type, list] of Object.entries(this.el.lists)) {
      list.innerHTML = getSortedCategories(Store.data.categories, type).map((c) => {
        const swatch = type === 'expense'
          ? `<span class="swatch" style="background:${Charts.colorOf(c.id, Store.data.categories)}"></span>`
          : '';
        return `<li data-id="${escapeHtml(c.id)}">
          ${swatch}
          <input type="text" value="${escapeHtml(c.name)}" maxlength="${CATEGORY_NAME_MAX}" aria-label="カテゴリ名">
          <button type="button" class="btn btn-small" data-action="rename">名前を変更</button>
          <button type="button" class="btn btn-small btn-danger" data-action="delete">削除</button>
        </li>`;
      }).join('');
    }
  },

  /**
   * カテゴリ名をチェックする
   * @param {string} type
   * @param {string} name 空白を取り除いた名前
   * @param {string|null} excludeId 名前変更のとき、自分自身の ID
   * @returns {string|null} エラーメッセージ。問題なければ null
   */
  validateName(type, name, excludeId) {
    if (name === '') return 'カテゴリ名を入力してください';
    if (name.length > CATEGORY_NAME_MAX) return `カテゴリ名は${CATEGORY_NAME_MAX}文字以内にしてください`;
    const duplicated = Store.data.categories.some((c) => c.type === type && c.name === name && c.id !== excludeId);
    if (duplicated) return `「${name}」はすでにあります`;
    return null;
  },

  /**
   * カテゴリを追加する
   * @param {'income'|'expense'} type
   * @param {string} rawName
   * @returns {boolean} 追加できたら true
   */
  add(type, rawName) {
    const name = rawName.trim();
    const error = this.validateName(type, name, null);
    if (error) {
      showMessage(this.el.message, error, 'error');
      return false;
    }
    const sameType = Store.data.categories.filter((c) => c.type === type);
    const order = sameType.length > 0 ? Math.max(...sameType.map((c) => c.order)) + 1 : 0;
    const saved = Store.commit((data) => {
      data.categories.push({ id: createId(), type, name, order });
    });
    if (!saved) return false;
    showMessage(this.el.message, `「${name}」を追加しました`, 'success');
    this.refresh();
    return true;
  },

  /**
   * カテゴリ名を変更する
   * @param {string} id
   * @param {string} rawName
   */
  rename(id, rawName) {
    const category = Store.data.categories.find((c) => c.id === id);
    if (!category) return;
    const name = rawName.trim();
    if (name === category.name) return;
    const error = this.validateName(category.type, name, id);
    if (error) {
      showMessage(this.el.message, error, 'error');
      return;
    }
    const oldName = category.name;
    const saved = Store.commit((data) => {
      data.categories.find((c) => c.id === id).name = name;
    });
    if (!saved) return;
    showMessage(this.el.message, `「${oldName}」を「${name}」に変更しました`, 'success');
    this.refresh();
  },

  /**
   * カテゴリを削除する。記録で使われているカテゴリは削除できない。
   * @param {string} id
   */
  remove(id) {
    const category = Store.data.categories.find((c) => c.id === id);
    if (!category) return;
    const usedCount = Store.data.transactions.filter((t) => t.categoryId === id).length;
    if (usedCount > 0) {
      showMessage(this.el.message,
        `「${category.name}」は${usedCount}件の記録で使われているため削除できません`, 'error');
      return;
    }
    if (!confirm(`カテゴリ「${category.name}」を削除しますか？`)) return;

    const saved = Store.commit((data) => {
      data.categories = data.categories.filter((c) => c.id !== id);
      delete data.budget.byCategory[id];
      getSortedCategories(data.categories, category.type).forEach((c, i) => { c.order = i; });
    });
    if (!saved) return;
    showMessage(this.el.message, `「${category.name}」を削除しました`, 'success');
    this.refresh();
  },

  /** カテゴリが変わったら、関係する画面をすべて更新する */
  refresh() {
    Budget.render();
    App.refreshAll();
  },
};
