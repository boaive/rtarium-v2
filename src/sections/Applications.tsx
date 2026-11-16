import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { APPLICATIONS } from '../content/site'
import { Link } from '../lib/router'
import { useScreen } from '../components/Chapter'
import { prefersReducedMotion, useIsCompact } from '../lib/motion'
import { useMarkIn } from '../lib/reveal'
import { Arrow } from '../facade/Shell'
import '../facade/overview.css'
import '../facade/unitized/more-cards.css'

const AppModel = lazy(() => import('./AppModel'))

/** a swipe moves the row on a card if it goes this far (a share of a card) or this fast (px/ms); a glide's length (ms) */
const SWIPE = { reach: 0.14, flick: 0.35, glide: 560 }
const mod = (a: number, n: number) => ((a % n) + n) % n

/** a tap anywhere on a card (a drag is not one: the row swallows its click) goes where the card's way in goes */
function openCard(e: { currentTarget: HTMLElement; target: EventTarget }) {
  const go = e.currentTarget.querySelector<HTMLAnchorElement>('a.ways__go')
  // (the way in itself takes its own tap)
  if (!go || (e.target as Element).closest?.('a')) return
  go.click()
}

/**
 * A phone's applications, laid out as the façade pages' "Three ways onto a building" (facade/unitized/More: MoreCards,
 * its styles too): the heading over a hairline, then a card an application in a row that goes round, swiped sideways a
 * card at a time, the next showing at the edge; each card its application's own model in 3D (AppModel: the one its page
 * opens on), its number and name at the foot and a round black button with a yellow arrow, the way in; dashes under the
 * row say which is in front. The models are made behind the opening, and only the one in front turns.
 */
function PhoneApplications() {
  const section = useRef<HTMLElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLLIElement | null)[]>([])
  const n = APPLICATIONS.length
  const [front, setFront] = useState(0)
  const pos = useRef(0)
  const anim = useRef(0)
  // (the models are made from the start, so they are built behind the opening, not mid-scroll as the section came near:
  // three scenes made at once there stalled the page just after Tech Space)
  const [near, setNear] = useState(true)
  // (the models play their openings as soon as they are made, out of sight, not all three at once as the section came
  // into view: that stalled the page a tenth of a second at a time, four times, as the section arrived)
  const [play, setPlay] = useState(true)
  // each model's picture once taken: the card shows it, and its 3D scene is let go (AppModel: Snapshot)
  const [shots, setShots] = useState<(string | null)[]>(() => APPLICATIONS.map(() => null))
  const onShot = useMemo(() => APPLICATIONS.map((_, i) => (url: string) => setShots((s) => s.map((x, j) => (j === i ? url : x)))), [])
  const live = useRef(false)
  // only the card in front turns; the ones beside it hold still and draw nothing (one scene drawn a frame, not three)
  const frontAt = useRef(0)
  frontAt.current = front
  const liveOf = useMemo(
    () => APPLICATIONS.map((_, i) => ({ get current() { return live.current && frontAt.current === i } })),
    [],
  )
  useEffect(() => {
    const el = section.current
    if (!el) return
    const ahead = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '100% 0px' })
    const seen = new IntersectionObserver(([e]) => {
      live.current = e.isIntersecting
      if (e.isIntersecting) setPlay(true)
    })
    ahead.observe(el)
    seen.observe(el)
    return () => {
      ahead.disconnect()
      seen.disconnect()
    }
  }, [])
  // (on the yellow, its cards warm ivory: the applications' palette, as at the foot of every page)
  useScreen(section, 'applications', 'yellow')

  const step = useCallback(() => {
    const r = rail.current
    const w = cards.current[0]?.offsetWidth ?? 0
    return w + (r ? parseFloat(getComputedStyle(r).getPropertyValue('--ways-gap')) || 0 : 0)
  }, [])
  const place = useCallback(() => {
    const s = step()
    const lo = -1
    cards.current.forEach((c, i) => {
      if (!c) return
      const o = mod(i - pos.current - lo, n) + lo
      c.style.transform = `translate3d(${(o * s).toFixed(1)}px, 0, 0)`
      c.style.opacity = String(Math.min(1, Math.max(0, (o - lo) / 0.5)))
    })
    setFront(mod(Math.round(pos.current), n))
  }, [n, step])
  const glide = useCallback(
    (to: number) => {
      cancelAnimationFrame(anim.current)
      const from = pos.current
      const end = () => {
        pos.current = mod(to, n)
        place()
      }
      if (prefersReducedMotion() || Math.abs(to - from) < 1e-3) return end()
      const t0 = performance.now()
      const ms = SWIPE.glide * Math.min(1.6, Math.max(0.6, Math.abs(to - from)))
      const frame = (now: number) => {
        const t = Math.min(1, (now - t0) / ms)
        pos.current = from + (to - from) * (1 - Math.pow(1 - t, 3))
        place()
        if (t < 1) anim.current = requestAnimationFrame(frame)
        else end()
      }
      anim.current = requestAnimationFrame(frame)
    },
    [n, place],
  )
  const show = useCallback(
    (i: number) => {
      const base = Math.round(pos.current)
      let d = mod(i - base, n)
      if (d > n / 2) d -= n
      glide(base + d)
    },
    [n, glide],
  )
  useLayoutEffect(() => {
    place()
    const r = rail.current
    if (!r) return
    const ro = new ResizeObserver(() => place())
    ro.observe(r)
    return () => ro.disconnect()
  }, [place])
  // a sideways drag moves the row with the finger; an upright one is the page's scroll (touch-action: pan-y)
  useEffect(() => {
    const r = rail.current
    if (!r) return
    const g = { id: -1, x: 0, y: 0, t: 0, from: 0, on: false, moved: 0 }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      cancelAnimationFrame(anim.current)
      Object.assign(g, { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, from: pos.current, on: false, moved: 0 })
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== g.id) return
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      if (!g.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          g.id = -1
          return glide(Math.round(pos.current))
        }
        if (Math.abs(dx) < 8) return
        g.on = true
        try {
          r.setPointerCapture(e.pointerId)
        } catch {
          /* */
        }
      }
      g.moved = Math.abs(dx)
      pos.current = g.from - dx / Math.max(1, step())
      place()
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== g.id) return
      g.id = -1
      const dx = e.clientX - g.x
      const fast = Math.abs(dx) / Math.max(1, e.timeStamp - g.t) > SWIPE.flick
      const base = Math.round(g.from)
      glide(g.on && (Math.abs(dx) > step() * SWIPE.reach || fast) ? base - Math.sign(dx) : base)
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== g.id) return
      g.id = -1
      glide(Math.round(pos.current))
    }
    const click = (e: MouseEvent) => {
      if (g.moved <= 8) return
      e.preventDefault()
      e.stopPropagation()
      g.moved = 0
    }
    r.addEventListener('pointerdown', down)
    r.addEventListener('pointermove', move)
    r.addEventListener('pointerup', up)
    r.addEventListener('pointercancel', cancel)
    r.addEventListener('click', click, true)
    return () => {
      cancelAnimationFrame(anim.current)
      r.removeEventListener('pointerdown', down)
      r.removeEventListener('pointermove', move)
      r.removeEventListener('pointerup', up)
      r.removeEventListener('pointercancel', cancel)
      r.removeEventListener('click', click, true)
    }
  }, [glide, place, step])

  return (
    <section id="applications" ref={section} className="ways ways--apps on-yellow" data-stage-ahead="" data-stage-early="" data-screen="yellow" data-flow="" aria-labelledby="apps-title">
      <div className="ways__in fc-reveal is-in">
        <header className="ways__head">
          <h2 id="apps-title" className="ways__title">
            Built into three applications.
          </h2>
        </header>
        <div ref={rail} className="ways__rail" role="group" aria-roledescription="carousel" aria-label="The three applications">
          <ol className="ways__track">
            {APPLICATIONS.map((a, i) => (
              <li key={a.id} ref={(el) => void (cards.current[i] = el)} className={`ways__card ${front === i ? 'is-front' : ''}`} onFocus={() => front !== i && show(i)} onClick={openCard}>
                <div className="ways__model" aria-hidden="true">
                  {shots[i] ? (
                    <img className="ways__shot" src={shots[i]!} alt="" draggable={false} />
                  ) : (
                    near && (
                      <Suspense fallback={<img className="ways__still" src={a.image.src} alt="" style={{ objectPosition: a.image.position }} />}>
                        <AppModel id={a.id} play={play} live={liveOf[i]} still={a.image.src} onShot={onShot[i]} />
                      </Suspense>
                    )
                  )}
                </div>
                <p className="ways__count num">
                  0{i + 1} / 0{n}
                </p>
                <h3 className="ways__name">{a.title}</h3>
                <Link to={a.path} className="ways__go" aria-label={`Explore ${a.title}`} draggable={false}>
                  <Arrow />
                </Link>
              </li>
            ))}
          </ol>
        </div>
        <div className="ways__dots">
          {APPLICATIONS.map((a, i) => (
            <button key={a.id} type="button" className="ways__dot" aria-label={`Show ${a.title}`} aria-current={front === i} onClick={() => show(i)} />
          ))}
        </div>
      </div>
    </section>
  )
}

/** One warm-white screen: the three applications side by side, full height. */
export function Applications() {
  const compact = useIsCompact()
  return compact ? <PhoneApplications /> : <WideApplications />
}

function WideApplications() {
  const ref = useRef<HTMLElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const compact = useIsCompact()
  useScreen(ref, 'applications', 'light')
  // on a phone the three are cards in one continuous run; each rises in as it comes up from the foot of the screen (mobile.css)
  useMarkIn(list, '.app', compact)
  return (
    <section
      id="applications"
      ref={ref}
      className="apps"
      aria-labelledby="apps-title"
      data-screen="light"
      // a phone reads the cards at its own pace: the page is not brought to a screen inside them (lib/scroll.ts)
      data-flow={compact ? '' : undefined}
      data-reveal={compact ? '' : undefined}
    >
      <header className="apps__head">
        <h2 id="apps-title" className="apps__title">
          Built into three applications.
        </h2>
      </header>
      <ul ref={list} className="apps__row">
        {APPLICATIONS.map((a, i) => (
          <li key={a.id} className="app" style={{ '--i': i } as CSSProperties}>
            <Link to={a.path} className="app__link">
              <img className="app__img" src={compact ? a.image.small : a.image.src} alt={a.image.alt} loading="lazy" style={{ objectPosition: a.image.position }} />
              <span className="app__shade" aria-hidden="true" />
              <span className="app__index num">0{i + 1}</span>
              <span className="app__body">
                <span className="app__title">{a.title}</span>
                <span className="app__points">
                  {a.points.map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </span>
                <span className="app__more">
                  Explore
                  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                    <path d="M4 12 12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
