// T-B04: the Kodo app. Loads the data once (the contract named in config.js, or the labelled
// sample), then routes between five read-only views on the URL hash:
//   #/            today          #/history       every settled day
//   #/leaderboard forecasters    #/f/0x...       one forecaster
//   #/forecast    make a forecast (prompt for your agent; this site never signs)
import { getAddress } from 'viem'
import './app.css'
import { loadChain } from '../chain.js'
import { siteConfig } from '../config.js'
import { sampleData } from './sample.js'
import { dashboard, el, forecast, forecaster, history, leaderboardView, startCountdown } from './views.js'

const view = document.getElementById('view')
const app = { data: null, cfg: { network: 'sample' }, pill: 'Sample data' }
let stopTimer = () => {}

const ROUTES = [
  [/^#?\/?$/, 'dashboard', () => dashboard(app)],
  [/^#\/history$/, 'history', () => history(app)],
  [/^#\/leaderboard$/, 'leaderboard', () => leaderboardView(app)],
  [/^#\/forecast$/, 'forecast', () => forecast(app)],
  [/^#\/f\/(.+)$/, 'leaderboard', (m) => forecaster(app, safeDecode(m[1]))],
]

// a malformed % in a shared link must reach forecaster() as text, so it can say "Not an address"
function safeDecode(s) { try { return decodeURIComponent(s) } catch { return s } }

function route() {
  stopTimer()
  const hash = location.hash || '#/'
  const hit = ROUTES.map(([re, name, make]) => [hash.match(re), name, make]).find(([m]) => m)
  const [m, name, make] = hit ?? [null, null, null]
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('on', a.dataset.route === name))
  try {
    view.replaceChildren(make ? make(m) : el('section', { class: 'view' },
      el('h1', { class: 'f-h2' }, 'Page not found'),
      el('p', { class: 'note' }, `Nothing lives at ${hash.slice(0, 60)}. `, el('a', { href: '#/' }, 'Go to today'), '.')))
  } catch (e) {
    console.error(e)
    view.replaceChildren(el('p', { class: 'note' }, 'This view could not be drawn from the data. Reload the page; if it keeps failing, report the address in the bar.'))
  }
  if (name === 'dashboard') stopTimer = startCountdown(view, app.data.chainNow)
  view.focus({ preventScroll: true })
  scrollTo(0, 0)
}

function contractLine() {
  const n = document.getElementById('contract-line')
  if (!app.data.contract) { n.textContent = 'Contract: not deployed yet. Showing sample data.'; return }
  const a = getAddress(app.data.contract)
  const scan = { mainnet: 'https://bscscan.com', testnet: 'https://testnet.bscscan.com' }[app.cfg.network]
  if (!scan) { n.textContent = `Contract: ${a} on a local ${app.cfg.network} (not on BscScan).`; return }
  n.replaceChildren('Contract: ', el('a', { href: `${scan}/address/${a}`, rel: 'noopener' }, a), ' on BscScan')
}

async function start() {
  try {
    app.cfg = siteConfig()
    app.data = app.cfg.network === 'sample' ? sampleData() : await loadChain(app.cfg, { history: true })
    // Events only give a baseline for settled days; yesterday, today and tomorrow come from the
    // contract's live views (baselineBand, crowdBand), so fill any gap from those.
    for (const [d, live] of Object.entries(app.data.days)) {
      const h = (app.data.history.days[d] ??= { day: Number(d), committed: live.committed ?? 0, revealed: 0, crowd: null })
      h.baseline ??= live.baseline
      if (!h.crowd && live.crowd) { h.crowd = live.crowd; h.revealed = live.revealed }
    }
    app.pill = app.data.sample ? 'Sample data' : app.cfg.network === 'fork' ? 'Local fork' : null
  } catch (e) {
    console.error(e)
    view.replaceChildren(el('section', { class: 'view' },
      el('h1', { class: 'f-h2' }, `Could not read the ${app.cfg.network} contract`),
      el('p', { class: 'note' }, `${e.shortMessage ?? e.message} ` +
        (app.cfg.network === 'fork' ? 'Check the fork is running (node fork/run.mjs) and reload.' : 'Reload the page; if it keeps failing, the RPC is down.'))))
    return
  }
  contractLine()
  addEventListener('hashchange', route)
  // the charts pick a narrow or wide canvas when drawn; redraw when the window crosses that line
  let wide = innerWidth >= 640, t = 0
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if ((innerWidth >= 640) !== wide) { wide = !wide; route() } }, 150) })
  route()
}
start()
