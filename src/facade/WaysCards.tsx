import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import './overview.css'
import './unitized/more-cards.css'
import { Link } from '../lib/router'
import { prefersReducedMotion } from '../lib/motion'
import { Arrow } from './Shell'
import { Words, useInView } from './Story'
import { useLive } from './unitized/live'

/**
 * A phone's close of a family's pages, shared by them all (the façade systems, the flooring applications): Home's row of
 * cards (its "ways"), the heading over a hairline, then a card a way in, in a row that goes round: swiped sideways a card
 * at a time, on past the last comes the first again (and back past the first, the last), the next one showing at the
 * edge. The row is the page's own, moved by the finger (the browser's scroll cannot go round): each card is set where the
 * row stands (`pos`), and one that goes out of sight on the left comes back round on the right. A card: its model in 3D
 * in its own canvas (`model`), filling the top; its number and name at the foot; and a round black button with a yellow
 * arrow, the way in. The card in front turns its model a little towards the visitor. Dashes under the row say which is in
 * front and take you to another. The models off the screen are made as the section comes near (`data-stage-ahead`).
 */

export interface WaysItem {
  id: string
  title: string
  /** where its way in goes; or, without one, what it does (`go`: Wall Panels' systems open their build on the page) */
  path?: string
  go?: () => void
  /** its number among all of the family's, and how many there are */
  num: number
  of: number
}

type WaysProps = {
  id?: string
  sectionRef?: RefObject<HTMLElement | null>
  /** the heading, in two lines */
  lines: [string, string]
  /** the way back to the family's overview (on its own pages) */
  overview?: { to: string; label: string }
  /** what the row is, for a screen reader */
  label: string
  items: WaysItem[]
  /** card `i`'s model: whether it is in front, whether the section has come into view, and whether it is on the screen */
  model: (i: number, front: boolean, play: boolean, live: { current: boolean }) => ReactNode
}

/** a swipe moves the row on a card if it goes this far (a share of a card) or this fast (px/ms); a glide's length (ms) */
const SWIPE = { reach: 0.14, flick: 0.35, glide: 560 }
const mod = (a: number, n: number) => ((a % n) + n) % n

/** a tap anywhere on a card (a drag is not one: the row swallows its click) goes where the card's way in goes */
function openCard(e: { currentTarget: HTMLElement; target: EventTarget }) {
  const go = e.currentTarget.querySelector<HTMLElement>('.ways__go')
  // (the way in itself takes its own tap)
  if (!go || (e.target as Element).closest?.('a, button')) return
  go.click()
}

export function WaysCards({ id, sectionRef, lines, overview, label, items, model }: WaysProps) {
  const n = items.length
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
    <section ref={section} id={id} className="ways on-yellow" data-stage-ahead="" aria-labelledby={`${id ?? 'ways'}-title`}>
      <div ref={ref} className={`ways__in fc-reveal ${inView ? 'is-in' : ''}`}>
        <header className="ways__head">
          <Words id={`${id ?? 'ways'}-title`} className="ways__title" lines={lines} />
          {overview && (
            <Link to={overview.to} className="ways__overview">
              {overview.label}
            </Link>
          )}
        </header>
        <div ref={rail} className="ways__rail" role="group" aria-roledescription="carousel" aria-label={label}>
          <ol className="ways__track">
            {items.map((it, i) => (
              // (a card's way in, reached by the keyboard, brings it to the front)
              <li key={it.id} ref={(el) => void (cards.current[i] = el)} className={`ways__card ${front === i ? 'is-front' : ''}`} onFocus={() => front !== i && show(i)} onClick={openCard}>
                <div className="ways__model" aria-hidden="true">
                  {/* (each model rises as soon as it is made, behind the loading screen, so it is standing by the time the row
                      is reached: rising only once the row came into view, the cards stood empty a moment, as if still loading) */}
                  {model(i, front === i, true, live)}
                </div>
                <p className="ways__count num">
                  0{it.num} / 0{it.of}
                </p>
                <h3 className="ways__name">{it.title}</h3>
                {it.path ? (
                  <Link to={it.path} className="ways__go" aria-label={`Explore ${it.title}`} draggable={false}>
                    <Arrow />
                  </Link>
                ) : (
                  <button type="button" className="ways__go" aria-label={`Explore ${it.title}`} onClick={it.go}>
                    <Arrow />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="ways__dots">
          {items.map((it, i) => (
            <button key={it.id} type="button" className="ways__dot" aria-label={`Show ${it.title}`} aria-current={front === i} onClick={() => show(i)} />
          ))}
        </div>
      </div>
    </section>
  )
}
