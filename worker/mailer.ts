import { db, type Sql } from './db'
import { clientMail, visitorMail, type EnquiryRecord } from './emails'
import { MAX_ATTEMPTS, type EmailJob, type Env } from './env'

/**
 * The email side: the queue consumer that sends each job, and the scheduled check that re-queues stuck jobs.
 *
 * Each job is one row of email_outbox. Sending it:
 * - the row is locked for the length of the send (`for update skip locked`), so two deliveries of the same job can never
 *   both send it; a job already 'sent' or 'failed' is simply acknowledged
 * - success: status 'sent', with Cloudflare's message id
 * - a temporary failure: attempts + 1 and the error kept, then retried with a growing delay (30 s, 60 s, ... up to 5 min)
 * - a permanent failure (a malformed or suppressed address, ...), or the last attempt: status 'failed'
 * The enquiry itself is never touched here: it is in the database whatever happens to its emails.
 */

/** errors no retry will fix */
const PERMANENT = new Set([
  'E_VALIDATION_ERROR',
  'E_FIELD_MISSING',
  'E_TOO_MANY_RECIPIENTS',
  'E_RECIPIENT_SUPPRESSED',
  'E_CONTENT_TOO_LARGE',
  'E_HEADER_NOT_ALLOWED',
  'E_HEADER_USE_API_FIELD',
  'E_HEADER_VALUE_INVALID',
  'E_HEADER_VALUE_TOO_LONG',
  'E_HEADER_NAME_INVALID',
  'E_HEADERS_TOO_LARGE',
  'E_HEADERS_TOO_MANY',
])

type Job = EnquiryRecord & { job_id: string; kind: 'client_notification' | 'visitor_confirmation'; status: string; attempts: number }

type Outcome = { kind: 'done' } | { kind: 'retry'; attempts: number }

const errInfo = (err: unknown) => {
  const code = (err as { code?: unknown })?.code
  const message = err instanceof Error ? err.message : String(err)
  return { code: typeof code === 'string' ? code : undefined, text: (typeof code === 'string' ? `${code}: ${message}` : message).slice(0, 1000) }
}

/** the email itself, through the binding meant for it */
async function deliver(env: Env, job: Job) {
  if (job.kind === 'client_notification') {
    const m = clientMail(job)
    return env.CLIENT_MAIL.send({
      from: { email: env.FROM_ADDRESS, name: 'RTARIUM Enquiries' },
      to: env.CLIENT_ADDRESS,
      replyTo: { email: job.email, name: job.name },
      subject: m.subject,
      html: m.html,
      text: m.text,
    })
  }
  const m = visitorMail(job)
  return env.VISITOR_MAIL.send({
    from: { email: env.FROM_ADDRESS, name: 'RTARIUM' },
    to: { email: job.email, name: job.name },
    replyTo: env.CLIENT_ADDRESS,
    subject: m.subject,
    html: m.html,
    text: m.text,
  })
}

async function sendJob(sql: Sql, env: Env, jobId: string): Promise<Outcome> {
  return sql.begin(async (tx) => {
    const [job] = await tx<Job[]>`
      select o.id as job_id, o.kind, o.status, o.attempts,
             e.ref, e.name, e.email, coalesce(e.phone, '') as phone, coalesce(e.company, '') as company,
             e.interest, e.message, e.created_at
      from email_outbox o join enquiries e on e.id = o.enquiry_id
      where o.id = ${jobId}
      for update of o skip locked`
    // locked by another delivery of the same job, gone, or already settled: nothing to do
    if (!job || job.status === 'sent' || job.status === 'failed') return { kind: 'done' } as Outcome

    const attempts = job.attempts + 1
    try {
      const res = await deliver(env, job)
      await tx`
        update email_outbox
        set status = 'sent', attempts = ${attempts}, sent_at = now(), updated_at = now(),
            provider_message_id = ${res.messageId ?? null}, last_error = null
        where id = ${jobId}`
      return { kind: 'done' } as Outcome
    } catch (err) {
      const { code, text } = errInfo(err)
      const giveUp = (code !== undefined && PERMANENT.has(code)) || attempts >= MAX_ATTEMPTS
      console.error(`[mailer] ${job.kind} for ${job.ref} failed (attempt ${attempts}${giveUp ? ', giving up' : ''}): ${text}`)
      await tx`
        update email_outbox
        set status = ${giveUp ? 'failed' : 'queued'}, attempts = ${attempts}, last_error = ${text}, updated_at = now()
        where id = ${jobId}`
      return giveUp ? ({ kind: 'done' } as Outcome) : ({ kind: 'retry', attempts } as Outcome)
    }
  })
}

/** the queue consumer: each message is one job */
export async function processBatch(batch: MessageBatch<EmailJob>, env: Env) {
  const sql = db(env)
  try {
    for (const msg of batch.messages) {
      const jobId = msg.body?.jobId
      if (typeof jobId !== 'string') {
        msg.ack()
        continue
      }
      try {
        const out = await sendJob(sql, env, jobId)
        if (out.kind === 'retry') msg.retry({ delaySeconds: Math.min(30 * 2 ** (out.attempts - 1), 300) })
        else msg.ack()
      } catch (err) {
        // the database itself failed: try the message again later (the queue gives up after max_retries)
        console.error('[mailer] database:', errInfo(err).text)
        msg.retry({ delaySeconds: 60 })
      }
    }
  } finally {
    await sql.end()
  }
}

/**
 * Every 5 minutes: jobs still pending or queued with no activity for 10 minutes (the queue send failed after the enquiry
 * was saved, or a message ran out of retries while the database was down) go back on the queue. A job that is already
 * being sent is locked, and a sent one is skipped, so this never sends an email twice.
 */
export async function requeueStale(env: Env) {
  const sql = db(env)
  try {
    const rows = await sql<{ id: string }[]>`
      update email_outbox
      set status = 'queued', updated_at = now()
      where id in (
        select id from email_outbox
        where status in ('pending', 'queued') and attempts < ${MAX_ATTEMPTS} and updated_at < now() - interval '10 minutes'
        order by created_at
        limit 100
        for update skip locked
      )
      returning id`
    if (rows.length) {
      await env.EMAIL_QUEUE.sendBatch(rows.map((r) => ({ body: { jobId: r.id } })))
      console.log(`[requeue] ${rows.length} email job(s) put back on the queue`)
    }
  } finally {
    await sql.end()
  }
}
