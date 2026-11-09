// Helpers DOM : échappement, feuilles (bottom sheets), boîtes de dialogue, toasts. Aucune logique métier.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const vibrate = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

// ---------- Feuilles ----------
const sheets = [];

export function openSheet({ title, body, footer = '', onMount, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">✕</button></header>
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </section>`;
  document.getElementById('sheet-root').appendChild(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));

  const entry = { wrap, closed: false };
  const sheet = $('.sheet', wrap);
  const close = () => {
    if (entry.closed) return;
    entry.closed = true;
    sheets.splice(sheets.indexOf(entry), 1);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 220);
    onClose?.();
  };
  entry.close = close;
  sheets.push(entry);
  $('.sheet-backdrop', wrap).addEventListener('click', close);
  $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
  onMount?.(sheet, close);
  return { close, el: sheet };
}

export const closeAllSheets = () => [...sheets].forEach((s) => s.close());
export const hasOpenSheet = () => sheets.length > 0;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close();
});

/** Affiche les erreurs de validation dans les <p class="err" data-err="champ">. */
export function showErrors(root, errors = {}) {
  $$('[data-err]', root).forEach((p) => (p.textContent = errors[p.dataset.err] || ''));
  const first = Object.keys(errors).find((k) => $(`[data-err="${k}"]`, root));
  if (first) {
    const field = $(`[data-field="${first}"]`, root) || $(`[data-err="${first}"]`, root);
    field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    if (field?.focus && field.tagName === 'INPUT') field.focus();
  }
  if (errors._) toast(errors._, { kind: 'bad' });
}

/** Groupe de pastilles à sélection unique. Retourne { get, set }. */
export function chipGroup(container, { initial = null, allowEmpty = false, onChange } = {}) {
  let value = initial;
  const paint = () => $$('.chip[data-val]', container).forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.val === String(value))));
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-val]');
    if (!chip || !container.contains(chip)) return;
    value = allowEmpty && String(value) === chip.dataset.val ? null : chip.dataset.val;
    paint();
    onChange?.(value);
  });
  paint();
  return { get: () => value, set: (v) => ((value = v), paint()), paint };
}

// ---------- Dialogue de confirmation ----------
export function confirmDialog({ title, text, confirm = 'Supprimer', cancel = 'Annuler', danger = true }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
      <h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="actions"><button class="btn" data-no>${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(confirm)}</button></div></div>`;
    document.body.appendChild(wrap);
    const done = (v) => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      resolve(v);
    };
    const onKey = (e) => e.key === 'Escape' && done(false);
    document.addEventListener('keydown', onKey);
    $('[data-no]', wrap).onclick = () => done(false);
    $('[data-yes]', wrap).onclick = () => done(true);
    wrap.addEventListener('click', (e) => e.target === wrap && done(false));
    $('[data-no]', wrap).focus();
  });
}

// ---------- Toasts ----------
let toastTimer = null;
export function toast(message, { action, onAction, ms = 4500, kind = '' } = {}) {
  const root = document.getElementById('toast-root');
  clearTimeout(toastTimer);
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  root.appendChild(el);
  if (action) {
    $('button', el).onclick = () => {
      el.remove();
      onAction?.();
    };
  }
  toastTimer = setTimeout(() => el.remove(), ms);
}
