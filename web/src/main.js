// Fills the Kage chapters with Kodo's data: Today, Yesterday, the Leaderboard and the footer
// contract line. Then mounts the CRT in the hero window, the particle dissolve on the body
// copy, and the copy-prompt button. The temple world, the cut-outs, the reveals, the hero exit
// and the rail are Kage's own script (web/vendor/kage/kage-world.js), which boots after this.
// Everything is built with textContent, never innerHTML: chain data is data, not markup.
import { getAddress } from 'viem'
import './shaders/threeui-crt.css'
import './kodo.css'
import { mountCrtBackground } from './shaders/crt/CrtBackground.js'
import { data } from './mock-data.js'
import { dayLabel, dayResult, leaderboard, MIN_SCORED_DAYS, pct, validBand } from './model.js'

const $ = (id) => document.getElementById(id)
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v
    else n.setAttribute(k, v)
  }
  for (const k of kids) if (k != null) n.append(k)
  return n
}
const set = (id, text) => { const n = $(id); if (n) n.textContent = text }
const bandShort = (b) => (validBand(b) ? `${pct(b.p10)} to ${pct(b.p90)}` : 'n/a')
const signed = (x, d = 1) => {
  const r = Number(x.toFixed(d))
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}`
}

function renderToday() {
  const t = data.days[data.today]
  const next = data.days[data.today + 1]
  const counts = Number.isInteger(t?.revealed) && Number.isInteger(t?.committed)
  set('today-copy', validBand(t?.crowd)
    ? `For ${dayLabel(data.today)}, the crowd expects BNB between ${pct(t.crowd.p10)} and ${pct(t.crowd.p90)}, ` +
      `with ${pct(t.crowd.p50)} in the middle${counts ? `, from ${t.revealed} of ${t.committed} forecasts revealed so far` : ''}. ` +
      `The baseline, no change widened by recent volatility, says ${bandShort(t.baseline)}.`
    : `The crowd band for ${dayLabel(data.today)} appears once forecasts are revealed after 00:00 UTC.`)
  const stats = [
    [String(next?.committed ?? 0), `Locked for ${dayLabel(data.today + 1)}`],
    [counts ? `${t.revealed}/${t.committed}` : '0', 'Revealed today'],
    [validBand(t?.crowd) ? pct(t.crowd.p50) : 'n/a', 'Crowd middle'],
    [validBand(t?.baseline) ? `±${pct(t.baseline.p90).slice(1)}` : 'n/a', 'Baseline band'],
  ]
  $('today-stats')?.replaceChildren(...stats.map(([b, s]) => el('div', {}, el('b', {}, b), el('span', {}, s))))
}

function renderYesterday() {
  const day = data.today - 1
  const d = data.days[day]
  const r = dayResult(d)
  const msg = {
    missing: 'No forecasts were locked',
    void: 'Void: no fresh Chainlink price',
    pending: 'Not settled yet',
    'no-crowd': 'No forecasts revealed',
  }[r.state]
  set('y-change', r.changeBps != null ? `BNB ${pct(r.changeBps)}` : dayLabel(day))
  if (msg) { set('y-verdict', msg); return }
  set('y-verdict', r.crowdBeatBaseline ? 'The crowd beat the baseline' : 'The baseline beat the crowd')
  set('y-crowd', bandShort(d.crowd))
  set('y-crowd-loss', `Loss ${d.crowdLoss}`)
  set('y-base', bandShort(d.baseline))
  set('y-base-loss', `Loss ${d.baselineLoss}`)
}

function renderBoard() {
  const root = $('board-data'); if (!root) return
  const rows = leaderboard(data.holders).slice(0, 5)
  if (!rows.length) {
    root.replaceChildren(el('p', { class: 'body' }, `Nobody has ${MIN_SCORED_DAYS} scored days yet.`))
    return
  }
  root.replaceChildren(...rows.map((r, i) =>
    el('div', { class: 'les', 'data-les': String(i), 'data-cursor': '' },
      el('span', { class: 'k' }, String(i + 1).padStart(2, '0')),
      el('h3', {}, r.address),
      el('p', {}, `In band ${Math.round(r.calibration * 100)}% of ${r.daysScored} scored days. Streak ${r.streak}.`),
      el('span', { class: 't' }, el('b', { class: r.skillBps >= 0 ? 'up' : 'down' }, signed(r.skillBps)), 'bps a day'),
      el('i', { class: 'bar' }),
    )))
}

function renderContract() {
  const root = $('contract-line'); if (!root) return
  if (!data.contract) { root.textContent = 'Contract: not deployed yet'; return }
  const a = getAddress(data.contract)
  root.replaceChildren('Contract: ', el('a', { href: `https://bscscan.com/address/${a}`, rel: 'noopener' }, `${a.slice(0, 6)}…${a.slice(-4)}`))
}

for (const render of [renderToday, renderYesterday, renderBoard, renderContract]) {
  try {
    render()
  } catch (e) {
    console.error(e)
  }
}
if (data.sample) document.querySelectorAll('[data-sample]').forEach((n) => { n.hidden = false })

// The hero window: <CrtBackground variant="terminal" ... /> with the configured props.
const crt = $('hero-crt')
if (crt) {
  try {
    mountCrtBackground(crt, { variant: 'terminal', speed: 1, typeSpeed: 1, motion: 1, hue: 0, saturation: 1, brightness: 1, opacity: 1 })
  } catch (e) {
    console.warn('CRT disabled:', e.message)
  }
}

// Copy the agent prompt. The clipboard can refuse; then say how to copy it by hand.
for (const b of document.querySelectorAll('[data-copy]')) {
  const label = b.querySelector('span')
  const text = label.textContent
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy)
      label.textContent = 'Prompt copied'
    } catch {
      label.textContent = `Copy this: ${b.dataset.copy}`
    }
    setTimeout(() => { label.textContent = text }, 2600)
  })
}

// Particle dissolve on the body copy (ThreeUI particle scroll), in the moon's vermilion.
if (window.ParticleScroll && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  window.__ps = window.ParticleScroll.mountParticleScroll('[data-ps]', {
    point: 0.68, band: 330, density: 2, size: 1.25, spread: 200, gravity: 0.35, drift: 0.9, swirl: 70,
    stagger: 0.55, fade: 0.42, settle: 0.7, hold: 1.15, smoothing: 0.26,
    tintA: [0.878, 0.137, 0.11], tintB: [1.0, 0.353, 0.235],
  })
}
