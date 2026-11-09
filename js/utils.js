// Utilitaires purs : dates (ISO locales), montants (format « 14.600,00 MAD »), identifiants.

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const pad = (n) => String(n).padStart(2, '0');
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const sum = (list, fn = (x) => x) => round2(list.reduce((s, x) => s + (Number(fn(x)) || 0), 0));

// ---------- Dates ----------
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISO(new Date());
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const isValidISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;
export const monthKey = (iso) => iso.slice(0, 7);
export const currentMonthKey = () => monthKey(today());
export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const daysInMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const monthStart = (key) => `${key}-01`;
export const monthEnd = (key) => `${key}-${pad(daysInMonth(key))}`;
export const shiftMonth = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const monthsBetween = (a, b) => {
  const out = [];
  for (let k = a; k <= b; k = shiftMonth(k, 1)) out.push(k);
  return out;
};
export const startOfWeek = (iso) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
};
export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const MONTHS_SHORT = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export const dayOfWeekIndex = (iso) => (parseISO(iso).getDay() + 6) % 7;
export const longDate = (iso) => {
  const d = parseISO(iso);
  return `${DAYS[dayOfWeekIndex(iso)]} ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`;
};
/** « 8 nov. 2026 » */
export const mediumDate = (iso) => {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
};
/** « 8 Oct. » */
export const dayMonth = (iso) => {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};
export const shortDate = (iso) => {
  const d = parseISO(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** n-ième occurrence (n = 0 → date de départ) d'une récurrence. */
export function nthOccurrence(start, freq, n) {
  const d = parseISO(start);
  if (freq === 'daily') {
    d.setDate(d.getDate() + n);
    return toISO(d);
  }
  if (freq === 'weekly') {
    d.setDate(d.getDate() + 7 * n);
    return toISO(d);
  }
  const step = freq === 'yearly' ? 12 * n : n;
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + step, 1);
  const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, dim));
  return toISO(t);
}

export const FREQUENCIES = { daily: 'Quotidienne', weekly: 'Hebdomadaire', monthly: 'Mensuelle', yearly: 'Annuelle' };

// ---------- Montants ----------
export const CURRENCIES = {
  MAD: { label: 'Dirham marocain (MAD)' },
  EUR: { label: 'Euro (EUR)' },
  USD: { label: 'Dollar US (USD)' },
  GBP: { label: 'Livre sterling (GBP)' },
};

const cache = new Map();
const nf = (min, max) => {
  const k = `${min}-${max}`;
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return cache.get(k);
};

/** Nombre seul : « 14.600,00 » (full) ou « 5.000 » / « 45,50 ». sign=true ajoute + / −. */
export function formatNumber(n, { full = false, sign = false } = {}) {
  const v = round2(n);
  const f = full || !Number.isInteger(v) ? nf(2, 2) : nf(0, 0);
  const abs = f.format(Math.abs(v) < 0.005 ? 0 : Math.abs(v));
  const s = v < 0 && abs !== '0' && abs !== '0,00' ? '−' : sign && v > 0 ? '+' : '';
  return s + abs;
}
/** « 14.600,00 MAD ». Espace insécable pour ne jamais couper un montant. */
export const formatMoney = (n, cur = 'MAD', opts) => `${formatNumber(n, opts)} ${cur}`;
export const formatPct = (p, decimals = 0) => `${nf(0, decimals).format(round2(p))} %`;

/** Saisie : "45.50", "45,50", "1 250,5", "12+30". NaN si invalide. */
export function parseAmount(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  let s = String(input ?? '').replace(/[\s  ]/g, '');
  if (!s) return NaN;
  // « 1.250,50 » (séparateur de milliers) → « 1250.50 »
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '.');
  let total = 0;
  for (const p of s.split('+')) {
    if (!/^\d*\.?\d+$|^\d+\.$/.test(p)) return NaN;
    total += parseFloat(p);
  }
  return round2(total);
}

export const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const initial = (name) => (String(name || '').trim()[0] || 'M').toUpperCase();
