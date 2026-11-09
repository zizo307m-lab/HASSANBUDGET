import { $, esc, toast, confirmDialog } from '../ui/dom.js';
import { pageHead } from '../ui/common.js';
import { CURRENCIES } from '../utils.js';
import { exportJSON, exportTransactionsCSV } from '../storage.js';
import { runPinFlow, pinSupported } from '../security.js';
import { notificationsSupported, requestNotifications } from '../notify.js';
import { applyTheme } from '../ui/theme.js';

const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const sw = (act, on, title, sub) => `<div class="switchrow"><div><b>${title}</b><small>${sub}</small></div><button class="sw" role="switch" aria-checked="${on}" data-act="${act}" aria-label="${title}"></button></div>`;
const link = (act, title, sub) => `<button class="menu-item" data-act="${act}" style="padding:13px 16px"><span><b style="font-size:17px">${title}</b><small>${sub}</small></span></button>`;

export default {
  render(ctx) {
    const s = ctx.s().settings;
    return `${pageHead('Paramètres')}
    <div class="field"><label>Votre prénom</label><input class="input" data-input="name" value="${esc(s.name)}" placeholder="ex. Moha" maxlength="30" /></div>
    <div class="field"><label>Apparence</label><div class="seg">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<button data-act="theme" data-v="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join('')}</div></div>
    <div class="field"><label>Devise</label><div class="chipbar">${Object.keys(CURRENCIES).map((c) => `<button class="chip" data-act="cur" data-v="${c}" aria-pressed="${s.currency === c}">${c}</button>`).join('')}</div></div>
    ${sw('hide', s.hideAmounts, 'Masquer les montants', 'Équivalent de l’œil de l’accueil')}
    ${sw('notif', s.notifications, 'Alertes de dépassement', notificationsSupported() ? 'Notification quand une enveloppe est dépassée' : 'Non pris en charge sur cet appareil')}
    ${s.pinHash ? `<div class="btnrow"><button class="btn" data-act="pin" data-k="change">Changer le PIN</button><button class="btn danger" data-act="pin" data-k="disable">Désactiver le PIN</button></div>` : sw('pin-on', false, 'Verrouillage par PIN', pinSupported() ? 'Code à 4 chiffres demandé à l’ouverture' : 'Nécessite HTTPS')}
    <div class="section-title">Données</div>
    ${link('exp-json', 'Sauvegarde complète (JSON)', 'Toutes vos données, sans le PIN')}
    ${link('exp-csv', 'Exporter les transactions (CSV)', 'Pour Excel ou Google Sheets')}
    ${link('imp', 'Restaurer une sauvegarde', 'Remplace les données actuelles')}
    ${link('demo', 'Charger des données de démonstration', 'Remplace vos données par un exemple de 3 mois')}
    ${link('reset', 'Tout effacer', 'Supprime définitivement les données de cet appareil')}
    <input type="file" accept="application/json,.json" data-file data-change="file" class="hide" />
    <p class="hint">Kanz · version 1.0 · vos données restent sur cet appareil.</p>`;
  },
  actions: {
    theme: (el, ctx) => (ctx.store.updateSettings({ theme: el.dataset.v }), applyTheme(ctx.s().settings.theme)),
    cur: (el, ctx) => ctx.store.updateSettings({ currency: el.dataset.v }),
    hide: (el, ctx) => ctx.store.updateSettings({ hideAmounts: !ctx.s().settings.hideAmounts }),
    async notif(el, ctx) {
      if (ctx.s().settings.notifications) return ctx.store.updateSettings({ notifications: false });
      const r = await requestNotifications();
      ctx.store.updateSettings({ notifications: r === 'granted' });
      if (r !== 'granted') toast('Notifications non autorisées sur cet appareil.', { kind: 'warn' });
    },
    'pin-on': async (el, ctx) => {
      await runPinFlow(ctx, 'setup', { toast });
      ctx.rerender();
    },
    pin: async (el, ctx) => {
      await runPinFlow(ctx, el.dataset.k, { toast });
      ctx.rerender();
    },
    'exp-json': (el, ctx) => (download(`kanz-sauvegarde-${ctx.now()}.json`, exportJSON(ctx.s()), 'application/json'), toast('Sauvegarde téléchargée.')),
    'exp-csv': (el, ctx) => (download(`kanz-transactions-${ctx.now()}.csv`, exportTransactionsCSV(ctx.s()), 'text/csv;charset=utf-8'), toast('Export CSV téléchargé.')),
    imp: () => $('[data-file]').click(),
    async demo(el, ctx) {
      if (await confirmDialog({ title: 'Charger la démo ?', text: 'Vos données actuelles seront remplacées par un exemple.', confirm: 'Charger', danger: false })) {
        ctx.store.loadDemo();
        toast('Données de démonstration chargées.');
        ctx.go('#/home');
      }
    },
    async reset(el, ctx) {
      if (await confirmDialog({ title: 'Tout effacer ?', text: 'Comptes, transactions, budgets, objectifs : tout sera supprimé de cet appareil.', confirm: 'Tout effacer' })) {
        ctx.store.resetAll();
        applyTheme('auto');
        toast('Données effacées.');
        ctx.go('#/home');
      }
    },
  },
  inputs: { name: (el, ctx) => ctx.store.updateSettings({ name: el.value }, { silent: true }) },
  changes: {
    async file(el, ctx) {
      const f = el.files?.[0];
      el.value = '';
      if (!f) return;
      let raw;
      try {
        raw = JSON.parse(await f.text());
      } catch {
        return toast('Ce fichier n’est pas un JSON valide.', { kind: 'bad' });
      }
      if (!(await confirmDialog({ title: 'Restaurer cette sauvegarde ?', text: 'Vos données actuelles seront remplacées.', confirm: 'Restaurer', danger: false }))) return;
      const r = ctx.store.importData(raw);
      if (r.ok) toast('Sauvegarde restaurée.');
      else toast(r.error || 'Import impossible.', { kind: 'bad', ms: 6000 });
    },
  },
};
