import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import { EMAIL_RE, ENQUIRY_FIELDS, INTERESTS, type Enquiry } from '../content/enquiry'

/**
 * The contact page, kept simple: on the left a photograph of the mesh, full-bleed and darkened, and over it from its top
 * left RTARIUM's slogan large over four lines, its last, RTARIUM, in yellow, and a line on what to tell us; on the right, on warm white, the form alone, in three short steps on the same page: a thin line across its top
 * filling a third a step, the step's number and name over it; then the step's fields, a row each, a faint hairline over
 * each, the label on the left and the line to write on the right (what it is about as four quiet buttons, two by two, a
 * dot each that fills when chosen), what is wrong said under it; and the way on, drawn in line: back, next, and at the
 * last, send. The slogan comes in as the façade's closing card's words do, under a block of its own colour that runs
 * across it and off; the rest rises after, and each step's rows rise in as it opens. Sent to /api/contact, which mails it
 * on numbered field by field with a PDF of it. A hidden field catches bots.
 */

type Key = keyof Enquiry
type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; ref?: string } | { kind: 'error'; text: string }

/** the form's three steps, and the fields in each */
const STEPS: { name: string; keys: Key[] }[] = [
  { name: 'About you', keys: ['name', 'email', 'phone', 'company'] },
  { name: 'The project', keys: ['interest'] },
  { name: 'Your message', keys: ['message'] },
]

const EMPTY: Enquiry = { name: '', company: '', email: '', phone: '', interest: '', message: '' }

const KIND: Partial<Record<Key, { type: string; auto: string; place: string }>> = {
  name: { type: 'text', auto: 'name', place: 'Your full name' },
  email: { type: 'email', auto: 'email', place: 'name@company.com' },
  phone: { type: 'tel', auto: 'tel', place: 'Your phone' },
  company: { type: 'text', auto: 'organization', place: 'Your company' },
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

/** a line revealed by a block of its own colour: the block runs across it, the words come up under it, it runs off */
function Mask({ k, children }: { k: number; children: ReactNode }) {
  return (
    <span className="ct-mask" style={{ '--k': k } as CSSProperties}>
      <span className="ct-mask__in">{children}</span>
    </span>
  )
}

/**
 * RTARIUM's slogan over the photograph, a line each (the last in yellow): what it is, basalt, a volcanic stone,
 * woven into a mesh, and what it comes to, concrete that lasts, with nothing in it to rust
 */
const SLOGAN: [string, string][] = [
  ['Woven', ''],
  ['from stone.', ''],
  ['', 'Built to'],
  ['', 'outlast.'],
]

function ArrowIcon({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" style={back ? { transform: 'rotate(180deg)' } : undefined}>
      <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function Contact({ labelledBy, points }: { labelledBy: string; points?: ReactNode }) {
  const page = useRef<HTMLElement>(null)
  const rows = useRef<HTMLDivElement>(null)
  const [v, setV] = useState<Enquiry>(EMPTY)
  const [trap, setTrap] = useState('')
  const [step, setStep] = useState(0)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [wrong, setWrong] = useState<Partial<Record<Key, string>>>({})
  /** moved on or back by the visitor (not the page's first showing): the step's first field takes the cursor */
  const moved = useRef(false)
  const last = step === STEPS.length - 1

  // the words come in as the closing card's do, once, as the page opens; once in, they stay. Never left hidden: it plays
  // on the next frames, as soon as any of it is in view, or in a moment whatever happens. Without script, or under
  // reduced motion, they are simply there
  useEffect(() => {
    const el = page.current
    if (!el || prefersReducedMotion()) return
    el.classList.add('is-armed')
    const play = () => el.classList.add('is-in')
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(play)))
    const io = new IntersectionObserver(([e]) => e.isIntersecting && play())
    io.observe(el)
    const late = window.setTimeout(play, 1200)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.clearTimeout(late)
      el.classList.remove('is-armed', 'is-in')
    }
  }, [])

  useEffect(() => {
    if (!moved.current) return
    rows.current?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true })
  }, [step])

  const set = (k: Key, val: string) => {
    setV((o) => ({ ...o, [k]: val }))
    if (wrong[k]) setWrong((w) => ({ ...w, [k]: undefined }))
    if (state.kind === 'error') setState({ kind: 'idle' })
  }

  /** a step's fields, checked: what is wrong with each is said under it, and the first takes the cursor */
  const check = (s: number) => {
    const w: Partial<Record<Key, string>> = {}
    for (const k of STEPS[s].keys) if (field(k).required && !v[k].trim()) w[k] = NEED[k] ?? 'Needed'
    if (STEPS[s].keys.includes('email') && v.email.trim() && !EMAIL_RE.test(v.email.trim())) w.email = 'Check the address'
    setWrong((o) => {
      const next = { ...o }
      for (const k of STEPS[s].keys) next[k] = w[k]
      return next
    })
    const first = STEPS[s].keys.find((k) => w[k])
    if (first && s === step) page.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
    return !first
  }

  /** on to the next step once this one is right, or back to the one before */
  const go = (to: number) => {
    if (to < 0 || to >= STEPS.length || to === step) return
    if (to > step && !check(step)) return
    moved.current = true
    setStep(to)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!last) return go(step + 1)
    if (state.kind === 'sending') return
    // every step once more, in case one was gone back to and changed
    for (let s = 0; s < STEPS.length; s++)
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
    moved.current = true
    setState({ kind: 'idle' })
  }

  /** a row: the label on the left, the line to write on (or the choices) on the right, what is wrong under it */
  const row = (k: Key, i: number) => {
    const f = field(k)
    const id = `cf-${k}`
    const style = { '--i': i } as CSSProperties
    const label = (
      <>
        {f.label}
        {f.required && <i aria-hidden="true"> *</i>}
      </>
    )
    const err = wrong[k] ? (
      <span className="ct-row__wrong" id={`${id}-err`}>
        {wrong[k]}
      </span>
    ) : null
    const described = wrong[k] ? `${id}-err` : undefined
    // what it is about: its choices laid out, two by two, a quiet button each with a dot that fills when chosen
    if (k === 'interest')
      return (
        <div key={k} className={`ct-row ${wrong[k] ? 'is-wrong' : ''}`} style={style} role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={described}>
          <span className="ct-row__label" id={`${id}-label`}>
            {label}
          </span>
          <div className="ct-row__field">
            <div className="ct-opts">
              {INTERESTS.map((x) => (
                <label key={x} className={`ct-opt ${v.interest === x ? 'is-on' : ''}`}>
                  <input type="radio" name="interest" value={x} checked={v.interest === x} onChange={() => set('interest', x)} />
                  <i aria-hidden="true" />
                  {x}
                </label>
              ))}
            </div>
            {err}
          </div>
        </div>
      )
    const common = { id, name: k, maxLength: f.max, required: f.required, value: v[k], 'aria-invalid': !!wrong[k], 'aria-describedby': described }
    return (
      <div key={k} className={`ct-row ${wrong[k] ? 'is-wrong' : ''}`} style={style}>
        <label className="ct-row__label" htmlFor={id}>
          {label}
        </label>
        <div className="ct-row__field">
          {k === 'message' ? (
            <textarea {...common} className="ct-input ct-input--area" rows={4} placeholder="The project, its size, when it starts" onChange={(e) => set(k, e.target.value)} />
          ) : (
            <input {...common} className="ct-input" type={KIND[k]!.type} autoComplete={KIND[k]!.auto} placeholder={KIND[k]!.place} onChange={(e) => set(k, e.target.value)} />
          )}
          {err}
        </div>
      </div>
    )
  }

  return (
    <section ref={page} className="contact" aria-labelledby={labelledBy}>
      {/* the photograph; over it the label, the slogan, and what to tell us */}
      <figure className="contact__media">
        <img src="/img/shoot/mesh-macro.webp" alt="RTARIUM's basalt mesh, close up" />
        <figcaption className="contact__brand">
          {/* the slogan, a line at a time: what it is in white, what it comes to in the brand's yellow */}
          <span className="contact__slogan">
            {SLOGAN.map(([words, lit], j) => (
              <Mask key={words + lit} k={j}>
                {words}
                {lit && <span className="contact__lit">{lit}</span>}
              </Mask>
            ))}
          </span>
          <span className="contact__lede ct-rise" style={{ '--d': '1s' } as CSSProperties}>
            Tell us about your project, and we'll help you find what fits it best.
          </span>
          {points}
        </figcaption>
      </figure>

      {/* the form alone, on warm white, in three steps */}
      <div className="contact__side on-light">
        <h1 id={labelledBy} className="visually-hidden">
          Contact
        </h1>

        {state.kind === 'sent' ? (
          <div className="ct-done" role="status">
            <div className="ct-progress" aria-hidden="true">
              <p className="ct-progress__label">
                <span className="num">✓</span> Sent
              </p>
              <span className="ct-progress__track">
                <i style={{ '--p': 1 } as CSSProperties} />
              </span>
            </div>
            <p className="ct-done__title">
              <span className="ct-done__tick" aria-hidden="true">
                ✓
              </span>
              Thank you. Your enquiry is with us.
            </p>
            <p className="ct-done__line">
              We will answer you at {v.email || 'the address you gave'}.
              {state.ref ? (
                <>
                  {' '}
                  Reference <span className="num">{state.ref}</span>.
                </>
              ) : null}
            </p>
            <button type="button" className="ct-btn" onClick={again}>
              <span className="ct-btn__label">Send another enquiry</span>
              <span className="ct-btn__cell">
                <ArrowIcon />
              </span>
            </button>
          </div>
        ) : (
          <form className="ct-form ct-rise" style={{ '--d': '0.3s' } as CSSProperties} onSubmit={submit} noValidate>
            {/* where the visitor is: the step's number and name, and a thin line filling a third a step */}
            <div className="ct-progress">
              <p className="ct-progress__label" aria-live="polite">
                <span className="num">
                  {two(step + 1)} / {two(STEPS.length)}
                </span>
                <span className="ct-progress__name">{STEPS[step].name}</span>
              </p>
              <span
                className="ct-progress__track"
                role="progressbar"
                aria-label="Steps of the enquiry"
                aria-valuemin={1}
                aria-valuemax={STEPS.length}
                aria-valuenow={step + 1}
              >
                <i style={{ '--p': (step + 1) / STEPS.length } as CSSProperties} />
              </span>
            </div>

            {/* the step's fields: they rise in as it opens */}
            <div ref={rows} key={step} className="ct-rows">
              {STEPS[step].keys.map((k, i) => row(k, i))}
            </div>

            {/* for bots only: a person never sees it */}
            <label className="ct-trap" aria-hidden="true">
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
            </label>

            <div className="ct-foot">
              {step > 0 && (
                <button type="button" className="ct-btn ct-btn--back" onClick={() => go(step - 1)}>
                  <span className="ct-btn__cell">
                    <ArrowIcon back />
                  </span>
                  <span className="ct-btn__label">Back</span>
                </button>
              )}
              <button type="submit" className="ct-btn" disabled={state.kind === 'sending'}>
                <span className="ct-btn__label">{last ? (state.kind === 'sending' ? 'Sending…' : 'Send enquiry') : 'Next'}</span>
                <span className="ct-btn__cell">
                  <ArrowIcon />
                </span>
              </button>
              <p className="ct-note" role={state.kind === 'error' ? 'alert' : undefined}>
                {state.kind === 'error' ? state.text : 'Fields marked * are needed.'}
              </p>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
