// Objectifs, habitudes, assistant local, transactions récurrentes.
import { $, esc, toast, confirmDialog } from '../ui/dom.js';
import { ic } from '../ui/icons.js';
import { pageHead, empty, tip } from '../ui/common.js';
import { goalForm, contributeForm, habitForm } from '../ui/forms.js';
import { goalProgress, habitStreak } from '../calc.js';
import { answer, SUGGESTIONS } from '../assistant.js';
import { FREQUENCIES, addDays, nthOccurrence, shortDate, DAYS, parseISO } from '../utils.js';

export const objectifs = {
  render(ctx) {
    const s = ctx.s();
    const now = ctx.now();
    return `${pageHead('Objectifs', { actions: `<button class="sq" data-act="new" aria-label="Nouvel objectif">${ic('plus', 22)}</button>` })}
    ${tip(ctx, 'goals', 'Fixez un montant et une date : l’application calcule combien mettre de côté chaque mois.')}
    ${
      s.goals.length
        ? s.goals
            .map((g) => {
              const p = goalProgress(g, now);
              return `<div class="card goal"><div class="top"><span class="tile-ic">${g.icon}</span><b>${esc(g.name)}</b><span class="num" style="font-weight:600">${Math.round(p.pct)} %</span></div><div class="prog"><i style="width:${p.pct.toFixed(0)}%"></i></div><div class="meta"><span class="num">${ctx.fmt(g.saved)} / ${ctx.fmt(g.target)}</span><span>${p.reached ? 'Objectif atteint 🎉' : p.monthly ? `${ctx.fmt(p.monthly)} / mois` : g.deadline ? (p.late ? 'Échéance dépassée' : '') : ''}</span></div>${g.deadline ? `<div class="muted" style="font-size:13.5px;margin-top:2px">Avant le ${esc(shortDate(g.deadline))}</div>` : ''}<div class="acts"><button class="btn primary" data-act="contrib" data-id="${esc(g.id)}">Alimenter</button><button class="btn" data-act="edit" data-id="${esc(g.id)}">Modifier</button></div></div>`;
            })
            .join('')
        : empty('🎯', 'Aucun objectif', 'Voyage, fonds d’urgence, voiture… créez votre premier objectif d’épargne.', '<button class="btn primary" data-act="new">Créer un objectif</button>')
    }`;
  },
  actions: {
    new: (el, ctx) => goalForm(ctx, null),
    edit: (el, ctx) => goalForm(ctx, ctx.s().goals.find((g) => g.id === el.dataset.id)),
    contrib: (el, ctx) => contributeForm(ctx, ctx.s().goals.find((g) => g.id === el.dataset.id)),
  },
};

export const habitudes = {
  render(ctx) {
    const s = ctx.s();
    const now = ctx.now();
    const days = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
    return `${pageHead('Habitudes', { actions: `<button class="sq" data-act="new" aria-label="Nouvelle habitude">${ic('plus', 22)}</button>` })}
    ${tip(ctx, 'habits', 'De petites habitudes régulières font les grandes économies. Cochez chaque jour ce que vous avez accompli.')}
    ${
      s.habits.length
        ? s.habits
            .map((h) => {
              const done = new Set(h.done);
              const streak = habitStreak(h, now);
              return `<div class="card"><div class="goal"><div class="top"><span class="tile-ic">${h.icon}</span><b>${esc(h.name)}</b><button class="check" data-act="toggle" data-id="${esc(h.id)}" aria-pressed="${done.has(now)}" aria-label="Fait aujourd’hui">${ic('check', 22)}</button></div></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><div class="dots7">${days.map((d) => `<i class="${done.has(d) ? 'on' : ''}" title="${esc(d)}">${DAYS[(parseISO(d).getDay() + 6) % 7][0]}</i>`).join('')}</div><span class="muted">${streak ? `🔥 ${streak} j` : '—'} <button data-act="del" data-id="${esc(h.id)}" aria-label="Supprimer" style="color:var(--soft);margin-left:6px">${ic('trash', 18)}</button></span></div></div>`;
            })
            .join('')
        : empty('⭐', 'Aucune habitude', 'Par exemple « Noter mes dépenses du jour » ou « Pas d’achat impulsif ».', '<button class="btn primary" data-act="new">Ajouter une habitude</button>')
    }`;
  },
  actions: {
    new: (el, ctx) => habitForm(ctx),
    toggle: (el, ctx) => ctx.store.toggleHabit(el.dataset.id, ctx.now()),
    async del(el, ctx) {
      if (await confirmDialog({ title: 'Supprimer cette habitude ?', text: 'Son historique sera perdu.' })) ctx.store.deleteHabit(el.dataset.id);
    },
  },
};

const chat = [];
export const assistant = {
  render(ctx) {
    return `${pageHead('Assistant')}
    <div class="tip"><span class="bubble">${ic('chat', 26)}</span><p>Je réponds à partir des données de votre téléphone, sans rien envoyer sur internet.</p></div>
    <div class="chat" data-chat>${chat.length ? chat.map((m) => `<div class="msg ${m.me ? 'me' : 'bot'}">${esc(m.text)}</div>`).join('') : '<div class="msg bot">Bonjour ! Posez-moi une question sur vos finances.</div>'}</div>
    <div class="chipbar">${SUGGESTIONS.map((q) => `<button class="chip" data-act="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form class="askbar" data-act-submit="send"><input class="input" data-input="q" placeholder="Votre question…" autocomplete="off" enterkeyhint="send" /><button class="btn primary" type="submit" aria-label="Envoyer">${ic('send', 22)}</button></form>`;
  },
  actions: {
    ask(el, ctx) {
      push(ctx, el.dataset.q);
    },
  },
  submit: {
    send(form, ctx) {
      const i = $('[data-input="q"]', form);
      const q = i.value.trim();
      if (q) push(ctx, q);
    },
  },
};
function push(ctx, q) {
  chat.push({ me: true, text: q });
  chat.push({ me: false, text: answer(ctx.s(), q, { now: ctx.now(), fmt: (n) => ctx.fmt(n) }).text });
  ctx.rerender();
  requestAnimationFrame(() => document.querySelector('.askbar')?.scrollIntoView({ block: 'end' }));
}

export const recurrents = {
  render(ctx) {
    const s = ctx.s();
    const now = ctx.now();
    const cat = new Map(s.categories.map((c) => [c.id, c]));
    return `${pageHead('Récurrents', { actions: `<button class="sq" data-act="new" aria-label="Nouveau récurrent">${ic('plus', 22)}</button>` })}
    ${tip(ctx, 'rec', 'À chaque échéance, l’application crée un brouillon à confirmer : le solde ne change qu’après votre validation.')}
    ${
      s.recurring.length
        ? `<div class="card rows" style="padding:4px 14px">${s.recurring
            .map((r) => {
              const c = cat.get(r.categoryId);
              const next = nthOccurrence(r.startDate, r.freq, r.count);
              return `<div class="row"><span class="tile-ic">${r.type === 'transfer' ? '🔁' : c?.icon || '📦'}</span><span class="main"><b>${esc(r.label || c?.name || 'Transfert')}</b><small>${FREQUENCIES[r.freq]} · ${r.active ? `prochaine ${esc(shortDate(next))}` : 'en pause'}</small></span><span class="amt num ${r.type === 'income' ? 'inc' : ''}">${r.type === 'expense' ? '−' : ''}${ctx.fmt(r.amount)}</span><button class="sq sm" data-act="pause" data-id="${esc(r.id)}" aria-label="${r.active ? 'Mettre en pause' : 'Reprendre'}">${r.active ? '⏸' : '▶'}</button><button class="sq sm" data-act="del" data-id="${esc(r.id)}" aria-label="Supprimer">${ic('trash', 18)}</button></div>`;
            })
            .join('')}</div>`
        : empty('🔁', 'Aucune récurrence', 'Salaire, loyer, internet, abonnements… créez une transaction récurrente.', '<button class="btn primary" data-act="new">Ajouter</button>')
    }`;
  },
  actions: {
    new: (el, ctx) => ctx.go('#/ajouter?rec=1'),
    pause: (el, ctx) => ctx.store.toggleRecurring(el.dataset.id),
    async del(el, ctx) {
      if (await confirmDialog({ title: 'Supprimer cette récurrence ?', text: 'Les transactions déjà créées sont conservées.' })) {
        ctx.store.deleteRecurring(el.dataset.id);
        toast('Récurrence supprimée.');
      }
    },
  },
};
