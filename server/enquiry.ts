import nodemailer from 'nodemailer'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { EMAIL_RE, ENQUIRY_FIELDS, INTERESTS, type Enquiry } from '../src/content/enquiry.js'

/**
 * The contact form's enquiry, sent on: checked, numbered field by field in an HTML mail to HEMISPHERE ONE, with the same
 * enquiry as a PDF attached to download. The mail goes out through a Gmail account (an app password), its reply-to the
 * visitor, so a reply in Gmail goes straight to them. Shared by the Vercel function (`api/contact.ts`) and the dev
 * server (vite.config.ts).
 *
 * Settings (environment): GMAIL_USER, GMAIL_APP_PASSWORD, and CONTACT_TO (where enquiries go; GMAIL_USER if unset).
 */

export type Result = { status: number; body: { ok: boolean; ref?: string; error?: string } }

const YELLOW = rgb(253 / 255, 208 / 255, 1 / 255)
const BLACK = rgb(8 / 255, 8 / 255, 8 / 255)
const GREY = rgb(0.38, 0.38, 0.36)
const LINE = rgb(0.82, 0.81, 0.78)

/** what the visitor sent, trimmed, kept to each field's length; or what is wrong with it */
function read(raw: unknown): { enquiry: Enquiry } | { error: string } {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  // the field no person fills in (the form hides it): a bot's, quietly dropped
  if (typeof src.website === 'string' && src.website.trim()) return { error: 'spam' }
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

/** a short reference for the enquiry: the date and time it came in, and four letters of chance */
function reference(now: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `RT-${stamp}-${tail}`
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** the standard PDF fonts read Latin-1 only: the typographer's marks to their plain forms, anything else to "?" */
const latin1 = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?')

/** a line of text broken to a width, keeping its own line breaks */
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = []
  for (const para of latin1(text).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) line = next
      else {
        if (line) out.push(line)
        // a word longer than the line (a long address): cut it
        let w = word
        while (font.widthOfTextAtSize(w, size) > width) {
          let k = w.length
          while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--
          out.push(w.slice(0, k))
          w = w.slice(k)
        }
        line = w
      }
    }
    out.push(line)
  }
  return out
}

/** the enquiry as an A4 PDF: a yellow band with the brand and its reference, then each field numbered, as the form has them */
export async function pdfOf(e: Enquiry, ref: string, when: Date) {
  const doc = await PDFDocument.create()
  doc.setTitle(`RTARIUM enquiry ${ref}`)
  doc.setAuthor('RTARIUM by HEMISPHERE ONE')
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const W = 595.28
  const H = 841.89
  const M = 56
  let page: PDFPage = doc.addPage([W, H])
  // the band
  page.drawRectangle({ x: 0, y: H - 120, width: W, height: 120, color: YELLOW })
  page.drawText('RTARIUM', { x: M, y: H - 62, size: 26, font: bold, color: BLACK })
  page.drawText('by HEMISPHERE ONE', { x: M, y: H - 82, size: 10, font: reg, color: BLACK })
  page.drawText('Enquiry', { x: W - M - bold.widthOfTextAtSize('Enquiry', 20), y: H - 62, size: 20, font: bold, color: BLACK })
  const meta = `${ref}  ·  ${when.toUTCString().replace(' GMT', ' UTC')}`
  page.drawText(latin1(meta), { x: W - M - reg.widthOfTextAtSize(latin1(meta), 9), y: H - 82, size: 9, font: reg, color: BLACK })

  let y = H - 168
  const valueX = M + 150
  const valueW = W - M - valueX
  ENQUIRY_FIELDS.forEach((f, i) => {
    const lines = wrap(e[f.key] || '-', reg, 11, valueW)
    const need = 18 + lines.length * 15
    if (y - need < M) {
      page = doc.addPage([W, H])
      y = H - M
    }
    page.drawLine({ start: { x: M, y: y + 14 }, end: { x: W - M, y: y + 14 }, thickness: i === 0 ? 1.4 : 0.6, color: i === 0 ? BLACK : LINE })
    page.drawText(String(i + 1).padStart(2, '0'), { x: M, y, size: 9, font: bold, color: GREY })
    page.drawText(latin1(f.label), { x: M + 28, y, size: 11, font: bold, color: BLACK })
    lines.forEach((l, k) => page.drawText(l, { x: valueX, y: y - k * 15, size: 11, font: reg, color: BLACK }))
    y -= need + 8
  })
  page.drawLine({ start: { x: M, y: y + 14 }, end: { x: W - M, y: y + 14 }, thickness: 0.6, color: LINE })
  page.drawText('Sent from the contact form on the RTARIUM website.', { x: M, y: M - 18, size: 8, font: reg, color: GREY })
  return doc.save()
}

/** the mail: the same numbered fields, on the site's colours, plain enough for any mail program */
export function htmlOf(e: Enquiry, ref: string, when: Date) {
  const rows = ENQUIRY_FIELDS.map((f, i) => {
    const v = e[f.key] ? esc(e[f.key]).replace(/\n/g, '<br>') : '<span style="color:#9a988f">-</span>'
    const value = f.key === 'email' && e.email ? `<a href="mailto:${esc(e.email)}" style="color:#080808">${v}</a>` : f.key === 'phone' && e.phone ? `<a href="tel:${esc(e.phone.replace(/[^+\d]/g, ''))}" style="color:#080808">${v}</a>` : v
    return `<tr>
      <td style="padding:14px 12px 14px 0;border-top:${i === 0 ? '1.5px solid #080808' : '1px solid #d9d6cd'};width:34px;vertical-align:top;font:600 12px/1.4 Arial,sans-serif;color:#6f6d66">${String(i + 1).padStart(2, '0')}</td>
      <td style="padding:14px 16px 14px 0;border-top:${i === 0 ? '1.5px solid #080808' : '1px solid #d9d6cd'};width:150px;vertical-align:top;font:700 14px/1.4 Arial,sans-serif;color:#080808">${esc(f.label)}</td>
      <td style="padding:14px 0;border-top:${i === 0 ? '1.5px solid #080808' : '1px solid #d9d6cd'};vertical-align:top;font:400 14px/1.55 Arial,sans-serif;color:#080808">${value}</td>
    </tr>`
  }).join('')
  return `<!doctype html><html><body style="margin:0;background:#f3f0e9">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0e9"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff">
      <tr><td style="background:#fdd001;padding:28px 32px">
        <div style="font:800 26px/1 Arial,sans-serif;color:#080808;letter-spacing:-0.5px">RTARIUM</div>
        <div style="font:400 12px/1.4 Arial,sans-serif;color:#080808;margin-top:6px">New enquiry from the website &middot; ${esc(ref)}</div>
      </td></tr>
      <tr><td style="padding:28px 32px 8px">
        <div style="font:700 20px/1.3 Arial,sans-serif;color:#080808">${esc(e.name)}${e.company ? ` <span style="font-weight:400;color:#6f6d66">&middot; ${esc(e.company)}</span>` : ''}</div>
        <div style="font:400 13px/1.5 Arial,sans-serif;color:#6f6d66;margin-top:4px">${esc(e.interest)} &middot; ${esc(when.toUTCString().replace(' GMT', ' UTC'))}</div>
      </td></tr>
      <tr><td style="padding:16px 32px 8px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr>
      <tr><td style="padding:16px 32px 32px;font:400 13px/1.5 Arial,sans-serif;color:#6f6d66">
        The same enquiry is attached as a PDF to download and keep. Reply to this mail to answer ${esc(e.name)} directly.
      </td></tr>
    </table>
  </td></tr></table></body></html>`
}

function textOf(e: Enquiry, ref: string) {
  return [`New RTARIUM enquiry ${ref}`, '', ...ENQUIRY_FIELDS.map((f, i) => `${String(i + 1).padStart(2, '0')}  ${f.label}: ${e[f.key] || '-'}`), '', 'The same enquiry is attached as a PDF.'].join('\n')
}

export async function handleEnquiry(raw: unknown, env: Record<string, string | undefined>): Promise<Result> {
  const got = read(raw)
  // a bot's: answered as if sent, so it learns nothing
  if ('error' in got && got.error === 'spam') return { status: 200, body: { ok: true } }
  if ('error' in got) return { status: 400, body: { ok: false, error: got.error } }
  const user = env.GMAIL_USER
  const pass = env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '')
  if (!user || !pass) return { status: 503, body: { ok: false, error: 'The form is not set up to send yet.' } }
  const e = got.enquiry
  const when = new Date()
  const ref = reference(when)
  const pdf = await pdfOf(e, ref, when)
  const mailer = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
  try {
    await mailer.sendMail({
      from: { name: 'RTARIUM website', address: user },
      to: env.CONTACT_TO || user,
      replyTo: { name: e.name, address: e.email },
      subject: `New enquiry · ${e.interest} · ${e.name}`,
      text: textOf(e, ref),
      html: htmlOf(e, ref, when),
      attachments: [{ filename: `RTARIUM-enquiry-${ref}.pdf`, content: Buffer.from(pdf), contentType: 'application/pdf' }],
    })
  } catch (err) {
    console.error('[contact] send failed:', err instanceof Error ? err.message : err)
    return { status: 502, body: { ok: false, error: 'The enquiry could not be sent. Please try again in a moment.' } }
  }
  return { status: 200, body: { ok: true, ref } }
}
