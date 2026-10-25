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
 * What it replaces, one thing at a time (Enerblock's stacked rows), slim, on warm white. The
 * section is pinned for as many screens as it has rows; the scroll opens one row after another
 * while the last one folds into a bar, so the passed rows stack up with their names struck
 * through, until RTARIUM opens on black. The strike plays when its row is reached.
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
      // a folded row keeps its number and its struck name; an open one is slim, never the whole screen
      const C = Math.round(Math.min(64, Math.max(46, window.innerHeight * 0.064)))
      const O = Math.round(Math.max(150, window.innerHeight * 0.27))
      const k = Math.min(n - 1, Math.floor(p))
      const t = k >= n - 1 ? 0 : p - k
      const open = (i: number) => Math.min(H - i * C, O)
      const folding = lerp(open(k), C, t)
      rows.current.forEach((row, i) => {
        if (!row) return
        let top = H
        let h = 0
        if (i < k) {
          top = i * C
          h = C
        } else if (i === k) {
          top = k * C
          h = folding
        } else if (i === k + 1) {
          // the next one unrolls under it as it folds
          top = k * C + folding
          h = open(i) * t
        }
        row.style.transform = `translate3d(0, ${top.toFixed(1)}px, 0)`
        row.style.height = `${Math.max(0, Math.min(h, H - top)).toFixed(1)}px`
        row.style.visibility = h < 0.5 ? 'hidden' : ''
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
          {ROWS.map((r, i) => (
            <li
              key={r.id}
              ref={(node) => void (rows.current[i] = node)}
              className={`row row--${r.id} ${i === step ? 'is-active' : ''} ${(seen & (1 << i)) !== 0 ? 'is-seen' : ''}`}
              style={i ? { visibility: 'hidden' } : undefined}
            >
              <span className="row__num num">0{i + 1} /</span>
              <div className="row__main">
                <p className="row__name">
                  {r.name}
                  {r.id !== 'rtarium' && <span className="row__strike" aria-hidden="true" />}
                </p>
                <p className="row__weak">{r.weak}</p>
              </div>
              <p className="row__what">{r.what}</p>
            </li>
          ))}
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
