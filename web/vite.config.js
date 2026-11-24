import { cpSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The particle scroll, the VHS overlay and the copy button are classic scripts shared with
// artifact.html. Vite does not bundle a script without type="module", and it does not copy one
// either, so copy them into the output folder at the same paths index.html uses.
const CLASSIC = ['vendor/particle-scroll.js', 'src/sublevel-fx.js', 'src/page.js']
const here = import.meta.dirname
let outDir = resolve(here, 'dist')

export default defineConfig({
  root: here,
  base: './',
  plugins: [
    {
      name: 'copy-classic-scripts',
      apply: 'build',
      configResolved(c) {
        outDir = resolve(c.root, c.build.outDir)
      },
      closeBundle() {
        for (const f of CLASSIC) cpSync(resolve(here, f), resolve(outDir, f))
      },
    },
  ],
})
