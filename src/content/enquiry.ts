/**
 * The contact form's fields, in order: the form numbers them 01, 02… and the enquiry mail and its PDF number them
 * the same way, so what the visitor filled in reads back line for line.
 *
 * The rules below are the ONE set both sides use: the form checks them as the visitor fills it in, and the Worker
 * (worker/contact.ts) cleans and checks again what actually arrives, the same way, before anything is saved or sent.
 */

export const INTERESTS = ['Façade & Cladding', 'Advanced Flooring', 'Wall Panels', 'Something else'] as const

export interface EnquiryField {
  key: 'name' | 'company' | 'email' | 'phone' | 'interest' | 'message'
  label: string
  required?: boolean
  /** the longest it may be */
  max: number
  /** what it says when it is needed and left empty */
  need?: string
  /** more than one line allowed (only the message); every other field is one line */
  multiline?: boolean
}

export const ENQUIRY_FIELDS: EnquiryField[] = [
  { key: 'name', label: 'Full name', required: true, max: 120, need: 'Enter your name' },
  { key: 'email', label: 'Email', required: true, max: 200, need: 'Enter your email' },
  { key: 'phone', label: 'Phone', max: 40 },
  { key: 'company', label: 'Company', max: 160 },
  { key: 'interest', label: 'Interested in', required: true, max: 60, need: 'Choose one' },
  { key: 'message', label: 'Message', required: true, max: 4000, need: 'Tell us a little about it', multiline: true },
]

export type EnquiryKey = EnquiryField['key']
export type Enquiry = Record<EnquiryKey, string>

export const enquiryField = (key: EnquiryKey) => ENQUIRY_FIELDS.find((f) => f.key === key)!

/** characters that change how text reads without showing (direction overrides and isolates, zero-width space, BOM) */
const INVISIBLE = /[\u202A-\u202E\u2066-\u2069\u200B\uFEFF]/g
/** control characters, apart from tab and line feed */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/**
 * A field as it is kept: one Unicode form, no hidden or control characters, line breaks as \n, and (every field but
 * the message) on one line, its runs of space made one. Anything but a string is empty.
 */
export function cleanField(f: EnquiryField, raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const s = raw
    .normalize('NFC')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(INVISIBLE, '')
    .replace(CONTROL, '')
  return (f.multiline ? s.replace(/[ \t]+\n/g, '\n') : s.replace(/\s+/g, ' ')).trim()
}

/** one plain address the mail service accepts: no display name, no list, no comments, dots only between characters */
const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/
export const isEmail = (s: string) => s.length <= 200 && s.indexOf('@') <= 64 && EMAIL.test(s)

/** a phone number as people write it: digits, spaces, + ( ) . - /, an extension at the end; 6 to 24 digits */
const PHONE = /^\+?[0-9(][0-9 ().\-/]*(?:\s*(?:ext\.?|x|#)\s*[0-9]{1,6})?$/i
export const isPhone = (s: string) => {
  const digits = s.replace(/[^0-9]/g, '').length
  return PHONE.test(s) && digits >= 6 && digits <= 24
}

/** a name is not a link or an address: the name is the one thing typed that the visitor's confirmation repeats */
const NOT_A_NAME = /:\/\/|www\.|[@<>]/i

/** what is wrong with a field's cleaned value, if anything */
export function fieldProblem(f: EnquiryField, v: string): string | undefined {
  if (!v) return f.required ? (f.need ?? 'Needed') : undefined
  if (v.length > f.max) return `Keep it under ${f.max} characters`
  if (f.key === 'email' && !isEmail(v)) return 'Check the address'
  if (f.key === 'phone' && !isPhone(v)) return 'Check the number'
  if (f.key === 'name' && NOT_A_NAME.test(v)) return 'Enter just your name'
  if (f.key === 'interest' && !(INTERESTS as readonly string[]).includes(v)) return 'Choose one'
  return undefined
}

/** a whole enquiry, cleaned and checked: what it holds, or the first field that is wrong and why */
export function checkEnquiry(src: Record<string, unknown>): { enquiry: Enquiry } | { field: EnquiryKey; error: string } {
  const e = {} as Enquiry
  for (const f of ENQUIRY_FIELDS) {
    const v = cleanField(f, src[f.key])
    const wrong = fieldProblem(f, v)
    if (wrong) return { field: f.key, error: wrong }
    e[f.key] = v
  }
  return { enquiry: e }
}
