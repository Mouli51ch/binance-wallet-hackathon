// Scroll animation ported from ThreeUI KageLandingPage (public/landing-pages/kage.html,
// SHA-256 c8e06b90...2d9f49), section 11 "page wiring" and section 9 "scroll <-> chapters":
//   wireReveals + splitHeadingWords   headings arrive word by word, blocks rise as they enter
//   wireHeroExit                      the hero stands down piece by piece as the scroll leaves 0
//   wireNav (rail part) + measure     the chapter rail and the active top-bar link
// The functions are the authored ones. What changed is only what has to: Kage marks its
// elements in its own markup (data-rv, h1.display, data-cam), so tag() applies the same
// markers to this page's elements, and the hero exit sequence names this hero's pieces.
// Kage's Three.js temple, camera rig and foreground cut-outs are not part of this.

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const sat = (v) => clamp(v, 0, 1)
const smooth = (e0, e1, x) => { const t = sat((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t) }
const vpH = () => document.documentElement.clientHeight || innerHeight
const $ = (s) => document.querySelector(s)
const $$ = (s) => [].slice.call(document.querySelectorAll(s))

/* Kage's markers, placed on this page's elements */
const DISPLAY = '.hero h1, .caps .big > p, main h2.f-h3, .contact .lead'
const UP = [
  '.hero .lede', '.hero__actions', '.crt-monitor',
  '.caps .cap', '.cols .inner > .sheet', '.cols .inner > p',
  '.contact .steps li', '.contact .prompt', '.contact .join__repo',
  '.foot .wordmark--big', '.foot__risk', '.foot__legal',
].join(', ')
const CHAPTERS = [
  ['#top', 'Kodo'], ['#today', 'Today'], ['#yesterday', 'Yesterday'], ['#board', 'Leaderboard'],
  ['#how', 'How it works'], ['#forecast', 'The forecast'], ['#rules', 'Rules and limits'], ['#join', 'Join'],
]

function tag() {
  $$(DISPLAY).forEach((el) => el.classList.add('display'))
  $$(UP).forEach((el) => { if (!el.hasAttribute('data-rv')) el.setAttribute('data-rv', 'up') })
  $$('.hero .eyebrow').forEach((el) => el.setAttribute('data-rv', 'fade'))
}

/* ============================================== 9 · scroll <-> chapters */
let SECS = [], anchors = [], maxScroll = 1, activeSec = 0
function measure() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight - vpH())
  anchors = SECS.map((el, i) => {
    if (i === 0) return 0
    if (i === SECS.length - 1) return maxScroll
    return clamp(el.offsetTop + el.offsetHeight * 0.5 - vpH() * 0.5, 0, maxScroll)
  })
  for (let i = 1; i < anchors.length; i++) anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1)
}
function progressFor(y) {
  if (y <= anchors[0]) return 0
  for (let i = 0; i < anchors.length - 1; i++)
    if (y <= anchors[i + 1]) return i + (y - anchors[i]) / (anchors[i + 1] - anchors[i])
  return anchors.length - 1
}

/* =================================================== 11 · page wiring */
function wireReveals() {
  splitHeadingWords()
  const groups = new Map()
  const items = $$('[data-rv], .mask-line, .word-reveal')
  items.forEach((el) => {
    const key = el.parentElement
    const arr = groups.get(key) || []; arr.push(el); groups.set(key, arr)
  })
  groups.forEach((arr) => arr.forEach((el, i) => (el.dataset.rvd = i * 85)))
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return
      io.unobserve(e.target)
      const d = parseFloat(e.target.dataset.rvd || 0)
      setTimeout(() => e.target.classList.add('rv-in'), REDUCE ? 0 : d)
    })
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.04 })
  items.forEach((el) => { if (!el.closest('#top')) io.observe(el) })
}

/* Word-level masks let every display heading arrive at a human reading pace.
   The original text remains the accessible label, while the visual words are
   explicitly presentational. */
function splitHeadingWords() {
  if (REDUCE) return
  $$('.display').forEach((heading) => {
    const lines = heading.querySelectorAll('.mask-line')
    const targets = lines.length ? [].slice.call(lines) : [heading]
    targets.forEach((target) => {
      if (target.dataset.wordReady === 'true') return
      const phrase = target.textContent.replace(/\s+/g, ' ').trim()
      if (!phrase) return
      target.dataset.wordReady = 'true'
      target.classList.add('word-reveal')
      target.setAttribute('aria-label', phrase)
      target.textContent = ''
      phrase.split(' ').forEach((word, i) => {
        if (i) target.appendChild(document.createTextNode(' '))
        const mask = document.createElement('span')
        const inner = document.createElement('span')
        mask.className = 'word-mask'; mask.setAttribute('aria-hidden', 'true')
        inner.className = 'word'; inner.textContent = word
        inner.style.setProperty('--word-delay', i * 72 + 'ms')
        mask.appendChild(inner); target.appendChild(mask)
      })
    })
  })
}

/* Leaving the hero: each piece along its foot gets its own window, so the hero empties
   one element at a time instead of sliding away as a block. The monitor is the largest,
   flattest thing in the frame, so it goes early, goes quickly, and dissolves. */
function wireHeroExit() {
  const hero = $('#top'); if (!hero) return
  /* at = where in the exit it starts, span = how long it takes to go */
  const seq = [
    { el: $('.crt-monitor'), at: 0.0, span: 0.26, blur: 10 },
    { el: $('.hero__actions'), at: 0.1, span: 0.3, shift: true },
    { el: $('.hero .lede'), at: 0.3, span: 0.3, shift: true },
    { el: $('.hero .eyebrow'), at: 0.6, span: 0.3 },
  ].filter((o) => o.el)
  let on = false
  const apply = () => {
    const t = clamp(scrollY / Math.max(1, vpH() * 0.58), 0, 1)
    if (t <= 0) {
      if (!on) return
      seq.forEach((o) => {
        o.el.style.opacity = ''; o.el.style.transform = ''; o.el.style.filter = ''
        o.el.style.pointerEvents = ''; o.el.style.transition = ''
      })
      on = false; return
    }
    on = true
    seq.forEach((o) => {
      /* these carry the reveal's own .9s opacity transition, which would animate every
         value written here, so the fade would trail the scroll */
      o.el.style.transition = 'none'
      const a = 1 - smooth(o.at, o.at + o.span, t)
      o.el.style.opacity = a.toFixed(3)
      if (o.shift) o.el.style.transform = 'translate3d(0,' + ((1 - a) * 15).toFixed(1) + 'px,0)'
      if (o.blur) o.el.style.filter = a > 0.999 ? '' : 'blur(' + ((1 - a) * o.blur).toFixed(1) + 'px)'
      o.el.style.pointerEvents = a < 0.05 ? 'none' : ''
    })
  }
  addEventListener('scroll', apply, { passive: true })
  addEventListener('resize', apply, { passive: true })
  apply()
}

function wireNav() {
  const rail = document.createElement('nav')
  rail.className = 'rail'; rail.id = 'rail'; rail.setAttribute('aria-label', 'Sections')
  document.body.appendChild(rail)
  SECS.forEach((s, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.appendChild(document.createElement('i'))
    b.title = CHAPTERS[i][1]
    b.setAttribute('aria-label', CHAPTERS[i][1])
    b.addEventListener('click', () => scrollTo({ top: anchors[i], behavior: REDUCE ? 'auto' : 'smooth' }))
    rail.appendChild(b)
  })
  const dots = $$('#rail button')
  const links = $$('.topbar__links a')
  /* which chapter each link points at, read off its href */
  const linkSec = links.map((l) => SECS.indexOf(document.querySelector(l.getAttribute('href'))))
  const update = () => {
    const a = Math.round(progressFor(scrollY))
    if (a !== activeSec) {
      activeSec = a
      dots.forEach((d, i) => d.classList.toggle('on', i === a))
      links.forEach((l, i) => l.classList.toggle('on', linkSec[i] === a))
    }
  }
  dots[0]?.classList.add('on')
  addEventListener('scroll', update, { passive: true })
  return update
}

export function startScrollReveal() {
  SECS = CHAPTERS.map(([sel]) => $(sel)).filter(Boolean)
  CHAPTERS.splice(0, CHAPTERS.length, ...CHAPTERS.filter(([sel]) => $(sel)))
  tag()
  wireReveals()
  wireHeroExit()
  measure()
  const update = wireNav()
  const remeasure = () => { measure(); update() }
  addEventListener('resize', remeasure, { passive: true })
  document.fonts?.ready.then(remeasure)
  new ResizeObserver(remeasure).observe(document.body)
  /* the hero arrives on load, the rest on scroll */
  setTimeout(() => {
    $$('#top [data-rv], #top .mask-line, #top .word-reveal').forEach((e, i) =>
      setTimeout(() => e.classList.add('rv-in'), REDUCE ? 0 : 120 + i * 95))
  }, REDUCE ? 0 : 340)
}
