// The five app views. Each returns one DOM node built with textContent, never innerHTML:
// chain data is data, not markup. Read-only: nothing here connects a wallet or signs.
import { getAddress } from 'viem'
import { backtest, dayLabel, leaderboard, MIN_SCORED_DAYS, pct, shortAddr, validBand } from '../model.js'
import { bandStrip, dayColumns, domainFor } from './charts.js'

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

/* ---------------------------------------------------------------- dashboard */
export function dashboard(app) {
  const { data } = app
  const h = data.history
  const t = h.days[data.today] ?? {}
  const y = h.days[data.today - 1]
  const tomorrow = h.days[data.today + 1]
  const domain = domainFor([t.crowd?.p10, t.crowd?.p90, t.baseline?.p10, t.baseline?.p90, y?.result?.changeBps])
  const countdown = el('b', { 'data-countdown': '' }, '--:--:--')
  const top = rankRows(app).filter((r) => r.ranked).slice(0, 3)

  return el('section', { class: 'view' },
    head(`Today, ${dayLabel(data.today)}`, 'The crowd band is the average of every revealed low, middle and high.', app.pill),
    frame('card card--hero',
      validBand(t.crowd)
        ? el('p', { class: 'lead' }, `${t.revealed} verified ${t.revealed === 1 ? 'person expects' : 'people expect'} BNB between ${pct(t.crowd.p10)} and ${pct(t.crowd.p90)} today, ${pct(t.crowd.p50)} in the middle.`)
        : el('p', { class: 'lead' }, t.committed ? `${t.committed} verified people locked a forecast for today. The band opens as they reveal.` : 'No forecasts for today yet.'),
      bandStrip({ baseline: t.baseline, crowd: validBand(t.crowd) ? t.crowd : null, domain }),
      el('p', { class: 'note' }, 'The baseline is "no change", widened by recent volatility. The crowd only shows skill if it beats it over time.')),
    el('div', { class: 'stats' },
      stat(countdown, 'Until today settles, 00:00 UTC'),
      stat(String(tomorrow?.committed ?? 0), `Locked for ${dayLabel(data.today + 1)}`),
      stat(`${t.revealed ?? 0}/${t.committed ?? 0}`, 'Revealed today'),
      stat(String(app.data.holders.length), `Forecasters, last ${Math.min(14, data.today - Math.min(...Object.keys(h.days).map(Number)) + 1)} days`)),
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
    // accept the shortened form shown everywhere (0x1D01…9623 or 0x1D01...9623) as well as any part of the full address
    const [pre, suf] = q.toLowerCase().split(/…|\.\.\./)
    const match = (a) => (suf === undefined ? a.includes(pre) : a.startsWith(pre) && a.endsWith(suf))
    const rows = all.filter((r) => match(r.full.toLowerCase())).sort((a, b) => (b.ranked - a.ranked) || SORTS[sort](a, b))
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
  if (!row || !v) {
    // committed but nothing scored yet (every forecaster on day one): say so, not "no forecasts"
    const h = app.data.holders.find((x) => x.address.toLowerCase() === addr.toLowerCase())
    const msg = h?.daysCommitted > 0
      ? `${h.daysCommitted} ${h.daysCommitted === 1 ? 'forecast' : 'forecasts'} locked, none scored yet. A forecast is scored once it is revealed and its day settles at 00:00 UTC.`
      : 'No forecasts from this address in the last 14 days. Records appear after its first commit.'
    return el('section', { class: 'view' }, head(shortAddr(addr), msg, app.pill), link('#/leaderboard', 'Open the leaderboard', 'btn'))
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
    frame('card', el('div', { class: 'scroll-x' }, el('table', { class: 'board' },
      el('caption', {}, 'Loss is pinball loss in bps against the same day\'s baseline; lower is better.'),
      el('thead', {}, el('tr', {}, ...['Day', 'Their band', 'BNB', 'Loss', 'Baseline', 'In band'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, ...days.slice().reverse().map((d) => {
        const f = v.forecasts[d.day], s = v.scores[d.day]
        return el('tr', {},
          el('td', {}, dayLabel(d.day)),
          el('td', {}, f ? `${pct(f.p10)} / ${pct(f.p50)} / ${pct(f.p90)}` : 'not revealed'),
          el('td', {}, pct(d.result.changeBps)),
          el('td', { class: s && s.loss < s.baselineLoss ? 'up' : 'down' }, s ? s.loss.toFixed(1) : 'not scored yet'),
          el('td', {}, s ? s.baselineLoss.toFixed(1) : '-'),
          el('td', {}, s ? (s.inBand ? 'yes' : 'no') : '-'))
      }))))),
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
  const values = {}

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
    return el('div', { class: 'slider' }, el('label', { for: `s-${key}` }, label), input, out)
  }
  const sliders = el('div', { class: 'sliders' }, slider('p10', 'Low, p10: 90% sure BNB ends above'), slider('p50', 'Middle, p50: best guess'), slider('p90', 'High, p90: 90% sure BNB ends below'))

  const sync = () => {
    for (const k of ['p10', 'p50', 'p90']) {
      sliders.querySelector(`#s-${k}`).value = band[k]
      values[k].textContent = pct(band[k])
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

  return el('section', { class: 'view' },
    head('Make a forecast', `For tomorrow's BNB move: a low, a middle and a high. Your agent sends it; you confirm it in Binance.`, app.pill),
    frame('card card--hero', sliders, chartBox, el('p', { class: 'note' }, 'Today\'s crowd and baseline are shown for reference. A wide band rarely misses but loses a little every day; a narrow one loses more when it misses.'),
      link('index.html#forecast', 'How scoring works', 'arrow')),
    el('h2', { class: 'card-title' }, 'How this band would have scored'),
    result,
    past.length ? frame('card', perDay, el('p', { class: 'note' }, 'Past days say nothing certain about tomorrow. This is how the scoring works, not a promise of how it will go.')) : null,
    frame('card card--prompt',
      el('h2', { class: 'card-title' }, 'Send it with your agent'),
      el('div', { class: 'prompt' }, prompt, copyBtn),
      el('ol', { class: 'steps-mini' },
        el('li', {}, 'Your agent needs an Agent ID wallet with Developer Mode on, and the Kodo skill.'),
        el('li', {}, 'It shows you a preview of the transaction. Read it.'),
        el('li', {}, 'You confirm it yourself. This site never connects a wallet or sends anything.'))),
  )
}
