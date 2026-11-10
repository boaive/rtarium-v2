import { handleEnquiry } from '../server/enquiry.js'

/**
 * The contact form's endpoint on Vercel: POST /api/contact, a JSON enquiry in, sent on as a mail (server/enquiry.ts).
 * Its settings are the project's environment variables: GMAIL_USER, GMAIL_APP_PASSWORD, CONTACT_TO.
 */
export default async function handler(
  req: { method?: string; body?: unknown },
  res: { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void },
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'POST only.' })
  }
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body
  const { status, body: out } = await handleEnquiry(body, process.env)
  return res.status(status).json(out)
}

function safeJson(s: string) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
