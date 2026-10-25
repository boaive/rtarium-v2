import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useStageRegion } from '../three/Stage'
import { setShared, useStageValue, type Ground, type PoseId } from '../three/stageStore'
import { POSES } from '../three/poses'

/** what a screen shows where its mesh would be when there is no 3D */
const STILLS: Partial<Record<PoseId, string>> = {
  structure: '/img/shoot/mesh-profile.webp',
  material: '/img/shoot/mesh-macro.webp',
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
      data-index={index}
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

/** A single full screen outside a chapter (applications, footer) that still sets the ground. */
export function useScreen(ref: RefObject<HTMLElement | null>, chapter: string, ground: Ground) {
  useScrollRead(ref, (top, vh, height) => {
    if (top <= vh * 0.5 && top + height > vh * 0.5) setShared({ chapter, step: 0, ground })
  })
}

/** Scroll to a chapter's step; the snap settles it. */
export function goToStep(chapter: string, index: number) {
  const el = document.querySelectorAll<HTMLElement>(`#${chapter} .scene`)[index] ?? document.getElementById(chapter)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: reduce ? 'auto' : 'smooth' })
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
