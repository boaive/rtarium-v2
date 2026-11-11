import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus, type LabelBus } from '../../facade/three/kit'
import { smooth, type Progress } from '../../facade/progress'
import { StepBar } from '../../facade/unitized/StepBar'
import { useLive } from '../../facade/unitized/live'
import { Wake } from '../../facade/three/rain/lines'
import type { BuildRoom } from '../data/three/BuildScene'

/**
 * A pinned 3D stage in the Data & AI Centres build's form (the Unitized answers' stage): the words
 * always in one place on the left, the floor in the room right of them, a bar along the foot. A
 * step's words come in where the last ones were (a fade and a short settle), and only then does the
 * scene play it out; the camera moves only in the gap between steps, every shot fitted to the room,
 * so the 3D never leaves it. The scroll is the clock; nothing is held.
 *
 * The semiconductor page's floor, as RTARIUM makes it, on yellow with the black bar.
 */

export interface Step {
  id: string
  name: string
  head: [string, string]
  line: string
  labels: string[]
  clip?: { src: string; poster: string; label: string }
}

/** the stage's scene: its run as steps, the label bus, whether on a phone, the room it keeps to, whether on screen */
export type SceneOf = (t: Progress, bus: LabelBus, compact: boolean, room: { current: BuildRoom }, live: { current: boolean }) => ReactNode

export function Stage({
  id,
  title,
  steps,
  stretch,
  labels,
  barLabel,
  fallback,
  scene,
}: {
  id: string
  title: string
  steps: Step[]
  /** screens of scroll for each step */
  stretch: number[]
  labels: LabelSpec[]
  barLabel: string
  fallback: ReactNode
  scene: SceneOf
}) {
  const N = steps.length
  const { RUN, START } = useMemo(() => ({ RUN: stretch.reduce((a, b) => a + b, 0), START: stretch.map((_, k) => stretch.slice(0, k).reduce((a, b) => a + b, 0)) }), [stretch])
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const live = useLive(section)
  const words = useRef<(HTMLDivElement | null)[]>([])
  const clips = useRef<(HTMLElement | null)[]>([])
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const pin = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const [step, setStep] = useState(0)
  const [lit, setLit] = useState('')
  /** the room the scene keeps to, from the layout: right of the words to the bar's end, under the title to over the bar */
  const space = useRef<BuildRoom>({ x: 0.38, y: 0.2, w: 0.58, h: 0.62 })

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const w = room.current?.getBoundingClientRect()
      const head = pin.current?.querySelector('.fu-ans__title')?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !w || !bar || !head || !p.width || !p.height) return
      const x0 = w.right + 32
      const y0 = head.bottom + 24
      const y1 = bar.top - 28
      space.current = { x: (x0 - p.left) / p.width, y: (y0 - p.top) / p.height, w: (bar.right - x0) / p.width, h: (y1 - y0) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // left as the slab to slab's build is, by the page's stepper (usePageSteps): plays with the scroll going down, never
  // back, its bar playing it to a step; done where its last step has played out
  const done = (START[N - 1] + stretch[N - 1] * 0.9) / RUN

  useEffect(() => {
    const el = section.current
    if (!el) return
    const reduced = prefersReducedMotion()
    /** the run, in screens scrolled into the pin, as steps: step k over k..k+1 */
    const stepAt = (s: number) => {
      if (s <= 0) return 0
      for (let k = 0; k < N; k++) if (s < START[k] + stretch[k]) return k + (s - START[k]) / stretch[k]
      return N - 1e-4
    }
    /** how far step k's words are in (0..1), at `p` */
    const wordsAt = (k: number, p: number) => {
      const f = p - k
      if (f < 0) return 0
      const inn = k === 0 ? 1 : smooth(0, 0.14, f)
      const out = k === N - 1 ? 0 : smooth(0.8, 0.94, f)
      return inn * (1 - out)
    }
    let raf = 0
    let last = performance.now()
    let p = -1
    const place = () => {
      steps.forEach((s, k) => {
        const f = p - k
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
        // the footage opens out of its corner as the words come in, and plays only while it is open
        const c = clips.current[k]
        if (c && s.clip) {
          const g = Math.max(0, smooth(0.06, 0.3, f) - smooth(0.74, 0.9, f))
          c.style.setProperty('--g', g.toFixed(4))
          c.style.visibility = g > 0.003 ? '' : 'hidden'
          const v = videos.current[k]
          if (v) {
            if (g > 0.5 && !reduced) {
              if (!v.src) v.src = s.clip.src
              if (v.paused) v.play().catch(() => {})
            } else if (!v.paused) v.pause()
          }
        }
        const cell = cells.current[k]
        if (cell) {
          cell.style.setProperty('--f', Math.min(1, Math.max(0, f / (k === N - 1 ? 0.9 : 0.76))).toFixed(4))
          cell.style.setProperty('--c', (k < N - 1 ? smooth(0.86, 1, f) : 0).toFixed(4))
        }
      })
    }
    const tick = (now: number) => {
      raf = 0
      // held by its controller (`data-held`, the page's stepper): it stays where it stands; and while a step of the bar plays
      // it there, that play has it
      if (seeking || el.hasAttribute('data-held')) return
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const target = stepAt(-el.getBoundingClientRect().top / window.innerHeight)
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
      // a step's labels are up once it has played out, until its words go
      const f = p - k
      setLit(f > 0.55 && f < 0.8 + (k === N - 1 ? 1 : 0) ? steps[k].id : '')
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
      const s = START[k] + stretch[k] * (k === N - 1 ? 0.9 : 0.76)
      if (move) scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight, true)
      // (without `move`, the stepper is saying the scroll has played it to its end: it is eased on from where it stands,
      // never played again from its start)
      seek(stepAt(s), move === undefined ? undefined : k, move === undefined)
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
  }, [t, steps, stretch, START, N])

  // the labels change with the step, after the frame that moved the scene there: the scene, which draws only when asked,
  // is asked for one more, so the labels it places are the new step's, never the last one's left where they stood
  useEffect(() => {
    t.listeners.forEach((f) => f())
  }, [lit, t])

  /** scrolls to where step k has played out, its words still in place */
  const goToStep = (k: number) => {
    const el = section.current
    if (!el) return
    const s = START[k] + stretch[k] * (k === N - 1 ? 0.9 : 0.76)
    scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight)
  }

  const shown = steps.find((s) => s.id === lit)?.labels ?? []

  return (
    <section
      data-done={done}
      ref={section}
      id={id}
      className="fu-ans fdc-build fsc-build on-yellow"
      data-ground="yellow"
      aria-labelledby={`${id}-title`}
      style={{ '--run': RUN } as CSSProperties}
    >
      <div ref={pin} className="fu-ans__pin">
        <div className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows fallback={fallback}>
            <Wake live={live} />
            {scene(t, bus, compact, space, live)}
            <LabelProjector bus={bus} bottom={compact ? 300 : 110} />
          </Stage3D>
          <Labels bus={bus} labels={labels} shown={shown} />
        </div>

        <h2 id={`${id}-title`} className="fu-ans__title">
          {title}
        </h2>

        {/* the words, all in one place, one step at a time, each name starting on the same line */}
        <div ref={room} className="fu-ans__words">
          {steps.map((s, k) => (
            <div key={s.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
              <h3 className="fu-ans__name">
                {s.head[0]} <br />
                {s.head[1]}
              </h3>
              <p className="fu-ans__line">{s.line}</p>
              {s.clip && (
                <figure ref={(el) => void (clips.current[k] = el)} className="fu-ans__shot fdc-build__clip" style={{ visibility: 'hidden' }}>
                  <span className="fu-ans__frame">
                    <video ref={(el) => void (videos.current[k] = el)} muted loop playsInline preload="none" poster={s.clip.poster} aria-label={s.clip.label} width={640} height={360} />
                  </span>
                  <figcaption className="fdc-build__site">On site</figcaption>
                </figure>
              )}
            </div>
          ))}
        </div>

        <StepBar label={barLabel} names={steps.map((s) => s.name)} step={step} onGo={goToStep} cellRef={(k, el) => void (cells.current[k] = el)} hints="run" />
      </div>
    </section>
  )
}
