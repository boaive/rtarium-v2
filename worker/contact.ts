import { EMAIL_RE, ENQUIRY_FIELDS, INTERESTS, type Enquiry } from '../src/content/enquiry'
import { db } from './db'
import type { Env } from './env'

/**
 * POST /api/contact: the contact form's enquiry.
 *
 * 1. rate-limited per IP; the body is size-capped JSON
 * 2. the hidden "website" field filled in = a bot: answered as if sent, nothing is stored
 * 3. fields checked (the same rules the form uses), then the Turnstile token verified with Cloudflare
 * 4. ONE transaction: the enquiry and its two email jobs (client notification, visitor confirmation). The visitor is told
 *    "sent" only once that has committed; if the database fails, they get an error and can try again.
 * 5. the jobs go on the queue. If that fails the enquiry is still safe: the 5-minute check picks the jobs up.
 *
 * The browser never chooses who gets an email, from which address, or with what subject: only the server does.
 */

type Out = { ok: boolean; ref?: string; error?: string }

const json = (status: number, body: Out, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })

/** larger than any real enquiry (the message is capped at 4,000 characters) */
const MAX_BODY = 32 * 1024

/** what the visitor sent, trimmed and kept to each field's length; or what is wrong with it */
function read(src: Record<string, unknown>): { enquiry: Enquiry } | { error: string } {
  const e = {} as Enquiry
  for (const f of ENQUIRY_FIELDS) {
    const v = typeof src[f.key] === 'string' ? (src[f.key] as string).trim() : ''
    if (f.required && !v) return { error: `${f.label} is needed.` }
    if (v.length > f.max) return { error: `${f.label} is too long.` }
    e[f.key] = v
  }
  if (!EMAIL_RE.test(e.email)) return { error: 'That email address does not look right.' }
  if (!(INTERESTS as readonly string[]).includes(e.interest)) return { error: 'Choose what you are interested in.' }
  return { enquiry: e }
}

/** a short reference: when it came in (UTC) and four random letters, e.g. RT-20261111-1530-AB12 */
function reference(now: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => letters[b % letters.length]).join('')
  return `RT-${stamp}-${tail}`
}

/** Cloudflare Turnstile: is the token real, unused and for this visitor? */
async function turnstileOk(env: Env, token: string, ip: string | null) {
  if (!env.TURNSTILE_SECRET_KEY) throw new Error('TURNSTILE_SECRET_KEY is not set')
  const form = new FormData()
  form.append('secret', env.TURNSTILE_SECRET_KEY)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  if (!r.ok) throw new Error(`Turnstile siteverify answered ${r.status}`)
  const out = (await r.json()) as { success: boolean; 'error-codes'?: string[] }
  if (!out.success) console.warn('[contact] turnstile rejected:', out['error-codes']?.join(', '))
  return out.success
}

export async function handleContact(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'POST only.' }, { Allow: 'POST' })

  const ip = request.headers.get('CF-Connecting-IP')
  const { success } = await env.CONTACT_LIMIT.limit({ key: `contact:${ip ?? 'unknown'}` })
  if (!success) return json(429, { ok: false, error: 'Too many enquiries in a short time. Please wait a minute and try again.' })

  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) return json(415, { ok: false, error: 'Not JSON.' })
  const raw = await request.text()
  if (raw.length > MAX_BODY) return json(413, { ok: false, error: 'The enquiry is too long.' })
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return json(400, { ok: false, error: 'Not JSON.' })
  }

  // the field no person fills in (the form hides it): a bot's, answered as if sent so it learns nothing
  if (typeof body.website === 'string' && body.website.trim()) return json(200, { ok: true })

  const got = read(body)
  if ('error' in got) return json(400, { ok: false, error: got.error })

  const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : ''
  if (!token) return json(400, { ok: false, error: 'Please complete the verification check.' })
  try {
    if (!(await turnstileOk(env, token, ip))) return json(403, { ok: false, error: 'The verification check failed. Please try again.' })
  } catch (err) {
    console.error('[contact] turnstile:', err instanceof Error ? err.message : err)
    return json(503, { ok: false, error: 'The enquiry could not be sent. Please try again in a moment.' })
  }

  const e = got.enquiry
  const ref = reference(new Date())
  const sql = db(env)
  let jobIds: string[]
  try {
    jobIds = await sql.begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into enquiries (ref, name, email, phone, company, interest, message)
        values (${ref}, ${e.name}, ${e.email}, ${e.phone || null}, ${e.company || null}, ${e.interest}, ${e.message})
        returning id`
      const jobs = await tx<{ id: string }[]>`
        insert into email_outbox (enquiry_id, kind)
        values (${row.id}, 'client_notification'), (${row.id}, 'visitor_confirmation')
        returning id`
      return jobs.map((j) => j.id)
    })
  } catch (err) {
    console.error('[contact] database:', err instanceof Error ? err.message : err)
    ctx.waitUntil(sql.end())
    return json(503, { ok: false, error: 'The enquiry could not be sent. Please try again in a moment.' })
  }

  // saved: hand the emails to the queue. A failure here is not the visitor's problem; the 5-minute check re-queues.
  try {
    await env.EMAIL_QUEUE.sendBatch(jobIds.map((jobId) => ({ body: { jobId } })))
    await sql`update email_outbox set status = 'queued', updated_at = now() where id = any(${jobIds}::uuid[]) and status = 'pending'`
  } catch (err) {
    console.error('[contact] queue (jobs left pending for the scheduled check):', err instanceof Error ? err.message : err)
  } finally {
    ctx.waitUntil(sql.end())
  }

  return json(200, { ok: true, ref })
}
