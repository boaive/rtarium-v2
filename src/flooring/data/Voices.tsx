import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { damp, lerp, prefersReducedMotion } from '../../lib/motion'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus } from '../../facade/three/kit'
import { smooth } from '../../facade/progress'
import { useLive } from '../../facade/unitized/live'
import { ReviewNote } from '../../components/Media'
import { BuildUp } from './three/BuildUp'

/**
 * Specified. Approved. Built.: what the floor means to the three people who sign it off, then what it
 * means for the planet. The homepage's ledger, without its strikes, on warm white: four bands that
 * always fill the screen, the open one taking the height the others leave, the scroll handing it down
 * the ledger, one band to the next, both ways. An open band is a spread: whose it is and the client's
 * line for them on the left, large; on the right what backs it, the floor's build-up turning in 3D for
 * the consultant, the hall for the owner, the site for the contractor. A passed band closes to its
 * name and its line, a band to come is a quiet line. The last band is on black, as RTARIUM's is on the
 * homepage: the sustainability win, a carbon meter winding down as the page goes on.
 */

export interface Band {
  id: string
  role: string
  head: string
  line: string
  media?: { kind: '3d' } | { kind: 'photo'; src: string; alt: string; credit?: string; pos?: string }
}

/* The client's messages for the three stakeholders and the sustainability win (Data & AI Centres brief). */
const BANDS: Band[] = [
  {
    id: 'consultant',
    role: 'Consultant & Engineer',
    head: 'Specify with total confidence.',
    line: 'A non-combustible, high-ductility floor system that absorbs dynamic deflections and protects critical ESD floor warranties.',
    media: { kind: '3d' },
  },
  {
    id: 'owner',
    role: 'Developer & Owner',
    head: 'Zero structural maintenance.',
    line: 'Zero out-dusting, and seamless vibration dampening to maximise server performance and facility uptime.',
    media: { kind: 'photo', src: '/img/flooring/dc-aisle.webp', alt: 'A cold aisle between two rows of server racks in a data centre', credit: 'Photo: Robert Harker, CC BY-SA 3.0', pos: '50% 45%' },
  },
  {
    id: 'contractor',
    role: 'General Contractor',
    head: 'Unmatched installation velocity.',
    line: 'An 800 mm slump-flow pumpable mix that flows continuously around an easy-to-lay independent 3D mesh, slicing days off the project schedule.',
    media: { kind: 'photo', src: '/img/flooring/dc-site-pump.webp', alt: 'RTARIUM on site: the mixer-pump, its hose across the slab and a crew levelling a strip of the floor', pos: '50% 50%' },
  },
  {
    id: 'carbon',
    role: 'Sustainability',
    head: 'The global sustainability win.',
    line: 'A GGBS and fly-ash green binder matrix paired with a low-embodied-carbon mineral mesh, helping the world’s tech giants hit their strict Scope 3 net-zero targets.',
  },
]

/** the sustainability win and its carbon meter: the last band, the same for every application */
export const CARBON_BAND = BANDS[BANDS.length - 1]

const LABELS: LabelSpec[] = [
  { id: 'esd', anchor: 'bu-esd', text: 'ESD coating', dx: 56, dy: -70 },
  { id: 'mesh', anchor: 'bu-mesh', text: 'RTARIUM, 10 mm', dx: -50, dy: -84 },
  { id: 'screed', anchor: 'bu-screed', text: '20 mm screed', dx: -56, dy: 64 },
  { id: 'slab', anchor: 'bu-slab', text: 'Hollow-core plank', dx: 50, dy: 64 },
]

/** the meter: how many bars, and where it winds down to (relative; the client gives no figure) */
const BARS = 56
const LOW = 0.42

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

/**
 * The ledger; the Data & AI Centres page's by default. Another application brings its own bands and
 * the model its consultant's band shows.
 */
export function Voices({ bands = BANDS, model = <Model /> }: { bands?: Band[]; model?: ReactNode }) {
  const N = bands.length
  const section = useRef<HTMLElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const meter = useRef<HTMLDivElement>(null)
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
    const place = (raw: number) => {
      const H = ol.clientHeight
      // a closed band keeps its number, whose it is and its line; the open one has the rest of the height
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
      // the carbon meter winds down as the last band holds the screen
      const wind = reduced ? Number(raw > N - 1.4) : smooth(N - 1.45, N - 0.55, raw)
      meter.current?.style.setProperty('--lit', lerp(1, LOW, wind).toFixed(4))
      meter.current?.style.setProperty('--wind', wind.toFixed(4))
    }
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const raw = -r.top / vh
      const target = Math.min(N - 1, Math.max(0, raw))
      p = p < 0 || reduced ? target : damp(p, target, 11, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      place(raw)
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
  }, [N])

  return (
    <section ref={section} id="voices" className="fdc-v on-light" style={{ '--rows': N } as CSSProperties} aria-labelledby="fdc-v-title">
      <div className="fdc-v__pin">
        <h2 id="fdc-v-title" className="fdc-v__title">
          Specified. Approved. Built.
        </h2>
        <ol ref={list} className="fdc-v__rows">
          {bands.map((b, i) => {
            const carbon = b.id === 'carbon'
            return (
              <li
                key={b.id}
                ref={(node) => void (rows.current[i] = node)}
                data-ground={carbon ? 'black' : undefined}
                className={`fdc-v__row ${carbon ? 'fdc-v__row--carbon' : ''} ${i === step ? 'is-active' : ''} ${(seen & (1 << i)) !== 0 ? 'is-seen' : ''}`}
              >
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
                  {b.media?.kind === '3d' && (
                    <figure className="fdc-v__media">{model}</figure>
                  )}
                  {b.media?.kind === 'photo' && (
                    <figure className="fdc-v__media">
                      <img src={b.media.src} alt={b.media.alt} loading="lazy" decoding="async" style={b.media.pos ? { objectPosition: b.media.pos } : undefined} />
                      {b.media.credit && <figcaption className="fdc-v__credit">{b.media.credit}</figcaption>}
                    </figure>
                  )}
                  {carbon && (
                    <figure className="fdc-v__meter" aria-label="Embodied carbon, winding down from a conventional steel-fibre screed to RTARIUM">
                      <p className="fdc-v__meter-name">Embodied carbon</p>
                      <div ref={meter} className="fdc-v__bars" style={{ '--bars': BARS, '--lit': 1, '--low': LOW } as CSSProperties}>
                        {Array.from({ length: BARS }, (_, k) => (
                          <i key={k} style={{ '--k': k } as CSSProperties} />
                        ))}
                        <span className="fdc-v__mark fdc-v__mark--was">Steel-fibre screed</span>
                        <span className="fdc-v__mark fdc-v__mark--now">RTARIUM</span>
                      </div>
                      <ReviewNote>No carbon figure is supplied: the meter is relative and its end level illustrative.</ReviewNote>
                    </figure>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
