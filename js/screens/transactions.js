// Transactions (mois en cours, navigable) et Historique (toutes périodes + filtres).
import { esc } from '../ui/dom.js';
import { ic } from '../ui/icons.js';
import { pageHead, sqBtn, txRow, dayTitle, monthNav, lookups, empty } from '../ui/common.js';
import { formSheet, field, chipsField, textInput } from '../ui/forms.js';
import { filterTransactions, groupByDate, periodTotals } from '../calc.js';
import { monthEnd, monthKey, monthStart, shiftMonth } from '../utils.js';

const mk = () => ({ month: null, q: '', type: '', status: '', accountId: '', categoryId: '', from: '', to: '', search: false });
const S = { tx: mk(), hist: mk() };

function list(ctx, f, L) {
  const items = filterTransactions(ctx.s(), f);
  if (!items.length) return empty('🧾', 'Aucune transaction', f.q || f.type || f.status || f.accountId || f.categoryId || f.from ? 'Aucun résultat avec ces filtres.' : 'Appuyez sur « Ajouter » pour saisir votre première transaction.');
  const drafts = items.filter((t) => t.status === 'draft');
  const rest = items.filter((t) => t.status !== 'draft');
  let html = '';
  if (drafts.length) {
    html += `<div class="card" style="background:var(--lime-soft)"><div class="cardhead"><h2>À confirmer · ${drafts.length}</h2><button class="link" data-act="confirm-all">Tout confirmer</button></div>${drafts
      .map((t) => `${txRow(ctx, t, L)}<div class="btnrow" style="padding-bottom:10px"><button class="btn primary" style="min-height:40px" data-act="confirm" data-id="${esc(t.id)}">Confirmer</button><button class="btn" style="min-height:40px" data-act="skip" data-id="${esc(t.id)}">Ignorer</button></div>`)
      .join('')}</div>`;
  }
  for (const g of groupByDate(rest)) html += `<div>${dayTitle(g.date, g.total, ctx)}<div class="card rows" style="padding:4px 14px">${g.items.map((t) => txRow(ctx, t, L, { sub: 'acc' })).join('')}</div></div>`;
  return html;
}

function make(mode) {
  const key = mode === 'tx' ? 'tx' : 'hist';
  return {
    enter(ctx, params) {
      S[key] = mk();
      S[key].month = ctx.now().slice(0, 7);
      if (params.cat) S[key].categoryId = params.cat;
      if (params.status) S[key].status = params.status;
      if (params.acc) S[key].accountId = params.acc;
    },
    render(ctx) {
      const f = S[key];
      const s = ctx.s();
      const L = lookups(s);
      const eff = { ...f };
      if (mode === 'tx') {
        eff.from = monthStart(f.month);
        eff.to = monthEnd(f.month);
      }
      const tot = mode === 'tx' ? periodTotals(s, eff.from, eff.to) : null;
      const filtered = f.type || f.status || f.accountId || f.categoryId || f.from || f.to;
      const head =
        mode === 'tx'
          ? `<div class="bhead">${monthNav(f.month)}<div class="acts">${sqBtn('search', 'search', 'Rechercher')}${sqBtn('filters', 'filter', 'Filtres')}</div></div>`
          : pageHead('Historique', { actions: `${sqBtn('search', 'search', 'Rechercher')}${sqBtn('filters', 'filter', 'Filtres')}` });
      return `${head}
      ${f.search ? `<input class="input" data-input="q" value="${esc(f.q)}" placeholder="Rechercher un libellé, une catégorie…" autofocus />` : ''}
      ${tot ? `<div class="hero" style="padding:14px"><div class="two"><div class="t"><span>Revenus</span><b class="num">${ctx.fmt(tot.income)}</b></div><div class="t"><span>Dépenses</span><b class="num">${ctx.fmt(tot.expense)}</b></div></div></div>` : ''}
      <div class="chipbar">${[['', 'Tout'], ['income', 'Revenus'], ['expense', 'Dépenses'], ['transfer', 'Transferts']].map(([v, l]) => `<button class="chip" data-act="type" data-v="${v}" aria-pressed="${f.type === v}">${l}</button>`).join('')}${ctx.store.draftCount() ? `<button class="chip" data-act="type" data-v="draft" aria-pressed="${f.status === 'draft'}">Brouillons</button>` : ''}</div>
      ${filtered && (f.categoryId || f.accountId) ? `<div class="chipbar">${f.categoryId ? `<button class="chip" data-act="clear" data-k="categoryId" aria-pressed="true">${esc(L.cat.get(f.categoryId)?.name || 'Catégorie')} ✕</button>` : ''}${f.accountId ? `<button class="chip" data-act="clear" data-k="accountId" aria-pressed="true">${esc(L.acc.get(f.accountId)?.name || 'Compte')} ✕</button>` : ''}</div>` : ''}
      <div data-list>${list(ctx, eff, L)}</div>`;
    },
    actions: {
      month: (el, ctx) => ((S[key].month = shiftMonth(S[key].month, Number(el.dataset.d))), ctx.rerender()),
      search: (el, ctx) => ((S[key].search = !S[key].search), (S[key].q = S[key].search ? S[key].q : ''), ctx.rerender()),
      type: (el, ctx) => {
        const v = el.dataset.v;
        if (v === 'draft') S[key].status = S[key].status === 'draft' ? '' : 'draft';
        else (S[key].type = v), (S[key].status = S[key].status === 'draft' ? '' : S[key].status);
        ctx.rerender();
      },
      clear: (el, ctx) => ((S[key][el.dataset.k] = ''), ctx.rerender()),
      filters: (el, ctx) => {
        const f = S[key];
        const s = ctx.s();
        formSheet({
          title: 'Filtres',
          body: `${field('Compte', 'accountId', chipsField('accountId', [['', 'Tous'], ...s.accounts.map((a) => [a.id, a.name])], f.accountId))}
            ${field('Statut', 'status', chipsField('status', [['', 'Tous'], ['done', 'Confirmées'], ['draft', 'Brouillons']], f.status))}
            ${mode === 'hist' ? `${field('Du', 'from', textInput('from', f.from, { type: 'date' }))}${field('Au', 'to', textInput('to', f.to, { type: 'date' }))}` : ''}`,
          submit: 'Appliquer',
          extra: '<button class="btn" data-reset>Réinitialiser</button>',
          onSubmit: (v) => {
            Object.assign(f, { accountId: v.accountId, status: v.status, from: v.from || '', to: v.to || '' });
            ctx.rerender();
            return { ok: true };
          },
        }).el.addEventListener('click', (e) => {
          if (e.target.closest('[data-reset]')) {
            Object.assign(f, { accountId: '', categoryId: '', status: '', type: '', from: '', to: '' });
            document.querySelector('.sheet [data-close]').click();
            ctx.rerender();
          }
        });
      },
      tx: (el, ctx) => ctx.go(`#/ajouter/${el.dataset.id}`),
      confirm: (el, ctx) => (ctx.store.confirmDraft(el.dataset.id), ctx.toast('Transaction confirmée.')),
      'confirm-all': (el, ctx) => ctx.toast(`${ctx.store.confirmAllDrafts()} transaction(s) confirmée(s).`),
      skip: (el, ctx) => {
        const t = ctx.store.deleteTransaction(el.dataset.id);
        ctx.toast('Brouillon ignoré.', { action: 'Annuler', onAction: () => t && ctx.store.restoreTransaction(t) });
      },
    },
    inputs: {
      q: (el, ctx) => {
        S[key].q = el.value;
        const f = { ...S[key] };
        if (mode === 'tx') (f.from = monthStart(f.month)), (f.to = monthEnd(f.month));
        document.querySelector('[data-list]').innerHTML = list(ctx, f, lookups(ctx.s()));
      },
    },
  };
}
export const transactions = make('tx');
export const historique = make('hist');
export const _u = [ic, monthKey];
