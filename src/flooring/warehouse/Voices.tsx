import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion } from '../../lib/motion'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus } from '../../facade/three/kit'
import { useLive } from '../../facade/unitized/live'
import { BuildUp } from './three/BuildUp'

/**
 * Specified. Approved. Built.: the Data & AI Centres ledger on warm white, without its carbon band: the
 * client's three messages to the market, the open band taking the height the others leave, the scroll
 * handing it down the ledger, both ways. An open band is a spread: whose it is and the message on the
 * left, large; on the right what backs it, the floor's build-up turning in 3D for the consultant, the
 * aisle for the owner, the site for the contractor.
 */

interface Band {
  id: string
  role: string
  head: string
  line: string
  media: { kind: '3d' } | { kind: 'photo'; src: string; alt: string; pos?: string }
}

/* The client's three messages, word for word, split at their first sentence as the ledger sets them. */
const BANDS: Band[] = [
  {
    id: 'consultant',
    role: 'Consultant & Engineer',
    head: 'Specify maximum structural toughness.',
    line: 'A high-ductility, jointless floor matrix that eliminates reflective cracking over dynamic PT and SFRC slabs while comfortably achieving demanding TR34 DM1 flatness specs.',
    media: { kind: '3d' },
  },
  {
    id: 'owner',
    role: 'Logistics Developer & Owner',
    head: 'Maximize warehouse uptime.',
    line: 'Eliminate wheel-shattering joint failures, surface spalling, and alignment-killing ruts. A continuous, abrasion-resistant system engineered for endless 24/7 robotic cycles.',
    media: { kind: 'photo', src: '/img/flooring/aw-lgv-aisle.webp', alt: 'Laser-guided trucks in a narrow aisle between towering racks, on a smooth floor', pos: '50% 60%' },
  },
  {
    id: 'contractor',
    role: 'Concrete Flooring Contractor',
    head: 'Unmatched execution speed.',
    line: 'A self-consolidating, high-fluidity 800 mm slump mix that easily pumps through a lightweight, rust-proof 3D basalt grid — drastically cutting labor hours and eliminating joint-cutting steps.',
    media: { kind: 'photo', src: '/img/flooring/aw-site-pour.webp', alt: 'RTARIUM on site: a crew pumping self-levelling concrete through a hose onto the mesh', pos: '60% 50%' },
  },
]
const N = BANDS.length

const LABELS: LabelSpec[] = [
  { id: 'coat', anchor: 'bw-coat', text: 'Resin wear coat', dx: 56, dy: -70 },
  { id: 'mesh', anchor: 'bw-mesh', text: 'RTARIUM, 10 mm', dx: -50, dy: -84 },
  { id: 'screed', anchor: 'bw-screed', text: '20 mm screed', dx: -56, dy: 64 },
  { id: 'slab', anchor: 'bw-slab', text: 'PT or SFRC slab', dx: 50, dy: 64 },
]

function Model() {
  const host = useRef<HTMLDivElement>(null)
  const live = useLive(host)
  const bus = useMemo(createBus, [])
  return (
    <div ref={host} className="fdc-v__model" aria-hidden="true">
      <Stage3D shadows keyLight={false}>
        <BuildUp bus={bus} live={live} />
        <LabelProjector bus={bus} bottom={12} />
      </Stage3D>
      <Labels bus={bus} labels={LABELS} shown={LABELS.map((l) => l.id)} />
    </div>
  )
}

export function Voices() {
  const section = useRef<HTMLElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const [step, setStep] = useState(-1)
  const stepRef = useRef(-1)
  const [seen, setSeen] = useState(0)

  useEffect(() => {
    const el = section.current
    const ol = list.current
    if (!el || !ol) return
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let p = -1
    const place = () => {
      const H = ol.clientHeight
      const C = Math.round(Math.min(64, Math.max(48, window.innerHeight * 0.07)))
      const O = H - (N - 1) * C
      ol.style.setProperty('--open', `${O}px`)
      ol.style.setProperty('--closed', `${C}px`)
      let top = 0
      rows.current.forEach((row, i) => {
        if (!row) return
        const w = Math.max(0, 1 - Math.abs(p - i))
        const h = i === N - 1 ? H - top : C + (O - C) * w
        row.style.transform = `translate3d(0, ${top.toFixed(1)}px, 0)`
        row.style.height = `${Math.max(0, h).toFixed(1)}px`
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
      const target = Math.min(N - 1, Math.max(0, -r.top / vh))
      p = p < 0 || reduced ? target : damp(p, target, 11, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      place()
      const inside = r.top <= vh * 0.5 && r.bottom > vh * 0.5
      const s = inside ? Math.round(target) : -1
      if (s !== stepRef.current) {
        stepRef.current = s
        setStep(s)
        if (s >= 0) setSeen((m) => m | ((1 << (s + 1)) - 1))
      }
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
  }, [])

  return (
    <section ref={section} id="voices" className="fdc-v on-light" style={{ '--rows': N } as CSSProperties} aria-labelledby="faw-v-title">
      <div className="fdc-v__pin">
        <h2 id="faw-v-title" className="fdc-v__title">
          Specified. Approved. Built.
        </h2>
        <ol ref={list} className="fdc-v__rows">
          {BANDS.map((b, i) => (
            <li key={b.id} ref={(node) => void (rows.current[i] = node)} className={`fdc-v__row ${i === step ? 'is-active' : ''} ${(seen & (1 << i)) !== 0 ? 'is-seen' : ''}`}>
              <div className="fdc-v__bar">
                <span className="fdc-v__num num">0{i + 1}</span>
                <p className="fdc-v__role">{b.role}</p>
                <p className="fdc-v__tag" aria-hidden="true">
                  {b.head}
                </p>
              </div>
              <div className="fdc-v__body">
                <div className="fdc-v__words">
                  <p className="fdc-v__head">{b.head}</p>
                  <p className="fdc-v__line">{b.line}</p>
                </div>
                <figure className="fdc-v__media">
                  {b.media.kind === '3d' ? <Model /> : <img src={b.media.src} alt={b.media.alt} loading="lazy" decoding="async" style={b.media.pos ? { objectPosition: b.media.pos } : undefined} />}
                </figure>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
