import { checkEnquiry, type Enquiry } from '../src/content/enquiry'
import { alert } from './alert'
import { db, type Sql } from './db'
import type { Env } from './env'
import { errInfo, json } from './http'

/**
 * POST /api/contact: the contact form's enquiry. In order, each step answering at once when it fails:
 *
 * 1. POST only, on one of the allowed sites (ALLOWED_ORIGINS: rtarium.com, www.rtarium.com, the workers.dev address),
 *    and from that site's own pages: a browser's Origin, when it sends one, must be the same host
 * 2. rate-limited: 5 a minute per IP address (per IPv6 /64, which one home or server usually has whole)
 * 3. JSON only, at most 32 KB (read as it arrives, so a huge body is stopped early), valid UTF-8, one object
 * 4. the hidden trap field filled in = a bot: answered as if sent, logged, nothing stored or sent
 * 5. every field cleaned and checked by the same rules as the form (src/content/enquiry.ts)
 * 6. the Turnstile token checked with Cloudflare: real, unused, made by this form ('contact') on this host
 * 7. ONE time-limited transaction, one at a time per email address:
 *    - the same enquiry again within 30 minutes (a retry after a lost answer, a double send) gets the first one's
 *      reference back; nothing new is saved or sent
 *    - otherwise the enquiry and its email jobs are saved together. The visitor's confirmation is left out when their
 *      address has had 3 in the last day, or 40 have gone out in the last hour, so the form cannot be used to flood
 *      someone's inbox. The client's notification is never left out.
 *    The visitor is told "sent" only once that has committed; if the database fails, they get an error and can retry.
 * 8. the jobs go on the queue. If that fails the enquiry is still safe: the 5-minute check picks the jobs up.
 *
 * The browser never chooses who gets an email, from which address, or with what subject: only the server does.
 * Every database value goes in as a query parameter (worker/db.ts), never as SQL text.
 */

/** larger than any real enquiry: 4,000 characters of message are at most 16 KB of UTF-8 */
const MAX_BODY = 32 * 1024
/** Turnstile's tokens are at most 2,048 characters */
const MAX_TOKEN = 2048
/** the action the form's widget is rendered with (src/components/Turnstile.tsx) */
const TURNSTILE_ACTION = 'contact'
/** Cloudflare's test secrets (always pass / always fail / already spent): only ever accepted on this machine */
const TURNSTILE_TEST_SECRET = /^[123]x0{31}AA$/
const CONFIRMATIONS_PER_ADDRESS_PER_DAY = 3
const CONFIRMATIONS_PER_HOUR = 40

const SORRY = 'The enquiry could not be sent. Please try again in a moment.'

/** a short reference: when it came in (UTC) and four random characters, e.g. RT-20261111-1530-AB12 */
function reference(now: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => letters[b % letters.length]).join('')
  return `RT-${stamp}-${tail}`
}

const isLocalHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')

function hostOf(origin: string) {
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** the hosts of ALLOWED_ORIGINS (wrangler.jsonc). Matched by host: a page reached over plain http on one of them, whose
 *  send the browser then upgrades to https, is still the same site */
function allowedHosts(env: Env) {
  return new Set(
    (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => hostOf(o.trim()))
      .filter(Boolean),
  )
}

/** for logs: the part of an address after the @, nothing that identifies the person */
function domainOf(v: unknown) {
  return typeof v === 'string' && v.includes('@') ? v.slice(v.lastIndexOf('@') + 1).replace(/[^\w.-]/g, '').slice(0, 80) : '?'
}

/** the rate limit's key: an IPv4 address as it is, an IPv6 address by its first 64 bits */
function limitKey(ip: string | null) {
  if (!ip) return 'contact:unknown'
  if (!ip.includes(':')) return `contact:${ip}`
  // an IPv4 address written as IPv6 (::ffff:1.2.3.4)
  if (ip.includes('.')) return `contact:${ip.slice(ip.lastIndexOf(':') + 1)}`
  const [head, tail] = ip.toLowerCase().split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
  return `contact:${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}

/** the body, read as it arrives and stopped as soon as it is too long; then decoded, refusing broken UTF-8 */
async function readBody(request: Request): Promise<{ text: string } | { status: number; error: string }> {
  const tooLong = { status: 413, error: 'The enquiry is too long.' }
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return tooLong
  if (!request.body) return { text: '' }
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => {})
      return tooLong
    }
    parts.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    all.set(p, at)
    at += p.byteLength
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(all) }
  } catch {
    return { status: 400, error: 'Not valid text.' }
  }
}

type Verdict = 'ok' | 'failed' | 'stale-page'

/**
 * Cloudflare Turnstile: is the token real, unused, and made by this form on this site? Throws when the fault is ours
 * (no secret, a wrong secret, a test secret on the live site) or Cloudflare cannot be reached: then no visitor can
 * send, and someone is told (worker/alert.ts).
 */
async function verifyTurnstile(env: Env, token: string, ip: string | null, host: string): Promise<Verdict> {
  // trimmed: a secret pasted into a terminal can carry a stray space or line break
  const secret = (env.TURNSTILE_SECRET_KEY ?? '').trim()
  if (!secret) throw new Error('TURNSTILE_SECRET_KEY is not set')
  const test = TURNSTILE_TEST_SECRET.test(secret)
  if (test && !isLocalHost(host)) throw new Error(`a Turnstile TEST secret is set on ${host}: every token would pass`)
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    signal: AbortSignal.timeout(10_000),
  })
  const out = (await r.json().catch(() => null)) as { success?: boolean; 'error-codes'?: string[]; hostname?: string; action?: string } | null
  if (!out) throw new Error(`Turnstile siteverify answered ${r.status} without a result`)
  const codes = out['error-codes'] ?? []
  // our own set-up is wrong (not the visitor's fault)
  if (codes.some((c) => c.includes('secret') || c === 'bad-request' || c === 'internal-error'))
    throw new Error(`Turnstile siteverify answered ${r.status}: ${codes.join(', ')}`)
  if (out.success !== true) {
    console.warn(`[contact] turnstile rejected (${r.status}): ${codes.join(', ') || 'no reason given'}`)
    return 'failed'
  }
  // test tokens carry no real host or action
  if (test) return 'ok'
  if ((out.hostname ?? '').toLowerCase() !== host) {
    console.warn(`[contact] turnstile token made on another host (${out.hostname})`)
    return 'failed'
  }
  if (out.action !== TURNSTILE_ACTION) {
    // most likely a page loaded before this version went live
    console.warn(`[contact] turnstile token for action "${out.action}"`)
    return 'stale-page'
  }
  return 'ok'
}

/** step 7: the enquiry and its email jobs, saved in one transaction; or the same enquiry's reference, if it is a repeat */
async function save(sql: Sql, e: Enquiry): Promise<{ ref: string; jobIds: string[] }> {
  const email = e.email.toLowerCase()
  for (let attempt = 1; ; attempt++) {
    try {
      return await sql.begin(async (tx) => {
        await tx`set local statement_timeout = '8s'`
        await tx`set local lock_timeout = '5s'`
        // one enquiry at a time per address, so two identical sends at the same moment cannot both get through
        await tx`select pg_advisory_xact_lock(hashtext(${'rtarium-enquiry:' + email}))`

        const [same] = await tx<{ ref: string }[]>`
          select ref from enquiries
          where lower(email) = ${email} and interest = ${e.interest} and message = ${e.message}
            and created_at > now() - interval '30 minutes'
          order by created_at desc
          limit 1`
        if (same) return { ref: same.ref, jobIds: [] as string[] }

        const [sent] = await tx<{ address: number; hour: number }[]>`
          select
            (select count(*) from email_outbox o join enquiries q on q.id = o.enquiry_id
              where o.kind = 'visitor_confirmation' and lower(q.email) = ${email}
                and o.created_at > now() - interval '1 day')::int as address,
            (select count(*) from email_outbox
              where kind = 'visitor_confirmation' and created_at > now() - interval '1 hour')::int as hour`
        const confirm = sent.address < CONFIRMATIONS_PER_ADDRESS_PER_DAY && sent.hour < CONFIRMATIONS_PER_HOUR
        if (!confirm)
          console.warn(`[contact] confirmation left out (this address ${sent.address} today, ${sent.hour} in all this hour; @${domainOf(email)})`)

        const ref = reference(new Date())
        const [row] = await tx<{ id: string }[]>`
          insert into enquiries (ref, name, email, phone, company, interest, message)
          values (${ref}, ${e.name}, ${e.email}, ${e.phone || null}, ${e.company || null}, ${e.interest}, ${e.message})
          returning id`
        const jobs = confirm
          ? await tx<{ id: string }[]>`
              insert into email_outbox (enquiry_id, kind)
              values (${row.id}, 'client_notification'), (${row.id}, 'visitor_confirmation')
              returning id`
          : await tx<{ id: string }[]>`
              insert into email_outbox (enquiry_id, kind)
              values (${row.id}, 'client_notification')
              returning id`
        return { ref, jobIds: jobs.map((j) => j.id) }
      })
    } catch (err) {
      // the made-up reference already taken (about one in a million within the same minute): again, with a new one
      const pg = err as { code?: string; constraint_name?: string }
      if (attempt < 3 && pg.code === '23505' && /ref/.test(pg.constraint_name ?? '')) continue
      throw err
    }
  }
}

export async function handleContact(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'POST only.' }, { Allow: 'POST' })
  const host = new URL(request.url).hostname.toLowerCase()
  const local = isLocalHost(host)

  // 1. only the allowed sites (ALLOWED_ORIGINS), and only their own pages: every browser says where a POST comes from
  //    (scripts outside a browser do not, and still have to pass Turnstile, made on this host, like anyone else)
  const allowed = allowedHosts(env)
  if (!local && !allowed.size) {
    ctx.waitUntil(alert(env, 'origins', 'The contact form refuses every enquiry: ALLOWED_ORIGINS is not set'))
    return json(503, { ok: false, error: SORRY })
  }
  if (!local && !allowed.has(host)) return json(403, { ok: false, error: 'Not allowed.' })
  const origin = request.headers.get('Origin')
  const fromHost = origin === null ? null : hostOf(origin)
  const sameSite = fromHost === null || fromHost === host || (local && isLocalHost(fromHost))
  if (!sameSite || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json(403, { ok: false, error: 'Not allowed.' })

  // 2. at most 5 a minute from one address
  const ip = request.headers.get('CF-Connecting-IP')
  try {
    const { success } = await env.CONTACT_LIMIT.limit({ key: limitKey(ip) })
    if (!success)
      return json(429, { ok: false, error: 'Too many enquiries in a short time. Please wait a minute and try again.' }, { 'Retry-After': '60' })
  } catch (err) {
    // the limiter itself failed: carry on (Turnstile still stands in front), but say so in the log
    console.error('[contact] rate limiter:', errInfo(err).text)
  }

  // 3. a small JSON object
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json'))
    return json(415, { ok: false, error: 'Not JSON.' })
  const got = await readBody(request)
  if ('status' in got) return json(got.status, { ok: false, error: got.error })
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(got.text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return json(400, { ok: false, error: 'Not JSON.' })
  }

  // 4. the field no person fills in (the form hides it): a bot's, answered as if sent so it learns nothing. Logged,
  //    in case a browser ever fills it in for a person
  if (typeof body.website === 'string' && body.website.trim()) {
    console.warn(`[contact] trap field filled in: answered as sent, nothing kept (@${domainOf(body.email)})`)
    return json(200, { ok: true, ref: reference(new Date()) })
  }

  // 5. every field, cleaned and checked
  const checked = checkEnquiry(body)
  if ('error' in checked) return json(400, { ok: false, field: checked.field, error: checked.error })

  // 6. Turnstile
  const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : ''
  if (!token) return json(400, { ok: false, error: 'Please complete the verification check.' })
  if (token.length > MAX_TOKEN) return json(403, { ok: false, error: 'The verification check failed. Please try again.' })
  let verdict: Verdict
  try {
    verdict = await verifyTurnstile(env, token, ip, host)
  } catch (err) {
    const { text } = errInfo(err)
    console.error('[contact] turnstile:', text)
    ctx.waitUntil(alert(env, 'turnstile', 'The contact form cannot check visitors, so no enquiry can be sent', [text]))
    return json(503, { ok: false, error: SORRY })
  }
  if (verdict === 'stale-page') return json(403, { ok: false, error: 'This page is out of date. Please reload it and send again.' })
  if (verdict !== 'ok') return json(403, { ok: false, error: 'The verification check failed. Please try again.' })

  // 7. saved, then 8. queued
  const sql = db(env)
  try {
    const saved = await save(sql, checked.enquiry)
    if (saved.jobIds.length) {
      try {
        await env.EMAIL_QUEUE.sendBatch(saved.jobIds.map((jobId) => ({ body: { jobId } })))
        // an IN list of parameters: with fetch_types off the driver cannot send a JS array as a Postgres array
        await sql`update email_outbox set status = 'queued', updated_at = now() where id in ${sql(saved.jobIds)} and status = 'pending'`
      } catch (err) {
        // not the visitor's problem: the enquiry is saved, and the 5-minute check sends its emails
        console.error('[contact] queue (jobs left for the 5-minute check):', errInfo(err).text)
      }
    }
    return json(200, { ok: true, ref: saved.ref })
  } catch (err) {
    const { text } = errInfo(err)
    console.error('[contact] database:', text)
    ctx.waitUntil(alert(env, 'database', 'Enquiries cannot be saved: the database did not answer', [text]))
    return json(503, { ok: false, error: SORRY })
  } finally {
    ctx.waitUntil(sql.end().catch(() => {}))
  }
}
