'use strict';

/**
 * 収支の登録（F-01）と一覧・編集・削除（F-02）
 */

const Transactions = {
  /** 編集中の記録の ID（新規登録のときは null） */
  editingId: null,

  /** 画面の要素 */
  el: {},

  init() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      form: $('tx-form'),
      title: $('tx-form-title'),
      date: $('tx-date'),
      amount: $('tx-amount'),
      category: $('tx-category'),
      memo: $('tx-memo'),
      submit: $('tx-submit'),
      cancel: $('tx-cancel'),
      message: $('tx-message'),
      list: $('tx-list'),
      table: $('tx-table'),
      empty: $('tx-empty'),
      errDate: $('err-date'),
      errAmount: $('err-amount'),
      errCategory: $('err-category'),
    };

    this.el.date.value = todayString();
    this.el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.el.cancel.addEventListener('click', () => this.cancelEdit());
    document.querySelectorAll('input[name="tx-type"]').forEach((radio) => {
      radio.addEventListener('change', () => this.renderCategoryOptions(''));
    });
    this.el.list.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      if (button.dataset.action === 'edit') this.startEdit(button.dataset.id);
      if (button.dataset.action === 'delete') this.remove(button.dataset.id);
    });
  },

  /** 選んでいる種別（収入／支出） */
  getType() {
    return document.querySelector('input[name="tx-type"]:checked').value;
  },

  setType(type) {
    document.querySelector(`input[name="tx-type"][value="${type}"]`).checked = true;
  },

  /**
   * カテゴリの選択肢を、今の種別に合わせて作り直す
   * @param {string} [selectedId] 選んだ状態にするカテゴリID。省略時は今の選択を保つ
   */
  renderCategoryOptions(selectedId) {
    const select = this.el.category;
    const keep = selectedId ?? select.value;
    const options = getSortedCategories(Store.data.categories, this.getType())
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
      .join('');
    select.innerHTML = `<option value="">選択してください</option>${options}`;
    select.value = keep;
    if (select.value !== keep) select.value = '';
  },

  clearErrors() {
    for (const key of ['errDate', 'errAmount', 'errCategory']) this.el[key].textContent = '';
    for (const key of ['date', 'amount', 'category']) this.el[key].classList.remove('is-invalid');
  },

  /**
   * 入力欄にエラーを表示する
   * @param {string} field 'date' | 'amount' | 'category'
   * @param {string} text
   */
  setError(field, text) {
    const errKey = 'err' + field[0].toUpperCase() + field.slice(1);
    this.el[errKey].textContent = text;
    this.el[field].classList.add('is-invalid');
  },

  /** 登録・更新ボタンを押したとき */
  submit() {
    this.clearErrors();
    const type = this.getType();
    const date = this.el.date.value;
    const amountText = this.el.amount.value;
    const amount = parseAmount(amountText);
    const categoryId = this.el.category.value;
    const memo = this.el.memo.value.trim();

    let ok = true;
    if (!isValidDateString(date)) {
      this.setError('date', '日付を入力してください');
      ok = false;
    }
    if (amountText.trim() === '') {
      this.setError('amount', '金額を入力してください');
      ok = false;
    } else if (amount === null) {
      this.setError('amount', '金額は数字で入力してください');
      ok = false;
    } else if (amount <= 0) {
      this.setError('amount', '金額は1円以上で入力してください');
      ok = false;
    }
    const category = Store.data.categories.find((c) => c.id === categoryId && c.type === type);
    if (!category) {
      this.setError('category', 'カテゴリを選択してください');
      ok = false;
    }
    if (!ok) return;

    const isEdit = this.editingId !== null;
    const saved = Store.commit((data) => {
      if (isEdit) {
        const tx = data.transactions.find((t) => t.id === this.editingId);
        Object.assign(tx, { type, date, amount, categoryId, memo });
      } else {
        data.transactions.push({
          id: createId(), type, date, amount, categoryId, memo, createdAt: new Date().toISOString(),
        });
      }
    });
    if (!saved) return;

    const monthNote = date.slice(0, 7) !== App.currentMonth ? `（${formatYearMonth(date.slice(0, 7))}の記録）` : '';
    if (isEdit) {
      this.cancelEdit();
      showMessage(this.el.message, `更新しました${monthNote}`, 'success');
    } else {
      this.resetInputs();
      showMessage(this.el.message, `登録しました${monthNote}`, 'success');
    }
    App.refreshAll();
    this.el.amount.focus();
  },

  /** 金額・カテゴリ・メモを空にする（日付と種別はそのまま） */
  resetInputs() {
    this.el.amount.value = '';
    this.el.memo.value = '';
    this.el.category.value = '';
  },

  /**
   * 記録の編集を始める
   * @param {string} id
   */
  startEdit(id) {
    const tx = Store.data.transactions.find((t) => t.id === id);
    if (!tx) return;
    this.clearErrors();
    this.editingId = id;
    this.setType(tx.type);
    this.renderCategoryOptions(tx.categoryId);
    this.el.date.value = tx.date;
    this.el.amount.value = String(tx.amount);
    this.el.memo.value = tx.memo || '';
    this.el.title.textContent = '収支の編集';
    this.el.submit.textContent = '更新';
    this.el.cancel.hidden = false;
    this.el.form.closest('.card').classList.add('is-editing');
    this.render();
    this.el.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.el.amount.focus({ preventScroll: true });
  },

  /** 編集をやめて新規登録の状態に戻す */
  cancelEdit() {
    this.editingId = null;
    this.clearErrors();
    this.resetInputs();
    this.el.title.textContent = '収支の登録';
    this.el.submit.textContent = '登録';
    this.el.cancel.hidden = true;
    this.el.form.closest('.card').classList.remove('is-editing');
    this.render();
  },

  /**
   * 記録を削除する（確認あり）
   * @param {string} id
   */
  remove(id) {
    const tx = Store.data.transactions.find((t) => t.id === id);
    if (!tx) return;
    const name = Store.data.categories.find((c) => c.id === tx.categoryId)?.name ?? '';
    const label = `${tx.date.replace(/-/g, '/')} ${name} ${formatYen(tx.amount)}`;
    if (!confirm(`次の記録を削除しますか？\n\n${label}`)) return;

    const saved = Store.commit((data) => {
      data.transactions = data.transactions.filter((t) => t.id !== id);
    });
    if (!saved) return;
    if (this.editingId === id) this.cancelEdit();
    showMessage(this.el.message, '削除しました', 'success');
    App.refreshAll();
  },

  /** 選んでいる月の記録一覧を表示する */
  render() {
    const nameOf = new Map(Store.data.categories.map((c) => [c.id, c.name]));
    const items = getTransactionsOfMonth(Store.data.transactions, App.currentMonth)
      .sort((a, b) => (b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));

    this.el.empty.hidden = items.length > 0;
    this.el.table.hidden = items.length === 0;
    this.el.list.innerHTML = items.map((t) => {
      const [, m, d] = t.date.split('-');
      const typeLabel = t.type === 'income' ? '収入' : '支出';
      const editing = t.id === this.editingId ? ' class="is-editing"' : '';
      return `<tr${editing}>
        <td>${Number(m)}/${Number(d)}</td>
        <td><span class="badge badge-${t.type}">${typeLabel}</span></td>
        <td>${escapeHtml(nameOf.get(t.categoryId) ?? '')}</td>
        <td class="num">${t.type === 'income' ? '+' : ''}${formatYen(t.amount)}</td>
        <td class="memo">${escapeHtml(t.memo || '')}</td>
        <td class="actions">
          <button type="button" class="btn btn-small" data-action="edit" data-id="${escapeHtml(t.id)}">編集</button>
          <button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="${escapeHtml(t.id)}">削除</button>
        </td>
      </tr>`;
    }).join('');
  },
};
