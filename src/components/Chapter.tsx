import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { refreshGround, useStageRegion } from '../three/Stage'
import { setShared, useStageValue, type Ground, type PoseId } from '../three/stageStore'
import { POSES } from '../three/poses'
import { damp, prefersReducedMotion } from '../lib/motion'
import { scrollToY } from '../lib/scroll'

/** what a screen shows where its mesh would be when there is no 3D */
const STILLS: Partial<Record<PoseId, string>> = {
  structure: '/img/shoot/mesh-profile.webp',
  material: '/img/shoot/mesh-macro.webp',
  pour: '/img/shoot/mesh-fibres.webp',
  depth: '/img/render-structure.webp',
  shear: '/img/shoot/mesh-profile.webp',
  mineral: '/img/shoot/mesh-fibres.webp',
  stack: '/img/render-structure.webp',
  spec: '/img/render-structure.webp',
  roving: '/img/shoot/mesh-fibres.webp',
  xray: '/img/render-structure.webp',
}

/**
 * The scene engine. A chapter is a run of full-screen steps, each one a real screen in the page:
 * scrolling carries the next one up over the last, continuously and the same way in both
 * directions, while the ground under the 3D wipes to the next step's colour along the same edge
 * (see Ground). Each step's copy lags the scroll a little (`--o`, -1 below .. 0 in place .. 1
 * above), so screens slide rather than cut. Reaching a step (it holds the middle of the screen)
 * plays its sequence in time: words rise one by one, figures count, the mesh glides to its pose.
 * The wheel is never captured; each step is a snap point.
 */

export interface Step {
  id: string
  /** short name on the progress chips */
  label: string
  ground: Ground
  pose: PoseId
  render: (active: boolean) => ReactNode
  className?: string
}

/** chapter titles and step labels, read by the progress chips */
export const CHAPTERS = new Map<string, { title: string; labels: string[] }>()

/** Calls back on scroll and resize (once per frame) with the element's top and the viewport height. */
export function useScrollRead(ref: RefObject<HTMLElement | null>, onRead: (top: number, vh: number, height: number) => void) {
  const cb = useRef(onRead)
  cb.current = onRead
  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      cb.current(r.top, window.innerHeight, r.height)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [ref])
}

function Scene({ chapter, step, index, active, seen, sceneRef }: { chapter: string; step: Step; index: number; active: boolean; seen: boolean; sceneRef: (el: HTMLDivElement | null) => void }) {
  const el = useRef<HTMLDivElement | null>(null)
  const failed = useStageValue('failed')
  useStageRegion(el, () => step.pose)
  const still = failed ? STILLS[step.pose] : undefined
  const frame = POSES[step.pose].frame
  return (
    <div
      ref={(node) => {
        el.current = node
        sceneRef(node)
      }}
      id={`${chapter}-${step.id}`}
      className={`scene scene--${step.id} on-${step.ground} ${step.className ?? ''} ${active ? 'is-active' : seen ? 'is-seen' : ''}`}
      data-screen={step.ground}
      data-step={index}
    >
      {still && <img className="scene__still" src={still} alt="" style={{ left: `${frame[0] * 100}%`, top: `${frame[1] * 100}%` }} />}
      <div className="scene__inner">{step.render(active)}</div>
    </div>
  )
}

export function Chapter({ id, title, steps, className = '' }: { id: string; title: string; steps: Step[]; className?: string }) {
  const section = useRef<HTMLElement>(null)
  const scenes = useRef<(HTMLDivElement | null)[]>([])
  const [step, setStep] = useState(-1)
  const stepRef = useRef(-1)
  // steps already played keep their end state; leaving the chapter altogether resets them
  const [seen, setSeen] = useState(0)
  CHAPTERS.set(id, { title, labels: steps.map((s) => s.label) })

  useScrollRead(section, (top, vh, height) => {
    const pos = -top / vh
    const inside = top <= vh * 0.5 && top + height > vh * 0.5
    const s = inside ? Math.min(steps.length - 1, Math.max(0, Math.floor(pos + 0.5))) : -1
    if (s !== stepRef.current) {
      stepRef.current = s
      setStep(s)
      if (s >= 0) setSeen((m) => m | (1 << s))
    }
    if (inside) setShared({ chapter: id, step: s, ground: steps[s].ground })
    // the copy's lag behind the scroll, only for screens near the viewport
    if (top > vh * 1.5 || top + height < -vh * 0.5) {
      setSeen(0)
      return
    }
    scenes.current.forEach((el, i) => {
      if (!el) return
      const o = Math.max(-1.5, Math.min(1.5, pos - i))
      el.style.setProperty('--o', o.toFixed(4))
      el.style.setProperty('--a', Math.abs(o).toFixed(4))
    })
  })

  return (
    <section id={id} ref={section} className={`chapter ${className}`} aria-label={title}>
      {steps.map((s, i) => (
        <Scene key={s.id} chapter={id} step={s} index={i} active={i === step} seen={(seen & (1 << i)) !== 0} sceneRef={(el) => void (scenes.current[i] = el)} />
      ))}
    </section>
  )
}

/** how far a slide on its way out drifts left (fraction of the width) while the next one covers it */
const DRIFT = 0.28

/**
 * A chapter that runs sideways. The section is pinned for as many screens as it has steps, and the
 * vertical scroll (damped, like the opening tour) carries it across: the next slide comes in from
 * the right edge over the last one, which drifts a little left as it is covered, the same both
 * ways; its ground comes in along the same edge (see Ground). Under every slide is one view of the
 * mesh that travels continuously from one step's pose to the next (`Region.blend`), so the mesh
 * never cuts. A step with nothing to draw (footage) holds the pose before it under its film.
 * Reaching a step plays its sequence in time, as on the vertical chapters; each step is a snap point.
 */
export function Track({ id, title, steps, className = '' }: { id: string; title: string; steps: Step[]; className?: string }) {
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const slides = useRef<(HTMLDivElement | null)[]>([])
  const prog = useRef(0)
  const [step, setStep] = useState(-1)
  const stepRef = useRef(-1)
  const [seen, setSeen] = useState(0)
  const failed = useStageValue('failed')
  const n = steps.length
  CHAPTERS.set(id, { title, labels: steps.map((s) => s.label) })

  const meshPose = useMemo(
    () =>
      steps.map((_, i) => {
        let j = i
        while (j > 0 && POSES[steps[j].pose].empty) j--
        return steps[j].pose
      }),
    [steps],
  )
  useStageRegion(
    pin,
    () => meshPose[Math.min(n - 1, Math.max(0, Math.round(prog.current)))],
    () => {
      const i = Math.min(n - 2, Math.max(0, Math.floor(prog.current)))
      return { a: meshPose[i], b: meshPose[i + 1], t: Math.min(1, Math.max(0, prog.current - i)), ga: steps[i].ground, gb: steps[i + 1].ground }
    },
  )

  useEffect(() => {
    const el = section.current
    if (!el) return
    let raf = 0
    let last = performance.now()
    let p = -1
    const place = () => {
      slides.current.forEach((slide, i) => {
        if (!slide) return
        const o = p - i
        let x = 0
        let clip = 0
        let shown = true
        if (o <= -1) {
          x = 1
          shown = false
        } else if (o <= 0) x = -o
        else if (o < 1) {
          x = -o * DRIFT
          clip = o * (1 - DRIFT)
        } else {
          x = -1
          shown = false
        }
        slide.style.transform = x ? `translate3d(${(x * 100).toFixed(3)}%, 0, 0)` : ''
        slide.style.setProperty('--cover', `${(clip * 100).toFixed(3)}%`)
        slide.style.setProperty('--edge', o > -0.995 && o < -0.005 ? '0.5' : '0')
        slide.style.setProperty('--out', o > 0 && o < 1 ? o.toFixed(3) : '0')
        slide.style.visibility = shown ? '' : 'hidden'
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
      prog.current = p
      place()
      refreshGround()
      const inside = r.top <= vh * 0.5 && r.bottom > vh * 0.5
      const s = inside ? Math.round(target) : -1
      if (s !== stepRef.current) {
        stepRef.current = s
        setStep(s)
        if (s >= 0) setSeen((m) => m | (1 << s))
      }
      if (inside) setShared({ chapter: id, step: s, ground: steps[s].ground })
      // leaving the chapter altogether resets what it has played
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
  }, [id, n, steps])

  return (
    <section id={id} ref={section} className={`track ${className}`} aria-label={title} style={{ '--steps': n } as CSSProperties}>
      {steps.map((s, i) => (
        <span key={s.id} className="track__snap" data-step={i} style={{ '--i': i } as CSSProperties} aria-hidden="true" />
      ))}
      <div ref={pin} className="track__pin">
        {steps.map((s, i) => {
          const still = failed ? STILLS[s.pose] : undefined
          const frame = POSES[s.pose].frame
          const active = i === step
          return (
            <div
              key={s.id}
              ref={(node) => void (slides.current[i] = node)}
              id={`${id}-${s.id}`}
              className={`scene scene--slide scene--${s.id} on-${s.ground} ${s.className ?? ''} ${active ? 'is-active' : (seen & (1 << i)) !== 0 ? 'is-seen' : ''}`}
              data-screen={s.ground}
              style={i ? { transform: 'translate3d(100%, 0, 0)', visibility: 'hidden' } : undefined}
            >
              {still && <img className="scene__still" src={still} alt="" style={{ left: `${frame[0] * 100}%`, top: `${frame[1] * 100}%` }} />}
              <div className="scene__inner">{s.render(active)}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** A single full screen outside a chapter (applications, footer) that still sets the ground. */
export function useScreen(ref: RefObject<HTMLElement | null>, chapter: string, ground: Ground | (() => Ground)) {
  useScrollRead(ref, (top, vh, height) => {
    if (top <= vh * 0.5 && top + height > vh * 0.5) setShared({ chapter, step: 0, ground: typeof ground === 'function' ? ground() : ground })
  })
}

/** Scroll to a chapter's step (a screen, or the scroll position of a step of a pinned chapter). */
export function goToStep(chapter: string, index: number) {
  const el = document.querySelector<HTMLElement>(`#${chapter} [data-step="${index}"]`) ?? document.getElementById(chapter)
  if (!el) return
  scrollToY(el.getBoundingClientRect().top + window.scrollY)
}

/* ---- timed type --------------------------------------------------------------------------- */

/** Splits a line into words that rise out of their own masks, one after another, from `--w`. */
function wordsOf(line: ReactNode, from: number) {
  if (typeof line !== 'string') {
    return {
      node: (
        <span className="word">
          <span className="word__in" style={{ '--w': from } as CSSProperties}>
            {line}
          </span>
        </span>
      ),
      count: 1,
    }
  }
  const words = line.split(' ')
  return {
    node: words.map((w, i) => (
      <Fragment key={i}>
        <span className="word">
          <span className="word__in" style={{ '--w': from + i } as CSSProperties}>
            {w}
          </span>
        </span>
        {i < words.length - 1 ? ' ' : null}
      </Fragment>
    )),
    count: words.length,
  }
}

/**
 * A heading whose words rise one by one when the step is reached, line after line. `slab` sets
 * each line on its own block of the inverse colour, so it reads over anything.
 */
export function Lines({ lines, as: Tag = 'h2', className = '', start = 0, slab = false, id }: { lines: ReactNode[]; as?: 'h1' | 'h2' | 'h3' | 'p'; className?: string; start?: number; slab?: boolean; id?: string }) {
  let w = start
  return (
    <Tag id={id} className={`lines ${slab ? 'lines--slab' : ''} ${className}`}>
      {lines.map((l, i) => {
        const { node, count } = wordsOf(l, w)
        w += count
        return (
          <span key={i} className="lines__line" style={{ '--i': i } as CSSProperties}>
            {node}
          </span>
        )
      })}
    </Tag>
  )
}

/** A statement whose words arrive one by one, at a steady reading pace. */
export function Statement({ text, className = '' }: { text: string; className?: string }) {
  return <p className={`statement ${className}`}>{wordsOf(text, 0).node}</p>
}

/** Counts up to its value when the step becomes active. Keeps the value's own format. */
export function CountUp({ value, active, duration = 1400, className = '' }: { value: string; active: boolean; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const match = value.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/)
    if (!active || !match || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value)
      return
    }
    const [, before, digits, after] = match
    const target = parseFloat(digits.replace(/,/g, ''))
    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0
    const grouped = digits.includes(',')
    let raf = 0
    const t0 = performance.now() + 250
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / duration))
      const n = target * (1 - Math.pow(1 - t, 4))
      const text = grouped ? n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals)
      setShown(`${before}${text}${after}`)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, value, duration])
  return (
    <span className={`count ${className}`} aria-label={value}>
      <span aria-hidden="true">{shown}</span>
    </span>
  )
}
