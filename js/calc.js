// Tous les calculs (fonctions pures : état → valeurs). Aucune dépendance DOM.
import { addDays, currentMonthKey, daysInMonth, diffDays, monthEnd, monthKey, monthStart, monthsBetween, nthOccurrence, round2, shiftMonth, startOfWeek, sum, today, pad } from './utils.js';

export const isDone = (t) => t.status !== 'draft';
const accMap = (s) => new Map(s.accounts.map((a) => [a.id, a]));
const groupOf = (s) => new Map(s.groups.map((g) => [g.id, g]));

/** Effet d'une transaction sur les soldes de comptes : [[compteId, delta], …] */
export function deltas(t) {
  if (t.type === 'income') return [[t.accountId, t.amount]];
  if (t.type === 'expense') return [[t.accountId, -t.amount]];
  return [[t.accountId, -t.amount], [t.toAccountId, t.amount]];
}

/** Effet d'une transaction sur la trésorerie « Dispo » (comptes budgétés uniquement). */
export function dispoEffect(accounts, t) {
  return deltas(t).reduce((s, [id, d]) => s + (accounts.get(id)?.onBudget ? d : 0), 0);
}

export function accountBalances(s, upTo = null) {
  const bal = new Map(s.accounts.map((a) => [a.id, Number(a.openingBalance) || 0]));
  for (const t of s.transactions) {
    if (!isDone(t) || (upTo && t.date > upTo)) continue;
    for (const [id, d] of deltas(t)) if (bal.has(id)) bal.set(id, bal.get(id) + d);
  }
  for (const [k, v] of bal) bal.set(k, round2(v));
  return bal;
}
export const cashBalance = (s, upTo = null) => {
  const bal = accountBalances(s, upTo);
  return round2(s.accounts.filter((a) => a.onBudget).reduce((x, a) => x + (bal.get(a.id) || 0), 0));
};

// ---------- Actifs, crédits, dettes ----------
export function valueAt(history, date) {
  let v = null;
  for (const h of [...(history || [])].sort((a, b) => (a.date < b.date ? -1 : 1))) if (h.date <= date) v = h.value;
  return v;
}
export const currentValue = (asset, date = today()) => valueAt(asset.history, date) ?? [...(asset.history || [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.value ?? 0;
export const debtPaid = (d, date = '9999-12-31') => sum((d.payments || []).filter((p) => p.date <= date), (p) => p.amount);
export const debtRemaining = (d, date = '9999-12-31') => (d.createdDate > date ? 0 : Math.max(0, round2(d.amount - debtPaid(d, date))));

export function assetTotals(s, date = today()) {
  const t = { immobilier: 0, or: 0, bourse: 0, autre: 0, credit: 0 };
  for (const a of s.assets) t[a.kind] = round2(t[a.kind] + (valueAt(a.history, date) ?? 0));
  const assets = round2(t.immobilier + t.or + t.bourse + t.autre);
  return { ...t, assets, credits: t.credit };
}
export function debtTotals(s, date = today()) {
  let receivable = 0;
  let payable = 0;
  for (const d of s.debts) (d.direction === 'owed_to_me' ? (receivable += debtRemaining(d, date)) : (payable += debtRemaining(d, date)));
  return { receivable: round2(receivable), payable: round2(payable) };
}

export function netWorth(s, date = today()) {
  const bal = accountBalances(s, date);
  const accounts = round2([...bal.values()].reduce((a, b) => a + b, 0));
  const at = assetTotals(s, date);
  const dt = debtTotals(s, date);
  return { accounts, ...at, ...dt, total: round2(accounts + at.assets - at.credits + dt.receivable - dt.payable), dispo: cashBalance(s, date) };
}

/** Série quotidienne [{date, patrimoine, dispo}] entre from et to (inclus). */
export function netWorthSeries(s, from, to) {
  const accs = accMap(s);
  const openTotal = sum(s.accounts, (a) => a.openingBalance);
  const openDispo = sum(s.accounts.filter((a) => a.onBudget), (a) => a.openingBalance);
  const dTotal = new Map();
  const dDispo = new Map();
  let baseTotal = openTotal;
  let baseDispo = openDispo;
  for (const t of s.transactions) {
    if (!isDone(t)) continue;
    const total = t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0;
    const dispo = dispoEffect(accs, t);
    if (t.date < from) {
      baseTotal += total;
      baseDispo += dispo;
    } else if (t.date <= to) {
      dTotal.set(t.date, (dTotal.get(t.date) || 0) + total);
      dDispo.set(t.date, (dDispo.get(t.date) || 0) + dispo);
    }
  }
  const out = [];
  let rt = baseTotal;
  let rd = baseDispo;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    rt += dTotal.get(d) || 0;
    rd += dDispo.get(d) || 0;
    const at = assetTotals(s, d);
    const dt = debtTotals(s, d);
    out.push({ date: d, patrimoine: round2(rt + at.assets - at.credits + dt.receivable - dt.payable), dispo: round2(rd) });
  }
  return out;
}

// ---------- Budget par enveloppes ----------
export function monthMaps(s) {
  const spent = new Map();
  const received = new Map();
  for (const t of s.transactions) {
    if (!isDone(t) || t.type === 'transfer') continue;
    const k = `${monthKey(t.date)}|${t.categoryId}`;
    (t.type === 'expense' ? spent : received).set(k, round2(((t.type === 'expense' ? spent : received).get(k) || 0) + t.amount));
  }
  return { spent, received };
}

export function budgetStart(s) {
  let m = s.settings.budgetStart || currentMonthKey();
  for (const k of Object.keys(s.assignments)) if (k < m) m = k;
  return m;
}
export const assignedFor = (s, month, catId) => Number(s.assignments[month]?.[catId]) || 0;

export function statusOf(assigned, available) {
  if (available < -0.004) return 'over';
  if (assigned > 0 && available / assigned < 0.15 && available >= 0 && available < assigned) return 'warn';
  return 'ok';
}

/** Vue complète du budget d'un mois (enveloppes cumulatives, « Prêt à assigner »). */
export function budgetOverview(s, month, now = today()) {
  const start = budgetStart(s) < month ? budgetStart(s) : month;
  const months = monthsBetween(start, month);
  const maps = monthMaps(s);
  const groups = groupOf(s);
  const incomeCats = s.categories.filter((c) => groups.get(c.groupId)?.kind === 'income');
  const expenseCats = s.categories.filter((c) => groups.get(c.groupId)?.kind !== 'income');

  const avail = new Map();
  for (const c of expenseCats) {
    let a = 0;
    for (const m of months) a += assignedFor(s, m, c.id) - (maps.spent.get(`${m}|${c.id}`) || 0);
    avail.set(c.id, round2(a));
  }
  const asOf = month < monthKey(now) ? monthEnd(month) : now;
  const cash = cashBalance(s, asOf);
  const inEnvelopes = round2([...avail.values()].reduce((a, b) => a + b, 0));

  const rows = [...s.groups].sort((a, b) => a.order - b.order).map((group) => {
    if (group.kind === 'income') {
      const cats = incomeCats.filter((c) => c.groupId === group.id).map((category) => ({
        category, received: maps.received.get(`${month}|${category.id}`) || 0, expected: assignedFor(s, month, category.id),
      }));
      return { group, income: true, cats, received: sum(cats, (c) => c.received), expected: sum(cats, (c) => c.expected), count: cats.length };
    }
    const cats = expenseCats.filter((c) => c.groupId === group.id).map((category) => {
      const assigned = assignedFor(s, month, category.id);
      const spent = maps.spent.get(`${month}|${category.id}`) || 0;
      const available = avail.get(category.id) || 0;
      return { category, assigned, spent, available, status: statusOf(assigned, available), pct: assigned > 0 ? (spent / assigned) * 100 : null };
    });
    return { group, income: false, cats, assigned: sum(cats, (c) => c.assigned), spent: sum(cats, (c) => c.spent), available: sum(cats, (c) => c.available), count: cats.length };
  });
  const incomeRow = rows.find((r) => r.income);
  return {
    month, cash, inEnvelopes, ready: round2(cash - inEnvelopes), groups: rows,
    income: { received: incomeRow ? incomeRow.received : 0, expected: incomeRow ? incomeRow.expected : 0 },
    overspent: rows.flatMap((r) => (r.income ? [] : r.cats.filter((c) => c.status === 'over'))),
  };
}

// ---------- Analyse ----------
export function periodTotals(s, from, to) {
  let income = 0;
  let expense = 0;
  for (const t of s.transactions) {
    if (!isDone(t) || t.type === 'transfer' || t.date < from || t.date > to) continue;
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income: round2(income), expense: round2(expense), net: round2(income - expense) };
}

export function categoryBreakdown(s, from, to) {
  const groups = groupOf(s);
  const cats = new Map(s.categories.map((c) => [c.id, c]));
  const byCat = new Map();
  for (const t of s.transactions) {
    if (!isDone(t) || t.type !== 'expense' || t.date < from || t.date > to) continue;
    byCat.set(t.categoryId, round2((byCat.get(t.categoryId) || 0) + t.amount));
  }
  const total = round2([...byCat.values()].reduce((a, b) => a + b, 0));
  const rows = [...byCat.entries()].filter(([id]) => cats.has(id)).map(([id, v]) => ({ category: cats.get(id), group: groups.get(cats.get(id).groupId), total: v, pct: total ? (v / total) * 100 : 0 })).sort((a, b) => b.total - a.total);
  const byGroup = new Map();
  for (const r of rows) byGroup.set(r.group?.id, round2((byGroup.get(r.group?.id) || 0) + r.total));
  const groupRows = [...byGroup.entries()].map(([id, v]) => ({ group: groups.get(id), total: v, pct: total ? (v / total) * 100 : 0 })).sort((a, b) => b.total - a.total);
  return { total, rows, groups: groupRows };
}

export function monthStats(s, key, now = today()) {
  const { income, expense, net } = periodTotals(s, monthStart(key), monthEnd(key));
  const cur = monthKey(now);
  const dim = daysInMonth(key);
  const elapsed = key === cur ? Number(now.slice(8)) : key < cur ? dim : 0;
  const avgPerDay = elapsed ? round2(expense / elapsed) : 0;
  const prev6 = [1, 2, 3, 4, 5, 6].map((n) => periodTotals(s, monthStart(shiftMonth(key, -n)), monthEnd(shiftMonth(key, -n))).expense);
  const bd = categoryBreakdown(s, monthStart(key), monthEnd(key));
  return {
    key, income, expense, net, dim, elapsed, isCurrent: key === cur,
    savingsRate: income > 0 ? (net / income) * 100 : null,
    avgPerDay, projection: key === cur ? round2(avgPerDay * dim) : expense,
    avg6: round2(prev6.reduce((a, b) => a + b, 0) / 6),
    top: bd.rows[0] || null,
  };
}

/** Spécification d'une plage (1M | 3M | 6M | 1A | custom). */
export function rangeSpec(range, now = today(), custom = null) {
  const cur = monthKey(now);
  if (range === '1M') return { from: addDays(now, -29), to: now, mode: 'day' };
  if (range === '3M') return { from: addDays(now, -90), to: now, mode: 'week' };
  if (range === '6M') return { from: monthStart(shiftMonth(cur, -5)), to: now, mode: 'month' };
  if (range === '1A') return { from: monthStart(shiftMonth(cur, -11)), to: now, mode: 'month' };
  const from = custom?.from || addDays(now, -29);
  const to = custom?.to && custom.to >= from ? custom.to : now;
  const days = diffDays(from, to);
  return { from, to, mode: days <= 45 ? 'day' : days <= 180 ? 'week' : 'month' };
}

/** Revenus / dépenses par tranche : [{key,label,from,to,income,expense}] */
export function flowBuckets(s, { from, to, mode }) {
  const keyOf = { day: (d) => d, week: startOfWeek, month: monthKey }[mode];
  const buckets = [];
  const index = new Map();
  const push = (key, label, f, t) => {
    index.set(key, buckets.length);
    buckets.push({ key, label, from: f, to: t, income: 0, expense: 0 });
  };
  if (mode === 'month') for (const m of monthsBetween(monthKey(from), monthKey(to))) push(m, pad(Number(m.slice(5))), monthStart(m), monthEnd(m));
  else if (mode === 'week') for (let d = startOfWeek(from); d <= to; d = addDays(d, 7)) push(d, `${pad(Number(d.slice(8)))}/${pad(Number(d.slice(5, 7)))}`, d, addDays(d, 6));
  else for (let d = from; d <= to; d = addDays(d, 1)) push(d, String(Number(d.slice(8))), d, d);
  for (const t of s.transactions) {
    if (!isDone(t) || t.type === 'transfer' || t.date < from || t.date > to) continue;
    const i = index.get(keyOf(t.date));
    if (i == null) continue;
    buckets[i][t.type === 'income' ? 'income' : 'expense'] += t.amount;
  }
  buckets.forEach((b) => ((b.income = round2(b.income)), (b.expense = round2(b.expense))));
  return buckets;
}

// ---------- Prévision ----------
export function forecast(s, nMonths = 6, now = today()) {
  const accs = accMap(s);
  const cur = monthKey(now);
  const hist = [-3, -2, -1].map((n) => shiftMonth(cur, n));
  const varAvg = { income: 0, expense: 0 };
  for (const t of s.transactions) {
    if (!isDone(t) || t.type === 'transfer' || t.recurringId || !hist.includes(monthKey(t.date))) continue;
    varAvg[t.type] += t.amount / 3;
  }
  const soFar = { income: 0, expense: 0 };
  for (const t of s.transactions) if (isDone(t) && t.type !== 'transfer' && !t.recurringId && monthKey(t.date) === cur) soFar[t.type] += t.amount;

  const rows = [];
  let balance = cashBalance(s, now);
  const base = balance;
  for (let i = 0; i <= nMonths; i++) {
    const m = shiftMonth(cur, i);
    let fixedIn = 0;
    let fixedOut = 0;
    let transfers = 0;
    const note = (t) => {
      if (t.type === 'income') fixedIn += t.amount;
      else if (t.type === 'expense') fixedOut += t.amount;
      else transfers += dispoEffect(accs, t);
    };
    for (const t of s.transactions) if (t.status === 'draft' && monthKey(t.date) === m) note(t);
    for (const r of s.recurring) {
      if (!r.active) continue;
      for (let n = r.count, guard = 0; guard < 400; n++, guard++) {
        const date = nthOccurrence(r.startDate, r.freq, n);
        if (date > monthEnd(m)) break;
        if (date > now && monthKey(date) === m) note(r);
      }
    }
    const varIn = i === 0 ? Math.max(0, varAvg.income - soFar.income) : varAvg.income;
    const varOut = i === 0 ? Math.max(0, varAvg.expense - soFar.expense) : varAvg.expense;
    const income = round2(fixedIn + varIn);
    const expense = round2(fixedOut + varOut);
    balance = round2(balance + income - expense + transfers);
    rows.push({ month: m, income, expense, transfers: round2(transfers), net: round2(income - expense + transfers), balance, partial: i === 0 });
  }
  return { base, rows };
}

// ---------- Objectifs, habitudes ----------
export function goalProgress(g, now = today()) {
  const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
  const remaining = Math.max(0, round2(g.target - g.saved));
  let monthly = null;
  if (g.deadline && remaining > 0 && g.deadline > now) monthly = round2(remaining / Math.max(1, Math.ceil(diffDays(now, g.deadline) / 30)));
  return { pct, remaining, monthly, reached: g.saved >= g.target && g.target > 0, late: !!g.deadline && g.deadline < now && remaining > 0 };
}
export function habitStreak(h, now = today()) {
  const set = new Set(h.done);
  let d = set.has(now) ? now : addDays(now, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- Transactions (liste) ----------
export function filterTransactions(s, f = {}) {
  const cat = new Map(s.categories.map((c) => [c.id, c.name.toLowerCase()]));
  const acc = new Map(s.accounts.map((a) => [a.id, a.name.toLowerCase()]));
  const q = (f.q || '').trim().toLowerCase();
  return s.transactions
    .filter((t) => {
      if (f.status === 'draft' ? t.status !== 'draft' : f.status === 'done' && t.status === 'draft') return false;
      if (f.type && t.type !== f.type) return false;
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
      if (f.categoryId && t.categoryId !== f.categoryId) return false;
      if (q && !`${t.label || ''} ${cat.get(t.categoryId) || ''} ${acc.get(t.accountId) || ''} ${t.amount}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
}
export function groupByDate(list) {
  const out = [];
  for (const t of list) {
    const g = out[out.length - 1];
    if (g && g.date === t.date) g.items.push(t);
    else out.push({ date: t.date, items: [t] });
  }
  return out.map((g) => ({ ...g, total: round2(g.items.reduce((x, t) => x + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0)) }));
}

/** Catégories récemment / souvent utilisées en premier (pour l'ajout rapide). */
export function rankCategories(s, kind, now = today()) {
  const groups = groupOf(s);
  const since = addDays(now, -60);
  const score = new Map();
  for (const t of s.transactions) if (t.categoryId && t.date >= since) score.set(t.categoryId, (score.get(t.categoryId) || 0) + 1);
  return s.categories.filter((c) => (groups.get(c.groupId)?.kind === 'income') === (kind === 'income')).sort((a, b) => (score.get(b.id) || 0) - (score.get(a.id) || 0));
}
export const currentMonth = currentMonthKey;
