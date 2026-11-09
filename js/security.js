// Verrouillage par code PIN (4 chiffres). Le PIN est dérivé avec PBKDF2-SHA256 + sel aléatoire :
// seul l'empreinte est stockée, jamais le PIN. NB : c'est un verrou d'accès à l'application, pas un chiffrement des données.
import { $, esc } from './ui/dom.js';

const ITERATIONS = 150_000;
const PIN_LENGTH = 4;
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const pinSupported = () => !!globalThis.crypto?.subtle;
export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

export async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}
export const verifyPin = async (pin, hash, salt) => (await hashPin(pin, salt)) === hash;

// Limitation des essais (en mémoire) : 5 erreurs → 30 s d'attente.
let failures = 0;
let blockedUntil = 0;
export const attempts = {
  blockedFor: () => Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000)),
  fail() {
    if (++failures >= 5) {
      failures = 0;
      blockedUntil = Date.now() + 30_000;
    }
  },
  ok() {
    failures = 0;
  },
};

/**
 * Affiche un pavé numérique plein écran. Résout avec le PIN accepté, ou null si annulé.
 * validate(pin) → Promise<string|null> : message d'erreur, ou null si le PIN est accepté.
 */
export function askPin({ title, subtitle = '', validate = async () => null, cancellable = true, extra = '', onExtra }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'lock';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', title);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', cancellable ? 'cancel' : '', '0', 'back'];
    root.innerHTML = `<div style="font-size:44px" aria-hidden="true">🔒</div>
      <div><h1>${esc(title)}</h1>${subtitle ? `<p class="muted" style="text-align:center;margin-top:4px">${esc(subtitle)}</p>` : ''}</div>
      <div class="dots" aria-hidden="true">${'<i></i>'.repeat(PIN_LENGTH)}</div>
      <p class="err" role="alert"></p>
      <div class="pad">${keys.map((k) => (k === '' ? '<span></span>' : k === 'cancel' ? '<button class="ghost" data-k="cancel" aria-label="Annuler">✕</button>' : k === 'back' ? '<button class="ghost" data-k="back" aria-label="Effacer">⌫</button>' : `<button data-k="${k}">${k}</button>`)).join('')}</div>
      ${extra ? `<button class="link" data-extra style="color:var(--primary);font-weight:600">${esc(extra)}</button>` : ''}`;
    document.getElementById('lock-root').appendChild(root);

    let pin = '';
    let busy = false;
    const dots = $('.dots', root);
    const errEl = $('.err', root);
    const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const finish = (v) => {
      document.removeEventListener('keydown', onKey);
      root.remove();
      resolve(v);
    };
    const press = async (k) => {
      if (busy) return;
      if (k === 'cancel') return finish(null);
      if (k === 'back') pin = pin.slice(0, -1);
      else if (/^\d$/.test(k) && pin.length < PIN_LENGTH) pin += k;
      errEl.textContent = '';
      paint();
      if (pin.length < PIN_LENGTH) return;
      busy = true;
      const err = await validate(pin);
      busy = false;
      if (!err) return finish(pin);
      pin = '';
      paint();
      errEl.textContent = err;
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
      navigator.vibrate?.(60);
    };
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Escape' && cancellable) press('cancel');
    };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) press(b.dataset.k);
      if (e.target.closest('[data-extra]')) onExtra?.();
    });
  });
}

/** Écran de verrouillage de l'application. Résout quand le PIN est correct (ou après réinitialisation). */
export function lockScreen(ctx, { confirmDialog, toast }) {
  const { hash, salt } = { hash: ctx.store.getState().settings.pinHash, salt: ctx.store.getState().settings.pinSalt };
  document.body.classList.add('locked');
  return askPin({
    title: 'Kanz',
    subtitle: 'Entrez votre code PIN',
    cancellable: false,
    extra: 'PIN oublié ?',
    onExtra: async () => {
      const yes = await confirmDialog({
        title: 'PIN oublié ?',
        text: "Le PIN ne peut pas être récupéré. Vous pouvez effacer toutes les données de l'application pour la débloquer, puis restaurer une sauvegarde exportée.",
        confirm: 'Tout effacer',
      });
      if (yes) {
        ctx.store.resetAll();
        document.body.classList.remove('locked');
        document.querySelector('.lock')?.remove();
        toast('Application réinitialisée.');
        location.reload();
      }
    },
    validate: async (pin) => {
      const wait = attempts.blockedFor();
      if (wait > 0) return `Trop d'essais. Réessayez dans ${wait} s.`;
      if (await verifyPin(pin, hash, salt)) {
        attempts.ok();
        return null;
      }
      attempts.fail();
      const w = attempts.blockedFor();
      return w > 0 ? `Trop d'essais. Réessayez dans ${w} s.` : 'PIN incorrect.';
    },
  }).then((v) => {
    document.body.classList.remove('locked');
    return v;
  });
}

/** Parcours de configuration : 'setup' | 'change' | 'disable'. Retourne true si le réglage a changé. */
export async function runPinFlow(ctx, kind, { toast }) {
  const { store } = ctx;
  const { pinHash, pinSalt } = store.getState().settings;
  if (!pinSupported()) {
    toast('Le verrouillage par PIN nécessite une connexion sécurisée (HTTPS ou localhost).', { kind: 'bad', ms: 6000 });
    return false;
  }
  if (kind !== 'setup') {
    const current = await askPin({
      title: 'PIN actuel',
      subtitle: kind === 'disable' ? 'Confirmez pour désactiver le verrouillage' : 'Confirmez avant de le modifier',
      validate: async (p) => {
        const wait = attempts.blockedFor();
        if (wait > 0) return `Trop d'essais. Réessayez dans ${wait} s.`;
        if (await verifyPin(p, pinHash, pinSalt)) return (attempts.ok(), null);
        attempts.fail();
        return 'PIN incorrect.';
      },
    });
    if (current == null) return false;
    if (kind === 'disable') {
      store.updateSettings({ pinHash: null, pinSalt: null });
      toast('Verrouillage désactivé.');
      return true;
    }
  }
  const first = await askPin({ title: 'Nouveau PIN', subtitle: `Choisissez ${PIN_LENGTH} chiffres` });
  if (first == null) return false;
  const second = await askPin({ title: 'Confirmez le PIN', subtitle: 'Saisissez-le une seconde fois', validate: async (p) => (p === first ? null : 'Les deux codes ne correspondent pas.') });
  if (second == null) return false;
  const salt = newSalt();
  store.updateSettings({ pinHash: await hashPin(first, salt), pinSalt: salt });
  toast('🔒 Verrouillage par PIN activé.');
  return true;
}
