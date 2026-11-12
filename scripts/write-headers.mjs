// The site's security headers, written to dist/_headers after the build (Cloudflare serves every page and file with
// them; the API sets its own in worker/http.ts).
//
// Content-Security-Policy: the page may run only its own scripts, the inline scripts of index.html (allowed by their
// exact hash, worked out here from the built file, so editing one can never quietly break it), Cloudflare Turnstile and
// Cloudflare's own analytics beacon; it may talk only to itself and Turnstile; nothing may frame it. The rest: no
// sniffing, no framing, no referrer beyond this site, no camera/microphone/location, HTTPS only.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const html = readFileSync(`${dist}index.html`, 'utf8')

// hashed as the browser reads them: its HTML parser turns every CRLF or lone CR into LF (a Windows checkout has CRLF)
const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].replace(/\r\n?/g, '\n'))
const hashes = inline.map((code) => `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`)

const TURNSTILE = 'https://challenges.cloudflare.com'
const csp = [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(' ')} ${TURNSTILE} https://static.cloudflareinsights.com`.replace(/\s+/g, ' '),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  `connect-src 'self' ${TURNSTILE} https://cloudflareinsights.com`,
  `frame-src ${TURNSTILE}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const headers = [
  '/*',
  `  Content-Security-Policy: ${csp}`,
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  '  Cross-Origin-Opener-Policy: same-origin',
  '  Strict-Transport-Security: max-age=31536000',
  '',
].join('\n')

writeFileSync(`${dist}_headers`, headers)
console.log(`headers: dist/_headers (${hashes.length} inline script hash${hashes.length === 1 ? '' : 'es'})`)
