// Accès aux données : localStorage derrière une interface minimale (getItem/setItem/removeItem),
// pour pouvoir brancher plus tard IndexedDB, SQLite ou un backend cloud sans toucher au reste.
import { SCHEMA_VERSION, createInitialState } from './model.js';
import { csvCell, shortDate } from './utils.js';

const KEY = 'kanz:v1';

export function memoryBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function browserBackend() {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return localStorage;
  } catch {
    return memoryBackend();
  }
}

/** Complète / répare un état lu (anciennes versions, import externe). */
export function migrate(raw) {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const arr = (v, d) => (Array.isArray(v) ? v : d);
  return {
    version: SCHEMA_VERSION,
    settings: { ...base.settings, ...(raw.settings || {}), dismissed: { ...(raw.settings?.dismissed || {}) } },
    accounts: arr(raw.accounts, []).map((a) => ({ type: 'checking', openingBalance: 0, onBudget: true, ...a })),
    groups: arr(raw.groups, base.groups),
    categories: arr(raw.categories, base.categories),
    assignments: raw.assignments && typeof raw.assignments === 'object' ? raw.assignments : {},
    transactions: arr(raw.transactions, []).map((t) => ({ status: 'done', recurringId: null, toAccountId: null, label: '', ...t })),
    recurring: arr(raw.recurring, []),
    assets: arr(raw.assets, []),
    debts: arr(raw.debts, []).map((d) => ({ payments: [], ...d })),
    goals: arr(raw.goals, []),
    habits: arr(raw.habits, []).map((h) => ({ done: [], ...h })),
  };
}

export function validateImport(raw) {
  if (!raw || typeof raw !== 'object') return 'Fichier invalide.';
  if (!Array.isArray(raw.accounts) || !Array.isArray(raw.transactions) || !Array.isArray(raw.categories)) return 'Ce fichier ne ressemble pas à une sauvegarde de cette application.';
  const cats = new Set(raw.categories.map((c) => c?.id));
  const accs = new Set(raw.accounts.map((a) => a?.id));
  if (raw.categories.some((c) => !c || typeof c.id !== 'string' || typeof c.name !== 'string')) return 'Catégories invalides dans le fichier.';
  if (raw.accounts.some((a) => !a || typeof a.id !== 'string' || typeof a.name !== 'string')) return 'Comptes invalides dans le fichier.';
  const bad = raw.transactions.some(
    (t) => !t || typeof t.amount !== 'number' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '') || !accs.has(t.accountId) || (t.type !== 'transfer' && !cats.has(t.categoryId)),
  );
  return bad ? 'Certaines transactions sont invalides (montant, date, compte ou catégorie).' : null;
}

export function createStorage(backend = browserBackend(), { delay = 150 } = {}) {
  let timer = null;
  let pending = null;
  let onError = () => {};
  const write = () => {
    timer = null;
    if (!pending) return;
    try {
      backend.setItem(KEY, JSON.stringify(pending));
    } catch (e) {
      onError(e);
    }
    pending = null;
  };
  return {
    load() {
      try {
        const txt = backend.getItem(KEY);
        return txt ? migrate(JSON.parse(txt)) : null;
      } catch {
        return null;
      }
    },
    save(state) {
      pending = state;
      if (delay === 0) return write();
      if (!timer) timer = setTimeout(write, delay);
    },
    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      backend.removeItem(KEY);
    },
    onError(fn) {
      onError = fn;
    },
  };
}

export function exportJSON(state) {
  const { pinHash, pinSalt, ...settings } = state.settings; // le PIN ne sort jamais de l'appareil
  return JSON.stringify({ ...state, settings, exportedAt: new Date().toISOString() }, null, 2);
}

export function exportTransactionsCSV(state) {
  const acc = new Map(state.accounts.map((a) => [a.id, a.name]));
  const cat = new Map(state.categories.map((c) => [c.id, c.name]));
  const head = ['Date', 'Type', 'Montant', 'Compte', 'Vers le compte', 'Catégorie', 'Libellé', 'Statut'];
  const typeLabel = { expense: 'Dépense', income: 'Revenu', transfer: 'Transfert' };
  const rows = [...state.transactions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) => [shortDate(t.date), typeLabel[t.type], String(t.amount).replace('.', ','), acc.get(t.accountId) || '', acc.get(t.toAccountId) || '', cat.get(t.categoryId) || '', t.label || '', t.status === 'draft' ? 'Brouillon' : 'Confirmée']);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}
