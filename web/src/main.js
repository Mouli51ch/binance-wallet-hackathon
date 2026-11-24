// Renders the Today, Yesterday and Leaderboard sections and the footer contract line.
// Everything is built with textContent, never innerHTML: chain data is data, not markup.
import { getAddress } from 'viem'
import './shaders/threeui-crt.css'
import './scroll-reveal.css'
import { startScrollReveal } from './scroll-reveal.js'
import { mountCrtBackground } from './shaders/crt/CrtBackground.js'
import { data } from './mock-data.js'
import { dayLabel, dayResult, leaderboard, MIN_SCORED_DAYS, pct, validBand } from './model.js'

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v
    else n.setAttribute(k, v)
  }
  for (const k of kids) if (k != null) n.append(k)
  return n
}

const CORNERS = ['tl', 'tr', 'bl', 'br']
const sheet = (head, pill, rows, notes = []) =>
  el(
    'div',
    { class: 'framed sheet' },
    ...CORNERS.map((c) => el('i', { class: `corner ${c}` })),
    el('div', { class: 'sheet__head' }, el('span', {}, head), pill ? el('span', { class: 'pill' }, pill) : null),
    el('dl', { class: 'sheet__rows' }, ...rows.map(([dt, dd]) => el('div', {}, el('dt', {}, dt), el('dd', {}, dd)))),
    ...notes.map((t) => el('p', { class: 'sheet__note' }, t)),
  )

const bandText = (b) => (validBand(b) ? `${pct(b.p10)} to ${pct(b.p90)}, middle ${pct(b.p50)}` : 'n/a')
const pill = data.sample ? 'Sample data' : null

function renderToday(root) {
  const t = data.days[data.today]
  const next = data.days[data.today + 1]
  const crowdRows = validBand(t?.crowd)
    ? [
        ['Low, p10', pct(t.crowd.p10)],
        ['Middle, p50', pct(t.crowd.p50)],
        ['High, p90', pct(t.crowd.p90)],
        ...(Number.isInteger(t.revealed) && Number.isInteger(t.committed) ? [['Revealed so far', `${t.revealed} of ${t.committed}`]] : []),
      ]
    : [['Crowd band', 'Appears once forecasts are revealed after 00:00 UTC']]
  root.replaceChildren(
    sheet(`Crowd band for ${dayLabel(data.today)}, UTC`, pill, [...crowdRows, ['Baseline band', bandText(t?.baseline)]], [
      'The crowd band is the average of every revealed low, middle and high. The baseline is "no change", widened by recent volatility.',
    ]),
    sheet(`Locked for ${dayLabel(data.today + 1)}, UTC`, pill, [
      ['Verified humans committed', String(next?.committed ?? 0)],
      ['Numbers revealed', 'after 00:00 UTC'],
    ]),
  )
}

function renderYesterday(root) {
  const day = data.today - 1
  const d = data.days[day]
  const r = dayResult(d)
  const head = `Result for ${dayLabel(day)}, UTC`
  const msg = {
    missing: 'No forecasts were locked for this day.',
    void: 'Void day: no Chainlink price was fresh enough at midnight, so nobody is scored.',
    pending: 'Not settled yet. Anyone can settle it with the Chainlink round from midnight UTC.',
    'no-crowd': 'Settled, but no forecasts were revealed, so there is no crowd band to score.',
  }[r.state]
  if (msg) {
    const rows = r.state === 'no-crowd' ? [['BNB change, Chainlink', pct(r.changeBps)]] : []
    root.replaceChildren(sheet(head, pill, rows, [msg]))
    return
  }
  root.replaceChildren(
    sheet(head, pill, [
      ['BNB change, Chainlink', pct(r.changeBps)],
      ['Crowd band', bandText(d.crowd)],
      ['Baseline band', bandText(d.baseline)],
      ['Inside the crowd band', r.inCrowdBand ? 'yes' : 'no'],
    ]),
    sheet('Crowd vs baseline', pill, [
      ['Crowd loss', `${d.crowdLoss} bps`],
      ['Baseline loss', `${d.baselineLoss} bps`],
      ['Forecasts scored', String(d.revealed)],
    ], [r.crowdBeatBaseline ? 'The crowd beat the baseline. Lower loss is better.' : 'The baseline beat the crowd. Lower loss is better.']),
  )
}

function renderBoard(root) {
  const rows = leaderboard(data.holders)
  if (!rows.length) {
    root.replaceChildren(el('p', { class: 'sheet__note' }, `Nobody has ${MIN_SCORED_DAYS} scored days yet.`))
    return
  }
  const num = (x, d = 1) => {
    const r = Number(x.toFixed(d))
    return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}`
  }
  const th = (t, cls) => el('th', { scope: 'col', ...(cls ? { class: cls } : {}) }, t)
  const table = el(
    'table',
    { class: 'board' },
    el('caption', {}, `Ranked by skill: average loss saved per day against the baseline, in bps. At least ${MIN_SCORED_DAYS} scored days.`),
    el('thead', {}, el('tr', {}, th('#'), th('Address'), th('Skill'), th('In band'), th('Streak'), th('Days', 'wide'))),
    el(
      'tbody',
      {},
      ...rows.map((r, i) =>
        el(
          'tr',
          {},
          el('td', {}, String(i + 1)),
          el('td', { class: 'mono' }, r.address),
          el('td', { class: r.skillBps >= 0 ? 'up' : 'down' }, num(r.skillBps)),
          el('td', {}, `${Math.round(r.calibration * 100)}%`),
          el('td', {}, String(r.streak)),
          el('td', { class: 'wide' }, String(r.daysScored)),
        ),
      ),
    ),
  )
  root.replaceChildren(
    el('div', { class: 'framed sheet board-wrap' }, ...CORNERS.map((c) => el('i', { class: `corner ${c}` })),
      el('div', { class: 'sheet__head' }, el('span', {}, 'Forecasters'), pill ? el('span', { class: 'pill' }, pill) : null), el('div', { class: 'board-scroll' }, table),
      el('p', { class: 'sheet__note' }, '"In band" is how often the result landed between their low and high. Well calibrated is about 80%.')),
  )
}

function renderContract(root) {
  if (!data.contract) {
    root.textContent = 'Contract: not deployed yet.'
    return
  }
  const a = getAddress(data.contract)
  root.replaceChildren('Contract: ', el('a', { href: `https://bscscan.com/address/${a}`, rel: 'noopener' }, a), ' on BscScan')
}

// Hero background: <CrtBackground variant="terminal" ... /> with the configured props.
const crtFrame = document.getElementById('hero-crt')
if (crtFrame) {
  try {
    mountCrtBackground(crtFrame, { variant: 'terminal', speed: 1, typeSpeed: 1, motion: 1, hue: 0, saturation: 1, brightness: 1, opacity: 1 })
  } catch (e) {
    // No WebGL: the hero keeps its plain black background, everything else still works.
    console.warn('CRT background disabled:', e.message)
  }
}

const parts = [
  ['today-data', renderToday],
  ['yesterday-data', renderYesterday],
  ['board-data', renderBoard],
  ['contract-line', renderContract],
]
for (const [id, render] of parts) {
  const root = document.getElementById(id)
  if (!root) continue
  try {
    render(root)
  } catch (e) {
    console.error(e)
    root.textContent = 'This section could not load its data. Reload the page; if it keeps failing, the data source is down.'
  }
}

// Kage scroll animation: runs after the data sections exist so their cards rise in too.
startScrollReveal()
