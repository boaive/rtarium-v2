import { ENQUIRY_FIELDS, type Enquiry } from '../src/content/enquiry'

/**
 * The two emails an enquiry sends, as HTML (on the site's colours, plain enough for any mail program) and as text.
 *
 * 1. To the client, info@rtarium.com: every field, numbered as the form numbers them; Reply goes to the visitor.
 * 2. To the visitor: a short confirmation with the reference; Reply goes to info@rtarium.com. The visitor's own message
 *    is deliberately not copied back, so the form cannot be used to send arbitrary text to someone else's inbox.
 */

export type EnquiryRecord = Enquiry & { ref: string; created_at: Date }

export interface Mail {
  subject: string
  html: string
  text: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** a subject line is one line, whatever was typed into the name */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim()

const when = (d: Date) => d.toUTCString().replace(' GMT', ' UTC')

/** the frame both emails share: the yellow RTARIUM band, then the body on white */
function frame(band: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f3f0e9">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0e9"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff">
      <tr><td style="background:#fdd001;padding:28px 32px">
        <div style="font:800 26px/1 Arial,sans-serif;color:#080808;letter-spacing:-0.5px">RTARIUM</div>
        <div style="font:400 12px/1.4 Arial,sans-serif;color:#080808;margin-top:6px">${band}</div>
      </td></tr>
      ${body}
    </table>
  </td></tr></table></body></html>`
}

/** 1. the client's notification: every field, numbered */
export function clientMail(e: EnquiryRecord): Mail {
  const rows = ENQUIRY_FIELDS.map((f, i) => {
    const raw = e[f.key]
    const v = raw ? esc(raw).replace(/\n/g, '<br>') : '<span style="color:#9a988f">-</span>'
    const value =
      f.key === 'email' && raw
        ? `<a href="mailto:${esc(raw)}" style="color:#080808">${v}</a>`
        : f.key === 'phone' && raw
          ? `<a href="tel:${esc(raw.replace(/[^+\d]/g, ''))}" style="color:#080808">${v}</a>`
          : v
    const line = i === 0 ? '1.5px solid #080808' : '1px solid #d9d6cd'
    return `<tr>
      <td style="padding:14px 12px 14px 0;border-top:${line};width:34px;vertical-align:top;font:600 12px/1.4 Arial,sans-serif;color:#6f6d66">${String(i + 1).padStart(2, '0')}</td>
      <td style="padding:14px 16px 14px 0;border-top:${line};width:150px;vertical-align:top;font:700 14px/1.4 Arial,sans-serif;color:#080808">${esc(f.label)}</td>
      <td style="padding:14px 0;border-top:${line};vertical-align:top;font:400 14px/1.55 Arial,sans-serif;color:#080808">${value}</td>
    </tr>`
  }).join('')

  const html = frame(
    `New enquiry from the website &middot; ${esc(e.ref)}`,
    `<tr><td style="padding:28px 32px 8px">
        <div style="font:700 20px/1.3 Arial,sans-serif;color:#080808">${esc(e.name)}${e.company ? ` <span style="font-weight:400;color:#6f6d66">&middot; ${esc(e.company)}</span>` : ''}</div>
        <div style="font:400 13px/1.5 Arial,sans-serif;color:#6f6d66;margin-top:4px">${esc(e.interest)} &middot; ${esc(when(e.created_at))}</div>
      </td></tr>
      <tr><td style="padding:16px 32px 8px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr>
      <tr><td style="padding:16px 32px 32px;font:400 13px/1.5 Arial,sans-serif;color:#6f6d66">
        Reply to this email to answer ${esc(e.name)} directly.
      </td></tr>`,
  )

  const text = [
    `New RTARIUM enquiry ${e.ref}`,
    when(e.created_at),
    '',
    ...ENQUIRY_FIELDS.map((f, i) => `${String(i + 1).padStart(2, '0')}  ${f.label}: ${e[f.key] || '-'}`),
    '',
    `Reply to this email to answer ${e.name} directly.`,
  ].join('\n')

  return { subject: oneLine(`New Product Enquiry – ${e.name}`), html, text }
}

/** 2. the visitor's confirmation: their name, what it is about, the reference; nothing else of what they typed */
export function visitorMail(e: EnquiryRecord): Mail {
  const html = frame(
    'Thank you for your enquiry',
    `<tr><td style="padding:32px 32px 8px;font:400 15px/1.6 Arial,sans-serif;color:#080808">
        <p style="margin:0 0 16px">Hi ${esc(e.name)},</p>
        <p style="margin:0 0 16px">Thank you for contacting RTARIUM. We've received your enquiry about <strong>${esc(e.interest)}</strong>, and our team will get back to you shortly.</p>
      </td></tr>
      <tr><td style="padding:8px 32px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          <td style="padding:14px 0;border-top:1.5px solid #080808;border-bottom:1px solid #d9d6cd;font:700 14px/1.4 Arial,sans-serif;color:#080808;width:150px">Your reference</td>
          <td style="padding:14px 0;border-top:1.5px solid #080808;border-bottom:1px solid #d9d6cd;font:400 14px/1.4 'Courier New',monospace;color:#080808">${esc(e.ref)}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 32px 32px;font:400 13px/1.6 Arial,sans-serif;color:#6f6d66">
        If you'd like to add anything, simply reply to this email.<br><br>
        RTARIUM by HEMISPHERE ONE
      </td></tr>`,
  )

  const text = [
    `Hi ${e.name},`,
    '',
    `Thank you for contacting RTARIUM. We've received your enquiry about ${e.interest}, and our team will get back to you shortly.`,
    '',
    `Your reference: ${e.ref}`,
    '',
    "If you'd like to add anything, simply reply to this email.",
    '',
    'RTARIUM by HEMISPHERE ONE',
  ].join('\n')

  return { subject: "We've Received Your Enquiry – RTARIUM", html, text }
}
