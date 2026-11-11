/** What the Worker is bound to (wrangler.jsonc), and its one secret. */
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
}

/** a queue message: which row of email_outbox to send */
export interface EmailJob {
  jobId: string
}

/** an email job is given up (and marked failed) after this many attempts */
export const MAX_ATTEMPTS = 6
