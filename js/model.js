// Modèle de données par défaut : comptes, groupes, catégories, et jeu de démonstration.
import { addDays, monthKey, monthStart, nthOccurrence, parseISO, shiftMonth, monthsBetween, toISO, today, pad } from './utils.js';

export const SCHEMA_VERSION = 1;

/** Palette observée sur l'application de référence (relevée sur captures). */
export const PALETTE = {
  lime: '#B3DC62', limeSoft: '#EAF6C8', limeDisabled: '#D9EFB1', dark: '#102422', dark2: '#283B39',
  green: '#244C44', line: '#2C5E53', card: '#F4F4F4', input: '#EAEEED', tip: '#EEF2F1',
};

export const GROUP_KINDS = { income: 'Revenus', fixed: 'Dépenses fixes', variable: 'Dépenses variables', custom: 'Personnalisé' };
export const ACCOUNT_TYPES = { checking: 'Compte courant', cash: 'Espèces', savings: 'Épargne', card: 'Carte' };
export const ASSET_KINDS = { immobilier: 'Immobilier', or: 'Or', bourse: 'Bourse', autre: 'Autre actif', credit: 'Crédit' };
export const ASSET_ICONS = { immobilier: '🏠', or: '🥇', bourse: '📈', autre: '💎', credit: '🏦' };
export const ICONS = ['💼', '🎁', '🏠', '🛒', '🚗', '👨‍👩‍👧', '🛍️', '🎯', '💰', '📦', '💡', '💧', '📶', '📱', '🍽️', '🥕', '🥩', '⛽', '🏫', '👕', '💊', '⚽', '🎬', '✈️', '🐾', '🧴', '🧹', '☕', '🏦', '📚', '🔧', '🧸', '🛋️', '🎟️', '📌', '🧺', '🐷', '🚌', '🥖', '🔌'];

const C = (id, groupId, name, icon, target = 0) => ({ id, groupId, name, icon, target });

export function defaultGroups() {
  return [
    { id: 'g_income', name: 'Revenus', icon: '💼', kind: 'income', order: 0 },
    { id: 'g_fixed', name: 'Dépenses fixes', icon: '📌', kind: 'fixed', order: 1 },
    { id: 'g_variable', name: 'Dépenses variables', icon: '🧺', kind: 'variable', order: 2 },
  ];
}

export function defaultCategories() {
  return [
    // Revenus
    C('i_salaire', 'g_income', 'Salaire net', '💼'),
    C('i_conjoint', 'g_income', 'Salaire conjoint', '👩‍💼'),
    C('i_prime', 'g_income', 'Prime', '🎁'),
    C('i_locatif', 'g_income', 'Revenus locatifs', '🏘️'),
    C('i_freelance', 'g_income', 'Missions & freelance', '💻'),
    C('i_secondaire', 'g_income', 'Revenus secondaires', '🧾'),
    C('i_rembours', 'g_income', 'Remboursements', '↩️'),
    C('i_aides', 'g_income', 'Allocations & aides', '🤝'),
    C('i_autres', 'g_income', 'Autres revenus', '💰'),
    // Dépenses fixes
    C('f_loyer', 'g_fixed', 'Loyer / Crédit', '🏠'),
    C('f_energie', 'g_fixed', 'Eau & Électricité', '💡'),
    C('f_internet', 'g_fixed', 'Internet', '📶'),
    C('f_tel', 'g_fixed', 'Téléphone', '📱'),
    C('f_assur_auto', 'g_fixed', 'Assurance auto', '🚗'),
    C('f_mutuelle', 'g_fixed', 'Mutuelle & santé', '🩺'),
    C('f_scolarite', 'g_fixed', 'Scolarité', '🏫'),
    C('f_transport_sco', 'g_fixed', 'Transport scolaire', '🚌'),
    C('f_abonnements', 'g_fixed', 'Abonnements', '🎬'),
    C('f_syndic', 'g_fixed', 'Syndic & charges', '🏢'),
    C('f_impots', 'g_fixed', 'Impôts & taxes', '🧾'),
    C('f_banque', 'g_fixed', 'Frais bancaires', '🏦'),
    C('f_credit', 'g_fixed', 'Crédit conso', '💳'),
    C('f_epargne', 'g_fixed', 'Épargne programmée', '🐷'),
    // Dépenses variables
    C('v_courses', 'g_variable', 'Courses', '🛒'),
    C('v_legumes', 'g_variable', 'Légumes', '🥕'),
    C('v_viande', 'g_variable', 'Viande', '🥩'),
    C('v_petit', 'g_variable', 'Petites courses', '🥖'),
    C('v_resto', 'g_variable', 'Restaurant', '🍽️'),
    C('v_cafe', 'g_variable', 'Café & snacks', '☕'),
    C('v_carburant', 'g_variable', 'Carburant', '⛽'),
    C('v_entretien_auto', 'g_variable', 'Entretien voiture', '🔧'),
    C('v_taxi', 'g_variable', 'Taxi & transport', '🚕'),
    C('v_vetements', 'g_variable', 'Vêtements', '👕'),
    C('v_sante', 'g_variable', 'Santé & pharmacie', '💊'),
    C('v_enfants', 'g_variable', 'Enfants', '🧸'),
    C('v_sport', 'g_variable', 'Activités & sport', '⚽'),
    C('v_sorties', 'g_variable', 'Sorties', '🎟️'),
    C('v_voyages', 'g_variable', 'Voyages', '✈️'),
    C('v_electro', 'g_variable', 'Électronique', '🔌'),
    C('v_maison', 'g_variable', 'Maison & déco', '🛋️'),
    C('v_cadeaux', 'g_variable', 'Cadeaux', '🎁'),
    C('v_divers', 'g_variable', 'Divers', '📦'),
  ];
}

export function createInitialState() {
  return {
    version: SCHEMA_VERSION,
    settings: { name: '', currency: 'MAD', theme: 'auto', hideAmounts: false, notifications: false, pinHash: null, pinSalt: null, demo: false, budgetStart: null, dismissed: {} },
    accounts: [],
    groups: defaultGroups(),
    categories: defaultCategories(),
    assignments: {}, // { 'YYYY-MM': { categoryId: montant } } — dépenses : budget assigné ; revenus : montant attendu
    transactions: [],
    recurring: [],
    assets: [],
    debts: [],
    goals: [],
    habits: [],
  };
}

// ---------- Démonstration ----------
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ~3 mois de données réalistes (déterministes). */
export function applyDemoData(state, now = today()) {
  const rnd = rng(20261108);
  const between = (a, b) => Math.round(a + rnd() * (b - a));
  const curKey = monthKey(now);
  const startKey = shiftMonth(curKey, -3);
  const start = monthStart(startKey);
  state.accounts = [
    { id: 'a_cur', name: 'Compte courant', type: 'checking', openingBalance: 18000, onBudget: true },
    { id: 'a_cash', name: 'Espèces', type: 'cash', openingBalance: 1500, onBudget: true },
    { id: 'a_sav', name: 'Épargne', type: 'savings', openingBalance: 25000, onBudget: false },
  ];
  const tx = [];
  const add = (type, date, accountId, categoryId, label, amount, extra = {}) =>
    tx.push({ id: `d${tx.length}`, type, date, accountId, toAccountId: null, categoryId, label, amount, status: 'done', recurringId: null, createdAt: Date.parse(`${date}T12:00:00`) || 0, ...extra });

  const tpl = (id, type, accountId, categoryId, label, amount, day, toAccountId = null) => ({
    id, type, accountId, toAccountId, categoryId, label, amount, freq: 'monthly', startDate: `${startKey}-${pad(day)}`, count: 0, active: true,
  });
  const todayDay = Number(now.slice(8));
  const recurring = [
    tpl('r_salaire', 'income', 'a_cur', 'i_salaire', 'Salaire', 10000, 1),
    tpl('r_loyer', 'expense', 'a_cur', 'f_loyer', 'Loyer', 3000, 1),
    tpl('r_scol', 'expense', 'a_cur', 'f_scolarite', 'Scolarité enfants', 800, 2),
    tpl('r_epargne', 'transfer', 'a_cur', null, 'Virement épargne', 1500, 2, 'a_sav'),
    tpl('r_auto', 'expense', 'a_cur', 'f_assur_auto', 'Assurance auto', 500, 3),
    tpl('r_internet', 'expense', 'a_cur', 'f_internet', 'Internet', 300, 5),
    tpl('r_netflix', 'expense', 'a_cur', 'f_abonnements', 'Netflix', 100, todayDay), // l'échéance du jour sera un brouillon
  ];
  for (const r of recurring) {
    for (let n = 0; ; n++) {
      const date = nthOccurrence(r.startDate, r.freq, n);
      if (date >= now) break; // aujourd'hui et le futur : générés comme brouillons au démarrage
      add(r.type, date, r.accountId, r.categoryId, r.label, r.amount, { toAccountId: r.toAccountId, recurringId: r.id });
      r.count = n + 1;
    }
  }
  state.recurring = recurring;

  for (let date = start; date <= now; date = addDays(date, 1)) {
    const d = parseISO(date);
    const dow = (d.getDay() + 6) % 7;
    const dom = d.getDate();
    const cash = () => (rnd() < 0.7 ? 'a_cash' : 'a_cur');
    if (dow === 5 && rnd() < 0.9) add('expense', date, 'a_cur', 'v_courses', 'Marjane', between(280, 560));
    if (rnd() < 0.65) add('expense', date, 'a_cash', 'v_petit', rnd() < 0.5 ? 'Pain & épicerie' : 'Épicerie du quartier', between(12, 60));
    if (rnd() < 0.3) add('expense', date, 'a_cash', 'v_legumes', 'Marché', between(20, 85));
    if (rnd() < 0.15) add('expense', date, 'a_cash', 'v_viande', 'Boucherie', between(80, 200));
    if (rnd() < 0.06) add('expense', date, 'a_cur', 'v_resto', 'Restaurant en famille', between(90, 230));
    if (rnd() < 0.09) add('expense', date, 'a_cur', 'v_carburant', 'Plein', between(180, 300));
    if (rnd() < 0.12) add('expense', date, cash(), 'v_enfants', 'Goûter / fournitures', between(20, 120));
    if (rnd() < 0.03) add('expense', date, cash(), 'v_sante', 'Pharmacie', between(90, 380));
    if (rnd() < 0.06) add('expense', date, cash(), 'v_sorties', 'Sortie', between(50, 240));
    if (rnd() < 0.04) add('expense', date, 'a_cur', 'v_maison', 'Maison', between(60, 380));
    if (dom === 10) add('expense', date, 'a_cur', 'f_energie', 'Facture Lydec', between(330, 470));
  }
  state.transactions = tx.filter((t) => t.date <= now);

  const plan = {
    f_loyer: 3000, f_energie: 450, f_internet: 300, f_tel: 200, f_assur_auto: 500, f_scolarite: 800, f_abonnements: 100,
    v_courses: 1800, v_legumes: 600, v_viande: 700, v_petit: 800, v_resto: 300, v_carburant: 700, v_sante: 300, v_enfants: 300, v_sorties: 300, v_vetements: 300, v_maison: 300,
  };
  state.assignments = {};
  for (const k of monthsBetween(startKey, shiftMonth(curKey, 1))) state.assignments[k] = { ...plan, i_salaire: 10000 };
  state.settings.budgetStart = startKey;

  state.assets = [
    { id: 'as_apt', kind: 'immobilier', name: 'Appartement', history: [{ date: start, value: 650000 }, { date: monthStart(curKey), value: 660000 }], monthlyPayment: 0 },
    { id: 'as_or', kind: 'or', name: 'Bijoux en or (50 g)', history: [{ date: start, value: 33000 }, { date: monthStart(curKey), value: 35500 }], monthlyPayment: 0 },
    { id: 'as_bourse', kind: 'bourse', name: 'Actions Bourse de Casablanca', history: [{ date: start, value: 11000 }, { date: monthStart(curKey), value: 12400 }], monthlyPayment: 0 },
    { id: 'as_credit', kind: 'credit', name: 'Crédit auto', history: [{ date: start, value: 92000 }, { date: monthStart(curKey), value: 83600 }], monthlyPayment: 2400 },
  ];
  state.goals = [
    { id: 'g_vac', name: 'Épargne vacances', icon: '🏖️', target: 8000, saved: 2500, deadline: monthStart(shiftMonth(curKey, 6)), createdAt: 0 },
    { id: 'g_urg', name: "Fonds d'urgence", icon: '🛟', target: 30000, saved: 12000, deadline: '', createdAt: 0 },
  ];
  state.debts = [
    { id: 'd_karim', direction: 'owed_to_me', person: 'Karim', amount: 1500, createdDate: addDays(now, -20), dueDate: addDays(now, 10), note: 'Prêt ponctuel', payments: [] },
    { id: 'd_four', direction: 'i_owe', person: 'Électroménager Atlas', amount: 3000, createdDate: addDays(now, -40), dueDate: addDays(now, 20), note: 'Paiement échelonné', payments: [{ date: addDays(now, -10), amount: 1000 }] },
  ];
  state.habits = [
    { id: 'h1', name: 'Noter mes dépenses chaque jour', icon: '📝', done: [addDays(now, -3), addDays(now, -2), addDays(now, -1)] },
    { id: 'h2', name: 'Aucun achat impulsif', icon: '🧘', done: [addDays(now, -1)] },
  ];
  state.settings.demo = true;
  return state;
}
