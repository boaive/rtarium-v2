/**
 * The contact form's fields, in order: the form numbers them 01, 02… and the enquiry mail and its PDF number them
 * the same way, so what the visitor filled in reads back line for line.
 */

export const INTERESTS = ['Façade & Cladding', 'Advanced Flooring', 'Wall Panels', 'Something else'] as const

export interface EnquiryField {
  key: 'name' | 'company' | 'email' | 'phone' | 'interest' | 'message'
  label: string
  required?: boolean
  /** the longest it may be */
  max: number
}

export const ENQUIRY_FIELDS: EnquiryField[] = [
  { key: 'name', label: 'Full name', required: true, max: 120 },
  { key: 'email', label: 'Email', required: true, max: 200 },
  { key: 'phone', label: 'Phone', max: 40 },
  { key: 'company', label: 'Company', max: 160 },
  { key: 'interest', label: 'Interested in', required: true, max: 60 },
  { key: 'message', label: 'Message', required: true, max: 4000 },
]

export type Enquiry = Record<EnquiryField['key'], string>

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
