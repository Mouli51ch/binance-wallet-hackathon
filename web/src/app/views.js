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

/** The three stages every forecast goes through, with today's live numbers. */
function lifecycle(app) {
  const { data } = app, h = data.history
  const t = h.days[data.today] ?? {}, tm = h.days[data.today + 1] ?? {}
  const step = (n, title, body, live) => el('li', { class: 'step' },
    el('span', { class: 'step-n', 'aria-hidden': 'true' }, n),
    el('h3', { class: 'step-title' }, title), el('p', { class: 'step-body' }, body), el('p', { class: 'step-live' }, ...live))
  return frame('card card--steps',
    el('h2', { class: 'card-title' }, 'How a forecast works'),
    el('ol', { class: 'steps' },
      step('1', 'Locked', 'You send a low, a middle and a high for tomorrow. Only a fingerprint of the numbers goes on chain, so nobody can see or copy them yet.',
        [`${tm.committed ?? 0} locked for ${dayLabel(data.today + 1)}`]),
      step('2', 'Revealed', 'On that day your agent reveals the numbers. Now everyone can see them, and they join the crowd band.',
        [`${t.revealed ?? 0} of ${t.committed ?? 0} revealed for today`]),
      step('3', 'Scored', "At 00:00 UTC the day closes on Chainlink's BNB price. Each forecast is scored against the baseline.",
        [el('b', { 'data-countdown': '' }, '--:--:--'), ' until today is scored'])))
}

const STAGE = { locked: 'Locked', revealed: 'Revealed', scored: 'Scored', missed: 'Not revealed' }
/** One row per forecast: what it said (once public), what BNB did, and how it scored. */
function forecastTable(rows, today, { voter = true } = {}) {
  const numbers = (r) => {
    if (r.band) return `${pct(r.band.p10)} / ${pct(r.band.p50)} / ${pct(r.band.p90)}`
    return r.stage === 'locked' ? `Hidden until revealed on ${dayLabel(r.day)}` : 'Never revealed'
  }
  const result = (r) => {
    if (r.score) return `${r.beat ? 'Beat the baseline' : 'Baseline won'}: ${r.score.loss.toFixed(1)} vs ${r.score.baselineLoss.toFixed(1)}`
    if (r.stage === 'missed') return 'Scored as a miss when the day settles'
    return `Scored after ${dayLabel(r.day)} ends, 00:00 UTC`
  }
  return el('div', { class: 'scroll-x' }, el('table', { class: 'board board--forecasts' },
    el('caption', {}, "Low / middle / high of BNB's move that day. Scores are pinball loss in bps; lower is better."),
    el('thead', {}, el('tr', {}, ...['Day', voter && 'Forecaster', 'Stage', 'Low / middle / high', 'BNB', 'Result'].filter(Boolean).map((t) => el('th', { scope: 'col' }, t)))),
    el('tbody', {}, ...rows.map((r) => el('tr', {},
      el('td', {}, dayLabel(r.day)),
      voter && el('td', {}, link(`#/f/${getAddress(r.voter)}`, shortAddr(r.voter), 'mono')),
      el('td', {}, el('span', { class: `stage stage--${r.stage}` }, STAGE[r.stage])),
      el('td', { class: r.band ? 'mono' : 'muted' }, numbers(r)),
      el('td', { class: r.change == null ? 'muted' : r.change >= 0 ? 'up' : 'down' }, r.change != null ? pct(r.change) : r.day > today ? 'Not started' : r.day === today ? 'Day not over' : 'Not settled yet'),
      el('td', { class: r.score ? (r.beat ? 'up' : 'down') : 'muted' }, result(r)))))))
}

/* ---------------------------------------------------------------- dashboard */
export function dashboard(app) {
  const { data } = app
  const h = data.history
  const t = h.days[data.today] ?? {}
  const y = h.days[data.today - 1]
  const domain = domainFor([t.crowd?.p10, t.crowd?.p90, t.baseline?.p10, t.baseline?.p90, y?.result?.changeBps])
  const latest = forecastRows(h, data.today).slice(0, 5)
  const top = rankRows(app).filter((r) => r.ranked).slice(0, 3)

  return el('section', { class: 'view' },
    head(`Today, ${dayLabel(data.today)}`, 'The crowd band is the average of every revealed low, middle and high.', app.pill),
    frame('card card--hero',
      validBand(t.crowd)
        ? el('p', { class: 'lead' }, `${t.revealed} verified ${t.revealed === 1 ? 'person expects' : 'people expect'} BNB between ${pct(t.crowd.p10)} and ${pct(t.crowd.p90)} today, ${pct(t.crowd.p50)} in the middle.`)
        : el('p', { class: 'lead' }, t.committed ? `${t.committed} verified ${t.committed === 1 ? 'person' : 'people'} locked a forecast for today. The band opens as they reveal.`
          : h.days[data.today + 1]?.committed ? `${h.days[data.today + 1].committed} verified ${h.days[data.today + 1].committed === 1 ? 'person has' : 'people have'} locked a forecast for ${dayLabel(data.today + 1)}. The numbers open when they are revealed that day.`
          : 'No forecasts for today yet.'),
      bandStrip({ baseline: t.baseline, crowd: validBand(t.crowd) ? t.crowd : null, domain }),
      el('p', { class: 'note' }, 'The baseline is "no change", widened by recent volatility. The crowd only shows skill if it beats it over time.')),
    lifecycle(app),
    frame('card',
      el('h2', { class: 'card-title' }, 'Latest forecasts'),
      latest.length ? forecastTable(latest, data.today) : el('p', { class: 'note' }, 'No forecasts yet. The first one appears here as soon as it is locked.'),
      link('#/forecasts', 'See every forecast, or find yours', 'arrow')),
    el('div', { class: 'cols2' },
      frame('card',
        el('h2', { class: 'card-title' }, `Yesterday, ${dayLabel(data.today - 1)}`),
        y?.result
          ? el('div', {},
            el('p', { class: 'big-num' }, `BNB ${pct(y.result.changeBps)}`),
            el('p', { class: 'verdict' }, y.result.crowdLoss < y.result.baselineLoss ? 'The crowd beat the baseline.' : 'The baseline beat the crowd.'),
            el('p', { class: 'note' }, `Crowd loss ${y.result.crowdLoss.toFixed(1)} bps against the baseline's ${y.result.baselineLoss.toFixed(1)}. Lower is better.`))
          : data.today - 1 < data.startDay
            ? el('p', { class: 'note' }, `Before the contract's first day, ${dayLabel(data.startDay)}. Nothing to settle.`)
            : el('p', { class: 'note' }, 'Not settled yet. Anyone can settle it with the Chainlink round from 00:00 UTC.'),
        link('#/history', 'See every day', 'arrow')),
      frame('card',
        el('h2', { class: 'card-title' }, 'Top forecasters'),
        top.length
          ? el('ol', { class: 'mini-board' }, ...top.map((r) => el('li', {},
            link(`#/f/${r.full}`, r.address, 'mono'), el('span', { class: r.skillBps >= 0 ? 'up' : 'down' }, `${signed(r.skillBps)} bps a day`))))
          : el('p', { class: 'note' }, `Nobody has ${MIN_SCORED_DAYS} scored days yet.`),
        link('#/leaderboard', 'Full leaderboard', 'arrow'))),
    frame('card card--cta',
      el('div', {}, el('h2', { class: 'card-title' }, 'Make your own forecast'),
        el('p', { class: 'note' }, 'Set a low, middle and high, see how that band would have scored on past days, and get the prompt for your agent.')),
      link('#/forecast', 'Make a forecast', 'btn')),
  )
}

/** Seconds to the next 00:00 UTC on the chain's clock (a fork runs ahead of the browser). */
export function startCountdown(root, chainNow) {
  const t0 = Date.now()
  const tickFn = () => {
    const n = root.querySelector('[data-countdown]'); if (!n) return false
    const now = chainNow + Math.floor((Date.now() - t0) / 1000)
    const left = 86400 - (now % 86400)
    const p = (v) => String(v).padStart(2, '0')
    n.textContent = `${p(Math.floor(left / 3600))}:${p(Math.floor((left % 3600) / 60))}:${p(left % 60)}`
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
      list, lifecycle(app))
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
    head('Forecasts', 'Every forecast from the last 14 days and where it is now. Paste your wallet address to find yours.', app.pill),
    frame('card',
      el('label', { class: 'search' }, el('span', {}, 'Find your forecasts'),
        el('input', { type: 'search', placeholder: 'Your wallet address, 0x...', autocomplete: 'off', spellcheck: 'false', oninput: (e) => { q = e.target.value.trim(); draw() } })),
      body),
    lifecycle(app),
  )
}

/* ---------------------------------------------------------------- make a forecast */
export function forecast(app) {
  const t = app.data.history.days[app.data.today] ?? {}
  const past = settledDays(app.data.history).map((d) => ({ day: d.day, changeBps: d.result.changeBps, baselineLoss: d.result.baselineLoss }))
  const start = validBand(t.crowd) ? t.crowd : t.baseline ?? { p10: -300, p50: 0, p90: 300 }
  const band = { ...start }
  const LIM = 1500
  const domain = Math.max(800, domainFor([t.baseline?.p10, t.baseline?.p90, ...past.map((d) => d.changeBps)]))

  const chartBox = el('div', { class: 'chart-box' })
  const result = el('div', { class: 'stats' })
  const perDay = el('ol', { class: 'past-days' })
  const prompt = el('code', { class: 'prompt-text' })
  const values = {}, usd = {}
  let price = null // { usd, ageS, stale } from Chainlink, filled in after the first read
  const money = (x) => `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const priceLine = el('p', { class: 'price-line' }, 'Reading the live BNB price from Chainlink...')

  const slider = (key, label) => {
    const out = el('output', { for: `s-${key}` })
    values[key] = out
    const input = el('input', { id: `s-${key}`, type: 'range', min: -LIM, max: LIM, step: 5, value: band[key], 'aria-describedby': `s-${key}-v`,
      oninput: (e) => {
        const v = Number(e.target.value)
        band[key] = v
        // keep low <= middle <= high by pushing the neighbours along
        if (key === 'p10') { band.p50 = Math.max(band.p50, v); band.p90 = Math.max(band.p90, band.p50) }
        if (key === 'p50') { band.p10 = Math.min(band.p10, v); band.p90 = Math.max(band.p90, v) }
        if (key === 'p90') { band.p50 = Math.min(band.p50, v); band.p10 = Math.min(band.p10, band.p50) }
        sync()
      } })
    out.id = `s-${key}-v`
    usd[key] = el('span', { class: 'slider-usd' })
    return el('div', { class: 'slider' }, el('label', { for: `s-${key}` }, label, usd[key]), input, out)
  }
  const sliders = el('div', { class: 'sliders' }, slider('p10', 'Low, p10: 90% sure BNB ends above'), slider('p50', 'Middle, p50: best guess'), slider('p90', 'High, p90: 90% sure BNB ends below'))

  const sync = () => {
    for (const k of ['p10', 'p50', 'p90']) {
      sliders.querySelector(`#s-${k}`).value = band[k]
      values[k].textContent = pct(band[k])
      usd[k].textContent = price ? `about ${money(usdAt(price.usd, band[k]))}` : ''
    }
    chartBox.replaceChildren(bandStrip({ baseline: t.baseline, crowd: validBand(t.crowd) ? t.crowd : null, mine: band, domain }))
    const r = backtest(band, past)
    result.replaceChildren(
      stat(r.days ? `${r.beat}/${r.days}` : 'n/a', 'Past days this band beat the baseline'),
      stat(r.days ? `${signed(r.avgSavedBps)}` : 'n/a', 'Average bps saved a day', r.avgSavedBps >= 0 ? 'up' : 'down'),
      stat(`${pct(band.p90 - band.p10)}`, 'Width, low to high'))
    perDay.replaceChildren(...past.slice().reverse().map((d) => {
      const inside = band.p10 <= d.changeBps && d.changeBps <= band.p90
      return el('li', { class: inside ? 'in' : 'out' }, el('span', {}, dayLabel(d.day)), el('span', {}, `BNB ${pct(d.changeBps)}`), el('span', {}, inside ? 'inside' : 'outside'))
    }))
    prompt.textContent = `Make my daily BNB forecast with the Kodo skill: low ${pct(band.p10)}, middle ${pct(band.p50)}, high ${pct(band.p90)}.`
  }
  const copyBtn = el('button', { type: 'button', class: 'copy', onclick: async () => {
    try { await navigator.clipboard.writeText(prompt.textContent); copyBtn.textContent = 'Prompt copied' } catch { copyBtn.textContent = 'Select the text and copy it' }
    setTimeout(() => { copyBtn.textContent = 'Copy the prompt' }, 2400)
  } }, 'Copy the prompt')
  sync()

  // the live price, refreshed every 30 s while this view is on screen
  const refresh = async () => {
    if (!priceLine.isConnected && price) return false
    try {
      price = await bnbPrice()
      const age = price.ageS < 90 ? `${price.ageS} s` : `${Math.round(price.ageS / 60)} min`
      priceLine.replaceChildren(el('b', {}, `BNB ${money(price.usd)}`),
        ` now, from Chainlink's BNB/USD feed, the price Kodo scores against. Updated ${age} ago.` +
        (price.stale ? ' This is over 2 hours old, so the feed may be stale.' : ''))
      sync()
    } catch (e) {
      priceLine.textContent = `The live BNB price could not be read (${e.shortMessage ?? e.message}). The forecast still works in %; reload to try again.`
    }
    return true
  }
  refresh().then(() => {
    const id = setInterval(async () => { if (!priceLine.isConnected || !(await refresh())) clearInterval(id) }, 30000)
  })

  return el('section', { class: 'view' },
    head('Make a forecast', `For tomorrow's BNB move: a low, a middle and a high. Your agent sends it; you confirm it in Binance.`, app.pill),
    frame('card card--hero', priceLine, sliders,
      el('p', { class: 'note' }, 'You forecast the % move over tomorrow (UTC), from the price at 00:00 to the next 00:00. The dollar values use the price now, as a guide.'),
      chartBox, el('p', { class: 'note' }, 'Today\'s crowd and baseline are shown for reference. A wide band rarely misses but loses a little every day; a narrow one loses more when it misses.'),
      link('index.html#forecast', 'How scoring works', 'arrow')),
    el('h2', { class: 'card-title' }, 'How this band would have scored'),
    result,
    past.length ? frame('card', perDay, el('p', { class: 'note' }, 'Past days say nothing certain about tomorrow. This is how the scoring works, not a promise of how it will go.')) : null,
    frame('card card--prompt',
      el('h2', { class: 'card-title' }, 'Send it with your agent'),
      el('div', { class: 'prompt' }, prompt, copyBtn),
      el('ol', { class: 'steps-mini' },
        el('li', {}, 'Paste it to your agent. It needs an Agent ID wallet with Developer Mode on, and the Kodo skill.'),
        el('li', {}, 'It shows you a preview. Read it and confirm it yourself. This site never connects a wallet or sends anything.'),
        el('li', {}, 'Your forecast is now locked: on chain, but hidden until tomorrow.'),
        el('li', {}, 'Tomorrow, ask your agent again. It reveals this forecast and locks the next one.'),
        el('li', {}, 'After 00:00 UTC that day it is scored. Find it under Forecasts with your wallet address.'))),
  )
}
