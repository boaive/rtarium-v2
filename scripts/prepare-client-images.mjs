// Lossless orientation normalization, then web-size encoding of the supplied, mapped originals.
// Run with NODE_PATH pointing to a runtime containing sharp. No creative edits or source overwrites.
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const source = resolve('assets/RTARIUM CLIPS/RTARIUM')
const destination = resolve('public/img/client')
const files = ['F1.jpg', 'F2.png', 'F3.png', 'U1.JPG', 'U3.JPG', 'U5.JPG', 'L1.jpg', 'L2.JPG', 'P1.JPG', 'P2.JPG', 'C1.JPG']

await mkdir(destination, { recursive: true })
for (const file of files) {
  const code = file.split('.')[0].toLowerCase()
  const result = await sharp(resolve(source, file))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, effort: 6 })
    .toFile(resolve(destination, `${code}.webp`))
  console.log(`${code}: ${result.width}x${result.height}, ${result.size} bytes`)
}

// Approved retouches are kept beside the untouched supplied originals.
for (const code of ['u2', 'u4', 'f4']) {
  await sharp(resolve(source, '..', 'retouched', `${code}.png`))
    .resize({ height: 1280, withoutEnlargement: true })
    .webp({ quality: 88, effort: 6 })
    .toFile(resolve(destination, `${code}.webp`))
}
await sharp(resolve(source, '..', 'retouched', 'l3.png'))
  .webp({ quality: 88, effort: 6 })
  .toFile(resolve(destination, 'l3.webp'))

// Rendered with scripts/media-render.html and the existing product components.
for (const code of ['h2', 'h3', 'h4']) {
  const input = resolve(source, '..', 'renders', `${code}.jpg`)
  const framing = {
    h2: { left: 120, top: 160, width: 660, height: 700 },
    h3: { left: 0, top: 180, width: 900, height: 700 },
    h4: { left: 150, top: 110, width: 600, height: 800 },
  }[code]
  await sharp(input)
    .extract(framing)
    .resize(1200, 900, { fit: 'contain', background: '#f2f0e9' })
    .webp({ quality: 90, effort: 6 })
    .toFile(resolve(destination, `${code}.webp`))
  await sharp(input)
    .extract(framing)
    .resize(600, 450, { fit: 'contain', background: '#f2f0e9' })
    .webp({ quality: 90, effort: 6 })
    .toFile(resolve(destination, `${code}-sm.webp`))
}
