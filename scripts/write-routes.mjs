// Static hosting: give every route its own index.html so a direct visit or refresh works on any
// static host without rewrite rules, and serve unknown paths the app's own not-found page.
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUTES = [
  'advanced-flooring',
  'facade-cladding',
  'facade-cladding/unitized-thin-concrete-facade',
  'facade-cladding/rainscreen-cladding',
  'facade-cladding/stud-frame-cladding',
  'wall-panels',
  'contact',
]
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const index = join(dist, 'index.html')
for (const route of ROUTES) {
  mkdirSync(join(dist, route), { recursive: true })
  copyFileSync(index, join(dist, route, 'index.html'))
}
copyFileSync(index, join(dist, '404.html'))
console.log(`routes: ${ROUTES.length} entry points + 404.html`)
