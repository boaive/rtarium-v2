import { alert } from './alert'
import { db, type Sql } from './db'
import { clientMail, visitorMail, type EnquiryRecord } from './emails'
import { MAX_ATTEMPTS, UUID, type EmailJob, type Env } from './env'
import { errInfo } from './http'

/**
 * The email side: the queue consumer that sends each job, the 5-minute check that re-queues stuck jobs, and the hourly
 * check that tells someone when emails are stuck or the database is down.
 *
 * Each job is one row of email_outbox. Sending it:
 * - the row is locked for the length of the send (`for update skip locked`), so two deliveries of the same job cannot
 *   both send it; a job already 'sent' or 'failed' is simply acknowledged. (One case can still send twice: the Worker
 *   stopping after the mail service took the email but before the row was marked; then the next try sends it again.)
 * - the mail service gets 30 s to answer; the database itself ends the transaction if the Worker vanishes mid-send
 * - success: status 'sent', with Cloudflare's message id
 * - the client's copy refused outright: sent once more without the visitor's address as Reply-To (an address the mail
 *   service will not take there must not cost the client the enquiry; the address is in the email itself)
 * - a temporary failure: attempts + 1 and the error kept, then retried with a growing delay (30 s, 60 s, ... up to 5 min)
 * - a permanent failure (a malformed or suppressed address, ...), or the last attempt: status 'failed', and an alert
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

/** how long the mail service has to answer one send */
const SEND_TIMEOUT_MS = 30_000

type Job = EnquiryRecord & { job_id: string; kind: 'client_notification' | 'visitor_confirmation'; status: string; attempts: number }

type Outcome = { kind: 'done'; failed?: { job: Job; error: string } } | { kind: 'retry'; attempts: number }

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`no answer within ${ms / 1000} s`), { code: 'E_TIMEOUT' })), ms)
  })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

/** the email itself, through the binding meant for it. `bare`: the client's copy without the visitor as Reply-To */
async function deliver(env: Env, job: Job, bare = false) {
  if (job.kind === 'client_notification') {
    const m = clientMail(job)
    return withTimeout(
      env.CLIENT_MAIL.send({
        from: { email: env.FROM_ADDRESS, name: 'RTARIUM Enquiries' },
        to: env.CLIENT_ADDRESS,
        ...(bare ? {} : { replyTo: { email: job.email, name: job.name } }),
        subject: m.subject,
        html: m.html,
        text: m.text,
      }),
      SEND_TIMEOUT_MS,
    )
  }
  const m = visitorMail(job)
  return withTimeout(
    env.VISITOR_MAIL.send({
      from: { email: env.FROM_ADDRESS, name: 'RTARIUM' },
      to: { email: job.email, name: job.name },
      replyTo: env.CLIENT_ADDRESS,
      subject: m.subject,
      html: m.html,
      text: m.text,
    }),
    SEND_TIMEOUT_MS,
  )
}

async function sendJob(sql: Sql, env: Env, jobId: string): Promise<Outcome> {
  return sql.begin(async (tx) => {
    await tx`set local statement_timeout = '10s'`
    // if the Worker vanishes mid-send, the database ends the transaction itself and the row is free again
    await tx`set local idle_in_transaction_session_timeout = '90s'`
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
    let res: { messageId?: string } | undefined
    let note: string | null = null
    let failure: unknown
    try {
      res = await deliver(env, job)
    } catch (err) {
      const first = errInfo(err)
      if (job.kind === 'client_notification' && first.code !== undefined && PERMANENT.has(first.code)) {
        try {
          res = await deliver(env, job, true)
          note = `sent without Reply-To after: ${first.text}`.slice(0, 1000)
          console.warn(`[mailer] client_notification for ${job.ref} ${note}`)
        } catch (again) {
          failure = again
        }
      } else failure = err
    }

    if (res) {
      await tx`
        update email_outbox
        set status = 'sent', attempts = ${attempts}, sent_at = now(), updated_at = now(),
            provider_message_id = ${res.messageId ?? null}, last_error = ${note}
        where id = ${jobId}`
      return { kind: 'done' } as Outcome
    }

    const { code, text } = errInfo(failure)
    const giveUp = (code !== undefined && PERMANENT.has(code)) || attempts >= MAX_ATTEMPTS
    console.error(`[mailer] ${job.kind} for ${job.ref} failed (attempt ${attempts}${giveUp ? ', giving up' : ''}): ${text}`)
    await tx`
      update email_outbox
      set status = ${giveUp ? 'failed' : 'queued'}, attempts = ${attempts}, last_error = ${text}, updated_at = now()
      where id = ${jobId}`
    return giveUp ? ({ kind: 'done', failed: { job, error: text } } as Outcome) : ({ kind: 'retry', attempts } as Outcome)
  })
}

/** an email given up on: someone is told, with what they need to follow it up */
function reportFailure(env: Env, job: Job, error: string) {
  if (job.kind === 'client_notification')
    return alert(env, `job:${job.job_id}`, `An enquiry could not be emailed to ${env.CLIENT_ADDRESS}`, [
      `Reference: ${job.ref}`,
      `From: ${job.name} <${job.email}>`,
      `Interested in: ${job.interest}`,
      `Error: ${error}`,
      'The enquiry itself is saved in the database (table enquiries).',
    ])
  return alert(env, `job:${job.job_id}`, "A visitor's confirmation email could not be sent", [`Reference: ${job.ref}`, `Error: ${error}`])
}

/** the queue consumer: each message is one job */
export async function processBatch(batch: MessageBatch<EmailJob>, env: Env) {
  const sql = db(env)
  try {
    for (const msg of batch.messages) {
      const jobId = msg.body?.jobId
      if (typeof jobId !== 'string' || !UUID.test(jobId)) {
        console.error('[mailer] a queue message without a valid job id: dropped')
        msg.ack()
        continue
      }
      try {
        const out = await sendJob(sql, env, jobId)
        if (out.kind === 'retry') msg.retry({ delaySeconds: Math.min(30 * 2 ** (out.attempts - 1), 300) })
        else {
          msg.ack()
          if (out.failed) await reportFailure(env, out.failed.job, out.failed.error)
        }
      } catch (err) {
        // the database itself failed: try the message again later (the queue gives up after max_retries, and the
        // 5-minute check puts the job back once the database answers)
        console.error('[mailer] database:', errInfo(err).text)
        msg.retry({ delaySeconds: 60 })
      }
    }
  } finally {
    await sql.end().catch(() => {})
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
  } catch (err) {
    console.error('[requeue]', errInfo(err).text)
  } finally {
    await sql.end().catch(() => {})
  }
}

/** Every hour: someone is told if emails have waited more than 30 minutes, or the database does not answer. */
export async function healthCheck(env: Env) {
  const sql = db(env)
  try {
    const [r] = await sql<{ stuck: number }[]>`
      select count(*)::int as stuck from email_outbox
      where status in ('pending', 'queued') and created_at < now() - interval '30 minutes'`
    if (r.stuck)
      await alert(env, 'stuck', `${r.stuck} enquiry email(s) have waited more than 30 minutes`, [
        'They are still being retried. The Worker logs ([mailer] lines) say why they are not going out.',
      ])
  } catch (err) {
    await alert(env, 'database-hourly', 'The database did not answer the hourly check', [errInfo(err).text])
  } finally {
    await sql.end().catch(() => {})
  }
}
