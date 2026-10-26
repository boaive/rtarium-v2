import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CHAPTERS, Chapter, Statement, type Step } from '../components/Chapter'
import { setShared } from '../three/stageStore'
import { damp, lerp, prefersReducedMotion } from '../lib/motion'

/**
 * Why RTARIUM: what thin concrete has been reinforced with until now, and what RTARIUM replaces.
 * The weaknesses are the client's own positioning (site-map workbook: steel and AR-glass fibre
 * are "prone to alkali, corrosion, and directional weakness"; flat meshes reinforce only parallel
 * to the sheet, technical PDF).
 */
const steps: Step[] = [
  {
    id: 'challenge',
    label: 'The challenge',
    ground: 'black',
    pose: 'none',
    // the whole screen is the sentence; its words arrive one by one
    render: () => (
      <div className="copy copy--full">
        <Statement text="Thin concrete has relied on steel fibre, glass fibre and flat mesh. Each brings a weakness with it." />
      </div>
    ),
  },
]

interface Row {
  id: string
  name: string
  weak: string
  what: string
}

const ROWS: Row[] = [
  { id: 'steel', name: 'Steel fibre', weak: 'Corrodes.', what: 'Short steel fibres, mixed through the concrete.' },
  { id: 'glass', name: 'AR-glass fibre', weak: 'Vulnerable to alkali.', what: 'Chopped glass strands, mixed through the concrete.' },
  { id: 'flat', name: 'Flat 2D mesh', weak: 'Works in one plane.', what: 'A single grid that reinforces only along the sheet.' },
  { id: 'rtarium', name: 'RTARIUM', weak: 'Non-corrosive. Alkali-resistant. Three-dimensional.', what: 'Basalt: two mesh faces held apart by fibres that run through the depth.' },
]

/**
 * What it replaces, one thing at a time (Enerblock's stacked rows), on warm white: a ledger of four
 * bands that always fills the screen. The section is pinned for as many screens as it has rows;
 * the open band takes all the height the others leave, and the scroll hands that height down the
 * ledger, one band to the next, both ways. A band still to come is a quiet line; an open one sets
 * its weakness at full size, rising in from its foot, and its name is struck through once it is
 * reached; a passed one closes to its struck name with its weakness beside it. RTARIUM is the last
 * band, on black: as it opens the struck bands close up a little more to give it room, and its
 * three strengths stand in columns under its name, numbered for the compromises they answer.
 */
function Replaces() {
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const [step, setStep] = useState(-1)
  const stepRef = useRef(-1)
  const [seen, setSeen] = useState(0)
  const n = ROWS.length
  CHAPTERS.set('replaces', { title: 'What it replaces', labels: ROWS.map((r) => r.name) })

  useEffect(() => {
    const el = section.current
    const ol = list.current
    if (!el || !ol) return
    let raf = 0
    let last = performance.now()
    let p = -1
    const place = () => {
      const H = ol.clientHeight
      // a closed band keeps its number and its name; the open one has the rest of the height
      const C = Math.round(Math.min(64, Math.max(46, window.innerHeight * 0.064)))
      const O = H - (n - 1) * C
      // as RTARIUM opens, the struck bands above it close up a little more
      const last = Math.max(0, 1 - Math.abs(p - (n - 1)))
      const c = lerp(C, C * 0.84, last)
      let top = 0
      rows.current.forEach((row, i) => {
        if (!row) return
        const w = Math.max(0, 1 - Math.abs(p - i))
        const head = i === n - 1 ? C : c
        const h = i === n - 1 ? H - top : head + (O - C) * w
        row.style.transform = `translate3d(0, ${top.toFixed(1)}px, 0)`
        row.style.height = `${Math.max(0, h).toFixed(1)}px`
        row.style.setProperty('--head', `${head.toFixed(1)}px`)
        row.style.setProperty('--w', w.toFixed(3))
        top += h
      })
    }
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const target = Math.min(n - 1, Math.max(0, -r.top / vh))
      p = p < 0 || prefersReducedMotion() ? target : damp(p, target, 11, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      place()
      const inside = r.top <= vh * 0.5 && r.bottom > vh * 0.5
      const s = inside ? Math.round(target) : -1
      if (s !== stepRef.current) {
        stepRef.current = s
        setStep(s)
        if (s >= 0) setSeen((m) => m | ((1 << (s + 1)) - 1))
      }
      if (inside) setShared({ chapter: 'replaces', step: s, ground: 'light' })
      if (r.top > vh * 1.5 || r.bottom < -vh * 0.5) setSeen(0)
      if (p !== target) raf = requestAnimationFrame(tick)
    }
    const kick = () => {
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    kick()
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', kick)
    return () => {
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', kick)
      cancelAnimationFrame(raf)
    }
  }, [n])

  return (
    <section id="replaces" ref={section} className={`stack on-light ${step >= 0 ? 'is-in' : ''}`} style={{ '--rows': n } as CSSProperties} aria-labelledby="replaces-title">
      {ROWS.map((r, i) => (
        <span key={r.id} className="track__snap" data-step={i} style={{ '--i': i } as CSSProperties} aria-hidden="true" />
      ))}
      <div ref={pin} className="stack__pin" data-screen="light">
        <h2 id="replaces-title" className="stack__title">
          One mesh in place of three compromises.
        </h2>
        <ol ref={list} className="stack__rows">
          {ROWS.map((r, i) => {
            const answer = i === n - 1
            return (
              <li
                key={r.id}
                ref={(node) => void (rows.current[i] = node)}
                className={`row row--${r.id} ${i === step ? 'is-active' : ''} ${(seen & (1 << i)) !== 0 ? 'is-seen' : ''}`}
              >
                <div className="row__head">
                  <span className="row__num num">0{i + 1}</span>
                  <p className="row__name">
                    {r.name}
                    {!answer && <span className="row__strike" aria-hidden="true" />}
                  </p>
                  {!answer && (
                    <p className="row__tag" aria-hidden="true">
                      {r.weak}
                    </p>
                  )}
                </div>
                {answer ? (
                  <div className="row__body">
                    <p className="row__word" aria-hidden="true">
                      {r.name}
                    </p>
                    <p className="row__what">{r.what}</p>
                    <ul className="row__answers">
                      {r.weak.split(/(?<=\.)\s+/).map((a, j) => (
                        <li key={a}>
                          <span className="row__ref num" aria-hidden="true">
                            0{j + 1}
                          </span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="row__body">
                    <p className="row__weak">{r.weak}</p>
                    <p className="row__what">{r.what}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

export function Why() {
  return (
    <>
      <Chapter id="why" title="Why RTARIUM" steps={steps} />
      <Replaces />
    </>
  )
}
