import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../three/Stage3D'
import { createBus } from '../three/kit'
import { smooth, type Progress } from '../progress'
import { AnswerScene, tallAt, type AnswerAxis } from '../three/unit/AnswerScene'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { StepBar } from './StepBar'

/**
 * RTARIUM's answers, on yellow, as EnduroSat's space-service page runs its satellite: one pinned
 * screen, the words always in one place on the left, the 3D in the room right of them and on their
 * line (the same place for every answer), and a bar along the foot. Every answer's name is two lines
 * and starts at the same height, so one answer takes the last one's place exactly. Only the ferrules
 * have a photograph from the shoot (the one thing a model cannot show as well), under their words,
 * on their left edge. The page is never held: the scroll is the clock. Each answer's words come in where the last ones were (a fade and a
 * short settle, never a slide), and only then does the textile play the answer out; the words go
 * before the next answer comes, and the camera moves on only in that gap, so nothing overlaps and
 * nothing plays while the screen is still arriving. Along the foot each answer is a cell: the
 * current one fills as it plays, the passed ones close to numbered squares (EnduroSat's squares),
 * and any of them takes you there.
 */

interface Answer {
  id: string
  name: string
  /** the name as it is set, in two lines */
  head?: [string, string]
  line: string
  photo?: { src: string; alt: string; pos: string }
  labels: string[]
  figure?: boolean
  review?: string
}

const ANSWERS: Answer[] = [
  { id: 'xyz', name: 'XYZ strength', head: ['XYZ', 'strength'], line: 'One 3D textile reinforces the panel in all three directions.', labels: ['x', 'y', 'z'] },
  {
    id: 'textile',
    name: 'Mesh in textile form',
    head: ['Mesh in', 'textile form'],
    line: 'One continuous textile, cut and stitched to shape. Nothing loose to clump.',
    labels: ['stitch'],
  },
  { id: 'spray', name: 'Easy spray method', head: ['Easy spray', 'method'], line: 'Face coat, textile, backing: sprayed, not poured.', labels: ['face'] },
  {
    id: 'ferrules',
    name: 'In-built ferrule inserts',
    head: ['In-built', 'ferrule inserts'],
    line: 'The fixings are set in the textile before the backing goes on.',
    // (a tall shot, seen wide: the screw coming down to the ferrule in the textile)
    photo: { src: '/img/facade/ferrule-in-mesh.webp', alt: 'A ferrule insert set into the RTARIUM textile in the mould', pos: '50% 50%' },
    labels: ['ferrule'],
    review: REVIEW.ferrules,
  },
  { id: 'tall', name: 'Up to 6 m high', line: 'High, in a single thickness.', labels: ['thick'], figure: true, review: REVIEW.sixMetres },
]

const LABELS: LabelSpec[] = [
  // each letter just beyond the tip of its axis
  { id: 'x', anchor: 'a-x', text: 'X', dx: 22, dy: 6 },
  { id: 'y', anchor: 'a-y', text: 'Y', dx: -4, dy: -24 },
  { id: 'z', anchor: 'a-z', text: 'Z', dx: -24, dy: 12 },
  // each pointing up or down, into the room above and below the textile, clear of the words and the photograph
  { id: 'stitch', anchor: 'a-stitch', text: 'Cut and stitched at 90°', dx: 24, dy: -110 },
  { id: 'face', anchor: 'a-face', text: 'Face coat', dx: -24, dy: 104 },
  { id: 'ferrule', anchor: 'a-ferrule', text: 'Ferrule insert', dx: 24, dy: -104 },
  { id: 'thick', anchor: 'a-thick', text: 'Single thickness, 20 mm', dx: -56, dy: -40, wide: true },
]

/** screens of scroll for each answer: the last has the panel to grow and cast */
const STRETCH = [1.3, 1.3, 1.3, 1.3, 2.2]
const RUN = STRETCH.reduce((a, b) => a + b, 0)
const START = STRETCH.map((_, k) => STRETCH.slice(0, k).reduce((a, b) => a + b, 0))
const N = ANSWERS.length

/** the run, in screens scrolled into the pin, as answers: answer k over k..k+1 */
function answerAt(s: number) {
  if (s <= 0) return 0
  for (let k = 0; k < N; k++) if (s < START[k] + STRETCH[k]) return k + (s - START[k]) / STRETCH[k]
  return N - 1e-4
}

/** how far answer k's words are in (0..1), at `t` */
function wordsAt(k: number, t: number) {
  const f = t - k
  if (f < 0) return 0
  const inn = k === 0 ? 1 : smooth(0, 0.14, f)
  const out = k === N - 1 ? 0 : smooth(0.8, 0.94, f)
  return inn * (1 - out)
}

/** scrolls to where answer k has played out, its words still in place */
export function goToAnswer(k: number) {
  const el = document.getElementById('answers')
  if (!el) return
  const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.9 : 0.76)
  scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight)
}

export function Answers() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const words = useRef<(HTMLDivElement | null)[]>([])
  const shots = useRef<(HTMLElement | null)[]>([])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const count = useRef<HTMLSpanElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  /** where the run has eased to, 0..5, told to the scene */
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const [step, setStep] = useState(0)
  const [lit, setLit] = useState('')
  /** where the scene stands, from the layout: the middle of the room right of the words, on their line */
  const axis = useRef<AnswerAxis>({ x: 0.6, y: 0.5 })

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const w = room.current?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !w || !bar || !p.width || !p.height) return
      axis.current = { x: ((w.right + bar.right) / 2 - p.left) / p.width, y: (w.top + w.height / 2 - p.top) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

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
        // the words: in with a fade and a short settle, out with a fade and a short lift
        const w = words.current[k]
        if (w) {
          const vis = wordsAt(k, p)
          const rising = f < 0.5
          w.style.opacity = vis.toFixed(3)
          w.style.visibility = vis > 0.004 ? '' : 'hidden'
          w.toggleAttribute('inert', vis < 0.5)
          if (!reduced) {
            const y = rising ? (1 - vis) * 14 : -(1 - vis) * 10
            w.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
            w.style.filter = vis > 0.995 ? '' : `blur(${((1 - vis) * 5).toFixed(2)}px)`
          }
        }
        // the photograph opens out of its corner as the words come in, and closes into it before they go
        const ph = shots.current[k]
        if (ph) {
          const g = Math.max(0, smooth(0.06, 0.3, f) - smooth(0.74, 0.9, f))
          ph.style.setProperty('--g', g.toFixed(4))
          ph.style.visibility = g > 0.003 ? '' : 'hidden'
        }
        // the bar: the current cell fills as its answer plays; a passed one closes to its number
        const c = cells.current[k]
        if (c) {
          c.style.setProperty('--f', Math.min(1, Math.max(0, f / 0.94)).toFixed(4))
          c.style.setProperty('--c', (k < N - 1 ? smooth(0.86, 1, f) : 0).toFixed(4))
        }
      })
      // the last answer counts the panel's height as it grows
      if (count.current) {
        const txt = tallAt(Math.max(0, p - (N - 1))).h.toFixed(1)
        if (count.current.textContent !== txt) count.current.textContent = txt
      }
    }
    const tick = (now: number) => {
      raf = 0
      // (a frame's timestamp can be a little earlier than the moment it was asked for)
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const vh = window.innerHeight
      const target = answerAt(-el.getBoundingClientRect().top / vh)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      if (t.value !== p) {
        t.value = p
        t.listeners.forEach((f) => f())
      }
      place()
      const k = Math.min(N - 1, Math.max(0, Math.floor(p)))
      setStep(k)
      // an answer's labels are up once it has played out, until its words go
      const f = p - k
      setLit(f > (k === N - 1 ? 0.82 : 0.5) && f < 0.8 + (k === N - 1 ? 1 : 0) ? ANSWERS[k].id : '')
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

  const shown = ANSWERS.find((a) => a.id === lit)?.labels ?? []

  return (
    <section ref={section} id="answers" className="fu-ans on-yellow" aria-labelledby="fu-answers-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows fallback={<img className="fu-still" src="/img/shoot/mesh-profile.webp" alt="" />}>
            <AnswerScene t={t} bus={bus} compact={compact} axis={axis} />
            <LabelProjector bus={bus} bottom={compact ? 300 : 110} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={shown} />
        </div>

        <h2 id="fu-answers-title" className="fu-ans__title">
          RTARIUM’s answers
        </h2>

        {/* the words, all in one place, one answer at a time, each name starting on the same line */}
        <div ref={room} className="fu-ans__words">
          {ANSWERS.map((a, k) => (
            <div key={a.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
              {a.figure ? (
                <h3 className="fu-ans__figure num" aria-label={a.name}>
                  <small className="fu-ans__upto">Up to</small>
                  <span ref={count}>0.3</span>
                  <small>m</small>
                </h3>
              ) : (
                <h3 className="fu-ans__name">
                  {a.head ? (
                    <>
                      {a.head[0]} <br />
                      {a.head[1]}
                    </>
                  ) : (
                    a.name
                  )}
                </h3>
              )}
              <p className="fu-ans__line">{a.line}</p>
              {/* the photograph (the ferrules'), under the words, opening out of its corner */}
              {a.photo && (
                <figure ref={(el) => void (shots.current[k] = el)} className="fu-ans__shot" style={{ visibility: 'hidden' }}>
                  <span className="fu-ans__frame">
                    <img src={a.photo.src} alt={a.photo.alt} loading="lazy" decoding="async" width={720} height={1280} style={{ objectPosition: a.photo.pos }} />
                  </span>
                </figure>
              )}
              {a.review && <ReviewNote>{a.review}</ReviewNote>}
            </div>
          ))}
        </div>

        <StepBar
          label="RTARIUM’s answers"
          names={ANSWERS.map((a) => a.name)}
          step={step}
          onGo={goToAnswer}
          cellRef={(k, el) => void (cells.current[k] = el)}
          after={
            <button
              type="button"
              className="fu-bar__back"
              onClick={() => {
                const el = document.getElementById('problems')
                if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY)
              }}
            >
              Back to the problems
            </button>
          }
        />
      </div>
    </section>
  )
}
