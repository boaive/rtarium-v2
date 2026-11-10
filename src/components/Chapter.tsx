import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { refreshGround, useStageRegion } from '../three/Stage'
import { setShared, useStageValue, type Ground, type PoseId } from '../three/stageStore'
import { POSES } from '../three/poses'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
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
 * After the opening tour, which scrolls freely and then plays itself on into About, Home moves a screen at a time
 * (`stepScreens`), so each step comes to rest whole.
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
 * Reaching a step plays its sequence in time, as on the vertical chapters.
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
  /**
   * On a phone the chapter is one screen and its steps a carousel: the step it shows (`at`) is moved by its
   * buttons and by a sideways swipe, not by the scroll, and the slides and the mesh travel to it the same way.
   */
  const compact = useIsCompact()
  const at = useRef(0)
  const [shown, setShown] = useState(0)
  const kickRef = useRef(() => {})
  const go = useCallback(
    (i: number) => {
      const to = Math.min(n - 1, Math.max(0, i))
      if (to === at.current) return
      at.current = to
      setShown(to)
      kickRef.current()
    },
    [n],
  )
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
    // a phone: when the last frame came, and the wait for one that has not (see `kick`)
    let frameAt = performance.now()
    let starved = 0
    const place = () => {
      slides.current.forEach((slide, i) => {
        if (!slide) return
        // a slide all but home is home: the scroll can come to rest a few pixels short of its stop, and a slide left
        // that far out leaves a sliver of the screen beside it uncovered, the 3D under it showing at its edge
        const o = Math.abs(p - i) < 0.006 ? 0 : p - i
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
        // the hairline only while the edge is crossing the screen, not as it creeps the last few pixels in (see Ground)
        slide.style.setProperty('--edge', o > -0.97 && o < -0.03 ? '0.5' : '0')
        slide.style.setProperty('--out', o > 0 && o < 1 ? o.toFixed(3) : '0')
        slide.style.visibility = shown ? '' : 'hidden'
      })
    }
    const tick = (now: number) => {
      raf = 0
      frameAt = performance.now()
      const gap = (now - last) / 1000
      const dt = Math.min(0.1, gap)
      last = now
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const target = compact ? at.current : Math.min(n - 1, Math.max(0, -r.top / vh))
      // a phone whose frames come slowly (a preview pane, a device under load) goes straight to the step it was asked
      // for, rather than crawling there a frame at a time with the ground and the copy behind it
      const slow = compact && gap > 0.25
      p = p < 0 || prefersReducedMotion() || slow ? target : damp(p, target, compact ? 7 : 11, dt)
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
      // a phone whose page gets no frames (a preview pane, a page held in the background) would leave the carousel, the
      // ground and the copy where they were: if no frame has come a moment after a tap or a scroll, the step is set
      // there and then, without one (`tick` sees the long gap and goes straight to it)
      if (!compact) return
      window.clearTimeout(starved)
      starved = window.setTimeout(() => {
        if (!raf || performance.now() - frameAt < 150) return
        cancelAnimationFrame(raf)
        raf = 0
        last = performance.now() - 1000
        tick(performance.now())
      }, 160)
    }
    kickRef.current = kick
    kick()
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', kick)
    return () => {
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', kick)
      cancelAnimationFrame(raf)
      window.clearTimeout(starved)
    }
  }, [id, n, steps, compact])

  // a phone: a sideways swipe across the screen takes the carousel a step (a vertical one scrolls the page on)
  useEffect(() => {
    const el = pin.current
    if (!compact || !el) return
    const g = { id: -1, x: 0, y: 0 }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || (e.target as HTMLElement | null)?.closest?.('a, button')) return
      g.id = e.pointerId
      g.x = e.clientX
      g.y = e.clientY
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== g.id) return
      g.id = -1
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.3) go(at.current + (dx < 0 ? 1 : -1))
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === g.id) g.id = -1
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [compact, go])

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
        {compact && <Carousel steps={steps} at={shown} onGo={go} />}
      </div>
    </section>
  )
}

const two = (k: number) => String(k).padStart(2, '0')

/**
 * A chapter's steps on a phone, at the foot of its screen: a line of a segment each (the ones passed and the one
 * shown drawn in), which of how many with its name, and the way back and on. It takes the colour of the step shown.
 */
function Carousel({ steps, at, onGo }: { steps: Step[]; at: number; onGo: (i: number) => void }) {
  const n = steps.length
  return (
    <div className={`carousel on-${steps[at].ground}`}>
      <ol className="carousel__line" aria-hidden="true">
        {steps.map((s, i) => (
          <li key={s.id} className={i < at ? 'is-past' : i === at ? 'is-now' : undefined} />
        ))}
      </ol>
      <div className="carousel__row">
        <p className="carousel__count" aria-live="polite">
          <span className="num">
            <b>{two(at + 1)}</b> / {two(n)}
          </span>
          <span className="carousel__name">{steps[at].label}</span>
        </p>
        <div className="carousel__nav">
          <button type="button" className="carousel__btn" onClick={() => onGo(at - 1)} disabled={at === 0} aria-label={at > 0 ? `Previous: ${steps[at - 1].label}` : 'Previous'}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
          <button type="button" className="carousel__btn carousel__btn--next" onClick={() => onGo(at + 1)} disabled={at === n - 1} aria-label={at < n - 1 ? `Next: ${steps[at + 1].label}` : 'Next'}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
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
