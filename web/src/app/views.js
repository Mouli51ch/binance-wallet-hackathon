// The five app views. Each returns one DOM node built with textContent, never innerHTML:
// chain data is data, not markup. Read-only: nothing here connects a wallet or signs.
import { getAddress, isAddress } from 'viem'
import { backtest, dayLabel, forecastRows, guessRecord, leanOf, leaderboard, MIN_SCORED_DAYS, myDays, pct, raceVerdict, sealGlyph, shortAddr, validBand } from '../model.js'
import { bandStrip, dayColumns, domainFor, svg } from './charts.js'
import { bnbPrice, raceData, usdAt } from '../price.js'

export const RISK = 'Forecasting signal only. Not financial advice. No returns are promised.'

export const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue
    if (k === 'class') n.className = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
    else n.setAttribute(k, v === true ? '' : v)
  }
  for (const k of kids) if (k != null && k !== false) n.append(k)
  return n
}
const CORNERS = () => ['tl', 'tr', 'bl', 'br'].map((c) => el('i', { class: `corner ${c}` }))
const frame = (cls, ...kids) => el('div', { class: `framed ${cls}` }, ...CORNERS(), ...kids)
const head = (title, sub, pill) => el('header', { class: 'view-head' },
  el('div', {}, el('h1', { class: 'f-h2' }, title), sub ? el('p', { class: 'view-sub' }, sub) : null),
  pill ? el('span', { class: 'pill' }, pill) : null)
const stat = (value, label, cls = '') => el('div', { class: `stat ${cls}` }, el('b', {}, value), el('span', {}, label))
const signed = (x, d = 1) => { const r = Number(x.toFixed(d)); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}` }
const settledDays = (h) => Object.values(h.days).filter((d) => d.result).sort((a, b) => a.day - b.day)
const tick = (day) => dayLabel(day).split(' ')[1] // the day of the month; the table below has full dates
const link = (href, label, cls) => el('a', { href, class: cls }, label)
// The risk line lives in app.html's footer, under every view.

function rankRows(app) {
  return leaderboard(app.data.holders, 0).map((r, i) => {
    const raw = app.data.holders.find((h) => getAddress(h.address) === r.full)
    return { ...r, missed: raw?.missedReveals ?? 0, ranked: r.daysScored >= MIN_SCORED_DAYS, i }
  })
}

// accept the shortened form shown everywhere (0x1D01…9623 or 0x1D01...9623) as well as any part of the full address
function addrMatcher(q) {
  const [pre, suf] = q.toLowerCase().split(/…|\.\.\./)
  return (a) => {
    const x = a.toLowerCase()
    return suf === undefined ? x.includes(pre) : x.startsWith(pre) && x.endsWith(suf)
  }
}

/** How Kodo works in three steps, each with today's live number. */
function lifecycle(app) {
  const { data } = app, h = data.history
  const t = h.days[data.today] ?? {}, tm = h.days[data.today + 1] ?? {}
  const step = (n, title, body, live) => el('li', { class: 'step' },
    el('span', { class: 'step-n', 'aria-hidden': 'true' }, n),
    el('h3', { class: 'step-title' }, title), el('p', { class: 'step-body' }, body), el('p', { class: 'step-live' }, ...live))
  return el('ol', { class: 'steps' },
    step('1', 'Forecast', 'Send a range with your AI agent.', [`${tm.committed ?? 0} for ${dayLabel(data.today + 1)}`]),
    step('2', 'Open', 'Sealed overnight, opened the next day.', [`${t.revealed ?? 0} of ${t.committed ?? 0} opened today`]),
    step('3', 'Score', 'The real price decides at 00:00 UTC.', [el('b', { 'data-countdown': '' }, '--:--:--'), ' to go']))
}

const SKILL_URL = 'https://github.com/Mouli51ch/binance-wallet-hackathon/tree/main/skills/human-pulse'
/** What a visitor does: two prompts to paste into an AI agent that can run commands. */
const INSTALL_PROMPT = 'Install the Kodo skill: copy the folder skills/human-pulse from https://github.com/Mouli51ch/binance-wallet-hackathon into ~/.claude/skills/human-pulse, then run npm install inside it.'
function copyRow(label, text) {
  const code = el('code', { class: 'prompt-text' }, text)
  const btn = el('button', { type: 'button', class: 'copy', onclick: async () => {
    try { await navigator.clipboard.writeText(code.textContent); btn.textContent = 'Copied' } catch { btn.textContent = 'Select and copy' }
    setTimeout(() => { btn.textContent = 'Copy' }, 2400)
  } }, 'Copy')
  return { code, node: el('div', { class: 'join-row' }, el('span', { class: 'join-n' }, label), el('div', { class: 'prompt' }, code, btn)) }
}
/** Forecasters (Agent ID holders): add the skill, then send the forecast prompt. */
function joinBlock(text) {
  const install = copyRow('1. Add the skill', INSTALL_PROMPT)
  const go = copyRow('2. Forecast', text)
  return { code: go.code, node: frame('card join-card',
    el('h2', { class: 'card-title' }, 'Paste these into your AI agent'),
    install.node, go.node,
    el('p', { class: 'join-foot' }, 'Needs a Binance Agent ID and an agent that runs commands on your computer, like Claude Code. ',
      el('a', { href: SKILL_URL, rel: 'noopener' }, 'See the skill'))) }
}
/** Everyone else: add the skill, then ask what the crowd expects. No wallet needed. */
function askBlock() {
  const install = copyRow('1. Add the skill', INSTALL_PROMPT)
  const ask = copyRow('2. Ask', 'What does the Kodo crowd expect for BNB today?')
  return frame('card join-card',
    el('h2', { class: 'card-title' }, 'Ask your AI agent'),
    install.node, ask.node,
    el('p', { class: 'join-foot' }, 'No wallet needed. Have a Binance Agent ID? ', link('#/forecast', 'Make your own forecast', 'arrow')))
}

const STAGE = { locked: 'Sealed', revealed: 'Opened', scored: 'Scored', missed: 'Never opened' }
/** One row per forecast: what it said (once public), what BNB did, and how it scored. */
function forecastTable(rows, today, { voter = true } = {}) {
  const numbers = (r) => {
    if (r.band) return `${pct(r.band.p10)} / ${pct(r.band.p50)} / ${pct(r.band.p90)}`
    return r.stage === 'locked' ? `Opens ${dayLabel(r.day)}` : 'Never opened'
  }
  const result = (r) => {
    if (r.score) return `${r.beat ? 'Beat a typical day' : 'Typical day did better'}: ${r.score.loss.toFixed(1)} vs ${r.score.baselineLoss.toFixed(1)}`
    if (r.stage === 'missed') return 'Scored as a miss when the day settles'
    return `Scored after ${dayLabel(r.day)} ends, 00:00 UTC`
  }
  return el('div', { class: 'scroll-x' }, el('table', { class: 'board board--forecasts' },
    el('caption', {}, "Low / middle / high of BNB's move that day. Scores are a loss: lower is better."),
    el('thead', {}, el('tr', {}, ...['Day', voter && 'Forecaster', 'Stage', 'Low / middle / high', 'BNB', 'Result'].filter(Boolean).map((t) => el('th', { scope: 'col' }, t)))),
    el('tbody', {}, ...rows.map((r) => el('tr', {},
      el('td', {}, dayLabel(r.day)),
      voter && el('td', {}, link(`#/f/${getAddress(r.voter)}`, shortAddr(r.voter), 'mono')),
      el('td', {}, el('span', { class: `stage stage--${r.stage}` }, STAGE[r.stage])),
      el('td', { class: r.band ? 'mono' : 'muted' }, numbers(r)),
      el('td', { class: r.change == null ? 'muted' : r.change >= 0 ? 'up' : 'down' }, r.change != null ? pct(r.change) : r.day > today ? 'Not started' : r.day === today ? 'Day not over' : 'Not settled yet'),
      el('td', { class: r.score ? (r.beat ? 'up' : 'down') : 'muted' }, result(r)))))))
}

/* ---------------------------------------------------------------- me: your own address, in this browser only */
const ME_KEY = 'kodo:me'
export function getMe() {
  try { const a = localStorage.getItem(ME_KEY); return a && isAddress(a, { strict: false }) ? getAddress(a.toLowerCase()) : null } catch { return null }
}
function setMe(a) {
  try { if (a) localStorage.setItem(ME_KEY, a); else localStorage.removeItem(ME_KEY) } catch {}
  dispatchEvent(new HashChangeEvent('hashchange')) // redraw the view with the new "me"
}
/** "This is me" on a forecaster's record; "Forget me" once saved. */
function meButton(addr) {
  const mine = getMe() === addr
  return el('button', { type: 'button', class: `me-btn ${mine ? 'me-btn--on' : ''}`, onclick: () => setMe(mine ? null : addr) },
    mine ? 'This is you. Forget' : 'This is me')
}
/** What is yours today: tomorrow's seal, today's open, yesterday's score. */
function youCard(app) {
  const me = getMe()
  if (!me) return null
  const { data } = app
  const m = myDays(data.history, data.today, me)
  const lines = []
  if (m.today?.stage === 'locked') {
    lines.push(el('p', { class: 'you-warn' }, "Open today's forecast: send your daily message again. ", el('b', { 'data-countdown': '' }, '--:--:--'), ' left.'))
  } else if (m.today?.band) {
    lines.push(el('p', {}, `Today: opened, ${pct(m.today.band.p10, 1)} to ${pct(m.today.band.p90, 1)}.`))
  }
  lines.push(m.tomorrow
    ? el('p', {}, `${dayLabel(data.today + 1)}: sealed.`)
    : el('p', {}, `Nothing sealed for ${dayLabel(data.today + 1)} yet. `, link('#/forecast', 'Make it', 'arrow')))
  if (m.yesterday?.score) lines.push(el('p', { class: m.yesterday.beat ? 'up' : 'down' }, `Yesterday: ${m.yesterday.beat ? 'you beat a typical day' : 'a typical day did better'}.`))
  return frame('card you', el('h2', { class: 'card-title' }, 'You, ', link('#/me', shortAddr(me), 'mono')), ...lines)
}
/** #/me: your record, or a box to save your address. */
export function meView(app) {
  const me = getMe()
  if (me) return forecaster(app, me)
  const input = el('input', { type: 'text', placeholder: 'Your wallet address, 0x...', autocomplete: 'off', spellcheck: 'false' })
  const msg = el('p', { class: 'note' })
  const save = () => {
    const v = input.value.trim()
    if (!isAddress(v, { strict: false })) { msg.textContent = 'That is not a wallet address. Copy it from your Binance Agentic Wallet.'; return }
    setMe(getAddress(v.toLowerCase()))
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save() })
  return el('section', { class: 'view' },
    head('Me', 'Paste your wallet address to follow your forecasts. Saved in this browser only.', app.pill),
    frame('card', el('label', { class: 'search' }, el('span', {}, 'Your address'), input),
      el('button', { type: 'button', class: 'btn me-save', onclick: save }, 'Follow my forecasts'), msg))
}

/* ---------------------------------------------------------------- seals and the guess game */
const SHADE = [null, 'rgba(255,77,0,.3)', 'rgba(255,77,0,.62)', '#ff4d00']
/** The seal drawn from a forecast's on-chain hash: anyone can check it, nobody can read it. */
function sealIcon(hash) {
  const n = svg('svg', { viewBox: '0 0 5 5', class: 'seal', 'aria-hidden': 'true', 'shape-rendering': 'crispEdges' })
  sealGlyph(hash).forEach((row, y) => row.forEach((c, x) => { if (c) n.append(svg('rect', { x, y, width: 1, height: 1, fill: SHADE[c] })) }))
  return n
}
/** An opened forecast as a small range on a +-6% track. */
function rangeIcon(f) {
  const x = (v) => 50 + (Math.max(-600, Math.min(600, v)) / 600) * 48
  return svg('svg', { viewBox: '0 0 100 20', class: 'range', 'aria-hidden': 'true' },
    svg('line', { x1: 2, x2: 98, y1: 10, y2: 10, class: 'range-track' }),
    svg('line', { x1: 50, x2: 50, y1: 4, y2: 16, class: 'range-zero' }),
    svg('rect', { x: x(f.p10), y: 5, width: Math.max(1.5, x(f.p90) - x(f.p10)), height: 10, class: 'range-band' }),
    svg('line', { x1: x(f.p50), x2: x(f.p50), y1: 2, y2: 18, class: 'range-mid' }))
}
const hhmm = (t) => new Date(t * 1000).toISOString().slice(11, 16)

/** Every forecast for one day as a tile: a seal until its owner opens it, then its range. */
function wall(app, day) {
  const seals = (app.data.seals ?? []).filter((x) => x.day === day)
  if (!seals.length) return null
  const vs = app.data.history.voters
  const opened = (v) => vs[Object.keys(vs).find((a) => a.toLowerCase() === v.toLowerCase())]?.forecasts?.[day]
  return el('div', { class: 'wall' }, ...seals.map((x) => {
    const f = opened(x.voter)
    return el('a', { class: `tile ${f ? 'tile--open' : 'tile--sealed'}`, href: `#/f/${getAddress(x.voter)}` },
      f ? rangeIcon(f) : sealIcon(x.hash),
      el('span', { class: 'tile-addr' }, shortAddr(x.voter)),
      el('span', { class: 'tile-meta' }, f ? `${pct(f.p10, 1)} to ${pct(f.p90, 1)}` : `sealed ${hhmm(x.at)} UTC`))
  }))
}

/** Guess which way tomorrow's sealed crowd leans; scored when it opens. Kept in this browser only. */
function guessCard(app) {
  const { data } = app
  const target = data.today + 1
  const n = data.history.days[target]?.committed ?? 0
  if (!n) return null
  const KEY = `kodo:guesses:${data.contract ?? 'sample'}`
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {} } catch { return {} } }
  const save = (g) => { try { localStorage.setItem(KEY, JSON.stringify(g)) } catch {} }
  const LEAN = { down: 'Down', flat: 'Flat', up: 'Up' }
  const card = frame('card guess')
  const draw = () => {
    const g = load()
    const rec = guessRecord(g, data.history.days)
    const last = Object.keys(g).map(Number).filter((d) => data.history.days[d]?.crowd).sort((a, b) => b - a)[0]
    const lastLine = last != null && (() => {
      const c = data.history.days[last].crowd
      const ok = leanOf(c.p50) === g[last]
      return el('p', { class: `guess-last ${ok ? 'up' : 'down'}` }, `${dayLabel(last)}: you said ${LEAN[g[last]]}, they went ${LEAN[leanOf(c.p50)]} (${pct(c.p50, 1)}). ${ok ? 'Right.' : 'Missed.'}`)
    })()
    card.replaceChildren(...[...card.querySelectorAll('.corner'),
      el('h2', { class: 'card-title' }, 'Guess the crowd'),
      el('p', { class: 'guess-q' }, n === 1 ? `1 forecast sealed for ${dayLabel(target)}. Which way does it lean?` : `${n} forecasts sealed for ${dayLabel(target)}. Which way do they lean?`),
      g[target]
        ? el('p', { class: 'guess-locked' }, `You said ${LEAN[g[target]]}. Find out ${dayLabel(target)}.`)
        : el('div', { class: 'guess-opts' }, ...Object.entries(LEAN).map(([k, label]) => el('button', { type: 'button', class: 'fc-preset',
          onclick: () => { save({ ...load(), [target]: k }); draw() } }, el('b', {}, label)))),
      lastLine || null,
      rec.scored ? el('p', { class: 'guess-rec' }, `Streak ${rec.streak}. Right ${rec.right} of ${rec.scored}.`) : null].filter(Boolean))
  }
  draw()
  return card
}

/* ---------------------------------------------------------------- the live race */
// The day as a drop: 00:00 UTC at the top, midnight at the bottom, BNB's move since 00:00 across.
// BNB is the ball; its trail is the real Chainlink path today. People's range is the goal zone at
// the bottom, every opened forecast a post that lights up while BNB is inside it. Updates every
// 30 s from the contract's own feed. Motion is off under prefers-reduced-motion (CSS).
const AW = 1000, AH = 470, TOP = 24, BOTTOM = 402
function raceCard(app) {
  const { data, cfg } = app
  if (!data.contract || cfg.network === 'sample') return null
  const t = data.history.days[data.today] ?? {}
  const crowd = validBand(t.crowd) && t.revealed > 0 ? t.crowd : null
  const typical = Math.max(50, t.baseline?.p90 ?? 320)
  const vs = data.history.voters
  const people = Object.entries(vs).map(([a, v]) => ({ a, f: v.forecasts?.[data.today] })).filter((x) => x.f)
  let domain = Math.ceil((Math.max(300, typical, Math.abs(crowd?.p10 ?? 0), Math.abs(crowd?.p90 ?? 0)) * 1.3) / 100) * 100
  const x = (bps) => AW / 2 + (Math.max(-domain, Math.min(domain, bps)) / domain) * (AW / 2 - 30)
  const yOf = (ts) => TOP + Math.max(0, Math.min(1, (ts - data.today * 86400) / 86400)) * (BOTTOM - TOP)

  const arena = svg('svg', { viewBox: `0 0 ${AW} ${AH}`, class: 'race-arena', role: 'img', 'aria-label': 'Live race: BNB today against what people expect' })
  const lanes = svg('g', {}), trail = svg('polyline', { class: 'race-trail', points: '' })
  const tilt = svg('g', { class: 'race-tilt' },
    svg('path', { d: 'M -6 9 Q 0 36 6 9 Z', class: 'race-flame' }),
    svg('path', { d: 'M -3 9 Q 0 25 3 9 Z', class: 'race-flame-core' }),
    svg('path', { d: 'M -6 2 L -13 13 L -6 10 Z M 6 2 L 13 13 L 6 10 Z', class: 'race-fin' }),
    svg('path', { d: 'M 0 -19 C 8 -12 8 3 6 10 L -6 10 C -8 3 -8 -12 0 -19 Z', class: 'race-body' }),
    svg('circle', { cx: 0, cy: -6, r: 3.2, class: 'race-window' }))
  const ring = svg('circle', { r: 16, class: 'race-ring' })
  const ball = svg('g', { class: 'race-ballg', style: `transform:translate(${AW / 2}px,${TOP}px)` }, ring, svg('g', { transform: 'scale(1.35)' }, tilt))
  let lastMove = null
  const nowLine = svg('line', { x1: 0, x2: AW, y1: TOP, y2: TOP, class: 'race-now' })
  // where it lands if the price holds: a drop line from the ball to the floor, and a marker on it
  const drop = svg('line', { x1: AW / 2, x2: AW / 2, y1: TOP, y2: BOTTOM, class: 'race-drop' })
  const mark = svg('path', { d: `M ${AW / 2 - 9} ${BOTTOM + 12} L ${AW / 2} ${BOTTOM} L ${AW / 2 + 9} ${BOTTOM + 12} Z`, class: 'race-mark' })
  const posts = svg('g', {})
  arena.append(lanes, nowLine, drop, trail, posts, mark, ball)

  const drawLanes = () => {
    lanes.replaceChildren(
      ...[-4, -2, 2, 4].map((p) => p * 100).filter((v) => Math.abs(v) < domain).map((v) => svg('line', { x1: x(v), x2: x(v), y1: TOP, y2: BOTTOM, class: 'race-grid' })),
      svg('line', { x1: x(0), x2: x(0), y1: TOP, y2: BOTTOM, class: 'race-zero' }),
      svg('rect', { x: x(-typical), y: TOP, width: x(typical) - x(-typical), height: BOTTOM - TOP, class: 'race-lane race-lane--typical' }),
      crowd ? svg('rect', { x: x(crowd.p10), y: TOP, width: Math.max(4, x(crowd.p90) - x(crowd.p10)), height: BOTTOM - TOP, class: 'race-lane race-lane--crowd' }) : null,
      crowd ? svg('rect', { x: x(crowd.p10), y: BOTTOM, width: Math.max(4, x(crowd.p90) - x(crowd.p10)), height: 12, class: 'race-goal' }) : null,
      svg('line', { x1: 0, x2: AW, y1: BOTTOM, y2: BOTTOM, class: 'race-floor' }))
    posts.replaceChildren(...people.slice(0, 7).map((p, i) => svg('rect', {
      x: x(p.f.p10), y: BOTTOM + 20 + i * 8, width: Math.max(3, x(p.f.p90) - x(p.f.p10)), height: 4, class: 'race-post', 'data-i': i })))
  }
  drawLanes()

  const priceEl = el('b', { class: 'race-price' }, 'BNB')
  const moveEl = el('span', { class: 'race-move' }, 'reading the live price')
  const status = el('p', { class: 'race-status' }, 'The rocket comes in as soon as the live price arrives.')
  const ticks = el('div', { class: 'race-ticks', 'aria-hidden': 'true' })
  const card = el('div', { class: 'race' },
    el('div', { class: 'race-hud' },
      el('div', {}, priceEl, moveEl),
      el('div', { class: 'race-clock' }, el('span', {}, 'touchdown in '), el('b', { 'data-countdown': '' }, '--:--:--'))),
    el('div', { class: 'race-stage' },
      el('span', { class: 'race-y race-y--top' }, '00:00 UTC'),
      arena,
      el('span', { class: 'race-y race-y--bottom' }, 'midnight: touchdown'),
      ticks),
    status)

  const drawTicks = () => ticks.replaceChildren(...[-domain, -domain / 2, 0, domain / 2, domain].map((v) =>
    el('span', { style: `left:${(x(v) / AW) * 100}%` }, pct(v, 0))))
  drawTicks()

  const show = (r) => {
    if (Math.abs(r.moveBps) * 1.15 > domain) { domain = Math.ceil((Math.abs(r.moveBps) * 1.3) / 100) * 100; drawLanes(); drawTicks() }
    const pts = r.points.map((p) => `${x(p.bps).toFixed(1)},${yOf(p.t).toFixed(1)}`)
    trail.setAttribute('points', pts.join(' '))
    const last = r.points[r.points.length - 1]
    const bx = x(last.bps), by = yOf(Math.max(last.t, data.chainNow))
    ball.style.transform = `translate(${bx}px,${by}px)`
    // tilt toward where BNB is heading; a jump of 5 bps or more since the last update fires the boost
    const prev = r.points[r.points.length - 2] ?? last
    tilt.style.transform = `rotate(${Math.max(-28, Math.min(28, (last.bps - prev.bps) * 0.8))}deg)`
    if (lastMove !== null && Math.abs(r.moveBps - lastMove) >= 5) {
      card.classList.remove('race--boost'); void card.offsetWidth; card.classList.add('race--boost')
      setTimeout(() => card.classList.remove('race--boost'), 2600)
    }
    if (lastMove !== null && r.moveBps !== lastMove) { priceEl.classList.remove('flash'); void priceEl.offsetWidth; priceEl.classList.add('flash') }
    lastMove = r.moveBps
    drop.setAttribute('x1', bx); drop.setAttribute('x2', bx); drop.setAttribute('y1', by)
    mark.style.transform = `translateX(${bx - AW / 2}px)`
    nowLine.setAttribute('y1', yOf(data.chainNow)); nowLine.setAttribute('y2', yOf(data.chainNow))
    priceEl.textContent = `BNB $${r.nowUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    moveEl.textContent = `${pct(r.moveBps)} today`
    moveEl.className = `race-move ${r.moveBps >= 0 ? 'up' : 'down'}`
    const v = raceVerdict(r.moveBps, crowd, typical, people.map((p) => p.f))
    posts.querySelectorAll('.race-post').forEach((n) => {
      const f = people[Number(n.dataset.i)].f
      n.classList.toggle('on', f.p10 <= r.moveBps && r.moveBps <= f.p90)
    })
    card.classList.toggle('race--in', v.zone === 'in' || (v.zone === null && v.typical === 'in'))
    card.classList.toggle('race--out', v.zone === 'high' || v.zone === 'low' || (v.zone === null && v.typical === 'out'))
    status.textContent = v.zone === 'in' ? `On course for the pad. ${v.onTarget} of ${v.of} on target.`
      : v.zone === 'high' ? `Overshooting the pad, above everyone. ${v.onTarget} of ${v.of} on target.`
      : v.zone === 'low' ? `Undershooting the pad, below everyone. ${v.onTarget} of ${v.of} on target.`
      : v.typical === 'in' ? "Inside a typical day. The landing pad appears as forecasts open."
      : 'Outside a typical day. A big day for BNB.'
    card.classList.add('race--live')
  }

  // first read, then every 30 s while the card is on screen
  raceData({ rpc: cfg.rpc, contract: data.contract, today: data.today }).then((r) => {
    if (!r) { status.textContent = "Today's opening price is not readable yet. Reload in a minute."; return }
    show(r)
    const id = setInterval(async () => {
      if (!card.isConnected) return clearInterval(id)
      try { show(await r.refresh()) } catch {}
    }, 30000)
  }).catch(() => { status.textContent = 'The live price could not be read. Reload to try again.' })
  return card
}

/* ---------------------------------------------------------------- live activity ticker */
// What just happened, newest first: seals, opens, wins and closes. Scrolls when there is enough of
// it; still under prefers-reduced-motion (CSS). Shortened addresses only.
function ticker(app) {
  const { data } = app, h = data.history, items = []
  for (const x of (data.seals ?? []).slice().sort((a, b) => b.at - a.at)) {
    items.push(el('span', { class: 'ti' }, sealIcon(x.hash), `${shortAddr(x.voter)} sealed a forecast for ${dayLabel(x.day)}`))
  }
  for (const d of [data.today, data.today - 1]) for (const [a, v] of Object.entries(h.voters)) {
    const f = v.forecasts?.[d]
    if (f) items.push(el('span', { class: 'ti ti--open' }, `${shortAddr(a)} opened ${pct(f.p10, 1)} to ${pct(f.p90, 1)}`))
  }
  for (const d of [data.today - 1, data.today - 2]) for (const [a, v] of Object.entries(h.voters)) {
    if (v.scores?.[d] && v.scores[d].loss < v.scores[d].baselineLoss) items.push(el('span', { class: 'ti ti--win' }, `${shortAddr(a)} beat a typical day on ${dayLabel(d)}`))
  }
  for (const x of Object.values(h.days).filter((x) => x.result).sort((a, b) => b.day - a.day).slice(0, 3)) {
    const who = x.crowd ? (x.result.crowdLoss < x.result.baselineLoss ? ', people won' : ', a typical day won') : ''
    items.push(el('span', { class: 'ti ti--close' }, `${dayLabel(x.day)} closed: BNB ${pct(x.result.changeBps)}${who}`))
  }
  if (!items.length) return null
  const list = items.slice(0, 16)
  const moving = list.length >= 4
  const track = el('div', { class: `ticker-track ${moving ? 'ticker-track--move' : ''}`, style: `--ticker-s:${list.length * 5}s` },
    ...list, ...(moving ? list.map((n) => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); return c }) : []))
  return el('div', { class: 'ticker', role: 'status', 'aria-label': 'Latest activity' }, el('span', { class: 'ticker-live' }, 'LIVE'), el('div', { class: 'ticker-win' }, track))
}
const CROWN = () => svg('svg', { viewBox: '0 0 24 14', class: 'crown', 'aria-label': 'Top forecaster' }, svg('path', { d: 'M2 13 L3.5 4 L8.5 8.5 L12 1.5 L15.5 8.5 L20.5 4 L22 13 Z' }))

/* ---------------------------------------------------------------- today */
export function dashboard(app) {
  const { data } = app
  const h = data.history
  const t = h.days[data.today] ?? {}
  const y = h.days[data.today - 1]
  const next = h.days[data.today + 1] ?? {}
  const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`
  const crowd = validBand(t.crowd) && t.revealed > 0

  // the one answer a visitor came for
  let answer, detail = null
  if (crowd) answer = `${people(t.revealed)} expect BNB between ${pct(t.crowd.p10, 1)} and ${pct(t.crowd.p90, 1)} today.`
  else if (t.committed) { answer = `${people(t.committed)} forecast today. Watch them open.` }
  else if (next.committed) { answer = `${people(next.committed)} sealed a forecast for ${dayLabel(data.today + 1)}.`; detail = null }
  else answer = 'No forecasts yet. Be the first.'

  const race = raceCard(app)
  const todayWall = wall(app, data.today)
  const nextWall = wall(app, data.today + 1)
  const priceNow = el('span', { class: 'td-price' })
  bnbPrice().then((p) => { priceNow.textContent = `BNB $${p.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}` }).catch(() => {})

  const top = rankRows(app).filter((r) => r.ranked).slice(0, 3)
  const side = [
    y?.result && frame('card',
      el('h2', { class: 'card-title' }, `Yesterday, ${dayLabel(data.today - 1)}`),
      el('p', { class: 'big-num' }, `BNB ${pct(y.result.changeBps)}`),
      y.crowd ? el('p', { class: 'verdict' }, y.result.crowdLoss < y.result.baselineLoss ? 'People beat a typical day.' : 'A typical day did better.') : null,
      link('#/history', 'Every day', 'arrow')),
    top.length > 0 && frame('card',
      el('h2', { class: 'card-title' }, 'Best forecasters'),
      el('ol', { class: 'mini-board' }, ...top.map((r, i) => el('li', {}, link(`#/f/${r.full}`, r.address, 'mono'), i === 0 ? CROWN() : null))),
      link('#/leaderboard', 'Leaderboard', 'arrow')),
  ].filter(Boolean)

  return el('section', { class: 'view' },
    ticker(app),
    el('header', { class: 'td-intro' },
      el('h1', { class: 'f-h2' }, 'Real people forecast BNB. Kodo keeps score.'),
      el('p', {}, 'One Binance Agent ID, one vote. No bots.'),
      app.pill ? el('span', { class: 'pill' }, app.pill) : null),
    frame('card td-answer',
      el('p', { class: 'td-when' }, `Today, ${dayLabel(data.today)}`, race ? null : priceNow),
      el('p', { class: 'td-big' }, answer),
      detail ? el('p', { class: 'td-detail' }, detail) : null,
      race ?? (crowd ? bandStrip({ baseline: t.baseline, crowd: t.crowd, domain: domainFor([t.crowd.p10, t.crowd.p90, t.baseline?.p10, t.baseline?.p90]), labels: { crowd: 'People', baseline: 'Typical day' } }) : null),
      todayWall ? el('p', { class: 'wall-head' }, `Today: ${t.revealed ?? 0} opened, ${(t.committed ?? 0) - (t.revealed ?? 0)} sealed`) : null,
      todayWall,
      nextWall ? el('p', { class: 'wall-head' }, `Sealed for ${dayLabel(data.today + 1)}. They open in `, el('b', { 'data-countdown': '' }, '--:--:--')) : null,
      nextWall,
      el('div', { class: 'td-actions' },
        link('#/forecast', 'Make your forecast', 'btn'),
        link('#/forecasts', 'See all forecasts', 'arrow'),
        getMe() ? null : link('#/me', 'Follow my forecasts', 'arrow'))),
    youCard(app),
    guessCard(app),
    lifecycle(app),
    askBlock(),
    side.length === 2 ? el('div', { class: 'cols2' }, ...side) : side[0] ?? null,
  )
}

/** Seconds to the next 00:00 UTC on the chain's clock (a fork runs ahead of the browser). */
export function startCountdown(root, chainNow) {
  const t0 = Date.now()
  const tickFn = () => {
    const ns = root.querySelectorAll('[data-countdown]'); if (!ns.length) return false
    const now = chainNow + Math.floor((Date.now() - t0) / 1000)
    const left = 86400 - (now % 86400)
    const p = (v) => String(v).padStart(2, '0')
    for (const n of ns) n.textContent = `${p(Math.floor(left / 3600))}:${p(Math.floor((left % 3600) / 60))}:${p(left % 60)}`
    return true
  }
  if (!tickFn()) return () => {}
  const id = setInterval(() => { if (!tickFn()) clearInterval(id) }, 1000)
  return () => clearInterval(id)
}

/* ---------------------------------------------------------------- history */
export function history(app) {
  const h = app.data.history
  const days = settledDays(h).reverse()
  const cols = settledDays(h).map((d) => ({ tick: tick(d.day), crowd: d.crowd, baseline: d.baseline, change: d.result.changeBps }))
  const domain = domainFor(cols.flatMap((d) => [d.crowd?.p10, d.crowd?.p90, d.baseline?.p10, d.baseline?.p90, d.change]))
  const withCrowd = days.filter((d) => d.crowd) // a day nobody revealed has no crowd to score
  const crowdWins = withCrowd.filter((d) => d.result.crowdLoss < d.result.baselineLoss).length
  return el('section', { class: 'view' },
    head('History', 'Every settled day: what BNB did, what the crowd and the baseline said, and who scored better.', app.pill),
    el('div', { class: 'stats' },
      stat(String(days.length), 'Settled days'),
      stat(`${crowdWins}/${withCrowd.length}`, 'Days the crowd beat the baseline'),
      stat(withCrowd.length ? `${Math.round((100 * withCrowd.filter((d) => d.crowd.p10 <= d.result.changeBps && d.result.changeBps <= d.crowd.p90).length) / withCrowd.length)}%` : 'n/a', 'Outcome inside the crowd band')),
    days.length
      ? frame('card card--chart',
        el('div', { class: 'legend' }, el('span', { class: 'lg lg--crowd' }, 'Crowd band'), el('span', { class: 'lg lg--baseline' }, 'Baseline band'), el('span', { class: 'lg lg--dot' }, 'BNB, inside the crowd band'), el('span', { class: 'lg lg--miss' }, 'outside')),
        el('div', { class: 'scroll-x' }, dayColumns({ days: cols, domain, label: `Crowd and baseline bands with BNB's move for ${cols.length} days` })))
      : frame('card', el('p', { class: 'note' }, 'No settled days yet. The first one settles at the first 00:00 UTC after a forecast.')),
    days.length ? frame('card', el('div', { class: 'scroll-x' }, el('table', { class: 'board' },
      el('caption', {}, 'Losses are pinball loss in bps; lower is better.'),
      el('thead', {}, el('tr', {}, ...['Day', 'BNB', 'Crowd band', 'Baseline band', 'Crowd loss', 'Baseline loss', 'Better', 'Reveals'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, ...days.map((d) => el('tr', {},
        el('td', {}, dayLabel(d.day)),
        el('td', { class: d.result.changeBps >= 0 ? 'up' : 'down' }, pct(d.result.changeBps)),
        el('td', {}, d.crowd ? `${pct(d.crowd.p10)} to ${pct(d.crowd.p90)}` : 'no reveals'),
        el('td', {}, d.baseline ? `${pct(d.baseline.p10)} to ${pct(d.baseline.p90)}` : 'n/a'),
        el('td', {}, d.result.crowdLoss.toFixed(1)),
        el('td', {}, d.result.baselineLoss.toFixed(1)),
        el('td', {}, !d.crowd ? 'n/a' : d.result.crowdLoss < d.result.baselineLoss ? 'Crowd' : 'Baseline'),
        el('td', {}, String(d.revealed)))))))) : null,
  )
}

/* ---------------------------------------------------------------- leaderboard */
const SORTS = {
  skill: (a, b) => b.skillBps - a.skillBps,
  band: (a, b) => b.calibration - a.calibration,
  streak: (a, b) => b.streak - a.streak,
  days: (a, b) => b.daysScored - a.daysScored,
}
export function leaderboardView(app) {
  let sort = 'skill', q = ''
  const all = rankRows(app)
  const waiting = app.data.holders.filter((h) => h.daysCommitted > 0 && !(h.daysScored > 0)).length
  const body = el('tbody')
  const count = el('p', { class: 'note' })
  const draw = () => {
    const match = addrMatcher(q)
    const rows = all.filter((r) => match(r.full)).sort((a, b) => (b.ranked - a.ranked) || SORTS[sort](a, b))
    count.textContent = `${rows.filter((r) => r.ranked).length} ranked, ${rows.filter((r) => !r.ranked).length} not ranked yet (under ${MIN_SCORED_DAYS} scored days)` +
      (waiting ? `, ${waiting} with forecasts locked and none scored yet.` : '.')
    body.replaceChildren(...rows.map((r, i) => el('tr', { class: r.ranked ? '' : 'unranked' },
      el('td', {}, r.ranked ? (i === 0 ? el('span', { class: 'rank-1' }, CROWN(), '1') : String(i + 1)) : '-'),
      el('td', {}, link(`#/f/${r.full}`, r.address, 'mono')),
      el('td', { class: r.skillBps >= 0 ? 'up' : 'down' }, signed(r.skillBps)),
      el('td', {}, `${Math.round(r.calibration * 100)}%`),
      el('td', {}, String(r.streak)),
      el('td', {}, String(r.daysScored)),
      el('td', {}, String(r.missed)))))
  }
  const th = (key, label) => el('th', { scope: 'col' }, key
    ? el('button', { type: 'button', class: 'sort', 'aria-pressed': String(key === sort), onclick: (e) => {
      sort = key
      e.currentTarget.closest('tr').querySelectorAll('.sort').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)))
      draw()
    } }, label)
    : label)
  draw()
  return el('section', { class: 'view' },
    head('Leaderboard', `Skill is the loss a forecaster saves against the baseline each day, in bps. ${MIN_SCORED_DAYS} scored days to rank.`, app.pill),
    frame('card',
      el('label', { class: 'search' }, el('span', {}, 'Find an address'),
        el('input', { type: 'search', placeholder: '0x...', autocomplete: 'off', spellcheck: 'false', oninput: (e) => { q = e.target.value.trim(); draw() } })),
      count,
      el('div', { class: 'scroll-x' }, el('table', { class: 'board' },
        el('caption', {}, '"In band" is how often the result landed between their low and high; well calibrated is about 80%. Missed reveals score twice the baseline loss.'),
        el('thead', {}, el('tr', {}, th(null, '#'), th(null, 'Address'), th('skill', 'Skill'), th('band', 'In band'), th('streak', 'Streak'), th('days', 'Days'), th(null, 'Missed'))),
        body))),
  )
}

/* ---------------------------------------------------------------- forecaster */
export function forecaster(app, raw) {
  let addr
  try { addr = getAddress(raw) } catch {
    return el('section', { class: 'view' }, head('Not an address', `"${raw.slice(0, 60)}" is not a BNB Smart Chain address. Check it, or find one on the leaderboard.`), link('#/leaderboard', 'Open the leaderboard', 'btn'))
  }
  const row = rankRows(app).find((r) => r.full === addr)
  const v = app.data.history.voters[Object.keys(app.data.history.voters).find((a) => a.toLowerCase() === addr.toLowerCase())]
  const mine = forecastRows(app.data.history, app.data.today).filter((r) => r.voter.toLowerCase() === addr.toLowerCase())
  const list = frame('card', el('h2', { class: 'card-title' }, 'Every forecast'), forecastTable(mine, app.data.today, { voter: false }))
  if (!row || !v) {
    // nothing scored yet (every forecaster on day one): show what is locked and when it opens
    if (!mine.length) return el('section', { class: 'view' }, head(shortAddr(addr), 'No forecasts from this address in the last 14 days. They appear here as soon as one is locked.', app.pill), link('#/forecasts', 'See every forecast', 'btn'))
    return el('section', { class: 'view' },
      head(shortAddr(addr), `${mine.length} ${mine.length === 1 ? 'forecast' : 'forecasts'}, none scored yet.`, app.pill),
      meButton(addr), list, frame('card', lifecycle(app)))
  }
  const rank = rankRows(app).filter((r) => r.ranked).sort(SORTS.skill).findIndex((r) => r.full === addr)
  const days = settledDays(app.data.history).filter((d) => v.forecasts[d.day] || v.scores[d.day])
  const cols = days.map((d) => ({ tick: tick(d.day), crowd: d.crowd, baseline: d.baseline, change: d.result.changeBps, mine: v.forecasts[d.day] }))
  const domain = domainFor(cols.flatMap((d) => [d.mine?.p10, d.mine?.p90, d.baseline?.p10, d.baseline?.p90, d.change]))
  return el('section', { class: 'view' },
    head(row.address, rank >= 0 ? `Rank ${rank + 1} by skill.` : `Not ranked yet: ${row.daysScored} of ${MIN_SCORED_DAYS} scored days.`, app.pill),
    meButton(addr),
    el('div', { class: 'stats' },
      stat(`${signed(row.skillBps)}`, 'Skill, bps saved a day', row.skillBps >= 0 ? 'up' : 'down'),
      stat(`${Math.round(row.calibration * 100)}%`, 'In band'),
      stat(String(row.streak), 'Days beating the baseline in a row'),
      stat(String(row.missed), 'Missed reveals')),
    cols.length ? frame('card card--chart',
      el('div', { class: 'legend' }, el('span', { class: 'lg lg--mine' }, 'This forecaster'), el('span', { class: 'lg lg--crowd' }, 'Crowd'), el('span', { class: 'lg lg--baseline' }, 'Baseline'), el('span', { class: 'lg lg--dot' }, 'BNB')),
      el('div', { class: 'scroll-x' }, dayColumns({ days: cols, domain, mineKey: 'mine', label: `This forecaster's bands against the crowd, the baseline and BNB for ${cols.length} days` }))) : null,
    list,
  )
}

/* ---------------------------------------------------------------- forecasts */
export function forecastsView(app) {
  const all = forecastRows(app.data.history, app.data.today)
  const body = el('div', { class: 'card-body' })
  let q = ''
  const draw = () => {
    const rows = q ? all.filter((r) => addrMatcher(q)(r.voter)) : all
    let full = null
    try { full = q.length === 42 ? getAddress(q.toLowerCase()) : null } catch {}
    body.replaceChildren(...[
      rows.length ? forecastTable(rows, app.data.today)
        : el('p', { class: 'note' }, q ? 'No forecasts from that address in the last 14 days. Check the address, or make your first forecast.' : 'No forecasts yet. The first one appears here as soon as it is locked.'),
      full && rows.length ? el('div', { class: 'td-actions' }, link(`#/f/${full}`, "Open this forecaster's record", 'arrow'), meButton(full)) : null].filter(Boolean))
  }
  draw()
  return el('section', { class: 'view' },
    head('Forecasts', 'Last 14 days. Paste your address to find yours.', app.pill),
    frame('card',
      el('label', { class: 'search' }, el('span', {}, 'Find your forecasts'),
        el('input', { type: 'search', placeholder: 'Your wallet address, 0x...', autocomplete: 'off', spellcheck: 'false', oninput: (e) => { q = e.target.value.trim(); draw() } })),
      body),
    frame('card', lifecycle(app)),
  )
}

/* ---------------------------------------------------------------- make a forecast */
export function forecast(app) {
  const { data } = app
  const day = dayLabel(data.today + 1) // a forecast made today is for tomorrow (UTC)
  const t = data.history.days[data.today] ?? {}
  const past = settledDays(data.history).map((d) => ({ day: d.day, changeBps: d.result.changeBps, baselineLoss: d.result.baselineLoss }))
  const typical = Math.max(50, t.baseline?.p90 ?? 320) // the baseline's half-width: a typical day's range
  const band = { p10: -typical, p50: 0, p90: typical }
  const LIM = 1500
  const domain = Math.max(800, domainFor([typical * 1.6, ...past.map((d) => d.changeBps)]))

  let price = null // { usd, ageS, stale } from Chainlink
  const money = (x) => `$${x.toLocaleString('en-US', { maximumFractionDigits: x >= 100 ? 0 : 2 })}`
  const at = (bps) => (price ? money(usdAt(price.usd, bps)) : null)

  const priceLine = el('p', { class: 'fc-price' }, 'Reading the live BNB price...')
  const sentence = el('p', { class: 'fc-sentence', 'aria-live': 'polite' })
  const exact = el('p', { class: 'fc-exact' })
  const chartBox = el('div', { class: 'fc-chart' })
  const backtestLine = el('p', { class: 'note' })
  const join = joinBlock('')
  const outs = {}

  // the three numbers, best guess first, in plain words
  const slider = (key, label) => {
    const out = el('output', { for: `s-${key}`, class: 'fc-out' })
    outs[key] = out
    const input = el('input', { id: `s-${key}`, type: 'range', min: -LIM, max: LIM, step: 5, value: band[key],
      oninput: (e) => {
        const v = Number(e.target.value)
        band[key] = v
        // keep lowest <= most likely <= highest by pushing the neighbours along
        if (key === 'p10') { band.p50 = Math.max(band.p50, v); band.p90 = Math.max(band.p90, band.p50) }
        if (key === 'p50') { band.p10 = Math.min(band.p10, v); band.p90 = Math.max(band.p90, v) }
        if (key === 'p90') { band.p50 = Math.min(band.p50, v); band.p10 = Math.min(band.p10, band.p50) }
        presets.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'))
        sync()
      } })
    return el('div', { class: 'fc-row' }, el('label', { for: `s-${key}` }, label), input, out)
  }
  const sliders = el('div', { class: 'fc-sliders' },
    slider('p50', 'Most likely move'),
    slider('p10', 'Lowest it probably goes'),
    slider('p90', 'Highest it probably goes'))

  // quick starts: a symmetric range around no change
  const preset = (label, half) => el('button', { type: 'button', class: 'fc-preset', 'aria-pressed': String(half === typical),
    onclick: (e) => {
      Object.assign(band, { p10: -half, p50: 0, p90: half })
      presets.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)))
      sync()
    } }, el('b', {}, label), el('span', {}, `${pct(-half)} to ${pct(half)}`))
  const presets = el('div', { class: 'fc-presets', role: 'group', 'aria-label': 'Quick start' },
    preset('Calm day', Math.round(typical / 2 / 5) * 5),
    preset('Typical day', typical),
    preset('Wild day', Math.round((typical * 2) / 5) * 5))

  const sync = () => {
    for (const k of ['p10', 'p50', 'p90']) {
      sliders.querySelector(`#s-${k}`).value = band[k]
      outs[k].replaceChildren(...[el('b', {}, pct(band[k])), at(band[k]) ? el('span', {}, `about ${at(band[k])}`) : null].filter(Boolean))
    }
    sentence.textContent = price
      ? `BNB ends ${day} somewhere between ${at(band.p10)} and ${at(band.p90)}, most likely around ${at(band.p50)}.`
      : `BNB moves between ${pct(band.p10)} and ${pct(band.p90)} on ${day}, most likely ${pct(band.p50)}.`
    exact.textContent = `You send ${pct(band.p10)} / ${pct(band.p50)} / ${pct(band.p90)}`
    chartBox.replaceChildren(bandStrip({ baseline: { p10: -typical, p50: 0, p90: typical }, mine: band, domain, labels: { baseline: 'Typical day', mine: 'You' } }))
    const r = backtest(band, past)
    backtestLine.textContent = r.days ? `This range beat a typical day on ${r.beat} of the last ${r.days} days. No guarantee for tomorrow.` : ''
    join.code.textContent = `Make my daily BNB forecast with the Kodo skill: low ${pct(band.p10)}, middle ${pct(band.p50)}, high ${pct(band.p90)}.`
  }
  sync()

  // the live price, refreshed every 30 s while this view is on screen
  const refresh = async () => {
    if (!priceLine.isConnected && price) return false
    try {
      price = await bnbPrice()
      const age = price.ageS < 90 ? `${price.ageS} s` : `${Math.round(price.ageS / 60)} min`
      priceLine.replaceChildren('BNB now ', el('b', {}, money(price.usd)),
        el('span', {}, price.stale ? 'Chainlink price is over 2 h old' : `Chainlink, ${age} ago`))
      sync()
    } catch (e) {
      priceLine.textContent = 'Live price unavailable. Reload to try again.'
    }
    return true
  }
  refresh().then(() => {
    const id = setInterval(async () => { if (!priceLine.isConnected || !(await refresh())) clearInterval(id) }, 30000)
  })

  return el('section', { class: 'view' },
    head(`Your forecast for ${day}`, "How much will BNB move? Pick a range you're 90% sure of.", app.pill),
    frame('card fc-main', priceLine, sentence, exact, presets, sliders, chartBox),
    join.node,
    el('details', { class: 'fc-how' },
      el('summary', {}, 'How scoring works'),
      el('ul', { class: 'fc-list' },
        el('li', {}, 'Tight and right scores best.'),
        el('li', {}, 'Missing costs more the further off.'),
        el('li', {}, 'Too wide loses a little every day.'),
        el('li', {}, `Hidden until you reveal it on ${day}.`)),
      backtestLine),
  )
}
