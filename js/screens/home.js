// Accueil : en-tête sombre (avatar, patrimoine, œil), dernières transactions, Flux, Patrimoine, raccourcis.
import { esc } from '../ui/dom.js';
import { ic } from '../ui/icons.js';
import { flowChart, lineChart } from '../ui/charts.js';
import { rangeChips, txRow, lookups, empty } from '../ui/common.js';
import { netWorth, netWorthSeries, flowBuckets, rangeSpec, filterTransactions } from '../calc.js';
import { addDays, dayMonth, initial, mediumDate, monthLabel, shiftMonth, monthKey } from '../utils.js';
import { accountForm } from '../ui/forms.js';

const st = { flow: '6M', flowSel: null, nw: '3M', series: 'patrimoine', cursor: null };

export const bucketLabel = (b, mode) => (mode === 'month' ? monthLabel(b.key) : mode === 'week' ? `Semaine du ${mediumDate(b.from)}` : mediumDate(b.from));

function flowCard(ctx) {
  const now = ctx.now();
  const spec = rangeSpec(st.flow, now);
  const b = flowBuckets(ctx.s(), spec);
  const sel = st.flowSel != null && st.flowSel < b.length ? st.flowSel : b.length - 1;
  const cur = b[sel];
  return `<div class="cardhead"><h2>Flux</h2>${rangeChips(st.flow, ['1M', '3M', '6M', '1A'], 'flow-range')}</div>
    <div class="flowhead"><span>${esc(bucketLabel(cur, spec.mode))}</span><span><i style="background:var(--lime)"></i>Revenus <b class="num">${ctx.fmt(cur.income)}</b></span><span><i style="background:var(--spend)"></i>Dépenses <b class="num">${ctx.fmt(cur.expense)}</b></span></div>
    <div data-act="flow-pick">${flowChart(b, { sel })}</div>`;
}

function nwData(ctx) {
  const now = ctx.now();
  const days = { '1M': 30, '3M': 90, '6M': 182, '1A': 365 }[st.nw];
  const from = addDays(now, -days);
  const ser = netWorthSeries(ctx.s(), from, now).map((p) => ({ date: p.date, v: p[st.series] }));
  let ci = st.cursor;
  if (ci == null || ci >= ser.length) {
    const want = shiftMonth(now, -1) > from ? shiftMonth(now, -1) : from;
    ci = Math.max(0, ser.findIndex((p) => p.date >= want));
  }
  return { ser, ci };
}

function nwCard(ctx) {
  const { ser, ci } = nwData(ctx);
  const cur = ser[ci];
  const end = ser[ser.length - 1];
  const delta = end.v - cur.v;
  const pct = cur.v !== 0 ? (delta / Math.abs(cur.v)) * 100 : 0;
  const neg = delta < 0;
  return `<div class="cardhead"><h2>Patrimoine</h2>${rangeChips(st.nw, ['1M', '3M', '6M', '1A'], 'nw-range')}</div>
    <div class="pillrow"><button class="pill" data-act="nw-series" data-v="patrimoine" aria-pressed="${st.series === 'patrimoine'}">Patrimoine</button><button class="pill" data-act="nw-series" data-v="dispo" aria-pressed="${st.series === 'dispo'}">Dispo</button></div>
    <div class="bigval"><b class="num">${ctx.fmt(cur.v)}</b><span class="delta num ${neg ? 'neg' : ''}">${neg ? '▼' : '▲'} ${Math.abs(pct).toFixed(1)}% · ${ctx.fmt(Math.abs(delta))}</span><span class="when">${esc(dayMonth(cur.date))}</span></div>
    ${lineChart(ser, { cursor: ci })}`;
}

export default {
  render(ctx) {
    const s = ctx.s();
    const w = netWorth(s, ctx.now());
    const L = lookups(s);
    const hasAcc = s.accounts.length > 0;
    const recent = filterTransactions(s, { status: 'done' }).slice(0, 4);
    const drafts = ctx.store.draftCount();
    return `<header class="topbar"><button class="avatar" data-act="go" data-to="#/parametres" aria-label="Paramètres">${esc(initial(s.settings.name))}</button><div class="total num" aria-label="Patrimoine total">${ctx.fmt(w.total, { full: true })}</div><button class="eye" data-act="eye" aria-label="${s.settings.hideAmounts ? 'Afficher' : 'Masquer'} les montants">${ic(s.settings.hideAmounts ? 'eyeoff' : 'eye', 22)}</button></header>
    <div class="home-wrap">
      ${hasAcc ? '' : `<div class="card"><h2>Bienvenue 👋</h2><p class="muted" style="margin:6px 0 14px">Créez votre premier compte pour commencer à suivre vos dépenses, ou explorez l'application avec des données de démonstration.</p><div class="btnrow"><button class="btn primary" data-act="new-account">Créer un compte</button><button class="btn" data-act="demo">Voir la démo</button></div></div>`}
      ${drafts ? `<div class="card" style="background:var(--lime-soft)"><div class="cardhead" style="margin:0"><div><b>${drafts} brouillon${drafts > 1 ? 's' : ''} à confirmer</b><div class="muted" style="font-size:14px">Générés par vos transactions récurrentes</div></div><button class="btn primary" style="min-height:42px" data-act="go" data-to="#/historique?status=draft">Voir</button></div></div>` : ''}
      ${recent.length ? `<div class="card"><div class="cardhead"><h2>Dernières transactions</h2><button class="link" data-act="go" data-to="#/transactions">Tout voir</button></div><div class="rows">${recent.map((t) => txRow(ctx, t, L)).join('')}</div></div>` : ''}
      ${s.transactions.some((t) => t.status !== 'draft') ? `<div class="card" data-card="flow">${flowCard(ctx)}</div>` : ''}
      <div class="card" data-card="nw" data-scrub-card>${nwCard(ctx)}</div>
      <button class="sc" data-act="go" data-to="#/analyse"><span class="ico">${ic('trend', 26)}<em>+</em></span><span><b>Analyse</b><small>Revenus, dépenses et tendances.</small></span><span class="go">${ic('caret', 14)}</span></button>
      <button class="sc" data-act="go" data-to="#/objectifs"><span class="ico">${ic('target', 28)}<em>+</em></span><span><b>Objectifs</b><small>Suivez vos objectifs d'épargne.</small></span><span class="go">${ic('caret', 14)}</span></button>
      <button class="sc" data-act="go" data-to="#/dettes"><span class="ico">${ic('wallet', 26)}<em>+</em></span><span><b>Dettes &amp; créances</b><small>Ce qu'on vous doit, ce que vous devez.</small></span><span class="go">${ic('caret', 14)}</span></button>
      <button class="sc" data-act="go" data-to="#/ajouter"><span class="ico">${ic('plus', 26)}<em>+</em></span><span><b>Ajout rapide</b><small>Appui long sur l'icône de l'application, puis « Ajouter une dépense ».</small></span><span class="go">${ic('caret', 14)}</span></button>
    </div>`;
  },
  full: true, // pas de padding latéral : le conteneur gère ses marges
  actions: {
    'flow-range': (el, ctx) => ((st.flow = el.dataset.v), (st.flowSel = null), ctx.rerender()),
    'flow-pick': (el, ctx, ev) => {
      const r = ev.target.closest('[data-i]');
      if (!r) return;
      st.flowSel = Number(r.dataset.i);
      document.querySelector('[data-card="flow"]').innerHTML = flowCard(ctx);
    },
    'nw-range': (el, ctx) => ((st.nw = el.dataset.v), (st.cursor = null), ctx.rerender()),
    'nw-series': (el, ctx) => ((st.series = el.dataset.v), ctx.rerender()),
    'new-account': (el, ctx) => accountForm(ctx, null, () => ctx.rerender()),
    demo: (el, ctx) => {
      ctx.store.loadDemo();
      ctx.toast('Données de démonstration chargées.');
    },
  },
  scrub(kind, idx, ctx, root) {
    st.cursor = idx;
    root.innerHTML = nwCard(ctx);
  },
  scrubCount: (ctx) => nwData(ctx).ser.length,
};
export const _x = [empty, monthKey];
