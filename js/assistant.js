// Assistant local : répond aux questions fréquentes à partir des données de l'appareil.
// Aucune IA externe, aucun envoi de données : simple reconnaissance de mots-clés + calculs.
import { budgetOverview, categoryBreakdown, debtRemaining, forecast, goalProgress, monthStats, netWorth, periodTotals } from './calc.js';
import { monthEnd, monthKey, monthLabel, monthStart, shiftMonth, startOfWeek, today, addDays } from './utils.js';

export const SUGGESTIONS = [
  'Combien ai-je dépensé ce mois ?',
  'Quel est mon plus gros poste ?',
  'Où en est mon budget ?',
  'Quel est mon patrimoine ?',
  'Projection de fin de mois ?',
  'Comparé au mois dernier ?',
  'Mes dettes et créances ?',
];

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
const has = (n, ...words) => words.some((w) => n.includes(w));

function scope(n, now) {
  const cur = monthKey(now);
  if (has(n, 'mois dernier', 'mois precedent', 'le mois passe')) return { label: 'le mois dernier', from: monthStart(shiftMonth(cur, -1)), to: monthEnd(shiftMonth(cur, -1)), key: shiftMonth(cur, -1) };
  if (has(n, 'semaine')) return { label: 'cette semaine', from: startOfWeek(now), to: now, key: cur };
  if (has(n, 'aujourd')) return { label: "aujourd'hui", from: now, to: now, key: cur };
  if (has(n, 'annee', 'an ')) return { label: 'cette année', from: `${now.slice(0, 4)}-01-01`, to: now, key: cur };
  return { label: 'ce mois-ci', from: monthStart(cur), to: monthEnd(cur), key: cur };
}

function matchCategory(s, n) {
  let best = null;
  for (const c of s.categories) {
    const words = norm(c.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    const hit = words.filter((w) => n.includes(w.slice(0, Math.max(4, w.length - 1)))).length;
    if (hit && (!best || hit > best.hit)) best = { c, hit };
  }
  return best?.c || null;
}

export function answer(s, question, { now = today(), fmt = (x) => String(x) } = {}) {
  const n = norm(question);
  if (!n.trim()) return { text: 'Posez-moi une question sur vos finances, par exemple : « Combien ai-je dépensé en courses ce mois ? ».' };
  const sc = scope(n, now);
  const cat = matchCategory(s, n);

  if (cat && has(n, 'depens', 'combien', 'paye', 'reste', 'budget')) {
    const bd = categoryBreakdown(s, sc.from, sc.to);
    const row = bd.rows.find((r) => r.category.id === cat.id);
    const ov = budgetOverview(s, monthKey(now), now);
    const line = ov.groups.flatMap((g) => g.cats || []).find((c) => c.category?.id === cat.id);
    const base = `${sc.label.charAt(0).toUpperCase() + sc.label.slice(1)}, vous avez dépensé ${fmt(row?.total || 0)} en « ${cat.name} ».`;
    return { text: line && sc.key === monthKey(now) && line.assigned > 0 ? `${base} Il reste ${fmt(line.available)} sur l'enveloppe (${fmt(line.assigned)} assignés).` : base };
  }
  if (has(n, 'patrimoine', 'solde', 'combien ai je', 'combien j ai', 'argent total', 'fortune')) {
    const w = netWorth(s, now);
    return { text: `Votre patrimoine net est de ${fmt(w.total)} : comptes ${fmt(w.accounts)}, actifs ${fmt(w.assets)}${w.credits ? `, crédits −${fmt(w.credits)}` : ''}. Disponible dans vos comptes budgétés : ${fmt(w.dispo)}.` };
  }
  if (has(n, 'plus gros', 'principal', 'ou part', 'ou va', 'poste')) {
    const bd = categoryBreakdown(s, sc.from, sc.to);
    if (!bd.rows.length) return { text: `Aucune dépense enregistrée ${sc.label}.` };
    return { text: `${sc.label.charAt(0).toUpperCase() + sc.label.slice(1)}, vos plus gros postes sont : ${bd.rows.slice(0, 3).map((r) => `${r.category.name} (${fmt(r.total)}, ${Math.round(r.pct)} %)`).join(', ')}.` };
  }
  if (has(n, 'prevision', 'projection', 'fin de mois', 'fin du mois')) {
    const m = monthStats(s, monthKey(now), now);
    const f = forecast(s, 3, now);
    return { text: `Au rythme actuel (${fmt(m.avgPerDay)} par jour), vos dépenses du mois atteindraient environ ${fmt(m.projection)}. Solde disponible estimé fin ${monthLabel(f.rows[0].month).split(' ')[0].toLowerCase()} : ${fmt(f.rows[0].balance)}.` };
  }
  if (has(n, 'compar', 'par rapport', 'evolution', 'mois dernier') && !cat) {
    const cur = monthKey(now);
    const a = periodTotals(s, monthStart(cur), monthEnd(cur)).expense;
    const b = periodTotals(s, monthStart(shiftMonth(cur, -1)), monthEnd(shiftMonth(cur, -1))).expense;
    if (!b) return { text: `Pas de dépenses le mois dernier pour comparer. Ce mois-ci : ${fmt(a)}.` };
    const pct = Math.round(((a - b) / b) * 100);
    return { text: `Ce mois-ci : ${fmt(a)} contre ${fmt(b)} le mois dernier, soit ${pct > 0 ? '+' : ''}${pct} %.` };
  }
  if (has(n, 'revenu', 'salaire', 'gagne')) {
    const t = periodTotals(s, sc.from, sc.to);
    return { text: `${sc.label.charAt(0).toUpperCase() + sc.label.slice(1)}, vos revenus s'élèvent à ${fmt(t.income)}.` };
  }
  if (has(n, 'epargn', 'economis')) {
    const m = monthStats(s, sc.key, now);
    return { text: m.income > 0 ? `${sc.label.charAt(0).toUpperCase() + sc.label.slice(1)} : revenus ${fmt(m.income)}, dépenses ${fmt(m.expense)}, soit ${fmt(m.net)} épargnés (${Math.round(m.savingsRate)} % des revenus).` : 'Aucun revenu enregistré ce mois-ci, impossible de calculer le taux d\'épargne.' };
  }
  if (has(n, 'dette', 'creance', 'doit', 'dois')) {
    const rows = s.debts.map((d) => ({ d, rest: debtRemaining(d) })).filter((x) => x.rest > 0);
    if (!rows.length) return { text: 'Aucune dette ni créance en cours.' };
    return { text: rows.map(({ d, rest }) => (d.direction === 'owed_to_me' ? `${d.person} vous doit ${fmt(rest)}` : `Vous devez ${fmt(rest)} à ${d.person}`)).join(' · ') + '.' };
  }
  if (has(n, 'objectif', 'projet')) {
    if (!s.goals.length) return { text: 'Aucun objectif défini pour le moment.' };
    return { text: s.goals.map((g) => `${g.name} : ${Math.round(goalProgress(g, now).pct)} % (${fmt(g.saved)} / ${fmt(g.target)})`).join(' · ') + '.' };
  }
  if (has(n, 'depens', 'combien', 'total')) {
    const t = periodTotals(s, sc.from, sc.to);
    return { text: `${sc.label.charAt(0).toUpperCase() + sc.label.slice(1)}, vous avez dépensé ${fmt(t.expense)} pour ${fmt(t.income)} de revenus.` };
  }
  if (has(n, 'budget', 'enveloppe', 'assigner', 'depasse')) {
    const ov = budgetOverview(s, monthKey(now), now);
    const over = ov.overspent;
    return { text: `Prêt à assigner : ${fmt(ov.ready)} (trésorerie ${fmt(ov.cash)}, en enveloppes ${fmt(ov.inEnvelopes)}). ${over.length ? `Dépassements : ${over.slice(0, 4).map((c) => `${c.category.name} (${fmt(-c.available)})`).join(', ')}.` : 'Aucune enveloppe dépassée.'}` };
  }
  return { text: "Je n'ai pas compris cette question. Essayez par exemple : « Combien ai-je dépensé en courses ? », « Quel est mon plus gros poste ? » ou « Où en est mon budget ? ».", fallback: true };
}
export const _unused = addDays;
