import { handleContact } from './contact'
import type { EmailJob, Env } from './env'
import { processBatch, requeueStale } from './mailer'

/**
 * The RTARIUM Worker: the website (static assets, served before this code runs for anything outside /api/*), the
 * contact form's API, the email queue's consumer, and a 5-minute check for stuck email jobs.
 */
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/contact' || pathname === '/api/contact/') return handleContact(request, env, ctx)
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ ok: false, error: 'Not found.' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }
    return env.ASSETS.fetch(request)
  },

  async queue(batch, env) {
    await processBatch(batch, env)
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(requeueStale(env))
  },
} satisfies ExportedHandler<Env, EmailJob>
