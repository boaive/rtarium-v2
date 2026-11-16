import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import '../overview.css'
import './more-cards.css'
import { Link } from '../../lib/router'
import { prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { Arrow } from '../Shell'
import { Words, useInView } from '../Story'
import { FACADE, SYSTEMS, type SystemId } from '../content'
import { Stage3D } from '../three/Stage3D'
import { SystemsTrio } from '../three/SystemsTrio'
import { useLive } from './live'

/**
 * Two more ways onto a building, in the overview's own systems block (`fct`): the heading and the way
 * back to the overview in the first column, the other two systems in the next two, each with its model
 * over it, seen from the same diagonal, its number as on the overview, its line and Explore. Pointing at
 * a column fills it yellow and turns its model towards the visitor; the whole column is the link's.
 * `current` is the page's own system, left out; with none (the overview itself) it is all three, "Three ways onto a
 * building", and no way back. The models are tall (a panel bay, a unit), so their band starts at the section's line
 * and takes more of its height, and each keeps clear room above it. The same on every page: a band under the
 * header, its line, the whole screen. A phone has its own: a row of cards swiped sideways (MoreCards).
 */

type MoreProps = { current?: SystemId | null; id?: string; sectionRef?: RefObject<HTMLElement | null> }

export function More(props: MoreProps) {
  return useIsCompact() ? <MoreCards {...props} /> : <MoreColumns {...props} />
}

/** the systems shown (all but the page's own) and whether that is all of them */
function picked(current: SystemId | null) {
  const pick = SYSTEMS.map((_, n) => n).filter((n) => SYSTEMS[n].id !== current)
  return { pick, all: pick.length === SYSTEMS.length }
}

function MoreColumns({ current = 'unitized', id, sectionRef }: MoreProps) {
  const { pick, all } = picked(current)
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -20% 0px')
  const own = useRef<HTMLElement>(null)
  const section = sectionRef ?? own
  const live = useLive(section)
  const [hover, setHover] = useState<number | null>(null)
  // each model takes more of its column than it would of the overview's old band of three; two to a band the most
  const fill = all ? 0.62 : 0.7

  return (
    <section ref={section} id={id} className={`fct fu-more fu-more--tall ${all ? 'fu-more--all' : ''} on-light`} aria-labelledby="fu-more-title">
      <div ref={ref} className={`fu-more__grid fc-reveal ${inView ? 'is-in' : ''}`}>
        <header className="fu-more__head">
          <Words id="fu-more-title" className="fct__title fu-more__title" lines={all ? ['Three ways', 'onto a building.'] : ['Two more ways', 'onto a building.']} />
          {!all && (
            <Link to={FACADE.path} className="fu-more__overview">
              Façade & Cladding overview
            </Link>
          )}
        </header>
        <div className="fct__stage fu-more__stage">
          <div className="fct__canvas" aria-hidden="true">
            <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-ivory.webp" alt="" />}>
              <SystemsTrio play={inView} hover={hover} live={live} pick={pick} fill={fill} headroom={0.13} />
            </Stage3D>
          </div>
          <ol className="fct__cols fu-more__cols">
            {pick.map((n, i) => {
              const s = SYSTEMS[n]
              return (
                <li
                  key={s.id}
                  className={`fct-col ${hover === i ? 'is-hover' : ''}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                >
                  <div className="fct-col__text">
                    <span className="fct-col__num num">0{n + 1}</span>
                    <h3 className="fct-col__name">{s.title}</h3>
                    <p className="fct-col__line">{s.short}</p>
                    <Link to={s.path} className="fc-go fct-col__go">
                      <span className="fc-go__label">Explore</span>
                      <span className="fc-go__cell" aria-hidden="true">
                        <Arrow />
                      </span>
                    </Link>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}

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
 * On a phone: the heading over a hairline, then the systems as cards in a row that goes round: swiped sideways a card at
 * a time, on past the last comes the first again (and back past the first, the last), the next one showing at the edge.
 * The row is the page's own, moved by the finger (the browser's scroll cannot go round): each card is set where the row
 * stands (`pos`), and one that goes out of sight on the left comes back round on the right. A card: its model in 3D in
 * its own canvas, so it goes with the card exactly, filling the top; its number and name at the foot; and a round black
 * button with a yellow arrow, the way in. The card in front turns its model a little towards the visitor. Dashes under
 * the row, on the left, say which is in front, yellow, and take you to another. The models off the screen are made as
 * the section comes near (`data-stage-ahead`), so a swipe never waits on one.
 */
function MoreCards({ current = 'unitized', id, sectionRef }: MoreProps) {
  const { pick, all } = picked(current)
  const n = pick.length
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -20% 0px')
  const own = useRef<HTMLElement>(null)
  const section = sectionRef ?? own
  const live = useLive(section)
  const rail = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLLIElement | null)[]>([])
  const [front, setFront] = useState(0)
  /** where the row stands: the card in front, between two while it moves (it counts on past the last) */
  const pos = useRef(0)
  const anim = useRef(0)

  /** a card's width and the gap after it */
  const step = useCallback(() => {
    const r = rail.current
    const w = cards.current[0]?.offsetWidth ?? 0
    return w + (r ? parseFloat(getComputedStyle(r).getPropertyValue('--ways-gap')) || 0 : 0)
  }, [])
  // each card where the row stands: from the left seam (`lo`, out of sight) round to the right; a card fades in from the
  // seam, so going round it is never seen (with two, the seam is half a card to the left, where one is still in sight)
  const place = useCallback(() => {
    const s = step()
    const lo = n >= 3 ? -1 : -0.5
    cards.current.forEach((c, i) => {
      if (!c) return
      const o = mod(i - pos.current - lo, n) + lo
      c.style.transform = `translate3d(${(o * s).toFixed(1)}px, 0, 0)`
      c.style.opacity = String(Math.min(1, Math.max(0, (o - lo) / 0.5)))
    })
    setFront(mod(Math.round(pos.current), n))
  }, [n, step])

  /** the row glides to stand at `to` (a whole card), settling softly */
  const glide = useCallback(
    (to: number) => {
      cancelAnimationFrame(anim.current)
      const from = pos.current
      const end = () => {
        // (counted round again, so the count never runs away)
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
  /** to card `i` the shorter way round */
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

  // the finger: a sideways drag moves the row with it, and as it lets go the row goes on a card that way (or back, a
  // small one); an upright one is the page's scroll (touch-action: pan-y), let go at once
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
        // (a pointer already gone, a quick flick, cannot be held: the drag goes on without it)
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
    // (a drag that ends over a card's button is not a press of it)
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
    <section ref={section} id={id} className="ways on-yellow" data-stage-ahead="" aria-labelledby="fu-more-title">
      <div ref={ref} className={`ways__in fc-reveal ${inView ? 'is-in' : ''}`}>
        <header className="ways__head">
          <Words id="fu-more-title" className="ways__title" lines={all ? ['Three ways', 'onto a building.'] : ['Two more ways', 'onto a building.']} />
          {!all && (
            <Link to={FACADE.path} className="ways__overview">
              Façade & Cladding overview
            </Link>
          )}
        </header>
        <div ref={rail} className="ways__rail" role="group" aria-roledescription="carousel" aria-label="The façade systems">
          <ol className="ways__track">
            {pick.map((n, i) => {
              const s = SYSTEMS[n]
              return (
                // (a card's way in, reached by the keyboard, brings it to the front)
                <li key={s.id} ref={(el) => void (cards.current[i] = el)} className={`ways__card ${front === i ? 'is-front' : ''}`} onFocus={() => front !== i && show(i)} onClick={openCard}>
                  <div className="ways__model" aria-hidden="true">
                    <Stage3D shadows keyLight={false} fallback={<img className="ways__still" src="/img/facade/panel-ivory.webp" alt="" />}>
                      <SystemsTrio play={inView} hover={front === i ? 0 : null} live={live} pick={[n]} fill={0.86} headroom={0.02} />
                    </Stage3D>
                  </div>
                  <p className="ways__count num">
                    0{n + 1} / 0{SYSTEMS.length}
                  </p>
                  <h3 className="ways__name">{s.title}</h3>
                  <Link to={s.path} className="ways__go" aria-label={`Explore ${s.title}`} draggable={false}>
                    <Arrow />
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>
        <div className="ways__dots">
          {pick.map((n, i) => (
            <button key={n} type="button" className="ways__dot" aria-label={`Show ${SYSTEMS[n].title}`} aria-current={front === i} onClick={() => show(i)} />
          ))}
        </div>
      </div>
    </section>
  )
}
