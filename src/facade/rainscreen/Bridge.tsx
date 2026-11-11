import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../three/Stage3D'
import { createBus } from '../three/kit'
import { smooth, type Progress } from '../progress'
import { BridgeScene, heightAt, type BridgeAxis } from '../three/rain/BridgeScene'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { StepBar } from '../unitized/StepBar'

/**
 * How RTARIUM bridges the gap, on yellow, in the Unitized answers' own stage (EnduroSat's space
 * service): one pinned screen, the words always in one place on the left, the panel in the room
 * right of them and on their line, a bar along the foot. Each answer closes one of the trade-offs
 * just seen (ACP is not concrete; GRC and UHPC are heavy and costly to engineer), every name two
 * lines starting on the same line. An answer's words come in where the last ones were (a fade and a
 * short settle), and only then does the panel play it out; the camera moves only in the gap between
 * answers. The scroll is the clock; nothing is held.
 */

interface Answer {
  id: string
  name: string
  /** the name as it is set, in two lines */
  head?: [string, string]
  line: string
  labels: string[]
  /** a figure in place of the name: what comes before it, its value, its unit; `count` counts the height as it grows */
  figure?: { pre: string; value: string; unit: string; count?: boolean }
  review?: string
}

/*
 * Each answer closes one of the trade-offs: ACP is not concrete; GRC, UHPC, stone and precast are
 * heavy; GRC and UHPC are costly to engineer and their fibres age or corrode; stone comes small.
 */
const ANSWERS: Answer[] = [
  { id: 'face', name: 'A solid concrete face', head: ['A solid', 'concrete face'], line: 'A cast concrete face, where ACP is only a sheet.', labels: ['face'] },
  { id: 'thin', name: 'A lightweight 12 mm panel', head: ['A lightweight', '12 mm panel'], line: 'A 12 mm façade, with additional depth for any design cast into its surface.', labels: ['edge', 'relief'] },
  {
    id: 'weight',
    name: 'Under 30 kg/m²',
    figure: { pre: 'Under', value: '30', unit: 'kg/m²' },
    line: 'Around a third of the weight of stone and less than a tenth of precast.',
    labels: ['sq'],
    review: REVIEW.weight,
  },
  {
    id: 'anchors',
    name: 'Integrated fixing points',
    head: ['Integrated', 'fixing points'],
    line: 'Fixings are set into the reinforcement textile, allowing the panel to hook directly onto its rails.',
    labels: ['anchor'],
    review: REVIEW.ferrules,
  },
  { id: 'durable', name: 'Non-corrosive', head: ['Non-corrosive', '\u00a0'], line: 'Basalt is naturally resistant to alkalis and does not corrode.', labels: [] },
  { id: 'tall', name: 'Panels up to 6 m tall', figure: { pre: 'Panels up to', value: '3.0', unit: 'm tall', count: true }, line: 'Cast in one piece, reducing the number of joints across the façade.', labels: ['textile', 'side'], review: REVIEW.panelSizes },
]

const LABELS: LabelSpec[] = [
  { id: 'face', anchor: 'b-face', text: 'Cast concrete', dx: -60, dy: 96 },
  { id: 'edge', anchor: 'b-edge', text: '12 mm', dx: 56, dy: -84 },
  { id: 'relief', anchor: 'b-relief', text: '+ design depth', dx: -70, dy: 70 },
  { id: 'sq', anchor: 'b-sq', text: '1 m², under 30 kg', dx: 56, dy: -60 },
  { id: 'anchor', anchor: 'b-anchor', text: 'Ferrule, cast in', dx: 60, dy: -96 },
  { id: 'textile', anchor: 'b-textile', text: 'RTARIUM', dx: 56, dy: -44 },
  { id: 'side', anchor: 'b-side', text: '12 mm', dx: 56, dy: 52 },
]

/** screens of scroll for each answer: the last has the panel to grow and cast (grown by 0.82 of it: no dead scroll after) */
const STRETCH = [1.3, 1.6, 1.3, 1.4, 1.3, 1.7]
/** where the last answer has played out, as a share of its stretch: the panel at its full height */
const LAST_AT = 0.88
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
function goToAnswer(k: number) {
  const el = document.getElementById('bridge')
  if (!el) return
  const s = START[k] + STRETCH[k] * (k === N - 1 ? LAST_AT : 0.76)
  scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight)
}

export function Bridge() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const words = useRef<(HTMLDivElement | null)[]>([])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const count = useRef<HTMLSpanElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  /** where the run has eased to, 0..6, told to the scene */
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const [step, setStep] = useState(0)
  const [lit, setLit] = useState('')
  /** where the scene stands, from the layout: the middle of the room right of the words, on their line */
  const axis = useRef<BridgeAxis>({ x: 0.6, y: 0.5 })

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

  // left as the slab to slab's build is, by the page's stepper (usePageSteps): plays with the scroll going down, never
  // back, its bar playing it to a step; done where its last step has played out
  const done = (START[N - 1] + STRETCH[N - 1] * LAST_AT) / RUN

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
        // the bar: the current cell fills as its answer plays; a passed one closes to its number
        const c = cells.current[k]
        if (c) {
          c.style.setProperty('--f', Math.min(1, Math.max(0, f / (k === N - 1 ? 0.84 : 0.76))).toFixed(4))
          c.style.setProperty('--c', (k < N - 1 ? smooth(0.86, 1, f) : 0).toFixed(4))
        }
      })
      // the last answer counts the panel's height as it grows
      if (count.current) {
        const h = heightAt(Math.max(0, p - (N - 1)))
        const txt = h > 5.95 ? '6' : h.toFixed(1)
        if (count.current.textContent !== txt) count.current.textContent = txt
      }
    }
    const tick = (now: number) => {
      raf = 0
      // held by its controller (`data-held`, the page's stepper): it stays where it stands; and while a step of the bar plays
      // it there, that play has it
      if (seeking || el.hasAttribute('data-held')) return
      // (a frame's timestamp can be a little earlier than the moment it was asked for)
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const vh = window.innerHeight
      const target = answerAt(-el.getBoundingClientRect().top / vh)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      apply()
      if (p !== target) raf = requestAnimationFrame(tick)
    }
    /** everything that follows where the run stands, `p` */
    const apply = () => {
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
    }
    // a step of the bar (`run:show`, from the page's stepper): the run played to that step, back or on, smoothly and in a time
    // of its own, as the slab to slab's bar plays to its step; `move`: the page goes straight there first
    let seeking = false
    let seekRaf = 0
    const seek = (to: number, at?: number, quick = false) => {
      cancelAnimationFrame(seekRaf)
      // (a step of the bar plays in full, from its own start: `at`)
      const from = at ?? (p < 0 ? to : p)
      if (reduced || Math.abs(to - from) < 1e-4) {
        p = to
        apply()
        return
      }
      // (quick: the last of a step the scroll has all but played, finished in about the time a scroll settles)
      const time = (quick ? Math.min(0.6, 0.25 + 1.5 * Math.abs(to - from)) : Math.min(4.2, 1.6 + 1.4 * Math.abs(to - from))) * 1000
      const start = performance.now()
      seeking = true
      const frame = (at: number) => {
        const u = Math.min(1, Math.max(0, (at - start) / time))
        p = from + (to - from) * (quick ? 1 - Math.pow(1 - u, 3) : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
        apply()
        if (u < 1) seekRaf = requestAnimationFrame(frame)
        else {
          seeking = false
          kick()
        }
      }
      seekRaf = requestAnimationFrame(frame)
    }
    const show = (e: Event) => {
      const { k, move } = (e as CustomEvent<{ k: number; move?: boolean }>).detail
      const s = START[k] + STRETCH[k] * (k === N - 1 ? LAST_AT : 0.76)
      if (move) scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight, true)
      // (without `move`, the stepper is saying the scroll has played it to its end: it is eased on from where it stands,
      // never played again from its start)
      seek(answerAt(s), move === undefined ? undefined : k, move === undefined)
    }
    const kick = () => {
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    // let go by its controller (`run:release`): straight to where the scroll is, never easing there from where it was held
    const release = () => {
      cancelAnimationFrame(seekRaf)
      seeking = false
      p = -1
      kick()
    }
    el.addEventListener('run:show', show)
    el.addEventListener('run:release', release)
    kick()
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', kick)
    return () => {
      el.removeEventListener('run:show', show)
      el.removeEventListener('run:release', release)
      cancelAnimationFrame(seekRaf)
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', kick)
      cancelAnimationFrame(raf)
    }
  }, [t])

  // the labels change with the step, after the frame that moved the scene there: the scene, which draws only when asked,
  // is asked for one more, so the labels it places are the new step's, never the last one's left where they stood
  useEffect(() => {
    t.listeners.forEach((f) => f())
  }, [lit, t])

  const shown = ANSWERS.find((a) => a.id === lit)?.labels ?? []

  return (
    <section ref={section} id="bridge" className="fu-ans on-yellow" data-done={done} aria-labelledby="fr-bridge-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows fallback={<img className="fu-still" src="/img/facade/panel-face.webp" alt="" />}>
            <BridgeScene t={t} bus={bus} compact={compact} axis={axis} />
            <LabelProjector bus={bus} bottom={compact ? 300 : 110} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={shown} />
        </div>

        <h2 id="fr-bridge-title" className="fu-ans__title">
          RTARIUM bridges the gap
        </h2>

        {/* the words, all in one place, one answer at a time, each name starting on the same line */}
        <div ref={room} className="fu-ans__words">
          {ANSWERS.map((a, k) => (
            <div key={a.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
              {a.figure ? (
                <h3 className="fu-ans__figure num" aria-label={a.name}>
                  <small className="fu-ans__upto">{a.figure.pre}</small>
                  <span ref={a.figure.count ? count : undefined}>{a.figure.value}</span>
                  <small>{a.figure.unit}</small>
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
              {a.review && <ReviewNote>{a.review}</ReviewNote>}
            </div>
          ))}
        </div>

        <StepBar
          label="How RTARIUM bridges the gap"
          names={ANSWERS.map((a) => a.name)}
          step={step}
          onGo={goToAnswer}
          cellRef={(k, el) => void (cells.current[k] = el)}
          hints="run"
        />
      </div>
    </section>
  )
}
