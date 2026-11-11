import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Older browsers (before Chrome/Edge 108, Firefox 110, Safari 16) know neither the small-viewport units (`svh`) nor the
 * container units (`cqh`, `cqw`): a declaration using them is dropped there, and a full-screen section loses its height.
 * Every such declaration gets a plain one before it, in `vh`/`vw`, which those browsers keep and newer ones override;
 * a custom property (always valid, so a plain one before it would simply lose) gets its plain value in an
 * `@supports not` block after its rule, for those browsers alone. `overflow: clip` gets `hidden` before it likewise.
 */
const NEW_UNITS = /(\d*\.?\d+)(svh|dvh|lvh|svw|dvw|lvw|cqh|cqw|cqi|cqb|cqmin|cqmax)\b/
const plainUnits = (v: string) =>
  v
    .replace(/(\d*\.?\d+)[sdl]v(h|w)\b/g, '$1v$2')
    .replace(/(\d*\.?\d+)cq(?:h|b)\b/g, '$1vh')
    .replace(/(\d*\.?\d+)cq(?:w|i)\b/g, '$1vw')
    .replace(/(\d*\.?\d+)cqmin\b/g, '$1vmin')
    .replace(/(\d*\.?\d+)cqmax\b/g, '$1vmax')
type Decl = { prop: string; value: string; parent?: Rule; prev(): { type: string; prop?: string; value?: string } | undefined; cloneBefore(o: object): void }
type Rule = { type: string; selector?: string; parent?: unknown; after(n: unknown): void; clone(o: object): unknown }
function oldBrowserFallbacks() {
  return {
    postcssPlugin: 'old-browser-fallbacks',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Declaration(decl: Decl, { AtRule, Rule: RuleNode, Declaration: DeclNode }: any) {
      if (decl.prop === 'overflow' && decl.value === 'clip') {
        const prev = decl.prev()
        if (!(prev?.type === 'decl' && prev.prop === 'overflow')) decl.cloneBefore({ value: 'hidden' })
        return
      }
      if (!NEW_UNITS.test(decl.value)) return
      const plain = plainUnits(decl.value)
      if (!decl.prop.startsWith('--')) {
        const prev = decl.prev()
        if (!(prev?.type === 'decl' && prev.prop === decl.prop && prev.value === plain)) decl.cloneBefore({ value: plain })
        return
      }
      const rule = decl.parent
      if (!rule || rule.type !== 'rule' || !rule.selector) return
      const test = /cq/.test(decl.value) ? '(height: 1cqh)' : '(height: 1svh)'
      const block = new AtRule({ name: 'supports', params: `not ${test}` })
      const copy = new RuleNode({ selector: rule.selector })
      copy.append(new DeclNode({ prop: decl.prop, value: plain }))
      block.append(copy)
      rule.after(block)
    },
  }
}
oldBrowserFallbacks.postcss = true

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: { plugins: [oldBrowserFallbacks()] },
  },
  server: {
    // the contact form's API is the Cloudflare Worker (worker/): run `npx wrangler dev` alongside `npm run dev` to use it
    proxy: { '/api': 'http://localhost:8787' },
    watch: {
      ignored: ['**/out/**', '**/.git/**', '**/rtarium-film/**', '**/rtarium-unitized/**'],
    },
  },
  build: {
    // the browsers of the last few years and up (Chrome/Edge 90, Firefox 90, Safari 15: 2021): newer syntax is
    // written down to what they read
    target: ['es2020', 'chrome90', 'edge90', 'firefox90', 'safari15'],
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
