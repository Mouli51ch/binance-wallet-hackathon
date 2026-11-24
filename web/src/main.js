// Renders the Today, Yesterday and Leaderboard sections and the footer contract line.
// Everything is built with textContent, never innerHTML: chain data is data, not markup.
import { getAddress } from 'viem'
import './shaders/threeui-crt.css'
import './scroll-reveal.css'
import { startScrollReveal } from './scroll-reveal.js'
import { mountCrtBackground } from './shaders/crt/CrtBackground.js'
import { data as sample } from './mock-data.js'
import { siteConfig } from './config.js'
import { loadChain } from './chain.js'
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
// Which data: the sample until a network is chosen in config.js (or by build mode, e.g.
// `vite --mode fork`). A failed read never falls back to the sample: the sections say what failed.
let data = sample
let loadError = null
let cfg = { network: 'sample' }
let pill = 'Sample data'
const bps = (x) => `${Number(x).toFixed(1)} bps`

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
      ['Crowd loss', bps(d.crowdLoss)],
      ['Baseline loss', bps(d.baselineLoss)],
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
  // A fork address exists only on this machine, so it gets no explorer link.
  const scan = { mainnet: 'https://bscscan.com', testnet: 'https://testnet.bscscan.com' }[cfg.network]
  if (!scan) {
    root.textContent = `Contract: ${a} on a local ${cfg.network} (not on BscScan).`
    return
  }
  root.replaceChildren('Contract: ', el('a', { href: `${scan}/address/${a}`, rel: 'noopener' }, a), ' on BscScan')
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

// The hero line (T-B02): built only from revealed forecasts; before any reveal, the commit count.
function renderHeroBand(root) {
  const t = data.days[data.today]
  const who = (n) => `${n} verified ${n === 1 ? 'person' : 'people'}`
  const lead = data.sample ? 'Sample: ' : ''
  const next = data.days[data.today + 1]
  if (validBand(t?.crowd) && t.revealed > 0) {
    root.textContent = `${lead}${who(t.revealed)} ${t.revealed === 1 ? 'expects' : 'expect'} BNB between ${pct(t.crowd.p10)} and ${pct(t.crowd.p90)} today.`
  } else if (t?.committed > 0) {
    root.textContent = `${lead}${who(t.committed)} locked a forecast for today. The band opens as they reveal.`
  } else if (next?.committed > 0) {
    // day one, or a quiet day: forecasts exist, they are just hidden until they are revealed tomorrow
    root.textContent = `${lead}${who(next.committed)} locked a forecast for ${dayLabel(data.today + 1)}. The numbers open when they are revealed that day.`
  } else {
    root.textContent = `${lead}No forecasts for today yet.`
  }
}

const parts = [
  ['hero-band', renderHeroBand],
  ['today-data', renderToday],
  ['yesterday-data', renderYesterday],
  ['board-data', renderBoard],
  ['contract-line', renderContract],
]
function renderAll() {
  for (const [id, render] of parts) {
    const root = document.getElementById(id)
    if (!root) continue
    if (loadError) {
      root.textContent = `Could not read the ${cfg.network} contract: ${loadError.shortMessage ?? loadError.message} ` +
        (cfg.network === 'fork' ? 'Check the fork is running (node fork/run.mjs) and reload.' : 'Reload the page; if it keeps failing, the RPC is down.')
      continue
    }
    try {
      render(root)
    } catch (e) {
      console.error(e)
      root.textContent = 'This section could not load its data. Reload the page; if it keeps failing, the data source is down.'
    }
  }
}

// The sample renders at once, so its cards join the scroll reveal. A chain read must not hold
// the page: the reveals start now and the sections fill in when the RPC answers.
async function loadAndRender() {
  try {
    cfg = siteConfig()
    if (cfg.network !== 'sample') data = await loadChain(cfg)
  } catch (e) {
    loadError = e
  }
  pill = data.sample ? 'Sample data' : cfg.network === 'fork' ? 'Local fork' : null
  renderAll()
}
const loading = loadAndRender() // synchronous up to its first await, so the sample is already drawn
startScrollReveal()
loading.catch((e) => console.error(e))
