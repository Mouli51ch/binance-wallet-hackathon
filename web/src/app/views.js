// The five app views. Each returns one DOM node built with textContent, never innerHTML:
// chain data is data, not markup. Read-only: nothing here connects a wallet or signs.
import { getAddress } from 'viem'
import { backtest, dayLabel, forecastRows, leaderboard, MIN_SCORED_DAYS, pct, shortAddr, validBand } from '../model.js'
import { bandStrip, dayColumns, domainFor } from './charts.js'
import { bnbPrice, usdAt } from '../price.js'

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
    step('2', 'Reveal', 'Hidden until the next day. No copying.', [`${t.revealed ?? 0} of ${t.committed ?? 0} revealed today`]),
    step('3', 'Score', 'The real price decides at 00:00 UTC.', [el('b', { 'data-countdown': '' }, '--:--:--'), ' to go']))
}

const SKILL_URL = 'https://github.com/Mouli51ch/binance-wallet-hackathon/tree/main/skills/human-pulse'
/** The one thing a visitor does: copy a prompt into their AI agent. */
function joinBlock(text) {
  const code = el('code', { class: 'prompt-text' }, text)
  const btn = el('button', { type: 'button', class: 'copy', onclick: async () => {
    try { await navigator.clipboard.writeText(code.textContent); btn.textContent = 'Copied' } catch { btn.textContent = 'Select and copy' }
    setTimeout(() => { btn.textContent = 'Copy the prompt' }, 2400)
  } }, 'Copy the prompt')
  return { code, node: frame('card join-card',
    el('h2', { class: 'card-title' }, 'Paste this into your AI agent'),
    el('div', { class: 'prompt' }, code, btn),
    el('p', { class: 'join-foot' }, 'Needs the ', el('a', { href: SKILL_URL, rel: 'noopener' }, 'Kodo skill'), ' and a Binance Agent ID. You confirm in Binance.')) }
}

const STAGE = { locked: 'Locked', revealed: 'Revealed', scored: 'Scored', missed: 'Not revealed' }
/** One row per forecast: what it said (once public), what BNB did, and how it scored. */
function forecastTable(rows, today, { voter = true } = {}) {
  const numbers = (r) => {
    if (r.band) return `${pct(r.band.p10)} / ${pct(r.band.p50)} / ${pct(r.band.p90)}`
    return r.stage === 'locked' ? `Hidden until revealed on ${dayLabel(r.day)}` : 'Never revealed'
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
  else if (t.committed) { answer = `${people(t.committed)} forecast today.`; detail = 'Numbers appear as they reveal.' }
  else if (next.committed) { answer = `${people(next.committed)} forecast ${dayLabel(data.today + 1)}.`; detail = 'Numbers stay hidden until then.' }
  else answer = 'No forecasts yet. Be the first.'

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
      el('ol', { class: 'mini-board' }, ...top.map((r) => el('li', {}, link(`#/f/${r.full}`, r.address, 'mono')))),
      link('#/leaderboard', 'Leaderboard', 'arrow')),
  ].filter(Boolean)

  return el('section', { class: 'view' },
    el('header', { class: 'td-intro' },
      el('h1', { class: 'f-h2' }, 'Real people forecast BNB. Kodo keeps score.'),
      el('p', {}, 'One Binance Agent ID, one vote. No bots.'),
      app.pill ? el('span', { class: 'pill' }, app.pill) : null),
    frame('card td-answer',
      el('p', { class: 'td-when' }, `Today, ${dayLabel(data.today)}`, priceNow),
      el('p', { class: 'td-big' }, answer),
      detail ? el('p', { class: 'td-detail' }, detail) : null,
      crowd ? bandStrip({ baseline: t.baseline, crowd: t.crowd, domain: domainFor([t.crowd.p10, t.crowd.p90, t.baseline?.p10, t.baseline?.p90]), labels: { crowd: 'People', baseline: 'Typical day' } }) : null,
      el('div', { class: 'td-actions' },
        link('#/forecast', 'Make your forecast', 'btn'),
        link('#/forecasts', 'See all forecasts', 'arrow'))),
    lifecycle(app),
    joinBlock('Make my daily BNB forecast with the Kodo skill.').node,
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
      el('td', {}, r.ranked ? String(i + 1) : '-'),
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
      head(shortAddr(addr), `${mine.length} ${mine.length === 1 ? 'forecast' : 'forecasts'}, none scored yet. Locked numbers stay hidden until the forecaster reveals them.`, app.pill),
      list, frame('card', lifecycle(app)))
  }
  const rank = rankRows(app).filter((r) => r.ranked).sort(SORTS.skill).findIndex((r) => r.full === addr)
  const days = settledDays(app.data.history).filter((d) => v.forecasts[d.day] || v.scores[d.day])
  const cols = days.map((d) => ({ tick: tick(d.day), crowd: d.crowd, baseline: d.baseline, change: d.result.changeBps, mine: v.forecasts[d.day] }))
  const domain = domainFor(cols.flatMap((d) => [d.mine?.p10, d.mine?.p90, d.baseline?.p10, d.baseline?.p90, d.change]))
  return el('section', { class: 'view' },
    head(row.address, rank >= 0 ? `Rank ${rank + 1} by skill.` : `Not ranked yet: ${row.daysScored} of ${MIN_SCORED_DAYS} scored days.`, app.pill),
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
    body.replaceChildren(
      rows.length ? forecastTable(rows, app.data.today)
        : el('p', { class: 'note' }, q ? 'No forecasts from that address in the last 14 days. Check the address, or make your first forecast.' : 'No forecasts yet. The first one appears here as soon as it is locked.'),
      full && rows.length ? link(`#/f/${full}`, "Open this forecaster's record", 'arrow') : null)
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
      outs[k].replaceChildren(el('b', {}, pct(band[k])), at(band[k]) ? el('span', {}, `about ${at(band[k])}`) : null)
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
