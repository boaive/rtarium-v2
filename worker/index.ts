import { alert } from './alert'
import { handleContact } from './contact'
import type { EmailJob, Env } from './env'
import { errInfo, json } from './http'
import { healthCheck, processBatch, requeueStale } from './mailer'

/**
 * The RTARIUM Worker: the website (static assets, served before this code runs for anything outside /api/*, with the
 * security headers of dist/_headers, written by scripts/write-headers.mjs), the contact form's API, the email queue's
 * consumer, a 5-minute check for stuck email jobs and an hourly check that tells someone when something is wrong.
 */
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      if (pathname === '/api/contact' || pathname === '/api/contact/') return await handleContact(request, env, ctx)
      return json(404, { ok: false, error: 'Not found.' })
    } catch (err) {
      // nothing the API does should end here; if it does, the visitor still gets a proper answer, and someone is told
      const { text } = errInfo(err)
      console.error('[api] unexpected:', text)
      ctx.waitUntil(alert(env, 'api-unexpected', 'The contact form hit an unexpected error', [text]))
      return json(500, { ok: false, error: 'Something went wrong. Please try again in a moment.' })
    }
  },

  async queue(batch, env) {
    await processBatch(batch, env)
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(requeueStale(env))
    // the run on the hour (the cron is every 5 minutes)
    if (new Date(controller.scheduledTime).getUTCMinutes() < 5) ctx.waitUntil(healthCheck(env))
  },
} satisfies ExportedHandler<Env, EmailJob>
