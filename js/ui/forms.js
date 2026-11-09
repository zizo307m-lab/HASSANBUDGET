// Feuilles de saisie (comptes, catégories, groupes, actifs, dettes, objectifs, habitudes) et sélecteurs.
import { $, $$, esc, openSheet, showErrors, toast, confirmDialog } from './dom.js';
import { ic } from './icons.js';
import { ACCOUNT_TYPES, ASSET_KINDS, ASSET_ICONS, ICONS } from '../model.js';
import { formatNumber, today } from '../utils.js';
import { rankCategories } from '../calc.js';

export const field = (label, name, html) => `<div class="field" data-field-wrap="${name}"><label>${esc(label)}</label>${html}<p class="err" data-err="${name}"></p></div>`;
export const textInput = (name, value = '', { ph = '', type = 'text', mode = '' } = {}) => `<input class="input" data-field="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" ${mode ? `inputmode="${mode}"` : ''} autocomplete="off" />`;
export const moneyInput = (name, value = '', ph = '0,00') => textInput(name, value === '' || value == null ? '' : String(value).replace('.', ','), { ph, mode: 'decimal' });
export const chipsField = (name, items, value) => `<div class="chipbar" data-field="${name}" data-kind="chips" style="flex-wrap:wrap">${items.map(([v, l]) => `<button type="button" class="chip" data-val="${esc(v)}" aria-pressed="${v === value}">${esc(l)}</button>`).join('')}</div>`;
export const emojiField = (name, value) => `<div class="emojis" data-field="${name}" data-kind="chips">${ICONS.map((e) => `<button type="button" data-val="${e}" aria-pressed="${e === value}">${e}</button>`).join('')}</div>`;
export const switchField = (name, value, title, sub = '') => `<div class="switchrow"><div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div><button type="button" class="sw" role="switch" data-field="${name}" data-kind="switch" aria-checked="${!!value}" aria-label="${esc(title)}"></button></div>`;

function read(root) {
  const v = {};
  for (const el of $$('[data-field]', root)) {
    const k = el.dataset.field;
    if (el.dataset.kind === 'chips') v[k] = $('[aria-pressed="true"]', el)?.dataset.val ?? '';
    else if (el.dataset.kind === 'switch') v[k] = el.getAttribute('aria-checked') === 'true';
    else v[k] = el.value;
  }
  return v;
}

/** Feuille de formulaire générique. onSubmit(values, close) → résultat du store ({ok, errors}). */
export function formSheet({ title, body, submit = 'Enregistrer', extra = '', onSubmit, onChange }) {
  return openSheet({
    title,
    body,
    footer: `${extra}<button class="btn primary" data-submit>${esc(submit)}</button>`,
    onMount(sheet, close) {
      sheet.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-kind="chips"] [data-val]');
        if (chip) {
          $$('[data-val]', chip.parentElement).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
          onChange?.(read(sheet), sheet);
        }
        const sw = e.target.closest('[data-kind="switch"]');
        if (sw) sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true'));
      });
      const go = () => {
        const r = onSubmit(read(sheet), close);
        if (r && r.ok === false) showErrors(sheet, r.errors || {});
        else if (r) close();
      };
      $('[data-submit]', sheet).addEventListener('click', go);
      sheet.addEventListener('keydown', (e) => e.key === 'Enter' && e.target.tagName === 'INPUT' && go());
      sheet._close = close;
      setTimeout(() => $('input.input', sheet)?.focus(), 260);
    },
  });
}

// ---------- Sélecteurs (compte, catégorie) ----------
export function pickAccount(ctx, { selected, exclude, onPick, title = 'Compte' }) {
  const list = ctx.s().accounts.filter((a) => a.id !== exclude);
  const bal = ctx.balances();
  openSheet({
    title,
    body: list.length
      ? list.map((a) => `<button class="pickrow" data-id="${esc(a.id)}" aria-pressed="${a.id === selected}"><span class="ic2">${a.type === 'cash' ? '💵' : a.type === 'savings' ? '🐷' : a.type === 'card' ? '💳' : '🏦'}</span><b>${esc(a.name)}</b><small class="num">${ctx.fmt(bal.get(a.id) || 0)}</small></button>`).join('')
      : `<p class="muted">Aucun compte disponible.</p>`,
    footer: `<button class="btn" data-new>+ Nouveau compte</button>`,
    onMount(sheet, close) {
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('.pickrow');
        if (b) {
          onPick(b.dataset.id);
          close();
        }
        if (e.target.closest('[data-new]')) {
          close();
          accountForm(ctx, null, (a) => onPick(a.id));
        }
      });
    },
  });
}

export function pickCategory(ctx, { selected, onPick }) {
  const s = ctx.s();
  const usedRank = [...rankCategories(s, 'expense', ctx.now()).slice(0, 5), ...rankCategories(s, 'income', ctx.now()).slice(0, 2)].filter((c) => s.transactions.some((t) => t.categoryId === c.id));
  const row = (c) => `<button class="pickrow" data-id="${esc(c.id)}" aria-pressed="${c.id === selected}"><span class="ic2">${c.icon}</span><b>${esc(c.name)}</b></button>`;
  const render = (q) => {
    const m = q.trim().toLowerCase();
    const ok = (c) => !m || c.name.toLowerCase().includes(m);
    let html = '';
    if (!m && usedRank.length) html += `<div class="pickgroup">Récentes</div>${usedRank.map(row).join('')}`;
    for (const g of [...s.groups].sort((a, b) => a.order - b.order)) {
      const cs = s.categories.filter((c) => c.groupId === g.id && ok(c));
      if (cs.length) html += `<div class="pickgroup">${esc(g.icon)} ${esc(g.name)}</div>${cs.map(row).join('')}`;
    }
    return html || '<p class="muted">Aucune catégorie.</p>';
  };
  openSheet({
    title: 'Catégorie',
    body: `<input class="input" data-q placeholder="Rechercher…" autocomplete="off" /><div data-list>${render('')}</div>`,
    onMount(sheet, close) {
      const list = $('[data-list]', sheet);
      $('[data-q]', sheet).addEventListener('input', (e) => (list.innerHTML = render(e.target.value)));
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('.pickrow');
        if (b) {
          onPick(b.dataset.id);
          close();
        }
      });
    },
  });
}

// ---------- Comptes ----------
export function accountForm(ctx, account, after) {
  const types = Object.entries(ACCOUNT_TYPES);
  const a = account || { name: '', type: 'checking', openingBalance: '', onBudget: true };
  formSheet({
    title: account ? 'Modifier le compte' : 'Nouveau compte',
    body: `${field('Nom', 'name', textInput('name', a.name, { ph: 'ex. Compte courant' }))}
      ${field('Type', 'type', chipsField('type', types, a.type))}
      ${field('Solde initial', 'openingBalance', moneyInput('openingBalance', a.openingBalance === '' ? '' : a.openingBalance))}
      ${switchField('onBudget', a.onBudget, 'Inclure dans le budget', "L'argent de ce compte alimente « Prêt à assigner »")}`,
    submit: account ? 'Enregistrer' : 'Créer le compte',
    extra: account ? `<button class="btn danger" data-del>Supprimer</button>` : '',
    onChange: (v, sheet) => {
      if (!account) $('[data-field="onBudget"]', sheet).setAttribute('aria-checked', String(v.type !== 'savings'));
    },
    onSubmit: (v) => {
      const r = account ? ctx.store.updateAccount(account.id, v) : ctx.store.addAccount(v);
      if (r.ok) after?.(r.value);
      return r;
    },
  });
  if (account) {
    setTimeout(() => {
      const btn = document.querySelector('.sheet [data-del]');
      btn?.addEventListener('click', async () => {
        const n = ctx.store.accountUsage(account.id);
        const yes = await confirmDialog({ title: 'Supprimer ce compte ?', text: n ? `Ses ${n} transaction(s) seront aussi supprimées. Cette action est définitive.` : 'Cette action est définitive.' });
        if (yes) {
          ctx.store.deleteAccount(account.id);
          document.querySelector('.sheet [data-close]')?.click();
          toast('Compte supprimé.');
          after?.(null);
        }
      });
    }, 300);
  }
}

// ---------- Groupes & catégories ----------
export function groupForm(ctx, group) {
  const g = group || { name: '', icon: '📁' };
  formSheet({
    title: group ? 'Modifier le groupe' : 'Nouveau groupe',
    body: `${field('Nom', 'name', textInput('name', g.name, { ph: 'ex. Projets' }))}${field('Icône', 'icon', emojiField('icon', g.icon))}`,
    onSubmit: (v) => (group ? ctx.store.updateGroup(group.id, v) : ctx.store.addGroup(v)),
  });
}

export function groupDelete(ctx, group) {
  const targets = ctx.s().groups.filter((g) => g.id !== group.id && g.kind !== 'income');
  const has = ctx.s().categories.some((c) => c.groupId === group.id);
  if (has && !targets.length) return toast('Créez un autre groupe pour y déplacer ses catégories.', { kind: 'warn' });
  formSheet({
    title: 'Supprimer le groupe',
    body: `<p class="muted">${has ? 'Ses catégories seront déplacées vers le groupe choisi.' : 'Ce groupe est vide.'}</p>${has ? field('Déplacer vers', 'targetId', chipsField('targetId', targets.map((g) => [g.id, `${g.icon} ${g.name}`]), targets[0].id)) : ''}`,
    submit: 'Supprimer',
    onSubmit: (v) => ctx.store.deleteGroup(group.id, { targetId: v.targetId }),
  });
}

export function categoryForm(ctx, { cat, groupId }) {
  const c = cat || { name: '', icon: '📦', target: '' };
  const sheet = formSheet({
    title: cat ? 'Modifier la catégorie' : 'Nouvelle catégorie',
    body: `${field('Nom', 'name', textInput('name', c.name, { ph: 'ex. Café Hassan' }))}
      ${field('Icône', 'icon', emojiField('icon', c.icon))}
      ${field('Budget mensuel habituel (optionnel)', 'target', moneyInput('target', c.target || ''))}`,
    extra: cat ? `<button class="btn danger" data-del>Supprimer</button>` : '',
    onSubmit: (v) => (cat ? ctx.store.updateCategory(cat.id, v) : ctx.store.addCategory({ ...v, groupId })),
  });
  if (cat) {
    $('[data-del]', sheet.el).addEventListener('click', () => {
      sheet.close();
      categoryDelete(ctx, cat);
    });
  }
}

export function categoryDelete(ctx, cat) {
  const s = ctx.s();
  const kind = s.groups.find((g) => g.id === cat.groupId)?.kind === 'income';
  const usage = ctx.store.categoryUsage(cat.id);
  const used = usage.transactions + usage.recurring;
  const targets = s.categories.filter((x) => x.id !== cat.id && (s.groups.find((g) => g.id === x.groupId)?.kind === 'income') === kind);
  if (!used) {
    confirmDialog({ title: `Supprimer « ${cat.name} » ?`, text: 'Cette catégorie n’est utilisée par aucune transaction.' }).then((y) => y && (ctx.store.deleteCategory(cat.id), toast('Catégorie supprimée.')));
    return;
  }
  formSheet({
    title: `Supprimer « ${cat.name} »`,
    body: `<p class="muted">${usage.transactions} transaction(s) et ${usage.recurring} récurrence(s) utilisent cette catégorie. Choisissez où les déplacer.</p>${field('Déplacer vers', 'targetId', `<div class="chipbar" data-field="targetId" data-kind="chips" style="flex-wrap:wrap">${targets.slice(0, 40).map((t) => `<button type="button" class="chip" data-val="${esc(t.id)}" aria-pressed="false">${t.icon} ${esc(t.name)}</button>`).join('')}</div>`)}`,
    submit: 'Déplacer et supprimer',
    onSubmit: (v) => ctx.store.deleteCategory(cat.id, { mode: 'reassign', targetId: v.targetId }),
  });
}

/** Saisie du budget assigné d'une catégorie pour un mois. */
export function assignSheet(ctx, { cat, month, assigned, income }) {
  const prev = ctx.prevAssigned(cat.id, month);
  formSheet({
    title: `${cat.icon} ${cat.name}`,
    body: `${field(income ? 'Montant attendu ce mois' : 'Budget assigné ce mois', 'amount', moneyInput('amount', assigned || ''))}
      <div class="chipbar">${prev ? `<button class="chip" data-fill="${prev}">Mois précédent : ${formatNumber(prev)}</button>` : ''}${cat.target ? `<button class="chip" data-fill="${cat.target}">Habituel : ${formatNumber(cat.target)}</button>` : ''}</div>
      <div class="btnrow"><button class="btn" data-edit>${ic('edit', 18)} Modifier</button><button class="btn" data-tx>${ic('history', 18)} Transactions</button></div>`,
    submit: 'Enregistrer',
    onSubmit: (v) => ctx.store.setAssignment(month, cat.id, v.amount),
  }).el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fill]');
    if (f) $('[data-field="amount"]').value = String(f.dataset.fill).replace('.', ',');
    if (e.target.closest('[data-edit]')) {
      document.querySelector('.sheet [data-close]').click();
      setTimeout(() => categoryForm(ctx, { cat }), 250);
    }
    if (e.target.closest('[data-tx]')) {
      document.querySelector('.sheet [data-close]').click();
      ctx.go(`#/historique?cat=${encodeURIComponent(cat.id)}`);
    }
  });
}

// ---------- Actifs ----------
export function assetForm(ctx, asset) {
  const kinds = Object.entries(ASSET_KINDS);
  const cur = asset ? asset.history[asset.history.length - 1].value : '';
  const sheet = formSheet({
    title: asset ? 'Modifier' : 'Nouvel actif ou crédit',
    body: `${asset ? '' : field('Type', 'kind', chipsField('kind', kinds.map(([k, l]) => [k, `${ASSET_ICONS[k]} ${l}`]), 'immobilier'))}
      ${field('Nom', 'name', textInput('name', asset?.name || '', { ph: 'ex. Appartement Mimosas' }))}
      ${asset ? '' : field('Valeur (ou capital restant dû pour un crédit)', 'value', moneyInput('value', cur))}
      ${asset ? '' : field('À la date du', 'date', textInput('date', today(), { type: 'date' }))}
      ${field('Mensualité (crédit)', 'monthlyPayment', moneyInput('monthlyPayment', asset?.monthlyPayment || ''))}`,
    extra: asset ? `<button class="btn danger" data-del>Supprimer</button>` : '',
    onSubmit: (v) => (asset ? ctx.store.updateAsset(asset.id, v) : ctx.store.addAsset(v)),
  });
  if (asset) {
    $('[data-del]', sheet.el).addEventListener('click', async () => {
      if (await confirmDialog({ title: 'Supprimer ?', text: `« ${asset.name} » et son historique seront supprimés.` })) {
        ctx.store.deleteAsset(asset.id);
        sheet.close();
        toast('Supprimé.');
      }
    });
  }
}
export function assetValueForm(ctx, asset) {
  const cur = asset.history[asset.history.length - 1].value;
  formSheet({
    title: `Mettre à jour la valeur`,
    body: `<p class="muted">${esc(asset.name)} — l'historique est conservé pour la courbe du patrimoine.</p>${field('Nouvelle valeur', 'value', moneyInput('value', cur))}${field('À la date du', 'date', textInput('date', today(), { type: 'date' }))}`,
    onSubmit: (v) => ctx.store.setAssetValue(asset.id, v.value, v.date),
  });
}

// ---------- Dettes ----------
export function debtForm(ctx, direction = 'i_owe') {
  formSheet({
    title: 'Nouvelle dette / créance',
    body: `${field('Sens', 'direction', chipsField('direction', [['i_owe', 'Je dois'], ['owed_to_me', 'On me doit']], direction))}
      ${field('Personne ou organisme', 'person', textInput('person', '', { ph: 'ex. Karim' }))}
      ${field('Montant', 'amount', moneyInput('amount'))}
      ${field('Échéance (optionnel)', 'dueDate', textInput('dueDate', '', { type: 'date' }))}
      ${field('Note (optionnel)', 'note', textInput('note', ''))}`,
    onSubmit: (v) => ctx.store.addDebt(v),
  });
}
export function debtPayForm(ctx, debt, rest) {
  formSheet({
    title: debt.direction === 'i_owe' ? 'Rembourser' : 'Encaisser',
    body: `<p class="muted">${esc(debt.person)} — reste ${ctx.fmt(rest)}</p>${field('Montant', 'amount', moneyInput('amount', rest))}`,
    onSubmit: (v) => ctx.store.payDebt(debt.id, v.amount),
  });
}

// ---------- Objectifs & habitudes ----------
export function goalForm(ctx, goal) {
  const g = goal || { name: '', icon: '🎯', target: '', saved: '', deadline: '' };
  const sheet = formSheet({
    title: goal ? 'Modifier l’objectif' : 'Nouvel objectif',
    body: `${field('Nom', 'name', textInput('name', g.name, { ph: 'ex. Voyage, fonds d’urgence' }))}${field('Icône', 'icon', emojiField('icon', g.icon))}
      ${field('Montant à atteindre', 'target', moneyInput('target', g.target))}${field('Déjà épargné', 'saved', moneyInput('saved', g.saved))}
      ${field('Date cible (optionnel)', 'deadline', textInput('deadline', g.deadline, { type: 'date' }))}`,
    extra: goal ? `<button class="btn danger" data-del>Supprimer</button>` : '',
    onSubmit: (v) => (goal ? ctx.store.updateGoal(goal.id, v) : ctx.store.addGoal(v)),
  });
  if (goal) {
    $('[data-del]', sheet.el).addEventListener('click', async () => {
      if (await confirmDialog({ title: 'Supprimer l’objectif ?', text: `« ${goal.name} » sera supprimé.` })) {
        ctx.store.deleteGoal(goal.id);
        sheet.close();
      }
    });
  }
}
export function contributeForm(ctx, goal) {
  formSheet({
    title: `${goal.icon} ${goal.name}`,
    body: `${field('Opération', 'dir', chipsField('dir', [['add', 'Ajouter'], ['sub', 'Retirer']], 'add'))}${field('Montant', 'amount', moneyInput('amount'))}`,
    onSubmit: (v) => {
      const n = ctx.parse(v.amount);
      if (Number.isNaN(n) || n <= 0) return { ok: false, errors: { amount: 'Montant invalide.' } };
      return ctx.store.contributeGoal(goal.id, v.dir === 'sub' ? -n : n);
    },
  });
}
export function habitForm(ctx) {
  formSheet({
    title: 'Nouvelle habitude',
    body: `${field('Nom', 'name', textInput('name', '', { ph: 'ex. Noter mes dépenses du jour' }))}${field('Icône', 'icon', emojiField('icon', '⭐'))}`,
    onSubmit: (v) => ctx.store.addHabit(v),
  });
}
