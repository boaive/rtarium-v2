/** What the Worker is bound to (wrangler.jsonc), and its secrets. */
export interface Env {
  ASSETS: Fetcher
  HYPERDRIVE: Hyperdrive
  EMAIL_QUEUE: Queue<EmailJob>
  /** sends only to info@rtarium.com */
  CLIENT_MAIL: SendEmail
  /** sends only from enquiries@rtarium.com */
  VISITOR_MAIL: SendEmail
  CONTACT_LIMIT: RateLimit
  FROM_ADDRESS: string
  CLIENT_ADDRESS: string
  /** secret: `npx wrangler secret put TURNSTILE_SECRET_KEY` */
  TURNSTILE_SECRET_KEY: string
  /**
   * secret, optional: where problems are reported (worker/alert.ts), a Slack, Google Chat, Discord or Telegram webhook.
   * `npx wrangler secret put ALERT_WEBHOOK_URL`. Without it, problems are only written to the Worker's logs.
   */
  ALERT_WEBHOOK_URL?: string
}

/** a queue message: which row of email_outbox to send */
export interface EmailJob {
  jobId: string
}

/** an email job is given up (and marked failed) after this many attempts */
export const MAX_ATTEMPTS = 6

/** a row id as the database makes them */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
