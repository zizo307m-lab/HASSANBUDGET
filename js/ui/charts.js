// Graphiques SVG sans dépendance. Toutes les fonctions renvoient une chaîne SVG.
import { esc } from './dom.js';

export const SERIES_COLORS = ['#244c44', '#b3dc62', '#78a39a', '#e0a73a', '#c4684a', '#6c8fd0', '#9a7cc4', '#d98aa8', '#8a96a0'];
const nice = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
};

/** Barres revenus / dépenses par tranche. sel = index mis en évidence. */
export function flowChart(buckets, { sel = buckets.length - 1, inc = '#b3dc62', exp = '#78a39a', h = 190 } = {}) {
  const W = 340;
  const padB = 26;
  const top = 8;
  const H = h;
  const ch = H - padB - top;
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expense)));
  const n = buckets.length;
  const slot = W / n;
  const dense = n > 14;
  const bw = dense ? Math.max(2.5, slot * 0.34) : Math.min(14, slot * 0.28);
  const every = n > 24 ? 5 : n > 14 ? 2 : 1;
  const bar = (v, x, color, r) => {
    const hh = v > 0 ? Math.max(5, (v / max) * ch) : 2.5;
    const y = top + ch - hh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${hh.toFixed(1)}" rx="${Math.min(r, bw / 2)}" fill="${color}" ${v > 0 ? '' : 'opacity=".75"'}/>`;
  };
  let out = '';
  buckets.forEach((b, i) => {
    const cx = slot * i + slot / 2;
    out += bar(b.income, cx - bw - 1, inc, 4) + bar(b.expense, cx + 1, exp, 4);
    if (i % every === 0 || i === n - 1) out += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="12.5" fill="currentColor" fill-opacity="${i === sel ? 1 : 0.55}" font-weight="${i === sel ? 700 : 400}">${esc(b.label)}</text>`;
    out += `<rect data-i="${i}" x="${(slot * i).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenus et dépenses" data-n="${n}">${out}</svg>`;
}

/** Courbe + curseur. points: [{date, v}], cursor: index. */
export function lineChart(points, { cursor = 0, h = 210, color = '#2c5e53' } = {}) {
  const W = 340;
  const H = h;
  const pt = 10;
  const pb = 12;
  const n = points.length;
  if (!n) return '';
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 8) + 4);
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let d = '';
  points.forEach((p, i) => {
    d += `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`;
  });
  const c = Math.min(Math.max(0, cursor), n - 1);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution" data-n="${n}">
    <line x1="${x(c).toFixed(1)}" x2="${x(c).toFixed(1)}" y1="2" y2="${H}" stroke="currentColor" stroke-opacity=".45" stroke-dasharray="3 4"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(c).toFixed(1)}" cy="${y(points[c].v).toFixed(1)}" r="5" fill="${color}"/>
    <rect data-scrub x="0" y="0" width="${W}" height="${H}" fill="transparent"/></svg>`;
}

/** Anneau de répartition. rows: [{label, value}] */
export function donut(rows, { size = 150 } = {}) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!total) return '';
  const r = 52;
  const C = 2 * Math.PI * r;
  let acc = 0;
  const arcs = rows.map((row, i) => {
    const len = (row.value / total) * C;
    const s = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${SERIES_COLORS[i % SERIES_COLORS.length]}" stroke-width="22" stroke-dasharray="${Math.max(0, len - 1.5).toFixed(2)} ${(C - len + 1.5).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
    acc += len;
    return s;
  });
  return `<svg viewBox="0 0 140 140" width="${size}" height="${size}" role="img" aria-label="Répartition">${arcs.join('')}</svg>`;
}

/** Barres verticales simples (prévision) : rows [{label, value}], valeurs négatives permises. */
export function balanceBars(rows, { h = 160 } = {}) {
  const W = 340;
  const padB = 24;
  const n = rows.length;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const hasNeg = rows.some((r) => r.value < 0);
  const zero = hasNeg ? (h - padB) / 2 : h - padB;
  const half = hasNeg ? (h - padB) / 2 - 6 : h - padB - 8;
  const slot = W / n;
  const bw = Math.min(26, slot * 0.55);
  let out = `<line x1="0" x2="${W}" y1="${zero}" y2="${zero}" stroke="currentColor" stroke-opacity=".2"/>`;
  rows.forEach((r, i) => {
    const hh = Math.max(3, (Math.abs(r.value) / max) * half);
    const cx = slot * i + slot / 2;
    const y = r.value >= 0 ? zero - hh : zero;
    out += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${hh.toFixed(1)}" rx="5" fill="${r.value >= 0 ? '#b3dc62' : '#c4443a'}"/>`;
    out += `<text x="${cx.toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="12.5" fill="currentColor" fill-opacity=".6">${esc(r.label)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Solde projeté">${out}</svg>`;
}
export const _nice = nice;
