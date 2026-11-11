import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { refreshGround, useStageRegion } from '../three/Stage'
import { setShared, useStageValue, type Ground, type PoseId } from '../three/stageStore'
import { POSES } from '../three/poses'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY } from '../lib/scroll'
import { FILM_STEPS, dropFilm, filmReady, seenFilm } from '../lib/films'

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
export function Track(props: { id: string; title: string; steps: Step[]; className?: string; phoneGround?: Ground }) {
  const compact = useIsCompact()
  if (compact) return <Rows {...props} ground={props.phoneGround} />
  return <SideTrack {...props} />
}

/**
 * A sideways chapter on a phone, set as Enerblock sets its solutions: read down the page at the finger's own speed, on
 * warm white, in rows parted by hairlines the width of the screen. Each step a row: its number, its name in small
 * capitals, the copy in plain weights, and its 3D in a framed figure under it (the stage draws the mesh inside the
 * figure's box: `useStageRegion` with `box`), a drawing's title block along the figure's foot. The step whose figure
 * holds the middle of the screen is the one playing.
 */
export function Rows({ id, title, steps, ground = 'light' }: { id: string; title: string; steps: Step[]; ground?: Ground }) {
  CHAPTERS.set(id, { title, labels: steps.map((s) => s.label) })
  const section = useRef<HTMLElement>(null)
  // holding the middle of the screen, read on every scroll as the other sections are, the header takes this ground
  useScreen(section, id, ground)
  return (
    <section ref={section} id={id} className={`eb on-${ground}`} aria-label={title} data-screen={ground}>
      <header className="eb__head">
        <p className="eb__title">{title}</p>
        {steps.length > 1 && <p className="eb__count num">{two(steps.length)} parts</p>}
      </header>
      {steps.map((s, i) => (
        <Row key={s.id} chapter={id} title={title} step={s} index={i} ground={ground} />
      ))}
    </section>
  )
}

/**
 * A phone's figures play as films: each pose its loop, recorded from the 3D itself (the mesh turning once round, at an
 * even pace, on its ground), so the page draws no 3D under its rows as it scrolls. The thin section's loop is the one
 * of the thickness chosen; Monolithic's, a flat mesh's while the comparison shows one.
 */
const LOOPS: Partial<Record<PoseId, string>> = {
  structure: 'about-structure',
  material: 'about-material',
  pour: 'about-pour',
  depth: 'innovation-depth',
  shear: 'innovation-shear',
  mineral: 'innovation-mineral',
  stack: 'tech-stack',
}
/** Monolithic's comparison, said to its loop (Innovation's ShearCompare): a flat mesh shown, or RTARIUM */
export const FLAT_EVENT = 'rtarium:flat'

function Loop({ pose }: { pose: PoseId }) {
  const video = useRef<HTMLVideoElement>(null)
  const thickness = useStageValue('thickness')
  const [flat, setFlat] = useState(false)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (pose !== 'shear') return
    const on = (e: Event) => setFlat(Boolean((e as CustomEvent<boolean>).detail))
    window.addEventListener(FLAT_EVENT, on)
    return () => window.removeEventListener(FLAT_EVENT, on)
  }, [pose])
  const base = LOOPS[pose]
  const name = !base ? '' : pose === 'stack' ? `${base}-${thickness}` : pose === 'shear' && flat ? `${base}-flat` : base
  // loaded once it comes near the screen, playing while it is on it, still while it is not (the film swapped for another
  // of the same figure, the new one watched in its place)
  useEffect(() => {
    const el = video.current
    if (!el) return
    el.muted = true
    seenFilm(el, 0)
    // near: loaded ahead of the screen
    const ahead = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '60% 0px 60% 0px' })
    ahead.observe(el)
    // how much of it is on the screen: the one most in view plays
    const seen = new IntersectionObserver(
      ([e]) => seenFilm(el, e.intersectionRatio),
      { threshold: FILM_STEPS },
    )
    seen.observe(el)
    // (a film that comes in while its box is the one in view starts as soon as it can)
    el.addEventListener('loadeddata', filmReady)
    return () => {
      ahead.disconnect()
      seen.disconnect()
      el.removeEventListener('loadeddata', filmReady)
      dropFilm(el)
    }
  }, [name])
  if (!base) return null
  const src = `/video/loops/${name}.mp4`
  return (
    <video
      key={name}
      ref={video}
      className="eb-fig__loop"
      src={near ? src : undefined}
      poster={`/video/loops/${name}.jpg`}
      muted
      loop
      playsInline
      preload={near ? 'auto' : 'none'}
      aria-hidden="true"
      disablePictureInPicture
    />
  )
}

function Row({ chapter, title, step, index, ground }: { chapter: string; title: string; step: Step; index: number; ground: Ground }) {
  const row = useRef<HTMLElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const none = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const [seen, setSeen] = useState(false)
  const failed = useStageValue('failed')
  // (a figure with its film plays that, and lends the 3D nothing)
  // (in development, while the films are recorded from the 3D, it draws: ?live)
  const filmed = Boolean(LOOPS[step.pose]) && !(import.meta.env.DEV && new URLSearchParams(window.location.search).has('live'))
  useStageRegion(filmed ? none : box, () => step.pose, undefined, { box: true })
  useEffect(() => {
    const el = row.current
    if (!el) return
    // in play from when the row's middle reaches the screen's lower third until it leaves the upper
    const io = new IntersectionObserver(([e]) => {
      setActive(e.isIntersecting)
      if (e.isIntersecting) setSeen(true)
    }, { rootMargin: '-30% 0px -30% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [chapter, index])
  const still = failed ? STILLS[step.pose] : undefined
  return (
    <article ref={row} id={`${chapter}-${step.id}`} className={`eb-row scene scene--${step.id} on-${ground} ${active ? 'is-active' : seen ? 'is-seen' : ''}`}>
      <p className="eb-row__num num">{two(index + 1)} /</p>
      <h3 className="eb-row__label">{step.label}</h3>
      <div className="eb-row__copy">{step.render(active)}</div>
      <figure className="eb-fig">
        <div ref={box} className="eb-fig__view" data-screen={ground}>
          {filmed ? <Loop pose={step.pose} /> : still && <img className="eb-fig__still" src={still} alt="" />}
          <i className="eb-fig__tick eb-fig__tick--tl" aria-hidden="true" />
          <i className="eb-fig__tick eb-fig__tick--br" aria-hidden="true" />
        </div>
        <figcaption className="eb-fig__block">
          <span className="eb-fig__name">{title}</span>
          <span>Fig. {two(index + 1)}</span>
          <span>{step.label}</span>
        </figcaption>
      </figure>
    </article>
  )
}

function SideTrack({ id, title, steps, className = '' }: { id: string; title: string; steps: Step[]; className?: string }) {
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
    <div className={`carousel on-${steps[at].ground} ${at === 0 ? 'is-first' : ''}`}>
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
          <span key={at} className="carousel__name">
            {steps[at].label}
          </span>
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
