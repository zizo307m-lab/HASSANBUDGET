// Patrimoine, comptes, actifs, dettes & créances, prévision.
import { esc, openSheet, toast, confirmDialog } from '../ui/dom.js';
import { ic } from '../ui/icons.js';
import { lineChart, balanceBars } from '../ui/charts.js';
import { pageHead, rangeChips, txRow, lookups, empty, tip } from '../ui/common.js';
import { accountForm, assetForm, assetValueForm, debtForm, debtPayForm } from '../ui/forms.js';
import { ACCOUNT_TYPES, ASSET_ICONS, ASSET_KINDS } from '../model.js';
import { accountBalances, currentValue, debtRemaining, forecast, netWorth, netWorthSeries, filterTransactions } from '../calc.js';
import { addDays, dayMonth, monthLabel, MONTHS, shortDate, mediumDate } from '../utils.js';

const accIcon = (t) => (t === 'cash' ? '💵' : t === 'savings' ? '🐷' : t === 'card' ? '💳' : '🏦');
const accountsCard = (ctx) => {
  const s = ctx.s();
  const bal = accountBalances(s, ctx.now());
  return `<div class="card"><div class="cardhead"><h2>Comptes</h2><button class="link" data-act="new-account">+ Nouveau</button></div>${
    s.accounts.length
      ? `<div class="rows">${s.accounts.map((a) => `<button class="row" data-act="edit-account" data-id="${esc(a.id)}"><span class="tile-ic">${accIcon(a.type)}</span><span class="main"><b>${esc(a.name)}</b><small>${ACCOUNT_TYPES[a.type] || a.type} · ${a.onBudget ? 'dans le budget' : 'hors budget'}</small></span><span class="amt num">${ctx.fmt(bal.get(a.id) || 0, { full: true })}</span></button>`).join('')}</div>`
      : empty('🏦', 'Aucun compte', 'Ajoutez votre compte courant, vos espèces ou votre épargne.')
  }</div>`;
};
const accountActions = {
  'new-account': (el, ctx) => accountForm(ctx, null, () => ctx.rerender()),
  'edit-account': (el, ctx) => accountForm(ctx, ctx.s().accounts.find((a) => a.id === el.dataset.id), () => ctx.rerender()),
};

// ---------- Patrimoine ----------
const P = { range: '6M', cursor: null };
const pRange = { '1M': 30, '3M': 90, '6M': 182, '1A': 365 };
const chartCard = (ctx) => {
  const now = ctx.now();
  const ser = netWorthSeries(ctx.s(), addDays(now, -pRange[P.range]), now).map((p) => ({ date: p.date, v: p.patrimoine }));
  const ci = P.cursor != null && P.cursor < ser.length ? P.cursor : ser.length - 1;
  return `<div class="cardhead"><h2>Évolution</h2>${rangeChips(P.range)}</div><div class="bigval"><b class="num">${ctx.fmt(ser[ci].v)}</b><span class="when">${esc(dayMonth(ser[ci].date))}</span></div>${lineChart(ser, { cursor: ci })}`;
};
export const patrimoine = {
  enter: () => (P.cursor = null),
  render(ctx) {
    const s = ctx.s();
    const w = netWorth(s, ctx.now());
    const moves = filterTransactions(s, { status: 'done' }).slice(0, 6);
    const L = lookups(s);
    return `${pageHead('Patrimoine')}
    <section class="hero"><div class="lbl">Patrimoine net</div><div class="big"><small>MAD</small><b class="num">${ctx.fmtN(w.total)}</b></div><div class="two"><div class="t"><span>Disponible</span><b class="num">${ctx.fmt(w.dispo)}</b></div><div class="t"><span>Actifs</span><b class="num">${ctx.fmt(w.assets)}</b></div></div></section>
    <div class="card" data-scrub-card="p" data-card="chart">${chartCard(ctx)}</div>
    <div class="card"><h2 style="margin-bottom:4px">Composition</h2>
      <div class="kv small"><span>Comptes</span><b class="num">${ctx.fmt(w.accounts)}</b></div><div class="kv small"><span>Actifs (immobilier, or, bourse…)</span><b class="num">${ctx.fmt(w.assets)}</b></div><div class="kv small"><span>Créances (on vous doit)</span><b class="num">${ctx.fmt(w.receivable)}</b></div><div class="kv small"><span>Crédits</span><b class="num">−${ctx.fmt(w.credits)}</b></div><div class="kv small" style="border:0"><span>Dettes (vous devez)</span><b class="num">−${ctx.fmt(w.payable)}</b></div></div>
    ${accountsCard(ctx)}
    ${moves.length ? `<div class="card"><div class="cardhead"><h2>Mouvements</h2><button class="link" data-act="go" data-to="#/historique">Tout voir</button></div><div class="rows">${moves.map((t) => txRow(ctx, t, L)).join('')}</div></div>` : ''}`;
  },
  actions: { ...accountActions, range: (el, ctx) => ((P.range = el.dataset.v), (P.cursor = null), ctx.rerender()) },
  scrub(k, idx, ctx, root) {
    P.cursor = idx;
    root.innerHTML = chartCard(ctx);
  },
};

export const comptes = {
  render(ctx) {
    return `${pageHead('Comptes')}${tip(ctx, 'comptes', 'Les comptes « dans le budget » alimentent Prêt à assigner. Un compte d’épargne est hors budget : il compte dans le patrimoine, pas dans la trésorerie.')}${accountsCard(ctx)}`;
  },
  actions: accountActions,
};

// ---------- Actifs ----------
export const actifs = {
  render(ctx) {
    const s = ctx.s();
    const now = ctx.now();
    const w = netWorth(s, now);
    const group = (kinds, title) => {
      const items = s.assets.filter((a) => kinds.includes(a.kind));
      if (!items.length) return '';
      return `<div class="card"><h2 style="margin-bottom:4px">${title}</h2><div class="rows">${items
        .map((a) => {
          const v = currentValue(a, now);
          const first = a.history[0];
          const diff = v - first.value;
          return `<button class="row" data-act="asset" data-id="${esc(a.id)}"><span class="tile-ic">${ASSET_ICONS[a.kind]}</span><span class="main"><b>${esc(a.name)}</b><small>${a.kind === 'credit' ? `Mensualité ${ctx.fmt(a.monthlyPayment || 0)}` : `${diff >= 0 ? '+' : '−'}${ctx.fmt(Math.abs(diff))} depuis ${esc(shortDate(first.date))}`}</small></span><span class="amt num">${a.kind === 'credit' ? '−' : ''}${ctx.fmt(v)}</span></button>`;
        })
        .join('')}</div></div>`;
    };
    return `${pageHead('Actifs', { actions: `<button class="sq" data-act="new-asset" aria-label="Ajouter">${ic('plus', 22)}</button>` })}
    <section class="hero"><div class="lbl">Valeur des actifs</div><div class="big"><small>MAD</small><b class="num">${ctx.fmtN(w.assets)}</b></div><div class="two"><div class="t"><span>Crédits restants</span><b class="num">${ctx.fmt(w.credits)}</b></div><div class="t"><span>Net</span><b class="num">${ctx.fmt(w.assets - w.credits)}</b></div></div></section>
    ${s.assets.length ? group(['immobilier', 'or', 'bourse', 'autre'], 'Actifs') + group(['credit'], 'Crédits') : empty('🏠', 'Aucun actif', 'Ajoutez un bien immobilier, de l’or, un portefeuille boursier ou un crédit pour suivre votre patrimoine réel.', '<button class="btn primary" data-act="new-asset">Ajouter un actif</button>')}`;
  },
  actions: {
    'new-asset': (el, ctx) => assetForm(ctx, null),
    asset(el, ctx) {
      const a = ctx.s().assets.find((x) => x.id === el.dataset.id);
      if (!a) return;
      openSheet({
        title: `${ASSET_ICONS[a.kind]} ${a.name}`,
        body: `<div class="rows">${[...a.history].reverse().slice(0, 6).map((h) => `<div class="kv small"><span>${esc(mediumDate(h.date))}</span><b class="num">${ctx.fmt(h.value)}</b></div>`).join('')}</div>`,
        footer: '<button class="btn" data-a="edit">Modifier</button><button class="btn primary" data-a="val">Mettre à jour la valeur</button>',
        onMount(sheet, close) {
          sheet.addEventListener('click', (e) => {
            const x = e.target.closest('[data-a]')?.dataset.a;
            if (!x) return;
            close();
            setTimeout(() => (x === 'edit' ? assetForm(ctx, a) : assetValueForm(ctx, a)), 240);
          });
        },
      });
    },
  },
};

// ---------- Dettes & créances ----------
const DB = { dir: 'i_owe' };
export const dettes = {
  render(ctx) {
    const s = ctx.s();
    const now = ctx.now();
    const rows = s.debts.filter((d) => d.direction === DB.dir);
    const totalOwe = s.debts.filter((d) => d.direction === 'i_owe').reduce((a, d) => a + debtRemaining(d), 0);
    const totalDue = s.debts.filter((d) => d.direction === 'owed_to_me').reduce((a, d) => a + debtRemaining(d), 0);
    return `${pageHead('Dettes & créances', { actions: `<button class="sq" data-act="new-debt" aria-label="Ajouter">${ic('plus', 22)}</button>` })}
    <section class="hero"><div class="two"><div class="t"><span>Vous devez</span><b class="num">${ctx.fmt(totalOwe)}</b></div><div class="t"><span>On vous doit</span><b class="num">${ctx.fmt(totalDue)}</b></div></div></section>
    <div class="seg"><button data-act="dir" data-v="i_owe" aria-pressed="${DB.dir === 'i_owe'}">Je dois</button><button data-act="dir" data-v="owed_to_me" aria-pressed="${DB.dir === 'owed_to_me'}">On me doit</button></div>
    ${
      rows.length
        ? rows
            .map((d) => {
              const rest = debtRemaining(d);
              const pct = d.amount ? ((d.amount - rest) / d.amount) * 100 : 0;
              const late = d.dueDate && d.dueDate < now && rest > 0;
              return `<button class="card goal" style="text-align:left;width:100%" data-act="debt" data-id="${esc(d.id)}"><div class="top"><span class="tile-ic">${d.direction === 'i_owe' ? '📤' : '📥'}</span><b>${esc(d.person)}</b><span class="num" style="font-weight:600">${ctx.fmt(rest)}</span></div><div class="prog"><i style="width:${pct.toFixed(0)}%"></i></div><div class="meta"><span>${rest <= 0 ? 'Soldée ✓' : `${Math.round(pct)} % réglé sur ${ctx.fmt(d.amount)}`}</span><span style="${late ? 'color:var(--bad);font-weight:600' : ''}">${d.dueDate ? `Échéance ${esc(shortDate(d.dueDate))}${late ? ' · en retard' : ''}` : ''}</span></div>${d.note ? `<div class="muted" style="font-size:14px;margin-top:4px">${esc(d.note)}</div>` : ''}</button>`;
            })
            .join('')
        : empty(DB.dir === 'i_owe' ? '🤝' : '💸', DB.dir === 'i_owe' ? 'Aucune dette' : 'Aucune créance', 'Ajoutez-en une avec le bouton +.')
    }`;
  },
  actions: {
    dir: (el, ctx) => ((DB.dir = el.dataset.v), ctx.rerender()),
    'new-debt': (el, ctx) => debtForm(ctx, DB.dir),
    debt(el, ctx) {
      const d = ctx.s().debts.find((x) => x.id === el.dataset.id);
      if (!d) return;
      const rest = debtRemaining(d);
      openSheet({
        title: d.person,
        body: `<div class="kv small"><span>Montant initial</span><b class="num">${ctx.fmt(d.amount)}</b></div><div class="kv small"><span>Reste</span><b class="num">${ctx.fmt(rest)}</b></div>${(d.payments || []).map((p) => `<div class="kv small"><span>${esc(mediumDate(p.date))}</span><b class="num">${ctx.fmt(p.amount)}</b></div>`).join('')}`,
        footer: `<button class="btn danger" data-a="del">Supprimer</button>${rest > 0 ? `<button class="btn primary" data-a="pay">${d.direction === 'i_owe' ? 'Rembourser' : 'Encaisser'}</button>` : ''}`,
        onMount(sheet, close) {
          sheet.addEventListener('click', async (e) => {
            const x = e.target.closest('[data-a]')?.dataset.a;
            if (!x) return;
            close();
            if (x === 'pay') setTimeout(() => debtPayForm(ctx, d, rest), 240);
            else if (await confirmDialog({ title: 'Supprimer ?', text: `« ${d.person} » sera supprimé.` })) {
              ctx.store.deleteDebt(d.id);
              toast('Supprimé.', { action: 'Annuler', onAction: () => ctx.store.restoreDebt(d) });
            }
          });
        },
      });
    },
  },
};

// ---------- Prévision ----------
export const prevision = {
  render(ctx) {
    const f = forecast(ctx.s(), 6, ctx.now());
    const last = f.rows[f.rows.length - 1];
    const lbl = (m) => MONTHS[Number(m.slice(5)) - 1].slice(0, 3);
    return `${pageHead('Prévision')}
    <section class="hero"><div class="lbl">Solde projeté fin ${esc(monthLabel(last.month).toLowerCase())}</div><div class="big"><small>MAD</small><b class="num">${ctx.fmtN(last.balance)}</b></div><div class="two"><div class="t"><span>Solde actuel</span><b class="num">${ctx.fmt(f.base)}</b></div><div class="t"><span>Variation</span><b class="num">${ctx.fmt(last.balance - f.base, { sign: true })}</b></div></div></section>
    <div class="card"><h2 style="margin-bottom:6px">Solde disponible par mois</h2>${balanceBars(f.rows.map((r) => ({ label: lbl(r.month), value: r.balance })))}</div>
    <div class="card"><h2 style="margin-bottom:4px">Détail</h2>${f.rows.map((r) => `<div class="kv small" style="display:grid;grid-template-columns:1.1fr 1fr 1fr 1.1fr;gap:6px"><span style="text-transform:capitalize">${esc(monthLabel(r.month).split(' ')[0])}${r.partial ? ' *' : ''}</span><b class="num" style="color:var(--inc)">+${ctx.fmtN(r.income)}</b><b class="num">−${ctx.fmtN(r.expense)}</b><b class="num">${ctx.fmtN(r.balance)}</b></div>`).join('')}<p class="muted" style="font-size:13px;margin-top:10px">Colonnes : revenus, dépenses, solde. Calcul = vos récurrents à venir + brouillons + moyenne de vos 3 derniers mois hors récurrents. * mois en cours (reste à venir).</p></div>`;
  },
};
export const _w = [ASSET_KINDS, accIcon];
