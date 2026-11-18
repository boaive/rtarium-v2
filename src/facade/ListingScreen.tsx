import { useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { damp, prefersReducedMotion } from '../lib/motion'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from './three/Stage3D'
import { createBus, type LabelBus } from './three/kit'
import { smooth, type Progress } from './progress'
import { useLive } from './unitized/live'
import { Zoom } from './unitized/Zoom'

/**
 * A phone: a few points, each with a 3D scene of its own (the Rainscreen barrier's, the Stud Frame components'), set as
 * the flooring pages' "Where the screed fails" (FailCards: FailScreen) and in its styles (`ffail`, minimal.css): one
 * black screen held while the page scrolls freely, the title at the top, the point in play under it (its name, its
 * line), its scene in the middle, a dash a point along the foot and its number large on the right. A screen of scroll
 * a point: its scene makes its one move as the page goes, eased toward where the scroll has it (as veedo's films), and
 * holds there for the rest. Nothing stops or settles the page.
 *
 * Every point's scene is made with the page (behind the loading screen), the scenes stacked in the one stage; the point
 * in play is shown, and only it draws as it plays.
 */

export interface ListingPoint {
  id: string
  /** (none: the line alone under the title, as the first point's on the wide screen) */
  name?: string
  line: string
  /** its own heading, set large in place of the section's title while it is in play (the Rainscreen barrier's, as it was) */
  head?: string
  /** what it is, small under its number at the foot (the wide screen's row: 'Water damage · Eliminated') */
  tag?: string
  Scene: ComponentType<{ t: Progress; bus: LabelBus; live: { current: boolean }; compact: boolean }>
  labels?: LabelSpec[]
  /**
   * snap: where its scene rests, a swipe each (shares of its move); by default one, played out ([1]). The barrier's first:
   * [0, 1], its whole wall in the rain as it arrives, then a swipe in to the corner
   */
  stops?: number[]
  /** drawn larger or smaller in the stage (Zoom): 1 as the scene frames itself */
  zoom?: number
}

/** in a point's screen of scroll, where its scene starts its move and where it has made it (then holds) */
const MOVE: [number, number] = [0.05, 0.75]

function Layer({ point, t, live, on, shadows }: { point: ListingPoint; t: Progress; live: { current: boolean }; on: boolean; shadows: boolean }) {
  const bus = useMemo(createBus, [])
  const { Scene } = point
  return (
    <div className={`fls__layer ${on ? 'is-on' : ''}`} aria-hidden="true">
      <Stage3D shadows={shadows} keyLight={false}>
        <Scene t={t} bus={bus} live={live} compact />
        {point.zoom && <Zoom by={point.zoom} />}
        {point.labels && <LabelProjector bus={bus} bottom={8} />}
      </Stage3D>
      {point.labels && <Labels bus={bus} labels={point.labels} shown={[]} />}
    </div>
  )
}

/**
 * `snap`: a stop a swipe (the Rainscreen barrier's, the user's, 18 Nov 2026), by the browser's own scroll snapping: a
 * half a screen of scroll for each stop of each point (`stops`), each stop a snap point the browser never lets a swipe
 * pass (`scroll-snap-stop: always`), so each swipe moves one stop on or back, natively, and nothing in code moves the page
 * (a code hold could not stop a phone's fling, and the swipe after it was not the page's to take). The scenes follow the
 * scroll between the stops, eased; the section's foot is no stop, so the page scrolls on from the last freely.
 */
export function ListingScreen({ id, title, points, shadows = false, snap = false }: { id: string; title: string; points: ListingPoint[]; shadows?: boolean; snap?: boolean }) {
  const n = points.length
  const section = useRef<HTMLElement>(null)
  const seen = useLive(section)
  const ts = useMemo<Progress[]>(() => points.map(() => ({ value: 0, listeners: new Set() })), [points])
  const at = useRef(0)
  // (each scene plays only while the section can be seen and its point is the one in play)
  const lives = useMemo(
    () =>
      points.map((_, i) => ({
        get current() {
          return seen.current && at.current === i
        },
      })),
    [points, seen],
  )
  const [k, setK] = useState(0)

  /** snap: every stop of every point, in order, a screen of scroll each */
  const seq = useMemo(() => (snap ? points.flatMap((p, j) => (p.stops ?? [1]).map((v) => [j, v] as const)) : []), [snap, points])

  // snap: the scenes follow the scroll from stop to stop (the browser's snapping carries the page a stop a swipe)
  useEffect(() => {
    const el = section.current
    if (!el || !snap) return
    const reduced = prefersReducedMotion()
    const m = seq.length
    const eased = points.map(() => 0)
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      // (read first, nothing written before it)
      const r = el.getBoundingClientRect()
      // (the scroll from one stop to the next: where the second snap point stands)
      const screen = el.querySelectorAll<HTMLElement>('.fls__snap')[1]?.offsetTop || window.innerHeight / 2
      const s = Math.min(m - 1, Math.max(0, -r.top / Math.max(1, screen)))
      const i = Math.min(m - 2, Math.floor(s))
      const f = s - i
      // where the page stands between two stops: one point's move part played, or (between two points) the one nearer
      const [ja, va] = seq[Math.max(0, i)]
      const [jb, vb] = seq[Math.min(m - 1, i + 1)]
      let j = ja
      let v = va
      if (m < 2) v = va
      else if (ja === jb) v = va + (vb - va) * (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2)
      else if (f >= 0.5) {
        j = jb
        v = vb
      }
      let moving = false
      points.forEach((_, q) => {
        const target = q < j ? 1 : q > j ? 0 : v
        // (a point come to shows from its start, not eased in from where it was left)
        if (q === j && at.current !== j && q > at.current) eased[q] = Math.min(eased[q], target)
        eased[q] = reduced ? target : damp(eased[q], target, 9.5, dt)
        if (Math.abs(eased[q] - target) < 1e-4) eased[q] = target
        else moving = true
        const t = ts[q]
        if (t.value !== eased[q]) {
          t.value = eased[q]
          t.listeners.forEach((g) => g())
        }
      })
      if (at.current !== j) {
        at.current = j
        setK(j)
        ts[j].listeners.forEach((g) => g())
      }
      if (moving) raf = requestAnimationFrame(tick)
    }
    const on = () => {
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [snap, seq, points, ts])

  useEffect(() => {
    const el = section.current
    if (!el || snap) return
    const reduced = prefersReducedMotion()
    const eased = points.map(() => 0)
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      // (read first, nothing written before it)
      const r = el.getBoundingClientRect()
      const run = Math.max(1, r.height - window.innerHeight)
      const s = Math.min(n - 1e-4, Math.max(0, (-r.top / run) * n))
      const i = Math.floor(s)
      let moving = false
      points.forEach((_, j) => {
        // the points passed have played out, the ones to come wait at their start
        const target = j < i ? 1 : j > i ? 0 : smooth(MOVE[0], MOVE[1], s - i)
        eased[j] = reduced ? target : damp(eased[j], target, 9.5, dt)
        if (Math.abs(eased[j] - target) < 1e-4) eased[j] = target
        else moving = true
        const t = ts[j]
        if (t.value !== eased[j]) {
          t.value = eased[j]
          t.listeners.forEach((f) => f())
        }
      })
      if (at.current !== i) {
        at.current = i
        setK(i)
        // (the point now in play drawn at once)
        ts[i].listeners.forEach((f) => f())
      }
      if (moving) raf = requestAnimationFrame(tick)
    }
    const on = () => {
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [snap, n, points, ts])

  const point = points[k]
  return (
    <section ref={section} id={id} className={`ffail fls ${snap ? 'fls--snap' : ''} on-black`} data-ground="black" data-no-top="" aria-labelledby={`${id}-title`} style={{ '--n': n, '--stops': seq.length } as CSSProperties}>
      {/* (snap: each stop's screen top, a point the browser's scrolling rests on and never passes in one swipe) */}
      {seq.map((_, i) => (
        <i key={i} className="fls__snap" style={{ '--i': i } as CSSProperties} aria-hidden="true" />
      ))}
      <div className="ffail__pin">
        <div className="fls__stage">
          {points.map((p, i) => (
            <Layer key={p.id} point={p} t={ts[i]} live={lives[i]} on={i === k} shadows={shadows} />
          ))}
        </div>
        <div className="ffail__top">
          <h2 key={point.head ? `h${point.id}` : 'title'} id={`${id}-title`} className={`ffail__title ${point.head ? 'fls__head' : ''}`}>
            {point.head ?? `${title}.`}
          </h2>
          <div key={point.id} className="ffail__words" aria-live="polite">
            {point.name && <h3 className="ffail__name">{point.name}</h3>}
            <p className="ffail__line">{point.line}</p>
          </div>
        </div>
        <ol className="ffail__dashes" aria-hidden="true">
          {points.map((p, i) => (
            <li key={p.id} className={i < k ? 'is-past' : i === k ? 'is-now' : ''} />
          ))}
        </ol>
        <p className="ffail__count num" aria-hidden="true">
          <b key={point.id}>0{k + 1}</b>
          <span>/ 0{n}</span>
        </p>
        {point.tag && (
          <p key={`t${point.id}`} className="fls__tag" aria-hidden="true">
            {point.tag}
          </p>
        )}
      </div>
    </section>
  )
}
