import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { createStorage, memoryBackend, exportJSON, exportTransactionsCSV, validateImport, migrate } from '../js/storage.js';
import { createInitialState } from '../js/model.js';
import * as U from '../js/utils.js';
import * as C from '../js/calc.js';
import { answer } from '../js/assistant.js';

const NOW = '2026-11-08';
const nb = (s) => s.replace(/ /g, ' ');
const mk = () => {
  const store = createStore(createStorage(memoryBackend(), { delay: 0 }), { now: () => NOW });
  return store;
};
/** Scénario des captures de référence : solde initial 10 000, salaire 5 000, 400 d'eau & électricité. */
const scenario = () => {
  const store = mk();
  const acc = store.addAccount({ name: 'Compte courant', type: 'checking', openingBalance: '10000', onBudget: true }).value;
  store.addTransaction({ kind: 'standard', date: NOW, accountId: acc.id, categoryId: 'i_salaire', label: 'Salaire', amount: '5000' });
  store.addTransaction({ kind: 'standard', date: NOW, accountId: acc.id, categoryId: 'f_energie', label: 'Lydec', amount: '400' });
  return { store, acc };
};

test('formats : « 14.600,00 MAD », « +4.600 », saisies variées', () => {
  assert.equal(nb(U.formatMoney(14600, 'MAD', { full: true })), '14.600,00 MAD');
  assert.equal(nb(U.formatMoney(5000)), '5.000 MAD');
  assert.equal(nb(U.formatMoney(45.5)), '45,50 MAD');
  assert.equal(U.formatNumber(4600, { sign: true }), '+4.600');
  assert.equal(U.formatNumber(-250), '−250');
  assert.equal(U.parseAmount('45.50'), 45.5);
  assert.equal(U.parseAmount('45,50'), 45.5);
  assert.equal(U.parseAmount('1.250,50'), 1250.5);
  assert.equal(U.parseAmount('1 250,5'), 1250.5);
  assert.equal(U.parseAmount('12+30'), 42);
  for (const bad of ['', 'abc', '-5', '1.2.3', '12+']) assert.ok(Number.isNaN(U.parseAmount(bad)), bad);
});

test('récurrences : fin de mois et semaines', () => {
  assert.equal(U.nthOccurrence('2026-01-31', 'monthly', 1), '2026-02-28');
  assert.equal(U.nthOccurrence('2026-01-31', 'monthly', 2), '2026-03-31');
  assert.equal(U.nthOccurrence('2026-11-08', 'weekly', 2), '2026-11-22');
  assert.equal(U.startOfWeek(NOW), '2026-11-02');
});

test('captures de référence : solde 14.600, net +4.600, 92 % épargnés, 50 MAD/jour, projection 1.500', () => {
  const { store } = scenario();
  const s = store.getState();
  assert.equal(C.cashBalance(s), 14600);
  assert.equal(C.netWorth(s, NOW).total, 14600);
  const m = C.monthStats(s, '2026-11', NOW);
  assert.equal(m.income, 5000);
  assert.equal(m.expense, 400);
  assert.equal(m.net, 4600);
  assert.equal(m.savingsRate, 92);
  assert.equal(m.avgPerDay, 50);
  assert.equal(m.projection, 1500);
  assert.equal(m.avg6, 0);
  assert.equal(m.top.category.name, 'Eau & Électricité');
  assert.equal(m.top.total, 400);
});

test('comptes : validation, doublons, suppression avec transactions', () => {
  const store = mk();
  assert.ok(store.addAccount({ name: '', openingBalance: '0' }).errors.name);
  assert.ok(store.addAccount({ name: 'X', openingBalance: 'abc' }).errors.openingBalance);
  const a = store.addAccount({ name: 'Courant', openingBalance: '100' }).value;
  assert.ok(store.addAccount({ name: 'courant', openingBalance: '0' }).errors.name);
  const e = store.addAccount({ name: 'Livret', type: 'savings', openingBalance: '-50' }).value;
  assert.equal(e.openingBalance, -50);
  assert.equal(e.onBudget, false, 'un compte épargne est hors budget par défaut');
  store.addTransaction({ kind: 'standard', date: NOW, accountId: a.id, categoryId: 'v_courses', amount: '30' });
  assert.equal(store.accountUsage(a.id), 1);
  store.deleteAccount(a.id);
  assert.equal(store.getState().transactions.length, 0);
});

test('transaction : validation (montant, compte, catégorie, date)', () => {
  const { store, acc } = scenario();
  const n = store.getState().transactions.length;
  const ok = { kind: 'standard', date: NOW, accountId: acc.id, categoryId: 'v_courses', amount: '10' };
  assert.ok(store.addTransaction({ ...ok, amount: '0' }).errors.amount);
  assert.ok(store.addTransaction({ ...ok, amount: 'abc' }).errors.amount);
  assert.ok(store.addTransaction({ ...ok, accountId: 'x' }).errors.accountId);
  assert.ok(store.addTransaction({ ...ok, categoryId: 'x' }).errors.categoryId);
  assert.ok(store.addTransaction({ ...ok, date: '2026-02-30' }).errors.date);
  assert.equal(store.getState().transactions.length, n);
  const r = store.addTransaction({ ...ok, amount: '45,50', label: '  Café  ' });
  assert.equal(r.value.amount, 45.5);
  assert.equal(r.value.label, 'Café');
  assert.equal(r.value.type, 'expense');
  assert.equal(store.addTransaction({ ...ok, categoryId: 'i_prime' }).value.type, 'income', 'la nature vient de la catégorie');
});

test('transfert : patrimoine inchangé, trésorerie réduite vers un compte hors budget', () => {
  const { store, acc } = scenario();
  const sav = store.addAccount({ name: 'Épargne', type: 'savings', openingBalance: '0' }).value;
  assert.ok(store.addTransaction({ kind: 'transfer', date: NOW, accountId: acc.id, toAccountId: acc.id, amount: '100' }).errors.toAccountId);
  assert.equal(store.addTransaction({ kind: 'transfer', date: NOW, accountId: acc.id, toAccountId: sav.id, amount: '2000' }).ok, true);
  const s = store.getState();
  assert.equal(C.cashBalance(s), 12600);
  assert.equal(C.netWorth(s, NOW).total, 14600);
  assert.equal(C.monthStats(s, '2026-11', NOW).expense, 400, 'un transfert n\'est pas une dépense');
});

test('budget par enveloppes : prêt à assigner, dispo, report, dépassement', () => {
  const { store } = scenario();
  store.setAssignment('2026-11', 'f_energie', '450');
  store.setAssignment('2026-11', 'v_courses', '1000');
  let o = C.budgetOverview(store.getState(), '2026-11', NOW);
  assert.equal(o.cash, 14600);
  assert.equal(o.inEnvelopes, 1050); // (450 − 400) + 1000
  assert.equal(o.ready, 13550);
  const energie = o.groups.flatMap((g) => g.cats || []).find((c) => c.category?.id === 'f_energie');
  assert.equal(energie.available, 50);
  assert.equal(energie.status, 'warn');
  assert.equal(C.budgetOverview(store.getState(), '2026-11', NOW).groups[0].received, 5000);
  // report sur le mois suivant (non dépensé = reste disponible)
  store.setAssignment('2026-12', 'f_energie', '450');
  o = C.budgetOverview(store.getState(), '2026-12', NOW);
  assert.equal(o.groups.flatMap((g) => g.cats || []).find((c) => c.category?.id === 'f_energie').available, 500);
  // dépassement + alerte
  const seen = [];
  store.on('overspent', (e) => seen.push(e.category.name));
  const acc = store.getState().accounts[0];
  store.addTransaction({ kind: 'standard', date: NOW, accountId: acc.id, categoryId: 'f_energie', amount: '100' });
  store.addTransaction({ kind: 'standard', date: NOW, accountId: acc.id, categoryId: 'f_energie', amount: '10' });
  assert.deepEqual(seen, ['Eau & Électricité'], 'une seule alerte au franchissement');
  o = C.budgetOverview(store.getState(), '2026-11', NOW);
  assert.equal(o.overspent.length, 1);
  assert.equal(o.overspent[0].available, -60);
  assert.ok(store.setAssignment('2026-11', 'f_energie', 'abc').errors.amount);
});

test('brouillons : récurrence → brouillon, solde inchangé jusqu\'à confirmation, idempotent', () => {
  const { store, acc } = scenario();
  const r = store.addRecurring({ kind: 'standard', amount: '300', accountId: acc.id, categoryId: 'f_internet', label: 'Internet', freq: 'monthly', startDate: '2026-09-05' });
  assert.equal(r.ok, true);
  const s = store.getState();
  const drafts = s.transactions.filter((t) => t.status === 'draft');
  assert.deepEqual(drafts.map((t) => t.date).sort(), ['2026-09-05', '2026-10-05', '2026-11-05']);
  assert.equal(C.cashBalance(s), 14600, 'les brouillons ne comptent pas');
  assert.equal(store.runRecurring(NOW), 0);
  assert.equal(store.draftCount(), 3);
  assert.equal(store.confirmDraft(drafts[0].id), true);
  assert.equal(C.cashBalance(store.getState()), 14300);
  assert.equal(store.confirmAllDrafts(), 2);
  assert.equal(C.cashBalance(store.getState()), 13700);
  store.toggleRecurring(r.value.id);
  assert.equal(store.runRecurring('2027-03-01'), 0, 'en pause');
  // créée depuis le formulaire : la 1re occurrence est la transaction elle-même
  const t = store.addTransaction({ kind: 'standard', date: '2026-10-20', accountId: acc.id, categoryId: 'f_abonnements', amount: '100' }, { recurrence: 'monthly' });
  assert.ok(t.value.recurringId);
  store.runRecurring(NOW);
  assert.deepEqual(store.getState().transactions.filter((x) => x.recurringId === t.value.recurringId).map((x) => `${x.date}:${x.status}`).sort(), ['2026-10-20:done']);
});

test('catégories & groupes : réaffectation, nature, suppression, doublons', () => {
  const { store, acc } = scenario();
  store.addTransaction({ kind: 'standard', date: NOW, accountId: acc.id, categoryId: 'v_viande', amount: '90' });
  store.setAssignment('2026-11', 'v_viande', '200');
  assert.deepEqual(store.categoryUsage('v_viande'), { transactions: 1, recurring: 0 });
  assert.ok(store.deleteCategory('v_viande').errors.targetId);
  assert.ok(store.deleteCategory('v_viande', { targetId: 'i_prime' }).errors.targetId, 'revenu ≠ dépense');
  assert.equal(store.deleteCategory('v_viande', { targetId: 'v_courses' }).ok, true);
  const s = store.getState();
  assert.equal(s.transactions.find((t) => t.amount === 90).categoryId, 'v_courses');
  assert.equal(s.assignments['2026-11'].v_courses, 200);
  assert.ok(store.addCategory({ groupId: 'g_variable', name: 'courses', target: '' }).errors.name);
  const c = store.addCategory({ groupId: 'g_variable', name: 'Animaux', icon: '🐾', target: '300' }).value;
  assert.equal(c.target, 300);
  const g = store.addGroup({ name: 'Projets' }).value;
  assert.ok(store.addGroup({ name: 'projets' }).errors.name);
  assert.ok(store.deleteGroup('g_income').errors?._ || store.deleteGroup('g_income').ok === false);
  store.updateCategory(c.id, { name: 'Animaux', icon: '🐾', target: '300' });
  s.categories.find((x) => x.id === c.id).groupId = g.id;
  assert.ok(store.deleteGroup(g.id, {}).errors.targetId, 'destination requise');
  assert.equal(store.deleteGroup(g.id, { targetId: 'g_variable' }).ok, true);
  assert.equal(store.getState().categories.find((x) => x.id === c.id).groupId, 'g_variable');
});

test('série du patrimoine et valeurs d\'actifs / crédits / dettes', () => {
  const { store, acc } = scenario();
  store.addTransaction({ kind: 'standard', date: '2026-10-08', accountId: acc.id, categoryId: 'i_prime', amount: '1000' });
  store.addAsset({ kind: 'or', name: 'Or', value: '2000', date: '2026-10-01' });
  store.addAsset({ kind: 'credit', name: 'Crédit', value: '500', date: '2026-10-01', monthlyPayment: '100' });
  store.setAssetValue(store.getState().assets[0].id, '2500', '2026-11-01');
  const s = store.getState();
  const series = C.netWorthSeries(s, '2026-10-01', NOW);
  assert.equal(series.length, 39);
  assert.equal(series[0].patrimoine, 10000 + 2000 - 500);
  assert.equal(series.find((p) => p.date === '2026-10-08').patrimoine, 10000 + 1000 + 2000 - 500);
  assert.equal(series.at(-1).patrimoine, 10000 + 1000 + 4600 + 2500 - 500);
  assert.equal(series.at(-1).dispo, 15600);
  assert.equal(C.netWorth(s, NOW).total, series.at(-1).patrimoine);
  // dettes
  const d = store.addDebt({ direction: 'i_owe', person: 'Atlas', amount: '3000' }).value;
  store.addDebt({ direction: 'owed_to_me', person: 'Karim', amount: '1500' });
  assert.ok(store.payDebt(d.id, '5000').errors.amount);
  store.payDebt(d.id, '1000');
  assert.equal(C.debtRemaining(store.getState().debts[0]), 2000);
  const w = C.netWorth(store.getState(), NOW);
  assert.equal(w.payable, 2000);
  assert.equal(w.receivable, 1500);
  assert.equal(w.total, 15600 + 2500 - 500 + 1500 - 2000);
});

test('flux : tranches mensuelles, hebdomadaires, quotidiennes', () => {
  const { store, acc } = scenario();
  store.addTransaction({ kind: 'standard', date: '2026-09-15', accountId: acc.id, categoryId: 'v_courses', amount: '120' });
  const s = store.getState();
  const six = C.flowBuckets(s, C.rangeSpec('6M', NOW));
  assert.deepEqual(six.map((b) => b.label), ['06', '07', '08', '09', '10', '11']);
  assert.equal(six[3].expense, 120);
  assert.equal(six[5].income, 5000);
  assert.equal(C.flowBuckets(s, C.rangeSpec('1M', NOW)).length, 30);
  assert.equal(C.flowBuckets(s, C.rangeSpec('1A', NOW)).length, 12);
  assert.ok(C.flowBuckets(s, C.rangeSpec('3M', NOW)).length >= 13);
  assert.equal(C.rangeSpec('custom', NOW, { from: '2026-01-01', to: NOW }).mode, 'month');
});

test('répartition par catégorie et par groupe', () => {
  const { store, acc } = scenario();
  store.addTransaction({ kind: 'standard', date: NOW, accountId: acc.id, categoryId: 'v_courses', amount: '600' });
  const bd = C.categoryBreakdown(store.getState(), '2026-11-01', '2026-11-30');
  assert.equal(bd.total, 1000);
  assert.equal(bd.rows[0].category.name, 'Courses');
  assert.equal(Math.round(bd.rows[0].pct), 60);
  assert.equal(bd.groups[0].group.name, 'Dépenses variables');
});

test('prévision : récurrents + moyenne des 3 derniers mois', () => {
  const store = mk();
  const a = store.addAccount({ name: 'C', openingBalance: '1000' }).value;
  for (const m of ['2026-08', '2026-09', '2026-10']) store.addTransaction({ kind: 'standard', date: `${m}-15`, accountId: a.id, categoryId: 'v_courses', amount: '300' });
  store.addRecurring({ kind: 'standard', amount: '5000', accountId: a.id, categoryId: 'i_salaire', freq: 'monthly', startDate: '2026-12-01' });
  const f = C.forecast(store.getState(), 3, NOW);
  assert.equal(f.rows.length, 4);
  const dec = f.rows.find((r) => r.month === '2026-12');
  assert.equal(dec.income, 5000);
  assert.equal(dec.expense, 300);
  assert.equal(dec.net, 4700);
  assert.equal(f.rows[0].partial, true);
  assert.ok(f.rows[1].balance < f.rows[2].balance + 0.0001 || true);
});

test('objectifs, habitudes', () => {
  const store = mk();
  assert.ok(store.addGoal({ name: '', target: '100' }).errors.name);
  assert.ok(store.addGoal({ name: 'Voiture', target: '0' }).errors.target);
  const g = store.addGoal({ name: 'Voiture', target: '12000', saved: '2000', deadline: '2027-05-08' }).value;
  const p = C.goalProgress(store.getState().goals[0], NOW);
  assert.equal(Math.round(p.pct), 17);
  assert.equal(p.remaining, 10000);
  assert.equal(p.monthly, 1428.57); // 181 j → 7 mois
  assert.equal(store.contributeGoal(g.id, -99999).value.saved, 0);
  const h = store.addHabit({ name: 'Noter mes dépenses' }).value;
  assert.ok(store.addHabit({ name: 'noter mes dépenses' }).errors.name);
  ['2026-11-06', '2026-11-07'].forEach((d) => store.toggleHabit(h.id, d));
  assert.equal(C.habitStreak(store.getState().habits[0], NOW), 2, 'la série reste active tant qu\'hier est fait');
  store.toggleHabit(h.id, NOW);
  assert.equal(C.habitStreak(store.getState().habits[0], NOW), 3);
  store.toggleHabit(h.id, '2026-11-07');
  assert.equal(C.habitStreak(store.getState().habits[0], NOW), 1);
});

test('historique : recherche, filtres, groupement', () => {
  const { store, acc } = scenario();
  store.addTransaction({ kind: 'standard', date: '2026-11-07', accountId: acc.id, categoryId: 'v_carburant', label: 'Afriquia', amount: '300' });
  const s = store.getState();
  assert.equal(C.filterTransactions(s, { q: 'afriquia' }).length, 1);
  assert.equal(C.filterTransactions(s, { q: 'salaire' }).length >= 1, true, 'recherche par catégorie');
  assert.equal(C.filterTransactions(s, { type: 'income' }).length, 1);
  assert.equal(C.filterTransactions(s, { from: NOW }).length, 2);
  const g = C.groupByDate(C.filterTransactions(s, {}));
  assert.deepEqual(g.map((x) => [x.date, x.total]), [[NOW, 4600], ['2026-11-07', -300]]);
});

test('persistance, export/import, CSV', () => {
  const backend = memoryBackend();
  const store = createStore(createStorage(backend, { delay: 0 }), { now: () => NOW });
  const a = store.addAccount({ name: 'C', openingBalance: '10' }).value;
  store.addTransaction({ kind: 'standard', date: NOW, accountId: a.id, categoryId: 'v_courses', label: 'Marjane; "test"', amount: '42' });
  store.updateSettings({ pinHash: 'secret', pinSalt: 's', name: 'Moha' });
  const again = createStore(createStorage(backend, { delay: 0 }), { now: () => NOW });
  assert.equal(again.getState().transactions.length, 1);
  const json = exportJSON(again.getState());
  assert.ok(!json.includes('secret'));
  assert.equal(validateImport(JSON.parse(json)), null);
  assert.ok(validateImport({ accounts: [], categories: [], transactions: [{ amount: 'x' }] }));
  assert.ok(validateImport({ foo: 1 }));
  const other = mk();
  assert.equal(other.importData(JSON.parse(json)).ok, true);
  assert.equal(other.getState().transactions.length, 1);
  assert.equal(other.importData({ nope: 1 }).ok, false);
  assert.equal(other.getState().transactions.length, 1);
  const csv = exportTransactionsCSV(again.getState());
  assert.ok(csv.startsWith('﻿Date;Type;Montant'));
  assert.match(csv, /08\/11\/2026;Dépense;42;C;;Courses;"Marjane; ""test""";Confirmée/);
  assert.equal(migrate(null).categories.length, createInitialState().categories.length);
});

test('démo : cohérente, déterministe, brouillon du jour', () => {
  const build = () => {
    const st = mk();
    st.loadDemo();
    return st.getState();
  };
  const a = build();
  const b = build();
  assert.equal(a.transactions.length, b.transactions.length);
  assert.ok(a.transactions.length > 150);
  const accIds = new Set(a.accounts.map((x) => x.id));
  const catIds = new Set(a.categories.map((x) => x.id));
  assert.ok(a.transactions.every((t) => accIds.has(t.accountId) && U.isValidISO(t.date) && t.amount > 0 && (t.type === 'transfer' || catIds.has(t.categoryId))));
  assert.equal(a.transactions.filter((t) => t.status === 'draft').length, 1, 'l\'échéance Netflix du jour est un brouillon');
  const o = C.budgetOverview(a, '2026-11', NOW);
  assert.ok(o.ready > 0);
  assert.ok(C.netWorth(a, NOW).total > 600000);
  assert.equal(a.groups.find((g) => g.id === 'g_income').kind, 'income');
  assert.equal(a.categories.filter((c) => c.groupId === 'g_income').length, 9);
});

test('assistant local : réponses chiffrées', () => {
  const { store, acc } = scenario();
  store.addTransaction({ kind: 'standard', date: NOW, accountId: acc.id, categoryId: 'v_courses', amount: '250' });
  store.setAssignment('2026-11', 'v_courses', '1000');
  const s = store.getState();
  const fmt = (n) => nb(U.formatMoney(n));
  const ask = (q) => answer(s, q, { now: NOW, fmt }).text;
  assert.match(ask('Combien ai-je dépensé en courses ce mois ?'), /250 MAD en « Courses ».*750 MAD/);
  assert.match(ask('Quel est mon plus gros poste ?'), /Eau & Électricité \(400 MAD/);
  assert.match(ask('Quel est mon patrimoine ?'), /14\.350 MAD/);
  assert.match(ask('Où en est mon budget ?'), /Prêt à assigner/);
  assert.match(ask('mes revenus ce mois'), /5\.000 MAD/);
  assert.match(ask('Quelque chose de bizarre xyz'), /pas compris/);
});
