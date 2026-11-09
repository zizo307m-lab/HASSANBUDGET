// Budget par enveloppes : Prêt à assigner, groupes repliables, catégories avec disponible.
import { esc, openSheet } from '../ui/dom.js';
import { ic } from '../ui/icons.js';
import { monthNav, sqBtn, tip } from '../ui/common.js';
import { assignSheet, categoryForm, groupForm, groupDelete } from '../ui/forms.js';
import { budgetOverview } from '../calc.js';
import { shiftMonth, currentMonthKey } from '../utils.js';

const S = { month: null, open: new Set(['g_variable']), q: '', search: false };

function catRow(ctx, c, income) {
  if (income) {
    return `<button class="cat" data-act="cat" data-id="${esc(c.category.id)}"><div class="l1"><span aria-hidden="true">${c.category.icon}</span><b>${esc(c.category.name)}</b><span class="av num">${ctx.fmtN(c.received)} / ${ctx.fmtN(c.expected)}</span></div></button>`;
  }
  const w = c.assigned > 0 ? Math.min(100, (c.spent / c.assigned) * 100) : c.spent > 0 ? 100 : 0;
  const avail = c.available;
  return `<button class="cat ${c.status}" data-act="cat" data-id="${esc(c.category.id)}"><div class="l1"><span aria-hidden="true">${c.category.icon}</span><b>${esc(c.category.name)}</b><span class="av num">${avail < 0 ? '−' : ''}${ctx.fmt(Math.abs(avail))}</span></div>${c.assigned > 0 || c.spent > 0 ? `<div class="bar"><i style="width:${w.toFixed(0)}%"></i></div>` : ''}<div class="l2"><span>Assigné ${ctx.fmtN(c.assigned)}</span><span>Dépensé ${ctx.fmtN(c.spent)}</span></div></button>`;
}

export default {
  enter(ctx) {
    S.month = currentMonthKey(ctx.now());
    S.q = '';
    S.search = false;
  },
  render(ctx) {
    if (!S.month) S.month = currentMonthKey(ctx.now());
    const o = budgetOverview(ctx.s(), S.month, ctx.now());
    const q = S.q.trim().toLowerCase();
    const groups = o.groups
      .map((g) => {
        const cats = g.cats.filter((c) => !q || c.category.name.toLowerCase().includes(q));
        if (q && !cats.length) return '';
        const open = S.open.has(g.group.id) || !!q;
        const sum = g.income ? `${ctx.fmtN(g.received)} / ${ctx.fmt(g.expected)}` : `dispo ${ctx.fmt(g.available)}`;
        return `<section class="grp"><div class="grphead ${open ? 'open' : ''}" style="padding-right:10px"><button class="grphead" style="padding:0;flex:1;min-width:0" data-act="grp" data-id="${esc(g.group.id)}" data-longpress="grp-menu" aria-expanded="${open}"><span class="tri">${ic('caret', 12)}</span>${g.group.kind !== 'income' && g.group.icon ? `<span aria-hidden="true">${g.group.icon}</span>` : ''}<b>${esc(g.group.name)}</b><span class="cnt">${g.count}</span><span class="sum num">${sum}</span></button><button class="plus" data-act="add-cat" data-id="${esc(g.group.id)}" aria-label="Ajouter une catégorie à ${esc(g.group.name)}">${ic('plus', 20)}</button></div>${open ? `<div class="cats">${cats.map((c) => catRow(ctx, c, g.income)).join('') || '<p class="muted" style="padding:6px 0 10px">Aucune catégorie.</p>'}</div>` : ''}</section>`;
      })
      .join('');
    return `<div class="bhead">${monthNav(S.month)}<div class="acts">${sqBtn('search', 'search', 'Rechercher une catégorie')}${sqBtn('more', 'dots', 'Plus d’actions')}</div></div>
    ${S.search ? `<input class="input" data-input="q" value="${esc(S.q)}" placeholder="Rechercher une catégorie…" autofocus />` : ''}
    <section class="hero lime ${o.ready < 0 ? 'neg' : ''}"><div class="lbl">Prêt à assigner</div><div class="big"><small>MAD</small><b class="num">${ctx.fmtN(o.ready)}</b></div><div class="two"><div class="t"><span>Trésorerie</span><b class="num">${ctx.fmt(o.cash)}</b></div><div class="t"><span>En enveloppes</span><b class="num">${ctx.fmt(o.inEnvelopes)}</b></div></div>${o.ready < 0 ? '<p style="margin-top:10px;color:var(--bad);font-weight:600">Vous avez assigné plus que votre trésorerie.</p>' : ''}</section>
    ${tip(ctx, 'budget', 'Votre budget mensuel par enveloppe : donnez un rôle à chaque dirham disponible, puis suivez ce qu’il reste dans chaque catégorie au fil du mois.')}
    ${groups}
    <button class="dashbtn" data-act="new-group">+ Nouveau groupe</button>
    <p class="hint">Appui long sur un groupe pour le renommer ou le supprimer</p>
    <button class="linkrow" data-act="go" data-to="#/recurrents">Récurrents<span class="go">${ic('chevR', 16)}</span></button>`;
  },
  actions: {
    month: (el, ctx) => ((S.month = shiftMonth(S.month, Number(el.dataset.d))), ctx.rerender()),
    grp: (el, ctx) => {
      const id = el.dataset.id;
      S.open.has(id) ? S.open.delete(id) : S.open.add(id);
      ctx.rerender();
    },
    search: (el, ctx) => ((S.search = !S.search), (S.q = S.search ? S.q : ''), ctx.rerender()),
    'add-cat': (el, ctx) => {
      S.open.add(el.dataset.id);
      categoryForm(ctx, { groupId: el.dataset.id });
    },
    'new-group': (el, ctx) => groupForm(ctx, null),
    'grp-menu': (el, ctx) => {
      const g = ctx.s().groups.find((x) => x.id === el.dataset.id);
      if (!g) return;
      openSheet({
        title: `${g.icon || ''} ${g.name}`,
        body: `<button class="pickrow" data-a="ren"><span class="ic2">✏️</span><b>Renommer</b></button>${g.kind === 'income' ? '' : '<button class="pickrow" data-a="del"><span class="ic2">🗑️</span><b>Supprimer</b></button>'}`,
        onMount(sheet, close) {
          sheet.addEventListener('click', (e) => {
            const a = e.target.closest('[data-a]')?.dataset.a;
            if (!a) return;
            close();
            setTimeout(() => (a === 'ren' ? groupForm(ctx, g) : groupDelete(ctx, g)), 240);
          });
        },
      });
    },
    cat: (el, ctx) => {
      const o = budgetOverview(ctx.s(), S.month, ctx.now());
      for (const g of o.groups) {
        const c = g.cats.find((x) => x.category.id === el.dataset.id);
        if (c) return assignSheet(ctx, { cat: c.category, month: S.month, assigned: g.income ? c.expected : c.assigned, income: g.income });
      }
    },
    more(el, ctx) {
      openSheet({
        title: 'Budget de ' + S.month,
        body: `<button class="pickrow" data-a="copy"><span class="ic2">📋</span><b>Copier les budgets du mois précédent</b></button><button class="pickrow" data-a="target"><span class="ic2">🎯</span><b>Appliquer les budgets habituels</b></button><button class="pickrow" data-a="rec"><span class="ic2">🔁</span><b>Transactions récurrentes</b></button>`,
        onMount(sheet, close) {
          sheet.addEventListener('click', (e) => {
            const a = e.target.closest('[data-a]')?.dataset.a;
            if (!a) return;
            close();
            if (a === 'copy') {
              const n = ctx.store.copyAssignments(shiftMonth(S.month, -1), S.month);
              ctx.toast(n ? `${n} budget(s) copié(s) du mois précédent.` : 'Aucun budget le mois précédent.', { kind: n ? '' : 'warn' });
            } else if (a === 'target') {
              let n = 0;
              for (const c of ctx.s().categories) if (c.target > 0 && !(ctx.s().assignments[S.month]?.[c.id] > 0) && ctx.store.setAssignment(S.month, c.id, c.target).ok) n++;
              ctx.toast(n ? `${n} budget(s) habituel(s) appliqué(s).` : 'Aucun budget habituel à appliquer. Définissez-les dans chaque catégorie.', { kind: n ? '' : 'warn' });
            } else ctx.go('#/recurrents');
          });
        },
      });
    },
  },
  inputs: {
    q: (el, ctx) => {
      S.q = el.value;
      ctx.rerender({ keepFocus: '[data-input="q"]' });
    },
  },
};
