// Vanilla port of ThreeUI src/shaders/crt/CrtBackground.tsx (SHA-256 20932f26...0c95031).
// The site has no React, so this does exactly what the component's useEffect and JSX do:
// the same host div, classes and inline style, one canvas, the same renderer, the same
// ResizeObserver, IntersectionObserver and requestAnimationFrame loop, and the same cleanup.
// crtRenderer.ts, crtShaders.ts and crtScreens.ts are the registered files, copied unchanged.
import { createCrtRenderer, crtStyle, CRT_DEFAULTS, CRT_VARIANTS } from './crtRenderer.ts'

export { CRT_VARIANTS }

/** Mounts a CRT background inside `parent`. Returns a function that unmounts it. */
export function mountCrtBackground(parent, { className = '', ...props } = {}) {
  const options = { ...CRT_DEFAULTS, ...props }
  const host = document.createElement('div')
  host.className = `threeui-background crt crt-${options.variant}${className ? ` ${className}` : ''}`
  host.style.background = crtStyle(options.variant).background
  host.style.opacity = String(options.opacity)
  host.style.filter = `hue-rotate(${options.hue}deg) saturate(${options.saturation}) brightness(${options.brightness})`
  const canvas = document.createElement('canvas')
  host.append(canvas)
  parent.append(host)

  const renderer = createCrtRenderer(host, canvas, () => options)
  let frame = 0
  let visible = true
  const resize = () => {
    renderer.resize()
    renderer.render(performance.now())
  }
  const tick = (now) => {
    renderer.render(now)
    frame = visible && !document.hidden ? requestAnimationFrame(tick) : 0
  }
  const resizeObserver = new ResizeObserver(resize)
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true
    if (visible && !frame) frame = requestAnimationFrame(tick)
    if (!visible && frame) cancelAnimationFrame(frame), (frame = 0)
  })
  resizeObserver.observe(host)
  intersection.observe(host)
  resize()
  frame = requestAnimationFrame(tick)

  return () => {
    if (frame) cancelAnimationFrame(frame)
    resizeObserver.disconnect()
    intersection.disconnect()
    renderer.dispose()
    host.remove()
  }
}
