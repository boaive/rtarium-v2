import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY } from '../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus } from '../facade/three/kit'
import { smooth, type Progress } from '../facade/progress'
import { StepBar } from '../facade/unitized/StepBar'
import { EnvelopeScene, spanAt, zoomAt } from './three/EnvelopeScene'
import type { Room } from './three/fit'
import { ANSWERS } from './content'

/**
 * Built for the envelope, on yellow, as the Unitized page runs RTARIUM's answers: one pinned screen, the words
 * always in one place on the left (every name two lines, starting on one line), the 3D in the room right of them, a
 * bar along the foot. One wall is put up in front of you: the panel grows to 5.8 m and is laid down; it is X-rayed
 * and looked at close; it is lifted by its tie holes and lowered between two steel channel posts, its ends in them,
 * and clamped and bolted to them; two more interlock on it; the lower ones swell
 * into SIPs under a beam, solid panels go on above; a thick wall closes in and draws back. Each slide's words come
 * in, then it plays out. The 3D never leaves its room: a close look is cropped to it, and while the camera is in,
 * the room shows its edge. The ferrule fixed on the mesh, before the concrete, is one of RTARIUM's own photographs.
 */

const LABELS: LabelSpec[] = [
  { id: 'span', anchor: 'e-span', text: <span className="wp-span"><span className="wp-span-count num">3.6</span> m</span>, dx: 30, dy: -26 },
  { id: 'mesh', anchor: 'e-mesh', text: 'Inert basalt: nothing to rust', dx: -40, dy: -84 },
  { id: 'xray', anchor: 'e-ferrule', text: 'Ferrule insert, cast on the RTARIUM', dx: 46, dy: -92 },
  { id: 'ferrules', anchor: 'e-ferrules', text: 'Ferrule inserts: to fix by', dx: 30, dy: -64 },
  { id: 'ties', anchor: 'e-ties', text: 'Tie holes: to lift by, 20 mm, through', dx: 34, dy: 60 },
  { id: 'lift', anchor: 'e-lift', text: 'Lifted by its tie holes', dx: 40, dy: -60 },
  { id: 'angle', anchor: 'e-angle', text: 'Steel clamp, bolted to the post', dx: 60, dy: -80 },
  { id: 'bolt', anchor: 'e-bolt', text: 'M8 bolt, washers and nut', dx: 70, dy: 70 },
  { id: 'joint', anchor: 'e-joint', text: 'Tapered tongue, taken into its groove', dx: -60, dy: -96 },
  { id: 'sip', anchor: 'e-sip', text: '100 mm SIP · climate-controlled zone', dx: 30, dy: 56 },
  { id: 'beam', anchor: 'e-beam', text: 'Steel beam, bolted to the columns', dx: 40, dy: -64 },
  { id: 'solid', anchor: 'e-solid', text: '30 mm solid · clear height', dx: 30, dy: -56 },
  { id: 'ghost', anchor: 'e-ghost', text: 'A 230 mm masonry wall', dx: 50, dy: -56 },
  { id: 'floor', anchor: 'e-floor', text: 'Floor given back', dx: 50, dy: 56 },
]
/** each slide's labels, and when each is up (in the slide's own run, 0..1; to the words' going if no end) */
const SHOWN: Record<string, [string, number, number?][]> = {
  span: [['span', 0.06, 0.64]],
  weld: [
    ['mesh', 0.24, 0.38],
    ['xray', 0.4, 0.5],
    ['ferrules', 0.62],
    ['ties', 0.64],
  ],
  bolt: [
    ['lift', 0.34, 0.56],
    ['angle', 0.71, 0.79],
    ['bolt', 0.81, 0.92],
  ],
  joint: [['joint', 0.56, 0.7]],
  zoned: [
    ['beam', 0.2, 0.34],
    ['solid', 0.62],
    ['sip', 0.64],
  ],
  space: [
    ['ghost', 0.26, 0.46],
    ['floor', 0.66],
  ],
}
/** what stands under a slide's words: one of RTARIUM's own photographs */
const MEDIA: Record<string, { src: string; alt: string }> = {
  weld: { src: '/img/facade/ferrule-in-mesh.webp', alt: 'A ferrule insert fixed on the RTARIUM mesh before the concrete, a bolt coming down to it' },
}

/** screens of scroll for each slide: the ones with a close look in them run longer */
const STRETCH = [1.7, 2.6, 2.2, 1.8, 1.7, 1.4]
const RUN = STRETCH.reduce((a, b) => a + b, 0)
const START = STRETCH.map((_, k) => STRETCH.slice(0, k).reduce((a, b) => a + b, 0))
const N = ANSWERS.length

function answerAt(s: number) {
  if (s <= 0) return 0
  for (let k = 0; k < N; k++) if (s < START[k] + STRETCH[k]) return k + (s - START[k]) / STRETCH[k]
  return N - 1e-4
}

function wordsAt(k: number, t: number) {
  const f = t - k
  if (f < 0) return 0
  const inn = k === 0 ? 1 : smooth(0, 0.12, f)
  const out = k === N - 1 ? 0 : smooth(0.88, 0.97, f)
  return inn * (1 - out)
}

function goTo(k: number) {
  const el = document.getElementById('wall-answers')
  if (!el) return
  const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.9 : 0.84)
  scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight)
}

export function Answers() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const words = useRef<(HTMLDivElement | null)[]>([])
  const shots = useRef<(HTMLElement | null)[]>([])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const pin = useRef<HTMLDivElement>(null)
  const roomEl = useRef<HTMLDivElement>(null)
  const edge = useRef<HTMLDivElement>(null)
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const [step, setStep] = useState(0)
  const [shown, setShown] = useState<string[]>([])
  /** the room the wall keeps to: right of the words to the bar's right, under the title, over the bar */
  const room = useRef<Room>({ x: 0.36, y: 0.2, w: 0.6, h: 0.62 })

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const w = roomEl.current?.getBoundingClientRect()
      const title = pin.current?.querySelector('.fu-ans__title')?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !w || !title || !bar || !p.width || !p.height) return
      if (compact) {
        const y0 = title.bottom + 16
        const y1 = w.top + 8
        room.current = { x: 0.04, y: (y0 - p.top) / p.height, w: 0.92, h: Math.max(0.2, (y1 - y0) / p.height) }
      } else {
        // (a clear margin between the words and the 3D: it never comes up to them)
        const x0 = w.right + Math.max(72, p.width * 0.065)
        const y0 = title.bottom + 28
        const y1 = bar.top - 32
        room.current = { x: (x0 - p.left) / p.width, y: (y0 - p.top) / p.height, w: (bar.right - x0) / p.width, h: (y1 - y0) / p.height }
      }
      // the room's edge, shown while the camera is in close
      const e = edge.current
      if (e) {
        const r = room.current
        e.style.left = `${(r.x * 100).toFixed(3)}%`
        e.style.top = `${(r.y * 100).toFixed(3)}%`
        e.style.width = `${(r.w * 100).toFixed(3)}%`
        e.style.height = `${(r.h * 100).toFixed(3)}%`
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [compact])

  useEffect(() => {
    const el = section.current
    if (!el) return
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let p = -1
    const place = () => {
      ANSWERS.forEach((_, k) => {
        const f = p - k
        const w = words.current[k]
        if (w) {
          const vis = wordsAt(k, p)
          w.style.opacity = vis.toFixed(3)
          w.style.visibility = vis > 0.004 ? '' : 'hidden'
          w.toggleAttribute('inert', vis < 0.5)
          if (!reduced) {
            const y = f < 0.5 ? (1 - vis) * 14 : -(1 - vis) * 10
            w.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
            w.style.filter = vis > 0.995 ? '' : `blur(${((1 - vis) * 5).toFixed(2)}px)`
          }
        }
        // the photograph opens out of its corner as the words come in, and closes into it before they go
        const ph = shots.current[k]
        if (ph) {
          const g = Math.max(0, smooth(0.06, 0.3, f) - smooth(0.82, 0.94, f))
          ph.style.setProperty('--g', g.toFixed(4))
          ph.style.visibility = g > 0.003 ? '' : 'hidden'
        }
        const c = cells.current[k]
        if (c) {
          c.style.setProperty('--f', Math.min(1, Math.max(0, f / 0.94)).toFixed(4))
          c.style.setProperty('--c', (k < N - 1 ? smooth(0.88, 1, f) : 0).toFixed(4))
        }
      })
      edge.current?.style.setProperty('--z', zoomAt(p).toFixed(3))
    }
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const target = answerAt(-el.getBoundingClientRect().top / window.innerHeight)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      if (t.value !== p) {
        t.value = p
        t.listeners.forEach((f) => f())
      }
      place()
      // the first slide counts the panel's length as it grows
      const len = spanAt(p).toFixed(1)
      const count = pin.current?.querySelector('.wp-span-count')
      if (count && count.textContent !== len) count.textContent = len
      const k = Math.min(N - 1, Math.max(0, Math.floor(p)))
      setStep(k)
      // a slide's labels are up while what they name is in view, until its words go
      const f = p - k
      const on = (SHOWN[ANSWERS[k].id] ?? []).filter(([, a, b]) => f > a && f < (b ?? (k === N - 1 ? 2 : 0.86))).map(([id]) => id)
      setShown((s) => (s.join() === on.join() ? s : on))
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
  }, [t])

  return (
    <section ref={section} id="wall-answers" className="fu-ans wp-ans on-yellow" aria-labelledby="wp-answers-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows keyLight={false}>
            <EnvelopeScene t={t} bus={bus} room={room} />
            <LabelProjector bus={bus} bottom={compact ? 300 : 110} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={shown} />
          <div ref={edge} className="wp-edge" />
        </div>

        <h2 id="wp-answers-title" className="fu-ans__title">
          Built for the envelope.
        </h2>

        <div ref={roomEl} className="fu-ans__words">
          {ANSWERS.map((a, k) => {
            const media = MEDIA[a.id]
            return (
              <div key={a.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
                <h3 className="fu-ans__name">
                  {a.head[0]} <br />
                  {a.head[1]}
                </h3>
                <p className="fu-ans__line">{a.line}</p>
                {media && (
                  <figure ref={(el) => void (shots.current[k] = el)} className="fu-ans__shot" style={{ visibility: 'hidden' }}>
                    <span className="fu-ans__frame">
                      <img src={media.src} alt={media.alt} loading="lazy" decoding="async" width={720} height={1280} />
                    </span>
                  </figure>
                )}
              </div>
            )
          })}
        </div>

        <StepBar label="Built for the envelope" names={ANSWERS.map((a) => a.bar)} step={step} onGo={goTo} cellRef={(k, el) => void (cells.current[k] = el)} />
      </div>
    </section>
  )
}
