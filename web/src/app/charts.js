// Two SVG charts, drawn by hand so the app adds no chart library.
//   bandStrip   one day: the baseline band, the crowd band, an optional band of yours, the outcome
//   dayColumns  many days side by side: the same marks stood up as columns
// Values are bps of BNB's daily % change. Everything is built with createElementNS and
// textContent, never innerHTML.
import { pct } from '../model.js'

const NS = 'http://www.w3.org/2000/svg'
export function svg(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v))
  for (const k of kids) if (k != null) n.append(k)
  return n
}
const text = (x, y, s, attrs = {}) => svg('text', { x, y, ...attrs }, s)

/** A symmetric axis in bps that fits every value with some room, at least +-3%. */
export function domainFor(values) {
  const m = Math.max(300, ...values.filter(Number.isFinite).map(Math.abs))
  return Math.ceil((m * 1.15) / 100) * 100
}

/** One day as horizontal rows on a shared % axis. */
export function bandStrip({ baseline, crowd, mine, outcome, domain, labels = {} }) {
  // a narrower canvas on phones keeps the labels at a readable size once the SVG is scaled down
  const narrow = typeof innerWidth === 'number' && innerWidth < 640
  const W = narrow ? 380 : 640, L = narrow ? 64 : 92, R = 16, rowH = 26, gap = 14
  const rows = [
    baseline && { key: 'baseline', band: baseline, label: labels.baseline ?? 'Baseline' },
    crowd && { key: 'crowd', band: crowd, label: labels.crowd ?? 'Crowd' },
    mine && { key: 'mine', band: mine, label: labels.mine ?? 'Yours' },
  ].filter(Boolean)
  const top = 18, H = top + rows.length * (rowH + gap) + 26
  const x = (v) => L + ((v + domain) / (2 * domain)) * (W - L - R)
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart chart--strip', role: 'img',
    'aria-label': rows.map((r) => `${r.label} ${pct(r.band.p10)} to ${pct(r.band.p90)}, middle ${pct(r.band.p50)}`).join('. ') +
      (Number.isFinite(outcome) ? `. Outcome ${pct(outcome)}.` : '') })
  const step = domain > 1200 ? 500 : domain > 600 ? 200 : 100
  for (let v = -Math.floor(domain / step) * step; v <= domain; v += step) {
    g.append(svg('line', { x1: x(v), x2: x(v), y1: top - 6, y2: H - 22, class: v === 0 ? 'ax ax--zero' : 'ax' }))
    if ((v / step) % 2 === 0) g.append(text(x(v), H - 6, pct(v, 0), { class: 'tick', 'text-anchor': 'middle' }))
  }
  rows.forEach((r, i) => {
    const y = top + i * (rowH + gap)
    g.append(text(0, y + rowH / 2 + 4, r.label, { class: 'lab' }))
    g.append(svg('rect', { x: x(r.band.p10), y, width: Math.max(2, x(r.band.p90) - x(r.band.p10)), height: rowH, class: `band band--${r.key}` }))
    g.append(svg('line', { x1: x(r.band.p50), x2: x(r.band.p50), y1: y - 3, y2: y + rowH + 3, class: `mid mid--${r.key}` }))
  })
  if (Number.isFinite(outcome)) {
    const ox = x(Math.max(-domain, Math.min(domain, outcome)))
    g.append(svg('line', { x1: ox, x2: ox, y1: top - 10, y2: H - 22, class: 'outcome' }))
    g.append(text(ox, top - 12 < 8 ? 8 : top - 8, `BNB ${pct(outcome)}`, { class: 'tick tick--out', 'text-anchor': ox > W - 90 ? 'end' : ox < L + 60 ? 'start' : 'middle' }))
  }
  return g
}

/** Many days as columns: baseline outline, crowd bar, optional band of one forecaster, outcome dot. */
export function dayColumns({ days, domain, mineKey = null, label }) {
  const colW = 44, L = 46, R = 10, top = 12, plotH = 220
  const W = Math.max(360, L + R + days.length * colW), H = top + plotH + 34
  const y = (v) => top + ((domain - v) / (2 * domain)) * plotH
  // drawn at its natural size, up to 1.5x: a few days should not blow up to the full page width
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart chart--cols', role: 'img', 'aria-label': label, style: `max-width:${Math.round(W * 1.5)}px` })
  const step = domain > 1200 ? 500 : domain > 600 ? 200 : 100
  for (let v = -Math.floor(domain / step) * step; v <= domain; v += step) {
    g.append(svg('line', { x1: L - 4, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'ax ax--zero' : 'ax' }))
    if ((v / step) % 2 === 0) g.append(text(L - 8, y(v) + 4, pct(v, 0), { class: 'tick', 'text-anchor': 'end' }))
  }
  days.forEach((d, i) => {
    const cx = L + i * colW + colW / 2
    if (d.baseline) g.append(svg('rect', { x: cx - 14, y: y(d.baseline.p90), width: 28, height: Math.max(1, y(d.baseline.p10) - y(d.baseline.p90)), class: 'band band--baseline' }))
    if (d.crowd) {
      g.append(svg('rect', { x: cx - 7, y: y(d.crowd.p90), width: 14, height: Math.max(2, y(d.crowd.p10) - y(d.crowd.p90)), class: 'band band--crowd' }))
      g.append(svg('line', { x1: cx - 10, x2: cx + 10, y1: y(d.crowd.p50), y2: y(d.crowd.p50), class: 'mid mid--crowd' }))
    }
    const m = mineKey && d[mineKey]
    if (m) g.append(svg('rect', { x: cx + 9, y: y(m.p90), width: 4, height: Math.max(2, y(m.p10) - y(m.p90)), class: 'band band--mine' }))
    if (Number.isFinite(d.change)) {
      const inside = d.crowd && d.crowd.p10 <= d.change && d.change <= d.crowd.p90
      g.append(svg('circle', { cx, cy: y(Math.max(-domain, Math.min(domain, d.change))), r: 4.5, class: inside ? 'dot' : 'dot dot--miss' }))
    }
    g.append(text(cx, H - 10, d.tick, { class: 'tick', 'text-anchor': 'middle' }))
  })
  return g
}
