import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { EMAIL_RE, ENQUIRY_FIELDS, INTERESTS, type Enquiry } from '../content/enquiry'

/**
 * The contact page: two halves and a line between them. On the left, words alone: the title, a line, and at the column's
 * foot the form's three sections, the one being filled in marked, those done ticked (a done one takes you back to it).
 * On the right the form, a section at a time on the same page: its count (01 / 03), its fields in rows, a label on the
 * left and the line to write on the right, the row being written on drawn yellow underneath; Next, Back, and at the last
 * Send. Sent to /api/contact, which mails it on numbered field by field, with a PDF of it. A hidden field catches bots.
 */

type Key = keyof Enquiry
type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; ref?: string } | { kind: 'error'; text: string }

const SECTIONS: { name: string; keys: Key[] }[] = [
  { name: 'About you', keys: ['name', 'email', 'phone', 'company'] },
  { name: 'The project', keys: ['interest', 'location'] },
  { name: 'Your message', keys: ['message'] },
]

const EMPTY: Enquiry = { name: '', company: '', email: '', phone: '', interest: '', location: '', message: '' }

const KIND: Partial<Record<Key, { type: string; auto: string; place: string }>> = {
  name: { type: 'text', auto: 'name', place: 'Your full name' },
  email: { type: 'email', auto: 'email', place: 'name@company.com' },
  phone: { type: 'tel', auto: 'tel', place: '+91 …' },
  company: { type: 'text', auto: 'organization', place: 'Your company or organisation' },
  location: { type: 'text', auto: 'address-level2', place: 'City, country' },
}

/** what a required field says when it is left empty */
const NEED: Partial<Record<Key, string>> = {
  name: 'Enter your name',
  email: 'Enter your email',
  interest: 'Choose one',
  message: 'Tell us a little about it',
}

const two = (n: number) => String(n).padStart(2, '0')
const field = (k: Key) => ENQUIRY_FIELDS.find((f) => f.key === k)!
/** a field's number: its place in the enquiry, as the mail and its PDF number it */
const num = (k: Key) => two(ENQUIRY_FIELDS.findIndex((f) => f.key === k) + 1)

function ArrowIcon({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style={back ? { transform: 'rotate(180deg)' } : undefined}>
      <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function Contact({ intro, labelledBy }: { intro: ReactNode; labelledBy: string }) {
  const [v, setV] = useState<Enquiry>(EMPTY)
  const [trap, setTrap] = useState('')
  const [step, setStep] = useState(0)
  /** the furthest section reached: any up to it can be gone back to */
  const [reached, setReached] = useState(0)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [wrong, setWrong] = useState<Partial<Record<Key, string>>>({})
  const rows = useRef<HTMLDivElement>(null)
  /** moved by the visitor (not the page's first showing): the new section's first field takes the cursor */
  const moved = useRef(false)
  const sent = state.kind === 'sent'
  const last = step === SECTIONS.length - 1

  useEffect(() => {
    if (!moved.current) return
    rows.current?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true })
  }, [step])

  const set = (k: Key, val: string) => {
    setV((o) => ({ ...o, [k]: val }))
    if (wrong[k]) setWrong((w) => ({ ...w, [k]: undefined }))
    if (state.kind === 'error') setState({ kind: 'idle' })
  }

  /** a section's fields, checked: what is wrong with each is shown under it */
  const check = (s: number) => {
    const w: Partial<Record<Key, string>> = {}
    for (const k of SECTIONS[s].keys) if (field(k).required && !v[k].trim()) w[k] = NEED[k] ?? 'Needed'
    if (SECTIONS[s].keys.includes('email') && v.email.trim() && !EMAIL_RE.test(v.email.trim())) w.email = 'Check the address'
    setWrong((o) => {
      const next = { ...o }
      for (const k of SECTIONS[s].keys) next[k] = w[k]
      return next
    })
    return Object.keys(w).length === 0
  }

  /** to a section: on only through those before it, each checked; back always */
  const go = (to: number) => {
    if (to === step || to < 0 || to >= SECTIONS.length) return
    if (to > step)
      for (let s = step; s < to; s++)
        if (!check(s)) {
          moved.current = true
          setStep(s)
          return
        }
    moved.current = true
    setStep(to)
    setReached((r) => Math.max(r, to))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!last) return go(step + 1)
    if (state.kind === 'sending') return
    // every section once more, in case one was gone back to and changed
    for (let s = 0; s < SECTIONS.length; s++)
      if (!check(s)) {
        moved.current = true
        setStep(s)
        return
      }
    setState({ kind: 'sending' })
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, website: trap }) })
      const out = (await r.json().catch(() => ({}))) as { ok?: boolean; ref?: string; error?: string }
      if (r.ok && out.ok) setState({ kind: 'sent', ref: out.ref })
      else setState({ kind: 'error', text: out.error ?? 'The enquiry could not be sent. Please try again.' })
    } catch {
      setState({ kind: 'error', text: 'No connection. Please try again.' })
    }
  }

  const again = () => {
    setV(EMPTY)
    setWrong({})
    setStep(0)
    setReached(0)
    moved.current = true
    setState({ kind: 'idle' })
  }

  const row = (k: Key, i: number) => {
    const f = field(k)
    const id = `cf-${k}`
    const style = { '--i': i } as CSSProperties
    const label = (
      <>
        <span className="cf-row__num num">{num(k)}</span>
        <span>
          {f.label}
          {f.required && <i aria-hidden="true"> *</i>}
        </span>
      </>
    )
    const err = wrong[k] ? (
      <span className="cf-row__wrong" id={`${id}-err`}>
        {wrong[k]}
      </span>
    ) : null
    if (k === 'interest')
      return (
        <div key={k} className={`cf-row ${wrong[k] ? 'is-wrong' : ''}`} style={style} role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={wrong[k] ? `${id}-err` : undefined}>
          <span className="cf-row__label" id={`${id}-label`}>
            {label}
          </span>
          <div className="cf-row__field">
            <div className="cf-choices">
              {INTERESTS.map((x) => (
                <label key={x} className={`cf-choice ${v.interest === x ? 'is-on' : ''}`}>
                  <input type="radio" name="interest" value={x} checked={v.interest === x} onChange={() => set('interest', x)} />
                  {x}
                </label>
              ))}
            </div>
            {err}
          </div>
        </div>
      )
    const common = {
      id,
      name: k,
      maxLength: f.max,
      required: f.required,
      value: v[k],
      'aria-invalid': !!wrong[k],
      'aria-describedby': wrong[k] ? `${id}-err` : undefined,
    }
    return (
      <div key={k} className={`cf-row ${wrong[k] ? 'is-wrong' : ''}`} style={style}>
        <label className="cf-row__label" htmlFor={id}>
          {label}
        </label>
        <div className="cf-row__field">
          {k === 'message' ? (
            <textarea {...common} className="cf-input cf-input--area" rows={5} placeholder="The project, its size, when it starts" onChange={(e) => set(k, e.target.value)} />
          ) : (
            <input {...common} className="cf-input" type={KIND[k]!.type} autoComplete={KIND[k]!.auto} placeholder={KIND[k]!.place} onChange={(e) => set(k, e.target.value)} />
          )}
          {err}
        </div>
      </div>
    )
  }

  return (
    <section className="contact" aria-labelledby={labelledBy}>
      <div className="contact__left">
        <div className="contact__intro">{intro}</div>
        {/* the form's sections: where the visitor is, what is done */}
        <ol className="contact__map" aria-label="The form's sections">
          {SECTIONS.map((s, i) => {
            const done = sent || (i < reached && i !== step)
            const st = sent ? 'done' : i === step ? 'now' : done ? 'done' : i <= reached ? 'seen' : 'next'
            return (
              <li key={s.name} className="contact__sec" data-state={st}>
                <button type="button" disabled={sent || i > reached} aria-current={!sent && i === step ? 'step' : undefined} onClick={() => go(i)}>
                  <span className="contact__sec-num num">{two(i + 1)}</span>
                  <span className="contact__sec-name">{s.name}</span>
                  <span className="contact__sec-mark" aria-hidden="true">
                    {st === 'done' ? '✓' : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="contact__right">
        {sent ? (
          <div className="cf-done" role="status">
            <p className="cf-count num">
              <span className="cf-done__tick" aria-hidden="true">
                ✓
              </span>
              Sent
            </p>
            <h2 className="cf-done__title">Thank you. Your enquiry is with us.</h2>
            <p className="cf-done__line">
              We will answer you at {v.email || 'the address you gave'}.
              {state.ref ? (
                <>
                  {' '}
                  Reference <span className="num">{state.ref}</span>.
                </>
              ) : null}
            </p>
            <div className="cf-foot">
              <button type="button" className="cf-btn cf-btn--line" onClick={again}>
                <span className="cf-btn__label">Send another enquiry</span>
                <span className="cf-btn__cell">
                  <ArrowIcon />
                </span>
              </button>
            </div>
          </div>
        ) : (
          <form className="cf" onSubmit={submit} noValidate>
            <p className="cf-count num" aria-live="polite">
              <span key={step} className="cf-count__now">
                {two(step + 1)}
              </span>
              <span className="cf-count__of">/ {two(SECTIONS.length)}</span>
              <span className="cf-count__name">{SECTIONS[step].name}</span>
            </p>

            <div ref={rows} key={step} className="cf-rows">
              {SECTIONS[step].keys.map((k, i) => row(k, i))}
            </div>

            {/* for bots only: a person never sees it */}
            <label className="cf-trap" aria-hidden="true">
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
            </label>

            <div className="cf-foot">
              {step > 0 && (
                <button type="button" className="cf-btn cf-btn--line cf-btn--back" onClick={() => go(step - 1)}>
                  <span className="cf-btn__cell">
                    <ArrowIcon back />
                  </span>
                  <span className="cf-btn__label">Back</span>
                </button>
              )}
              <button type="submit" className="cf-btn cf-btn--go" disabled={state.kind === 'sending'}>
                <span className="cf-btn__label">{last ? (state.kind === 'sending' ? 'Sending…' : 'Send enquiry') : 'Next'}</span>
                <span className="cf-btn__cell">
                  <ArrowIcon />
                </span>
              </button>
            </div>
            <p className="cf-note" role={state.kind === 'error' ? 'alert' : undefined}>
              {state.kind === 'error' ? state.text : 'Fields marked * are needed. We use your details only to answer you.'}
            </p>
          </form>
        )}
      </div>
    </section>
  )
}
