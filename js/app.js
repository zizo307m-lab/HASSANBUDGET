// Point d'entrée : contexte partagé, routeur par hash, délégation d'événements, verrouillage PIN, thème.
import { createStorage } from './storage.js';
import { createStore } from './store.js';
import { accountBalances } from './calc.js';
import { formatNumber, formatMoney, parseAmount, today, shiftMonth } from './utils.js';
import { $, $$, confirmDialog, toast, closeAllSheets } from './ui/dom.js';
import { applyTheme } from './ui/theme.js';
import { lockScreen } from './security.js';
import { notify } from './notify.js';
import home from './screens/home.js';
import { transactions, historique } from './screens/transactions.js';
import add from './screens/add.js';
import budget from './screens/budget.js';
import menu from './screens/menu.js';
import analyse from './screens/analyse.js';
import { patrimoine, comptes, actifs, dettes, prevision } from './screens/wealth.js';
import { objectifs, habitudes, assistant, recurrents } from './screens/life.js';
import settings from './screens/settings.js';

const SCREENS = { home, transactions, ajouter: add, budget, menu, analyse, patrimoine, comptes, actifs, dettes, prevision, historique, objectifs, habitudes, assistant, recurrents, parametres: settings };
const TAB_OF = { home: 'home', transactions: 'transactions', budget: 'budget', recurrents: 'budget', ajouter: 'ajouter' };

const storage = createStorage();
const store = createStore(storage);
const mount = $('#app');

const cur = () => store.getState().settings.currency || 'MAD';
const hidden = () => store.getState().settings.hideAmounts;
const ctx = {
  store,
  s: () => store.getState(),
  now: () => today(),
  fmt: (n, o) => (hidden() ? `•••• ${cur()}` : formatMoney(n, cur(), o)),
  fmtN: (n, o) => (hidden() ? '••••' : formatNumber(n, o)),
  parse: parseAmount,
  toast,
  balances: () => accountBalances(store.getState(), today()),
  prevAssigned: (catId, month) => Number(store.getState().assignments[shiftMonth(month, -1)]?.[catId]) || 0,
  go: (to, o = {}) => navigate(to, o),
  back: (fallback = '#/home') => {
    if ((history.state?.d || 0) > 0) history.back();
    else navigate(fallback, { replace: true });
  },
  rerender: (o) => render(o),
};

// ---------- Routeur ----------
let current = { name: 'home', params: {}, screen: home };
const parse = (hash) => {
  const [path, query = ''] = (hash || '#/home').replace(/^#\/?/, '').split('?');
  const [name, id] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(query));
  if (id) params.id = decodeURIComponent(id);
  return { name: SCREENS[name] ? name : 'home', params };
};

function navigate(to, { replace = false, tab = false } = {}) {
  const d = history.state?.d || 0;
  if (replace || tab) history.replaceState({ d: tab ? 0 : d }, '', to);
  else history.pushState({ d: d + 1 }, '', to);
  route(true);
}

function route(fresh) {
  closeAllSheets();
  const r = parse(location.hash);
  current = { ...r, screen: SCREENS[r.name] };
  current.screen.enter?.(ctx, r.params);
  render({ scrollTop: fresh !== false });
}

function render({ keepFocus, scrollTop } = {}) {
  const { screen, name } = current;
  const y = window.scrollY;
  const ae = document.activeElement;
  const caret = keepFocus && ae ? [ae.selectionStart, ae.selectionEnd] : null;
  const html = screen.render(ctx, current.params);
  mount.innerHTML = screen.full ? html : `<div class="screen">${html}</div>`;
  document.body.classList.toggle('nonav', !!screen.hideNav);
  const tab = TAB_OF[name] || 'menu';
  $$('#nav a').forEach((a) => (a.dataset.tab === tab && !screen.hideNav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  window.scrollTo(0, scrollTop ? 0 : y);
  if (keepFocus) {
    const el = $(keepFocus);
    if (el) {
      el.focus();
      if (caret) el.setSelectionRange?.(...caret);
    }
  } else if (scrollTop && screen.autofocus) {
    const el = $(screen.autofocus);
    if (el && !matchMedia('(pointer: coarse)').matches) el.focus();
  }
  document.body.classList.add('ready');
}

// ---------- Événements ----------
const globals = {
  go: (el) => navigate(el.dataset.to),
  tab: (el) => navigate(el.dataset.to, { tab: true }),
  back: () => ctx.back(),
  eye: () => store.updateSettings({ hideAmounts: !hidden() }),
  tip: (el) => store.dismissTip(el.dataset.key),
  tx: (el) => navigate(`#/ajouter/${encodeURIComponent(el.dataset.id)}`),
};
let swallow = 0;
document.addEventListener(
  'click',
  (e) => {
    if (Date.now() < swallow) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true,
);
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('.sheet-wrap') || el.closest('.dialog-wrap')) return;
  const fn = current.screen.actions?.[el.dataset.act] || globals[el.dataset.act];
  if (fn) fn(el, ctx, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && !el.closest('.sheet-wrap')) current.screen.inputs?.[el.dataset.input]?.(el, ctx, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) current.screen.changes?.[el.dataset.change]?.(el, ctx, e);
  const d = e.target.closest('[data-input="date"]');
  if (d) current.screen.inputs?.date?.(d, ctx, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-act-submit]');
  if (!f) return;
  e.preventDefault();
  current.screen.submit?.[f.dataset.actSubmit]?.(f, ctx);
});

// Appui long (renommer / supprimer un groupe)
let lp = null;
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-longpress]');
  if (!el) return;
  const x = e.clientX;
  const y = e.clientY;
  lp = { x, y, t: setTimeout(() => ((swallow = Date.now() + 700), (lp = null), navigator.vibrate?.(15), current.screen.actions?.[el.dataset.longpress]?.(el, ctx)), 520) };
});
const cancelLp = () => (lp && (clearTimeout(lp.t), (lp = null)));
document.addEventListener('pointerup', cancelLp);
document.addEventListener('pointercancel', cancelLp);
document.addEventListener('pointermove', (e) => lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 9 && cancelLp());
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-longpress]');
  if (el) {
    e.preventDefault();
    current.screen.actions?.[el.dataset.longpress]?.(el, ctx);
  }
});

// Curseur des courbes (toucher / glisser)
let scrub = null;
const scrubAt = (e) => {
  const svg = scrub.card.querySelector('svg[data-n]');
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  const n = Number(svg.dataset.n);
  const idx = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (n - 1));
  if (idx === scrub.last) return;
  scrub.last = idx;
  current.screen.scrub?.(scrub.card.dataset.scrubCard || scrub.card.dataset.card, idx, ctx, scrub.card);
};
document.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('[data-scrub-card]');
  if (!card || !e.target.closest('[data-scrub]')) return;
  scrub = { card, last: -1 };
  try {
    card.setPointerCapture(e.pointerId);
  } catch {}
  scrubAt(e);
});
document.addEventListener('pointermove', (e) => scrub && scrubAt(e));
const endScrub = () => (scrub = null);
document.addEventListener('pointerup', endScrub);
document.addEventListener('pointercancel', endScrub);

window.addEventListener('popstate', () => route(true));

// ---------- Démarrage ----------
store.subscribe(() => {
  applyTheme(store.getState().settings.theme);
  render();
});
store.on('overspent', ({ category, available }) => {
  if (store.getState().settings.notifications) notify('Enveloppe dépassée', `« ${category.name} » : ${ctx.fmt(-available)} au-dessus du budget.`);
});

async function boot() {
  applyTheme(store.getState().settings.theme);
  if (store.getState().settings.pinHash) await lockScreen(ctx, { confirmDialog, toast });
  const created = store.runRecurring(today());
  route(true);
  if (created) toast(`${created} brouillon${created > 1 ? 's' : ''} à confirmer (transactions récurrentes).`, { action: 'Voir', onAction: () => navigate('#/historique?status=draft') });
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) return void (hiddenAt = Date.now());
  const s = store.getState().settings;
  if (s.pinHash && hiddenAt && Date.now() - hiddenAt > 60_000 && !document.querySelector('.lock')) {
    mount.innerHTML = '';
    await lockScreen(ctx, { confirmDialog, toast });
    render();
  }
  store.runRecurring(today());
  render();
});
storage.onError(() => toast('Stockage plein ou indisponible : exportez une sauvegarde.', { kind: 'bad', ms: 8000 }));
window.addEventListener('pagehide', () => store.flush());
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
