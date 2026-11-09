// Analyse : Net du mois, Flux / Patrimoine / Catégories, statistiques du mois.
import { esc } from '../ui/dom.js';
import { flowChart, lineChart, donut, SERIES_COLORS } from '../ui/charts.js';
import { pageHead, sqBtn, tip, rangeChips, hbar } from '../ui/common.js';
import { bucketLabel } from './home.js';
import { categoryBreakdown, flowBuckets, monthStats, netWorthSeries, rangeSpec, periodTotals } from '../calc.js';
import { formatNumber, monthKey, monthLabel, shiftMonth, monthStart, monthEnd, dayMonth, today } from '../utils.js';
import { formSheet, field, textInput } from '../ui/forms.js';

const S = { tab: 'flux', range: '6M', custom: null, sel: null, series: 'patrimoine', cursor: null };

function tabBody(ctx) {
  const s = ctx.s();
  const now = ctx.now();
  const spec = rangeSpec(S.range, now, S.custom);
  const ranges = rangeChips(S.range, ['1M', '3M', '6M', '1A', 'custom']);
  if (S.tab === 'flux') {
    const b = flowBuckets(s, spec);
    const sel = S.sel != null && S.sel < b.length ? S.sel : b.length - 1;
    const c = b[sel];
    return `<div class="muted" style="font-size:14.5px">${esc(bucketLabel(c, spec.mode))} · Revenus <b class="num" style="color:var(--text)">${ctx.fmt(c.income)}</b> · Dépenses <b class="num" style="color:var(--text)">${ctx.fmt(c.expense)}</b></div>
    <div data-act="flow-pick">${flowChart(b, { sel, exp: 'var(--exp)', h: 200 })}</div>
    <div class="legend"><div class="k"><span><i style="background:var(--lime)"></i>Revenus</span><span><i style="background:var(--exp)"></i>Dépenses</span></div>${ranges}</div>`;
  }
  if (S.tab === 'patrimoine') {
    const ser = netWorthSeries(s, spec.from, spec.to).map((p) => ({ date: p.date, v: p[S.series] }));
    const ci = S.cursor != null && S.cursor < ser.length ? S.cursor : ser.length - 1;
    const first = ser[0].v;
    const cur = ser[ci];
    const d = cur.v - first;
    return `<div class="pillrow" style="margin:0"><button class="pill" data-act="series" data-v="patrimoine" aria-pressed="${S.series === 'patrimoine'}">Patrimoine</button><button class="pill" data-act="series" data-v="dispo" aria-pressed="${S.series === 'dispo'}">Dispo</button></div>
    <div class="bigval"><b class="num">${ctx.fmt(cur.v)}</b><span class="delta num ${d < 0 ? 'neg' : ''}">${d < 0 ? '▼' : '▲'} ${ctx.fmt(Math.abs(d))} depuis le ${esc(dayMonth(spec.from))}</span><span class="when">${esc(dayMonth(cur.date))}</span></div>
    <div data-scrub-card="patrimoine">${lineChart(ser, { cursor: ci })}</div><div class="legend"><span></span>${ranges}</div>`;
  }
  const bd = categoryBreakdown(s, spec.from, spec.to);
  if (!bd.rows.length) return `<p class="muted" style="padding:20px 0;text-align:center">Aucune dépense sur cette période.</p><div class="legend"><span></span>${ranges}</div>`;
  const top = bd.rows.slice(0, 8);
  const other = bd.rows.slice(8).reduce((a, r) => a + r.total, 0);
  const donutRows = [...top.map((r) => ({ value: r.total })), ...(other ? [{ value: other }] : [])];
  return `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><div style="margin:0 auto">${donut(donutRows)}</div><div class="muted" style="flex:1;min-width:130px">Total dépensé<br><b class="num" style="font-size:24px;color:var(--text)">${ctx.fmt(bd.total)}</b></div></div>
  ${top.map((r, i) => hbar(`${r.category.icon} ${esc(r.category.name)}`, `${ctx.fmt(r.total)} · ${Math.round(r.pct)} %`, r.pct, SERIES_COLORS[i % SERIES_COLORS.length], ctx)).join('')}
  ${other ? hbar('Autres', ctx.fmt(other), (other / bd.total) * 100, SERIES_COLORS[8], ctx) : ''}
  <div class="legend"><span></span>${ranges}</div>`;
}

export default {
  enter() {
    Object.assign(S, { tab: 'flux', sel: null, cursor: null });
  },
  render(ctx) {
    const s = ctx.s();
    const now = ctx.now();
    const key = monthKey(now);
    const m = monthStats(s, key, now);
    const prev = periodTotals(s, monthStart(shiftMonth(key, -1)), monthEnd(shiftMonth(key, -1)));
    const vsPrev = prev.expense > 0 ? Math.round(((m.expense - prev.expense) / prev.expense) * 100) : null;
    return `${pageHead('Analyse', { actions: `${sqBtn('go', 'flame', 'Habitudes', 'data-to="#/habitudes"')}${sqBtn('go', 'trend', 'Prévision', 'data-to="#/prevision"')}${sqBtn('go', 'chat', 'Assistant', 'data-to="#/assistant"')}` })}
    ${tip(ctx, 'analyse', 'Analyse de vos dépenses par catégorie et dans le temps, pour voir où part l’argent et comment cela évolue.')}
    <section class="hero"><div class="lbl">Net ce mois</div><div class="big"><small>MAD</small><b class="num">${ctx.fmtN(m.net, { sign: true })}</b></div><div class="two"><div class="t"><span>Revenus</span><b class="num">${ctx.fmt(m.income)}</b></div><div class="t"><span>Dépenses${m.savingsRate != null ? ` · ${Math.round(m.savingsRate)} % épargnés` : ''}</span><b class="num">${ctx.fmt(m.expense)}</b></div></div></section>
    ${m.top ? `<div class="insight"><i></i><span>Plus gros poste ce mois : ${esc(m.top.category.name)} à ${ctx.fmt(m.top.total)}.</span></div>` : ''}
    <div class="seg" role="tablist">${[['flux', 'Flux'], ['patrimoine', 'Patrimoine'], ['cat', 'Catégories']].map(([k, l]) => `<button data-act="atab" data-v="${k}" aria-pressed="${S.tab === k}">${l}</button>`).join('')}</div>
    <div data-card="body" data-scrub-card="patrimoine">${tabBody(ctx)}</div>
    <div class="stat-title"><h2>Ce mois-ci</h2><span>jour ${m.elapsed} sur ${m.dim}</span></div>
    <div>
      <div class="kv"><span>Moyenne par jour</span><b class="num">${ctx.fmt(m.avgPerDay)}</b></div>
      <div class="kv"><span>Projection fin de mois</span><b class="num">${ctx.fmt(m.projection)}</b></div>
      <div class="kv"><span>Moyenne 6 mois</span><b class="num">${ctx.fmt(m.avg6)}</b></div>
      <div class="kv"><span>Taux d’épargne</span><b class="num">${m.savingsRate == null ? '—' : `${formatNumber(m.savingsRate)} %`}</b></div>
      <div class="kv"><span>Dépenses du mois dernier</span><b class="num">${ctx.fmt(prev.expense)}${vsPrev != null ? ` <small style="color:${vsPrev > 0 ? 'var(--bad)' : 'var(--ok)'}">${vsPrev > 0 ? '+' : ''}${vsPrev} %</small>` : ''}</b></div>
      <div class="kv"><span>Mois en cours</span><b>${esc(monthLabel(key))}</b></div>
    </div>`;
  },
  actions: {
    atab: (el, ctx) => ((S.tab = el.dataset.v), (S.sel = null), (S.cursor = null), ctx.rerender()),
    series: (el, ctx) => ((S.series = el.dataset.v), ctx.rerender()),
    range(el, ctx) {
      if (el.dataset.v !== 'custom') {
        S.range = el.dataset.v;
        S.sel = S.cursor = null;
        return ctx.rerender();
      }
      const c = S.custom || { from: shiftMonth(ctx.now(), -2).slice(0, 7) + '-01', to: ctx.now() };
      formSheet({
        title: 'Période personnalisée',
        body: `${field('Du', 'from', textInput('from', c.from, { type: 'date' }))}${field('Au', 'to', textInput('to', c.to, { type: 'date' }))}`,
        submit: 'Appliquer',
        onSubmit: (v) => {
          if (!v.from || !v.to || v.to < v.from) return { ok: false, errors: { to: 'La date de fin doit suivre la date de début.' } };
          S.custom = v;
          S.range = 'custom';
          S.sel = S.cursor = null;
          ctx.rerender();
          return { ok: true };
        },
      });
    },
    'flow-pick': (el, ctx, ev) => {
      const r = ev.target.closest('[data-i]');
      if (!r) return;
      S.sel = Number(r.dataset.i);
      document.querySelector('[data-card="body"]').innerHTML = tabBody(ctx);
    },
  },
  scrub(kind, idx, ctx, root) {
    S.cursor = idx;
    root.innerHTML = tabBody(ctx);
  },
};
export const _a = today;
