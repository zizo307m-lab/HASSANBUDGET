// Nouvelle transaction / modification. Conçu pour une saisie en moins de 10 s : compte mémorisé, montant au clavier numérique.
import { $, esc, showErrors, toast, confirmDialog } from '../ui/dom.js';
import { ic } from '../ui/icons.js';
import { pickAccount, pickCategory, accountForm } from '../ui/forms.js';
import { FREQUENCIES, addDays, longDate, parseAmount, today } from '../utils.js';

let D = null;
let editing = null;
const LAST = 'kanz:lastAccount';
const lastAcc = () => {
  try {
    return localStorage.getItem(LAST) || '';
  } catch {
    return '';
  }
};
const rememberAcc = (id) => {
  try {
    localStorage.setItem(LAST, id);
  } catch {}
};

const dateLabel = (ctx, d) => (d === ctx.now() ? "Aujourd'hui" : d === addDays(ctx.now(), -1) ? 'Hier' : longDate(d));
const valid = (ctx) => {
  const a = parseAmount(D.amount);
  if (!(a > 0) || !D.accountId) return false;
  return D.kind === 'transfer' ? !!D.toAccountId : !!D.categoryId;
};
const payload = () => ({ kind: D.kind, date: D.date, accountId: D.accountId, toAccountId: D.kind === 'transfer' ? D.toAccountId : null, categoryId: D.kind === 'transfer' ? null : D.categoryId, label: D.label, amount: D.amount });
const refresh = () => {
  const b = $('[data-act="submit"]');
  if (b) b.setAttribute('aria-disabled', String(!valid()));
};

export default {
  hideNav: true,
  enter(ctx, params) {
    const s = ctx.s();
    editing = params.id ? s.transactions.find((t) => t.id === params.id) || null : null;
    if (editing) {
      D = { kind: editing.type === 'transfer' ? 'transfer' : 'standard', date: editing.date, accountId: editing.accountId, toAccountId: editing.toAccountId || '', categoryId: editing.categoryId || '', label: editing.label || '', amount: String(editing.amount).replace('.', ','), recurring: false, freq: 'monthly' };
    } else {
      const acc = s.accounts.some((a) => a.id === lastAcc()) ? lastAcc() : s.accounts.length === 1 ? s.accounts[0].id : '';
      D = { kind: 'standard', date: ctx.now(), accountId: acc, toAccountId: '', categoryId: params.cat || '', label: '', amount: '', recurring: !!params.rec, freq: 'monthly' };
    }
  },
  render(ctx) {
    const s = ctx.s();
    if (!D) this.enter(ctx, {});
    const acc = (id) => s.accounts.find((a) => a.id === id);
    const cat = s.categories.find((c) => c.id === D.categoryId);
    const sel = (act, label, ph, extra = '') => `<div class="field" ${extra}><label>${label}</label><button class="select" data-act="${act}" type="button">${label === '' ? '' : ''}${ph}<span class="go">${ic('caret', 12)}</span></button><p class="err" data-err="${act}"></p></div>`;
    const ph = (txt) => `<span class="ph">— ${txt} —</span>`;
    return `<div class="formhead"><h1>${editing ? 'Modifier' : 'Nouvelle transaction'}</h1><button data-act="close">Fermer</button></div>
    ${s.accounts.length ? '' : `<div class="infobox"><span>Créez d'abord un compte pour pouvoir ajouter une transaction.</span><button class="link" style="text-align:left;font-size:18px" data-act="create-account">Créer un compte →</button></div>`}
    <div class="seg" role="group"><button data-act="kind" data-v="standard" aria-pressed="${D.kind === 'standard'}">Standard</button><button data-act="kind" data-v="transfer" aria-pressed="${D.kind === 'transfer'}">Transfert</button></div>
    <div class="field"><label>Date</label><div class="datepick"><button data-act="day" data-d="-1" aria-label="Jour précédent">${ic('chevL', 16)}</button><label><span data-datelabel>${esc(dateLabel(ctx, D.date))}</span><input type="date" data-input="date" value="${D.date}" max="2100-01-01" aria-label="Choisir une date" /></label><button data-act="day" data-d="1" aria-label="Jour suivant">${ic('chevR', 16)}</button></div><p class="err" data-err="date"></p></div>
    <div class="field"><label>${D.kind === 'transfer' ? 'Du compte' : 'Compte'}</label><button class="select" data-act="pick-acc" type="button">${acc(D.accountId) ? esc(acc(D.accountId).name) : ph('Sélectionner')}<span class="go">${ic('caret', 12)}</span></button><p class="err" data-err="accountId"></p></div>
    ${
      D.kind === 'transfer'
        ? `<div class="field"><label>Vers le compte</label><button class="select" data-act="pick-to" type="button">${acc(D.toAccountId) ? esc(acc(D.toAccountId).name) : ph('Sélectionner')}<span class="go">${ic('caret', 12)}</span></button><p class="err" data-err="toAccountId"></p></div>`
        : `<div class="field"><label>Catégorie</label><button class="select" data-act="pick-cat" type="button">${cat ? `${cat.icon} ${esc(cat.name)}` : ph('Sélectionner')}<span class="go">${ic('caret', 12)}</span></button><p class="err" data-err="categoryId"></p></div>`
    }
    <div class="field"><label>Libellé</label><input class="input" data-input="label" value="${esc(D.label)}" placeholder="ex. Café Hassan" maxlength="80" autocomplete="off" /></div>
    <div class="field"><label>Montant</label><input class="input" data-input="amount" value="${esc(D.amount)}" placeholder="0,00" inputmode="decimal" autocomplete="off" /><p class="err" data-err="amount"></p></div>
    ${
      editing
        ? ''
        : `<div class="switchrow"><div><b>Transaction récurrente</b><small>Un brouillon sera généré à chaque échéance</small></div><button class="sw" role="switch" aria-checked="${D.recurring}" data-act="rec" aria-label="Transaction récurrente"></button></div>
    ${D.recurring ? `<div class="chipbar">${Object.entries(FREQUENCIES).map(([k, l]) => `<button class="chip" data-act="freq" data-v="${k}" aria-pressed="${D.freq === k}">${l}</button>`).join('')}</div>` : ''}`
    }
    <button class="btn primary block stickybtn" style="bottom:10px" data-act="submit" aria-disabled="${!valid()}">${editing ? 'Enregistrer' : 'Ajouter'}</button>
    ${editing ? `<div class="btnrow">${editing.status === 'draft' ? '<button class="btn" data-act="confirm-draft">Confirmer</button>' : ''}<button class="btn" data-act="dup">Dupliquer</button><button class="btn danger" data-act="del">Supprimer</button></div>` : ''}`;
  },
  actions: {
    close: (el, ctx) => ctx.back('#/home'),
    kind: (el, ctx) => ((D.kind = el.dataset.v), ctx.rerender()),
    day: (el, ctx) => ((D.date = addDays(D.date, Number(el.dataset.d))), ctx.rerender()),
    rec: (el, ctx) => ((D.recurring = !D.recurring), ctx.rerender()),
    freq: (el, ctx) => ((D.freq = el.dataset.v), ctx.rerender()),
    'create-account': (el, ctx) =>
      accountForm(ctx, null, (a) => {
        if (a) D.accountId = a.id;
        ctx.rerender();
      }),
    'pick-acc': (el, ctx) => pickAccount(ctx, { selected: D.accountId, onPick: (id) => ((D.accountId = id), ctx.rerender()) }),
    'pick-to': (el, ctx) => pickAccount(ctx, { selected: D.toAccountId, exclude: D.accountId, title: 'Vers le compte', onPick: (id) => ((D.toAccountId = id), ctx.rerender()) }),
    'pick-cat': (el, ctx) => pickCategory(ctx, { selected: D.categoryId, onPick: (id) => ((D.categoryId = id), ctx.rerender()) }),
    submit(el, ctx) {
      const root = document.getElementById('app');
      const r = editing ? ctx.store.updateTransaction(editing.id, payload()) : ctx.store.addTransaction(payload(), { recurrence: D.recurring ? D.freq : 'none' });
      if (!r.ok) {
        showErrors(root, { ...r.errors, ...(r.errors.categoryId ? {} : {}) });
        return;
      }
      rememberAcc(D.accountId);
      if (editing) {
        toast('Modifications enregistrées.');
        return ctx.back('#/transactions');
      }
      const tx = r.value;
      const line = r.line;
      const name = ctx.s().categories.find((c) => c.id === tx.categoryId)?.name;
      toast(line && line.assigned > 0 ? `Ajouté · il reste ${ctx.fmt(line.available)} sur « ${name} »` : 'Transaction ajoutée.', {
        action: 'Annuler',
        onAction: () => ctx.store.deleteTransaction(tx.id),
        kind: line && line.assigned > 0 && line.status === 'over' ? 'warn' : '',
      });
      ctx.back('#/home');
    },
    'confirm-draft': (el, ctx) => (ctx.store.confirmDraft(editing.id), ctx.toast('Transaction confirmée.'), ctx.back('#/transactions')),
    dup: (el, ctx) => {
      const c = ctx.store.duplicateTransaction(editing.id, ctx.now());
      ctx.toast('Dupliquée à la date du jour.');
      ctx.go(`#/ajouter/${c.id}`, { replace: true });
    },
    async del(el, ctx) {
      if (!(await confirmDialog({ title: 'Supprimer cette transaction ?', text: 'Vous pourrez annuler juste après.' }))) return;
      const t = ctx.store.deleteTransaction(editing.id);
      ctx.toast('Transaction supprimée.', { action: 'Annuler', onAction: () => ctx.store.restoreTransaction(t) });
      ctx.back('#/transactions');
    },
  },
  inputs: {
    label: (el) => ((D.label = el.value), refresh()),
    amount: (el) => ((D.amount = el.value), refresh()),
    date: (el, ctx) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) {
        D.date = el.value;
        const l = $('[data-datelabel]');
        if (l) l.textContent = dateLabel(ctx, D.date);
      }
    },
  },
  autofocus: '[data-input="amount"]',
};
export const _t = today;
