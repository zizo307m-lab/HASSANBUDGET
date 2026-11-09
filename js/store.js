// Store : état unique + actions métier (validation → mutation → persistance → notification).
import { applyDemoData, createInitialState } from './model.js';
import { migrate, validateImport } from './storage.js';
import { budgetOverview } from './calc.js';
import { FREQUENCIES, isValidISO, monthKey, nthOccurrence, parseAmount, round2, today, uid } from './utils.js';

const FREQS = Object.keys(FREQUENCIES);
const ACCOUNT_TYPES = ['checking', 'cash', 'savings', 'card'];
const ASSET_KINDS = ['immobilier', 'or', 'bourse', 'autre', 'credit'];
const trim = (v, n) => String(v ?? '').trim().slice(0, n);

export function createStore(storage, { now = today } = {}) {
  let state = storage.load() || createInitialState();
  const listeners = new Set();
  const events = new Map();
  const commit = () => {
    storage.save(state);
    listeners.forEach((fn) => fn(state));
  };
  const emit = (name, payload) => (events.get(name) || []).forEach((fn) => fn(payload));
  const fail = (errors) => ({ ok: false, errors });
  const ok = (value, extra = {}) => ({ ok: true, value, ...extra });
  const groupKind = (catId) => state.groups.find((g) => g.id === state.categories.find((c) => c.id === catId)?.groupId)?.kind;
  const amountOf = (v) => {
    const n = parseAmount(v);
    return Number.isNaN(n) ? { error: 'Saisissez un montant valide (ex. 45,50).' } : n <= 0 ? { error: 'Le montant doit être supérieur à 0.' } : n > 1e10 ? { error: 'Montant trop élevé.' } : { value: n };
  };
  const moneyOf = (v, allowNegative = false) => {
    if (String(v ?? '').trim() === '') return { value: 0 };
    const n = parseAmount(String(v).replace(/^−|^-/, ''));
    if (Number.isNaN(n)) return { error: 'Montant invalide.' };
    return { value: allowNegative && /^[−-]/.test(String(v).trim()) ? -n : n };
  };

  /** Valide une transaction « standard » (revenu/dépense selon la catégorie) ou un transfert. */
  const checkTx = (input) => {
    const errors = {};
    const a = amountOf(input.amount);
    if (a.error) errors.amount = a.error;
    if (!state.accounts.some((x) => x.id === input.accountId)) errors.accountId = 'Choisissez un compte.';
    if (!isValidISO(input.date)) errors.date = 'Date invalide.';
    let type;
    let categoryId = null;
    let toAccountId = null;
    if (input.kind === 'transfer') {
      type = 'transfer';
      toAccountId = input.toAccountId;
      if (!state.accounts.some((x) => x.id === toAccountId)) errors.toAccountId = 'Choisissez le compte de destination.';
      else if (toAccountId === input.accountId) errors.toAccountId = 'Les deux comptes doivent être différents.';
    } else {
      categoryId = input.categoryId;
      const kind = groupKind(categoryId);
      if (!kind) errors.categoryId = 'Choisissez une catégorie.';
      type = kind === 'income' ? 'income' : 'expense';
    }
    return { errors, value: { type, date: input.date, accountId: input.accountId, toAccountId, categoryId, label: trim(input.label, 80), amount: a.value } };
  };

  const store = {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    on(name, fn) {
      events.set(name, [...(events.get(name) || []), fn]);
    },
    flush: () => storage.flush(),

    // ---------- Comptes ----------
    addAccount(input) {
      const errors = {};
      const name = trim(input.name, 40);
      if (!name) errors.name = 'Donnez un nom au compte.';
      else if (state.accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) errors.name = 'Ce compte existe déjà.';
      const bal = moneyOf(input.openingBalance, true);
      if (bal.error) errors.openingBalance = bal.error;
      if (Object.keys(errors).length) return fail(errors);
      const account = { id: uid(), name, type: ACCOUNT_TYPES.includes(input.type) ? input.type : 'checking', openingBalance: bal.value, onBudget: input.onBudget !== false && input.type !== 'savings' ? true : !!input.onBudget };
      state.accounts.push(account);
      if (!state.settings.budgetStart) state.settings.budgetStart = monthKey(now());
      commit();
      return ok(account);
    },
    updateAccount(id, input) {
      const a = state.accounts.find((x) => x.id === id);
      if (!a) return fail({ _: 'Compte introuvable.' });
      const errors = {};
      const name = trim(input.name, 40);
      if (!name) errors.name = 'Donnez un nom au compte.';
      else if (state.accounts.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) errors.name = 'Ce compte existe déjà.';
      const bal = moneyOf(input.openingBalance, true);
      if (bal.error) errors.openingBalance = bal.error;
      if (Object.keys(errors).length) return fail(errors);
      Object.assign(a, { name, type: ACCOUNT_TYPES.includes(input.type) ? input.type : a.type, openingBalance: bal.value, onBudget: !!input.onBudget });
      commit();
      return ok(a);
    },
    accountUsage: (id) => state.transactions.filter((t) => t.accountId === id || t.toAccountId === id).length,
    deleteAccount(id) {
      if (!state.accounts.some((a) => a.id === id)) return fail({ _: 'Compte introuvable.' });
      state.transactions = state.transactions.filter((t) => t.accountId !== id && t.toAccountId !== id);
      state.recurring = state.recurring.filter((r) => r.accountId !== id && r.toAccountId !== id);
      state.accounts = state.accounts.filter((a) => a.id !== id);
      commit();
      return ok(null);
    },

    // ---------- Transactions ----------
    addTransaction(input, { recurrence = 'none' } = {}) {
      const v = checkTx(input);
      if (Object.keys(v.errors).length) return fail(v.errors);
      const month = monthKey(v.value.date);
      const before = v.value.type === 'expense' ? budgetOverview(state, month, now()) : null;
      let recurringId = null;
      if (FREQS.includes(recurrence)) {
        recurringId = uid();
        state.recurring.push({ id: recurringId, type: v.value.type, accountId: v.value.accountId, toAccountId: v.value.toAccountId, categoryId: v.value.categoryId, label: v.value.label, amount: v.value.amount, freq: recurrence, startDate: v.value.date, count: 1, active: true });
      }
      const tx = { id: uid(), ...v.value, status: 'done', recurringId, createdAt: Date.now() };
      state.transactions.push(tx);
      let line = null;
      if (before) {
        const after = budgetOverview(state, month, now());
        const find = (o) => o.groups.flatMap((g) => g.cats || []).find((c) => c.category?.id === tx.categoryId);
        line = find(after);
        const was = find(before);
        if (line && line.status === 'over' && was && was.status !== 'over') emit('overspent', { category: line.category, available: line.available });
      }
      commit();
      return ok(tx, { line });
    },
    updateTransaction(id, input) {
      const t = state.transactions.find((x) => x.id === id);
      if (!t) return fail({ _: 'Transaction introuvable.' });
      const v = checkTx(input);
      if (Object.keys(v.errors).length) return fail(v.errors);
      Object.assign(t, v.value);
      commit();
      return ok(t);
    },
    deleteTransaction(id) {
      const i = state.transactions.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const [removed] = state.transactions.splice(i, 1);
      commit();
      return removed;
    },
    restoreTransaction(t) {
      if (!state.transactions.some((x) => x.id === t.id)) state.transactions.push(t);
      commit();
    },
    duplicateTransaction(id, date = now()) {
      const t = state.transactions.find((x) => x.id === id);
      if (!t) return null;
      const copy = { ...t, id: uid(), date, status: 'done', recurringId: null, createdAt: Date.now() };
      state.transactions.push(copy);
      commit();
      return copy;
    },
    confirmDraft(id) {
      const t = state.transactions.find((x) => x.id === id && x.status === 'draft');
      if (!t) return false;
      t.status = 'done';
      commit();
      return true;
    },
    confirmAllDrafts() {
      let n = 0;
      state.transactions.forEach((t) => {
        if (t.status === 'draft') {
          t.status = 'done';
          n++;
        }
      });
      if (n) commit();
      return n;
    },
    draftCount: () => state.transactions.filter((t) => t.status === 'draft').length,

    // ---------- Récurrences (génèrent des brouillons à confirmer) ----------
    addRecurring(input) {
      const v = checkTx({ ...input, date: input.startDate });
      const errors = { ...v.errors };
      if (errors.date) {
        errors.startDate = errors.date;
        delete errors.date;
      }
      if (!FREQS.includes(input.freq)) errors.freq = 'Choisissez une fréquence.';
      if (Object.keys(errors).length) return fail(errors);
      const r = { id: uid(), type: v.value.type, accountId: v.value.accountId, toAccountId: v.value.toAccountId, categoryId: v.value.categoryId, label: v.value.label, amount: v.value.amount, freq: input.freq, startDate: input.startDate, count: 0, active: true };
      state.recurring.push(r);
      const created = store.runRecurring(now(), { silent: true });
      commit();
      return ok(r, { created });
    },
    toggleRecurring(id) {
      const r = state.recurring.find((x) => x.id === id);
      if (!r) return;
      r.active = !r.active;
      if (r.active) store.runRecurring(now(), { silent: true });
      commit();
    },
    deleteRecurring(id) {
      state.recurring = state.recurring.filter((r) => r.id !== id);
      commit();
    },
    /** Génère un brouillon pour chaque échéance échue (idempotent). Retourne le nombre de brouillons créés. */
    runRecurring(upTo = now(), { silent = false } = {}) {
      let created = 0;
      for (const r of state.recurring) {
        if (!r.active) continue;
        for (let guard = 0; guard < 500; guard++) {
          const date = nthOccurrence(r.startDate, r.freq, r.count);
          if (date > upTo) break;
          r.count += 1;
          if (state.transactions.some((t) => t.recurringId === r.id && t.date === date)) continue;
          if (!state.accounts.some((a) => a.id === r.accountId)) continue;
          state.transactions.push({ id: uid(), type: r.type, date, accountId: r.accountId, toAccountId: r.toAccountId, categoryId: r.categoryId, label: r.label, amount: r.amount, status: 'draft', recurringId: r.id, createdAt: Date.now() });
          created++;
        }
      }
      if (created && !silent) commit();
      return created;
    },

    // ---------- Catégories & groupes ----------
    addCategory(input) {
      const errors = {};
      const name = trim(input.name, 40);
      const group = state.groups.find((g) => g.id === input.groupId);
      if (!group) errors.groupId = 'Choisissez un groupe.';
      if (!name) errors.name = 'Donnez un nom à la catégorie.';
      else if (state.categories.some((c) => c.groupId === input.groupId && c.name.toLowerCase() === name.toLowerCase())) errors.name = 'Cette catégorie existe déjà dans ce groupe.';
      const target = moneyOf(input.target);
      if (target.error) errors.target = target.error;
      if (Object.keys(errors).length) return fail(errors);
      const c = { id: uid(), groupId: input.groupId, name, icon: input.icon || '📦', target: target.value };
      state.categories.push(c);
      commit();
      return ok(c);
    },
    updateCategory(id, input) {
      const c = state.categories.find((x) => x.id === id);
      if (!c) return fail({ _: 'Catégorie introuvable.' });
      const errors = {};
      const name = trim(input.name, 40);
      if (!name) errors.name = 'Donnez un nom à la catégorie.';
      else if (state.categories.some((x) => x.id !== id && x.groupId === c.groupId && x.name.toLowerCase() === name.toLowerCase())) errors.name = 'Cette catégorie existe déjà dans ce groupe.';
      const target = moneyOf(input.target);
      if (target.error) errors.target = target.error;
      if (Object.keys(errors).length) return fail(errors);
      Object.assign(c, { name, icon: input.icon || c.icon, target: target.value });
      commit();
      return ok(c);
    },
    categoryUsage: (id) => ({ transactions: state.transactions.filter((t) => t.categoryId === id).length, recurring: state.recurring.filter((r) => r.categoryId === id).length }),
    /** mode "reassign" : déplace vers targetId (même nature revenu/dépense) ; mode "delete" : supprime les transactions. */
    deleteCategory(id, { mode = 'reassign', targetId = null } = {}) {
      if (!state.categories.some((c) => c.id === id)) return fail({ _: 'Catégorie introuvable.' });
      const usage = store.categoryUsage(id);
      if (usage.transactions + usage.recurring > 0 && mode === 'reassign') {
        if (!targetId || targetId === id || !state.categories.some((c) => c.id === targetId)) return fail({ targetId: 'Choisissez la catégorie de destination.' });
        if ((groupKind(targetId) === 'income') !== (groupKind(id) === 'income')) return fail({ targetId: 'La destination doit être de même nature (revenu ou dépense).' });
        state.transactions.forEach((t) => t.categoryId === id && (t.categoryId = targetId));
        state.recurring.forEach((r) => r.categoryId === id && (r.categoryId = targetId));
        for (const m of Object.values(state.assignments)) {
          if (m[id] != null) {
            m[targetId] = round2((m[targetId] || 0) + m[id]);
            delete m[id];
          }
        }
      } else if (mode === 'delete') {
        state.transactions = state.transactions.filter((t) => t.categoryId !== id);
        state.recurring = state.recurring.filter((r) => r.categoryId !== id);
      }
      for (const m of Object.values(state.assignments)) delete m[id];
      state.categories = state.categories.filter((c) => c.id !== id);
      commit();
      return ok(null, { usage });
    },
    addGroup(input) {
      const name = trim(input.name, 30);
      if (!name) return fail({ name: 'Donnez un nom au groupe.' });
      if (state.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return fail({ name: 'Ce groupe existe déjà.' });
      const g = { id: uid(), name, icon: input.icon || '📁', kind: 'custom', order: state.groups.reduce((m, x) => Math.max(m, x.order), -1) + 1 };
      state.groups.push(g);
      commit();
      return ok(g);
    },
    updateGroup(id, input) {
      const g = state.groups.find((x) => x.id === id);
      if (!g) return fail({ _: 'Groupe introuvable.' });
      const name = trim(input.name, 30);
      if (!name) return fail({ name: 'Donnez un nom au groupe.' });
      if (state.groups.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return fail({ name: 'Ce groupe existe déjà.' });
      Object.assign(g, { name, icon: input.icon || g.icon });
      commit();
      return ok(g);
    },
    /** Les catégories du groupe supprimé sont déplacées vers targetId (un groupe de dépenses). */
    deleteGroup(id, { targetId } = {}) {
      const g = state.groups.find((x) => x.id === id);
      if (!g) return fail({ _: 'Groupe introuvable.' });
      if (g.kind === 'income') return fail({ _: 'Le groupe Revenus ne peut pas être supprimé.' });
      const cats = state.categories.filter((c) => c.groupId === id);
      if (cats.length) {
        const t = state.groups.find((x) => x.id === targetId);
        if (!t || t.id === id || t.kind === 'income') return fail({ targetId: 'Choisissez le groupe de destination.' });
        cats.forEach((c) => (c.groupId = t.id));
      }
      state.groups = state.groups.filter((x) => x.id !== id);
      commit();
      return ok(null);
    },

    // ---------- Budget (enveloppes) ----------
    setAssignment(month, categoryId, raw) {
      if (!state.categories.some((c) => c.id === categoryId)) return fail({ _: 'Catégorie introuvable.' });
      const m = moneyOf(raw);
      if (m.error || m.value < 0) return fail({ amount: 'Montant invalide.' });
      const before = groupKind(categoryId) === 'income' ? null : budgetOverview(state, month, now());
      (state.assignments[month] ||= {})[categoryId] = m.value;
      commit();
      return ok(m.value, { before });
    },
    copyAssignments(fromMonth, toMonth) {
      const src = state.assignments[fromMonth];
      if (!src) return 0;
      state.assignments[toMonth] = { ...src };
      commit();
      return Object.keys(src).length;
    },

    // ---------- Actifs & crédits ----------
    addAsset(input) {
      const errors = {};
      const name = trim(input.name, 50);
      if (!name) errors.name = 'Donnez un nom.';
      if (!ASSET_KINDS.includes(input.kind)) errors.kind = 'Choisissez un type.';
      const v = moneyOf(input.value);
      if (v.error) errors.value = v.error;
      const date = input.date || now();
      if (!isValidISO(date)) errors.date = 'Date invalide.';
      const mp = moneyOf(input.monthlyPayment);
      if (mp.error) errors.monthlyPayment = mp.error;
      if (Object.keys(errors).length) return fail(errors);
      const a = { id: uid(), kind: input.kind, name, history: [{ date, value: v.value }], monthlyPayment: mp.value };
      state.assets.push(a);
      commit();
      return ok(a);
    },
    updateAsset(id, input) {
      const a = state.assets.find((x) => x.id === id);
      if (!a) return fail({ _: 'Actif introuvable.' });
      const name = trim(input.name, 50);
      if (!name) return fail({ name: 'Donnez un nom.' });
      const mp = moneyOf(input.monthlyPayment);
      if (mp.error) return fail({ monthlyPayment: mp.error });
      Object.assign(a, { name, monthlyPayment: mp.value });
      commit();
      return ok(a);
    },
    setAssetValue(id, raw, date = now()) {
      const a = state.assets.find((x) => x.id === id);
      if (!a) return fail({ _: 'Actif introuvable.' });
      const v = moneyOf(raw);
      if (v.error) return fail({ value: v.error });
      if (!isValidISO(date)) return fail({ date: 'Date invalide.' });
      a.history = a.history.filter((h) => h.date !== date).concat({ date, value: v.value }).sort((x, y) => (x.date < y.date ? -1 : 1));
      commit();
      return ok(a);
    },
    deleteAsset(id) {
      state.assets = state.assets.filter((a) => a.id !== id);
      commit();
    },

    // ---------- Dettes & créances ----------
    addDebt(input) {
      const errors = {};
      const person = trim(input.person, 50);
      if (!person) errors.person = 'Indiquez la personne ou l’organisme.';
      const a = amountOf(input.amount);
      if (a.error) errors.amount = a.error;
      if (input.dueDate && !isValidISO(input.dueDate)) errors.dueDate = 'Date invalide.';
      if (Object.keys(errors).length) return fail(errors);
      const d = { id: uid(), direction: input.direction === 'i_owe' ? 'i_owe' : 'owed_to_me', person, amount: a.value, createdDate: input.createdDate || now(), dueDate: input.dueDate || '', note: trim(input.note, 120), payments: [] };
      state.debts.push(d);
      commit();
      return ok(d);
    },
    payDebt(id, raw, date = now()) {
      const d = state.debts.find((x) => x.id === id);
      if (!d) return fail({ _: 'Introuvable.' });
      const a = amountOf(raw);
      if (a.error) return fail({ amount: a.error });
      const rest = round2(d.amount - d.payments.reduce((s, p) => s + p.amount, 0));
      if (a.value > rest + 0.001) return fail({ amount: `Le reste à régler est de ${rest}.` });
      d.payments.push({ date, amount: a.value });
      commit();
      return ok(d);
    },
    deleteDebt(id) {
      const i = state.debts.findIndex((d) => d.id === id);
      if (i < 0) return null;
      const [removed] = state.debts.splice(i, 1);
      commit();
      return removed;
    },
    restoreDebt(d) {
      if (!state.debts.some((x) => x.id === d.id)) state.debts.push(d);
      commit();
    },

    // ---------- Objectifs ----------
    addGoal(input) {
      const errors = {};
      const name = trim(input.name, 40);
      if (!name) errors.name = 'Donnez un nom à l’objectif.';
      const t = amountOf(input.target);
      if (t.error) errors.target = 'Montant cible invalide.';
      const s = moneyOf(input.saved);
      if (s.error) errors.saved = s.error;
      if (input.deadline && !isValidISO(input.deadline)) errors.deadline = 'Date invalide.';
      if (Object.keys(errors).length) return fail(errors);
      const g = { id: uid(), name, icon: input.icon || '🎯', target: t.value, saved: s.value, deadline: input.deadline || '', createdAt: Date.now() };
      state.goals.push(g);
      commit();
      return ok(g);
    },
    updateGoal(id, input) {
      const g = state.goals.find((x) => x.id === id);
      if (!g) return fail({ _: 'Objectif introuvable.' });
      const errors = {};
      const name = trim(input.name, 40);
      if (!name) errors.name = 'Donnez un nom à l’objectif.';
      const t = amountOf(input.target);
      if (t.error) errors.target = 'Montant cible invalide.';
      const s = moneyOf(input.saved);
      if (s.error) errors.saved = s.error;
      if (input.deadline && !isValidISO(input.deadline)) errors.deadline = 'Date invalide.';
      if (Object.keys(errors).length) return fail(errors);
      Object.assign(g, { name, icon: input.icon || g.icon, target: t.value, saved: s.value, deadline: input.deadline || '' });
      commit();
      return ok(g);
    },
    contributeGoal(id, delta) {
      const g = state.goals.find((x) => x.id === id);
      if (!g) return fail({ _: 'Objectif introuvable.' });
      if (!Number.isFinite(delta) || delta === 0) return fail({ amount: 'Montant invalide.' });
      g.saved = Math.max(0, round2(g.saved + delta));
      commit();
      return ok(g);
    },
    deleteGoal(id) {
      state.goals = state.goals.filter((g) => g.id !== id);
      commit();
    },

    // ---------- Habitudes ----------
    addHabit(input) {
      const name = trim(input.name, 50);
      if (!name) return fail({ name: 'Donnez un nom à l’habitude.' });
      if (state.habits.some((h) => h.name.toLowerCase() === name.toLowerCase())) return fail({ name: 'Cette habitude existe déjà.' });
      const h = { id: uid(), name, icon: input.icon || '⭐', done: [] };
      state.habits.push(h);
      commit();
      return ok(h);
    },
    toggleHabit(id, date = now()) {
      const h = state.habits.find((x) => x.id === id);
      if (!h || !isValidISO(date)) return false;
      h.done = h.done.includes(date) ? h.done.filter((d) => d !== date) : [...h.done, date].sort();
      commit();
      return true;
    },
    deleteHabit(id) {
      state.habits = state.habits.filter((h) => h.id !== id);
      commit();
    },

    // ---------- Paramètres & données ----------
    updateSettings(patch, { silent = false } = {}) {
      const allowed = ['name', 'currency', 'theme', 'hideAmounts', 'notifications', 'pinHash', 'pinSalt'];
      for (const k of Object.keys(patch)) {
        if (!allowed.includes(k)) continue;
        if (k === 'currency' && !['MAD', 'EUR', 'USD', 'GBP'].includes(patch[k])) continue;
        if (k === 'theme' && !['auto', 'light', 'dark'].includes(patch[k])) continue;
        state.settings[k] = k === 'name' ? trim(patch[k], 30) : patch[k];
      }
      if (silent) storage.save(state);
      else commit();
    },
    dismissTip(key) {
      state.settings.dismissed[key] = true;
      commit();
    },
    loadDemo() {
      const keep = state.settings;
      state = createInitialState();
      Object.assign(state.settings, { name: keep.name, currency: keep.currency, theme: keep.theme, hideAmounts: keep.hideAmounts, pinHash: keep.pinHash, pinSalt: keep.pinSalt, notifications: keep.notifications });
      applyDemoData(state, now());
      store.runRecurring(now(), { silent: true });
      commit();
    },
    resetAll() {
      const keep = state.settings;
      state = createInitialState();
      Object.assign(state.settings, { pinHash: keep.pinHash, pinSalt: keep.pinSalt });
      commit();
    },
    importData(raw) {
      const err = validateImport(raw);
      if (err) return { ok: false, error: err };
      const keep = state.settings;
      state = migrate(raw);
      Object.assign(state.settings, { pinHash: keep.pinHash, pinSalt: keep.pinSalt });
      commit();
      return { ok: true };
    },
  };
  return store;
}
