import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import { Arrow } from '../Shell'
import './stations.css'

/**
 * A section on a phone set as veedo.space sets its factory's stations: its heading; the step's label, name and what
 * happens in it; the step played in a rounded card, a short clip rendered from the 3D (it plays once and holds); a bar
 * under the card, a segment a step, the one in play filling as its clip runs; which of how many, pause, back and on;
 * and the steps as thumbnails in a strip, the one in play ringed. It plays itself, step after step, round again after
 * the last, while it is on the screen (paused under reduced motion, until asked); the buttons and thumbnails go to a
 * step. It is one screen and takes no scroll of its own: the page scrolls past it as past any screen.
 *
 * The clips play by `useClips` (the Hang section's floor, StepFloor, plays its own by it too).
 */

export interface Station extends Clip {
  name: string
  line: string
  /** a still of the step, for its thumbnail */
  thumb?: string
}

/** a clip to play: the step's animated image (it plays once and holds), and how long it runs, hold included (ms) */
export interface Clip {
  clip: string
  ms: number
}

/**
 * Clips that play themselves, step after step, round again after the last, while their section is on the screen (paused
 * under reduced motion, until asked). Each is fetched once, when it is about to be wanted (the step in play and the
 * next), and shown afresh each time its step comes round (a new object URL: a new image, so it plays from its start),
 * over the last until it has loaded, so a step never shows blank. The two `layer`s are the images it shows them in.
 */
export function useClips(sectionRef: RefObject<HTMLElement | null>, items: Clip[]) {
  const n = items.length
  const [k, setK] = useState(0)
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const [seen, setSeen] = useState(false)
  /** how many times a step has been shown: restarts its bar's fill each time */
  const [turn, setTurn] = useState(0)
  const blobs = useRef<(Blob | null)[]>([])
  const layers = useRef<(HTMLImageElement | null)[]>([null, null])
  const front = useRef(0)
  const urls = useRef<(string | null)[]>([null, null])
  /** the step in play, for the loads that come in later */
  const now = useRef(k)
  now.current = k

  // on the screen: it plays; off it, it waits where it is
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setSeen(e.intersectionRatio >= 0.5), { threshold: [0, 0.5] })
    io.observe(el)
    return () => io.disconnect()
  }, [sectionRef])

  /*
   * The clips are fetched as they are wanted, each once: the step in play and the one after it, as the section comes
   * near and then as each step comes round (a clip is a few hundred KB: the five at once would be most of a page's weight)
   */
  const near = useRef(false)
  const asked = useRef(new Set<number>())
  const want = (i: number) => {
    if (!near.current || asked.current.has(i)) return
    asked.current.add(i)
    fetch(items[i].clip)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!b) return void asked.current.delete(i)
        blobs.current[i] = b
        if (i === now.current) show(i)
      })
      .catch(() => void asked.current.delete(i))
  }
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        near.current = true
        want(now.current)
        want((now.current + 1) % n)
        io.disconnect()
      },
      { rootMargin: '150% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionRef, n])

  /** step `i`'s clip, from its start, over the one shown until it has loaded */
  const show = (i: number) => {
    const b = blobs.current[i]
    const next = layers.current[1 - front.current]
    if (!b || !next) return
    const url = URL.createObjectURL(b)
    next.onload = () => {
      const was = front.current
      front.current = 1 - was
      next.classList.add('is-on')
      layers.current[was]?.classList.remove('is-on')
      const old = urls.current[front.current]
      if (old && old !== url) URL.revokeObjectURL(old)
      urls.current[front.current] = url
    }
    next.src = url
  }
  useEffect(() => {
    want(k)
    want((k + 1) % n)
    show(k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, turn])
  useEffect(
    () => () => {
      for (const u of urls.current) if (u) URL.revokeObjectURL(u)
    },
    [],
  )

  // coming on the screen, or played again after a pause: the step in play from its start, its clip and its bar together
  useEffect(() => {
    if (seen && playing) setTurn((t) => t + 1)
  }, [seen, playing])

  // played step after step while it is on the screen, round again after the last
  useEffect(() => {
    if (!playing || !seen) return
    const t = window.setTimeout(() => go((k + 1) % n), items[k].ms)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, turn, playing, seen, n, items])

  /** to step `i`, its clip and its bar from the start */
  const go = useCallback((i: number) => {
    setK(((i % n) + n) % n)
    setTurn((t) => t + 1)
  }, [n])

  return {
    k,
    turn,
    playing,
    setPlaying,
    /** playing, and on the screen */
    running: playing && seen,
    go,
    /** the two images the clips are shown in, one over the other */
    layer: (i: 0 | 1) => (el: HTMLImageElement | null) => void (layers.current[i] = el),
  }
}

export function Stations({
  sectionRef,
  id,
  title,
  label,
  items,
  ground,
  presentation,
}: {
  sectionRef: RefObject<HTMLElement | null>
  id: string
  /** the section's heading */
  title: string
  /** what each step is called ("Step", "Answer") */
  label: string
  items: Station[]
  ground: 'light' | 'yellow'
  presentation?: 'solution'
}) {
  const n = items.length
  const { k, turn, playing, setPlaying, running, go, layer } = useClips(sectionRef, items)
  const strip = useRef<HTMLOListElement>(null)
  const thumbs = useRef<(HTMLLIElement | null)[]>([])

  // the strip keeps the step in play in view
  useEffect(() => {
    const s = strip.current
    const t = thumbs.current[k]
    if (!s || !t) return
    const place = () => {
      const pad = parseFloat(getComputedStyle(s).paddingLeft) || 0
      const target = presentation === 'solution' ? thumbs.current[Math.max(0, Math.min(n - 3, k - 1))] : t
      s.scrollTo({ left: Math.max(0, (target ?? t).offsetLeft - pad), behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
    }
    place()
    if (presentation !== 'solution') return
    const resize = new ResizeObserver(place)
    resize.observe(s)
    return () => resize.disconnect()
  }, [k, n, presentation])

  // A horizontal gesture changes answers; vertical gestures continue scrolling the page.
  useEffect(() => {
    const card = sectionRef.current?.querySelector<HTMLElement>('.fst__card')
    if (presentation !== 'solution' || !card) return
    let start: { id: number; x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      start = { id: e.pointerId, x: e.clientX, y: e.clientY }
      card.setPointerCapture(e.pointerId)
    }
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      start = null
      if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.3) go(k + (dx < 0 ? 1 : -1))
    }
    const cancel = () => { start = null }
    card.addEventListener('pointerdown', down)
    card.addEventListener('pointerup', up)
    card.addEventListener('pointercancel', cancel)
    return () => {
      card.removeEventListener('pointerdown', down)
      card.removeEventListener('pointerup', up)
      card.removeEventListener('pointercancel', cancel)
    }
  }, [k, presentation, sectionRef, go])

  const item = items[k]
  const num = (i: number) => String(i + 1).padStart(2, '0')
  return (
    <section ref={sectionRef} id={id} className={`fst fst--${ground} ${presentation === 'solution' ? 'fst--solution' : ''} on-${ground}`} aria-labelledby={`${id}-title`} aria-roledescription="carousel">
      <div className="fst__pin">
        <h2 id={`${id}-title`} className="fst__title fu-h">
          {title}
        </h2>
        <div className="fst__head" aria-live={running ? 'off' : 'polite'}>
          <p className="fst__label">
            {label} {k + 1}
          </p>
          <h3 key={`n${k}`} className="fst__name">
            {item.name}
          </h3>
          <p key={`l${k}`} className="fst__line">
            {item.line}
          </p>
        </div>
        <div className="fst__card" data-step={k + 1} aria-hidden="true">
          <img ref={layer(0)} className="fst__clip" alt="" decoding="async" />
          <img ref={layer(1)} className="fst__clip" alt="" decoding="async" />
        </div>
        <ol className={`fst__bar ${running ? '' : 'is-paused'}`} aria-hidden="true">
          {items.map((it, i) => (
            <li
              key={i === k ? `${it.name}-${turn}` : it.name}
              className={`fst__seg ${i < k ? 'is-past' : i === k ? 'is-now' : ''}`}
              style={i === k ? ({ '--ms': `${it.ms}ms` } as CSSProperties) : undefined}
            />
          ))}
        </ol>
        <div className="fst__ctrl">
          <p className="fst__count num">
            <b>{num(k)}</b> / {num(n - 1)}
          </p>
          {presentation !== 'solution' && <div className="fst__btns">
            <button type="button" className="fst__btn" aria-label={playing ? 'Pause' : 'Play'} aria-pressed={!playing} onClick={() => setPlaying((p) => !p)}>
              {playing ? (
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M5 3v10M11 3v10" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M5 3l8 5-8 5z" fill="currentColor" />
                </svg>
              )}
            </button>
            <button type="button" className="fst__btn fst__btn--back" aria-label={`Previous ${label.toLowerCase()}`} onClick={() => go(k - 1)}>
              <Arrow />
            </button>
            <button type="button" className="fst__btn fst__btn--on" aria-label={`Next ${label.toLowerCase()}`} onClick={() => go(k + 1)}>
              <Arrow />
            </button>
          </div>}
        </div>
        <ol ref={strip} className="fst__strip" aria-label={`The ${label.toLowerCase()}s`}>
          {items.map((it, i) => (
            <li key={it.name} ref={(el) => void (thumbs.current[i] = el)} className={`fst__thumb ${i === k ? 'is-on' : ''}`}>
              <button type="button" className="fst__thumb-btn" aria-current={i === k} onClick={() => go(i)}>
                <span className="fst__thumb-img">{it.thumb && <img src={it.thumb} alt="" loading="lazy" decoding="async" width={232} height={143} />}</span>
                <span className="fst__thumb-num num">{num(i)}</span>
                <span className="fst__thumb-name">{it.name}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
