// Copy the agent prompt. The clipboard can refuse; then select the text so it can be copied by hand.
for (const b of document.querySelectorAll('[data-copy]')) {
  const label = b.textContent
  b.addEventListener('click', async () => {
    const el = document.querySelector(b.dataset.copy)
    // copy the prompt only, not its orange label
    const text = el ? [...el.childNodes].filter((n) => !n.classList?.contains('dim')).map((n) => n.textContent).join('').trim() : ''
    try {
      await navigator.clipboard.writeText(text)
      b.textContent = 'Prompt copied'
    } catch {
      const r = document.createRange(); r.selectNodeContents(el)
      const s = getSelection(); s.removeAllRanges(); s.addRange(r)
      b.textContent = 'Selected, press Ctrl+C'
    }
    setTimeout(() => { b.textContent = label }, 2200)
  })
}
