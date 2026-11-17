import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
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
/** `once`: played through to the last step and held there (`ended`), never round again by itself */
/** `manual`: each step played and held on, never run on to the next by itself (a swipe or a tap goes on) */
export function useClips(sectionRef: RefObject<HTMLElement | null>, items: Clip[], once = false, manual = false) {
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
  /** the turn whose clip is on the screen: its time, and its bar, run from then, not from when its step came round (a
   * clip still loading or decoding had its end cut off by the next step) */
  const [ready, setReady] = useState(-1)
  const turnNow = useRef(turn)
  turnNow.current = turn

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
    // (a step with no clip of its own: its scene is live, and there is nothing to fetch)
    if (!near.current || asked.current.has(i) || !items[i].clip) return
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
    const at = turnNow.current
    next.onload = () => {
      if (i === now.current) setReady(at)
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

  /** played through once and held on its last step (`once`) */
  const [ended, setEnded] = useState(false)
  /** a step picked once played through: shown, and held on (`once`) */
  const [held, setHeld] = useState(manual)
  // played step after step while it is on the screen, round again after the last (or, `once`, held on the last)
  useEffect(() => {
    if (!playing || !seen || ended) return
    // (development only: the steps held where they are while their stills are taken for the strip)
    // (and in a build, only with ?holdsteps in the address as well: the stills are taken from the built site too)
    if ((import.meta.env.DEV || window.location.search.includes('holdsteps')) && (window as Window & { __holdSteps?: boolean }).__holdSteps) return
    // (a clip's time from when it is on the screen; a live scene's from the start)
    if (items[k].clip && layers.current[0] && ready !== turn) return
    const last = k === n - 1
    const t = window.setTimeout(() => (once && (last || held) ? setEnded(true) : go((k + 1) % n)), items[k].ms)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, turn, playing, seen, n, items, once, ended, held, ready])

  /** to step `i`, its clip and its bar from the start (`hold`: and stay on it once it has played) */
  const go = useCallback((i: number, hold = false) => {
    setHeld(hold)
    setEnded(false)
    setK(((i % n) + n) % n)
    setTurn((t) => t + 1)
  }, [n])

  return {
    k,
    turn,
    playing,
    setPlaying,
    /** playing, and on the screen */
    running: playing && seen && !ended && (!items[k].clip || !layers.current[0] || ready === turn),
    ended,
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
  scene,
  manual = false,
  center = false,
  controls = false,
  foot,
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
  /** the live scene in place of the clips, given the step in play and each time it comes round (as StepFloor's) */
  scene?: (k: number, turn: number) => ReactNode
  /** a step a swipe, never run on by itself: a line says to swipe until the first swipe (Wall Panels' answers) */
  manual?: boolean
  /** the card moved to stand midway between its step's words and the bar, whatever their length */
  center?: boolean
  /** small back, on and play-again buttons by the count, in place of the swipe line (Wall Panels' answers) */
  controls?: boolean
  /** what follows the strip (Wall Panels' panels: the way to the technical sheet) */
  foot?: ReactNode
}) {
  const n = items.length
  // (a solution plays its steps through once and stops on the last, as the slab to slab does: round again it read as a
  // loop with no end; a step picked from the strip plays again)
  const { k, turn, playing, setPlaying, running, ended, go, layer } = useClips(sectionRef, items, presentation === 'solution', manual)
  /** a step gone to by hand: a manual card's swipe line goes, for good */
  const [swiped, setSwiped] = useState(false)
  /** to step `i` by hand: held on once played (a manual card always, any once it has played through) */
  const pick = (i: number) => {
    setSwiped(true)
    // (with the small controls a card picked by hand is held on even mid-play: the visitor has taken over)
    go(i, manual || ended || controls)
  }
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

  const pickRef = useRef(pick)
  pickRef.current = pick

  // (`center`: the card moved, eased, to stand midway between the step's words and the bar; measured from the layout,
  // never from where an animation has them this frame)
  useEffect(() => {
    const sec = sectionRef.current
    if (!center || !sec) return
    const top = (el: HTMLElement) => {
      let y = 0
      for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop
      return y
    }
    const place = () => {
      const line = sec.querySelector<HTMLElement>('.fst__line')
      const card = sec.querySelector<HTMLElement>('.fst__card')
      const bar = sec.querySelector<HTMLElement>('.fst__bar')
      if (!line || !card || !bar) return
      const mid = (top(line) + line.offsetHeight + top(bar)) / 2
      card.style.transform = `translate3d(0, ${(mid - (top(card) + card.offsetHeight / 2)).toFixed(1)}px, 0)`
    }
    place()
    const t = window.setTimeout(place, 120)
    window.addEventListener('resize', place)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', place)
    }
  }, [k, center, sectionRef])

  // A horizontal gesture changes answers; vertical gestures continue scrolling the page.
  useEffect(() => {
    const card = sectionRef.current?.querySelector<HTMLElement>('.fst__card')
    if (presentation !== 'solution' || !card) return
    let start: { id: number; x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      // (a tap on one of the card's own buttons is the button's, never a swipe)
      if ((e.target as Element | null)?.closest?.('button')) return
      start = { id: e.pointerId, x: e.clientX, y: e.clientY }
      card.setPointerCapture(e.pointerId)
    }
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      start = null
      // (once played through, the card swiped to is shown and held on, never run on to the end again)
      if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.3) pickRef.current(k + (dx < 0 ? 1 : -1))
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
  }, [k, presentation, sectionRef])

  // a solution's card the same size on every page, whatever its heading: a heading that runs to more lines than one
  // lengthens the section by as much, rather than taking it from the card (the page scrolls past it as past any screen)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const h = titleRef.current
    const pin = h?.parentElement
    if (presentation !== 'solution' || !h || !pin) return
    const fit = () => {
      const line = parseFloat(getComputedStyle(h).lineHeight) || h.offsetHeight
      const more = Math.max(0, Math.round(h.offsetHeight / line) - 1)
      pin.style.height = more ? `calc(100svh + ${Math.ceil(more * line)}px)` : ''
    }
    fit()
    document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [presentation, title])

  const item = items[k]
  const num = (i: number) => String(i + 1).padStart(2, '0')
  return (
    <section ref={sectionRef} id={id} className={`fst fst--${ground} ${presentation === 'solution' ? 'fst--solution' : ''} on-${ground}`} data-rest-top={presentation === 'solution' ? '' : undefined} aria-labelledby={`${id}-title`} aria-roledescription="carousel">
      <div className="fst__pin">
        <h2 ref={titleRef} id={`${id}-title`} className="fst__title fu-h">
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
        <div className="fst__card" data-step={k + 1}>
          <div className="fst__card-in" aria-hidden="true">
            {scene ? (
              scene(k, turn)
            ) : (
              <>
                <img ref={layer(0)} className="fst__clip" alt="" decoding="async" />
                <img ref={layer(1)} className="fst__clip" alt="" decoding="async" />
              </>
            )}
          </div>
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
          {/* small controls: a card back, a card on (each held on once played), and the whole run played again */}
          {presentation === 'solution' && controls && (
            <div className="fst__mini" role="group" aria-label="Cards">
              {/* pause or play while it runs; once played through, play it all again */}
              {ended ? (
                <button type="button" className="fst__mini-btn" aria-label="Play again from the first card" onClick={() => go(0)}>
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5M3.2 2.8v2.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <button type="button" className="fst__mini-btn" aria-label={playing ? 'Pause' : 'Play'} aria-pressed={!playing} onClick={() => setPlaying((p) => !p)}>
                  {playing ? (
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M5.5 3.5v9M10.5 3.5v9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M5.5 3.5 12 8l-6.5 4.5z" fill="currentColor" />
                    </svg>
                  )}
                </button>
              )}
              <button type="button" className="fst__mini-btn" aria-label="Previous card" onClick={() => pick(k - 1)}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="fst__mini-btn" aria-label="Next card" onClick={() => pick(k + 1)}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
          {/* a manual card: until the first swipe; any other, once it has played through (none with the small controls) */}
          {presentation === 'solution' && !controls && (manual ? !swiped : ended) && (
            <p className="fst__swipe" role="status">
              Swipe to view next card
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M2.5 8h10M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </p>
          )}
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
              <button type="button" className="fst__thumb-btn" aria-current={i === k} onClick={() => (presentation === 'solution' ? pick(i) : go(i))}>
                <span className="fst__thumb-img">{it.thumb && <img src={it.thumb} alt="" loading="lazy" decoding="async" width={232} height={143} />}</span>
                <span className="fst__thumb-num num">{num(i)}</span>
                <span className="fst__thumb-name">{it.name}</span>
              </button>
            </li>
          ))}
        </ol>
        {foot}
      </div>
    </section>
  )
}
