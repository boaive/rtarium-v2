import type { Env } from './env'
import { errInfo } from './http'

/**
 * Telling a person when something needs them: an email that could not be sent, emails stuck, the database or the
 * verification check unreachable. Always written to the Worker's log as "[ALERT] …"; also posted to ALERT_WEBHOOK_URL
 * when that secret is set (Slack, Google Chat, Telegram and most chat tools take {"text"}; Discord takes {"content"}).
 *
 * The same problem (the same key) is reported once per 15 minutes per Worker instance, so an outage is one message,
 * not one per visitor. An alert never throws and never holds up the visitor's answer.
 */

const QUIET_MS = 15 * 60_000
const lastSent = new Map<string, number>()

export async function alert(env: Env, key: string, title: string, lines: string[] = []) {
  const now = Date.now()
  const before = lastSent.get(key)
  if (before !== undefined && now - before < QUIET_MS) return
  lastSent.set(key, now)

  const text = [`RTARIUM website: ${title}`, ...lines].join('\n')
  console.error(`[ALERT] ${text}`)

  const raw = (env.ALERT_WEBHOOK_URL ?? '').trim()
  if (!raw) return
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    console.error('[alert] ALERT_WEBHOOK_URL is not a valid URL')
    return
  }
  // https only (plain http only to this machine, for testing)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    console.error('[alert] ALERT_WEBHOOK_URL must start with https://')
    return
  }
  const discord = /(^|\.)discord(app)?\.com$/i.test(url.hostname)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discord ? { content: text.slice(0, 1900) } : { text: text.slice(0, 3500) }),
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) console.error(`[alert] the webhook answered ${r.status}`)
  } catch (err) {
    console.error('[alert] the webhook could not be reached:', errInfo(err).text)
  }
}
