// Briques d'interface partagées par les écrans (rendu HTML sous forme de chaînes, tout est échappé).
import { esc } from './dom.js';
import { ic } from './icons.js';
import { longDate, monthLabel, shortDate } from '../utils.js';

export const lookups = (s) => ({
  cat: new Map(s.categories.map((c) => [c.id, c])),
  acc: new Map(s.accounts.map((a) => [a.id, a])),
  grp: new Map(s.groups.map((g) => [g.id, g])),
});

export const pageHead = (title, { back = true, actions = '' } = {}) =>
  `<header class="pagehead">${back ? `<button class="back" data-act="back" aria-label="Retour">${ic('back', 26)}</button>` : ''}<h1>${esc(title)}</h1>${actions ? `<div class="acts">${actions}</div>` : ''}</header>`;

export const sqBtn = (act, icon, label, data = '') => `<button class="sq" data-act="${act}" ${data} aria-label="${esc(label)}">${ic(icon, 22)}</button>`;

export function tip(ctx, key, text) {
  if (ctx.s().settings.dismissed[key]) return '';
  return `<div class="tip"><span class="bubble">${ic('chat', 26)}</span><p>${esc(text)}</p><button data-act="tip" data-key="${esc(key)}">Compris</button></div>`;
}

export const empty = (emoji, title, text, btn = '') => `<div class="empty"><span class="emoji">${emoji}</span><b>${esc(title)}</b>${esc(text)}${btn ? `<div style="margin-top:12px">${btn}</div>` : ''}</div>`;

export function rangeChips(active, ranges = ['1M', '3M', '6M', '1A'], act = 'range') {
  return `<div class="chips" role="group" aria-label="Période">${ranges.map((r) => `<button class="rchip" data-act="${act}" data-v="${r}" aria-pressed="${r === active}">${r === 'custom' ? 'Perso' : r}</button>`).join('')}</div>`;
}

export function txRow(ctx, t, L, { sub = 'iso' } = {}) {
  const c = L.cat.get(t.categoryId);
  const a = L.acc.get(t.accountId);
  const to = L.acc.get(t.toAccountId);
  const isT = t.type === 'transfer';
  const icon = isT ? '🔁' : c?.icon || '📦';
  const title = t.label || (isT ? 'Transfert' : c?.name || 'Sans catégorie');
  const where = isT ? `${a?.name || '?'} → ${to?.name || '?'}` : `${c?.name || '—'}${t.label ? '' : ''} · ${sub === 'iso' ? t.date : a?.name || ''}`;
  const cls = t.status === 'draft' ? 'draft' : t.type === 'income' ? 'inc' : '';
  const sign = t.type === 'expense' ? '−' : '';
  return `<button class="row" data-act="tx" data-id="${esc(t.id)}"><span class="tile-ic" aria-hidden="true">${icon}</span><span class="main"><b>${esc(title)}</b><small>${esc(where)}${t.status === 'draft' ? ' · <em>brouillon</em>' : ''}</small></span><span class="amt num ${cls}">${sign}${ctx.fmt(t.amount, { full: true })}</span></button>`;
}

export const dayTitle = (d, total, ctx) => `<div class="daytitle"><span>${esc(longDate(d))}</span><span class="num">${total ? ctx.fmt(total, { sign: true }) : ''}</span></div>`;

export const monthNav = (month, act = 'month') =>
  `<div class="monthnav"><button class="arr" data-act="${act}" data-d="-1" aria-label="Mois précédent">${ic('chevL', 18)}</button><span>${esc(monthLabel(month))}</span><button class="arr" data-act="${act}" data-d="1" aria-label="Mois suivant">${ic('chevR', 18)}</button></div>`;

export const hbar = (label, value, pct, color, ctx) => `<div class="hbar"><div class="t"><span>${label}</span><span class="num">${value}</span></div><div class="track"><i style="width:${Math.max(2, Math.min(100, pct)).toFixed(1)}%;background:${color}"></i></div></div>`;
export const _d = shortDate;
