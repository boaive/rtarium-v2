import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus } from '../three/kit'
import { ScrubRig } from '../three/ScrubRig'
import { FollowScroll, smooth, useScrollProgress } from '../progress'
import { ARRIVE, BurstUnit, CAST, CLOSE, NUMBER, burstAt, burstShot } from '../three/unit/BurstUnit'
import { BUILD, type Layer } from '../three/unit/parts'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { Arrow } from '../Shell'
import { useCornerBox, useLive } from './live'
import { paintCards } from './stack'

/**
 * Six layers, one unit, on yellow. Pinned for its run: on the left the layers as sticky stacking
 * cards in the order the unit is put together (06, the mounting frame, first); on the right the unit
 * in a black studio box that opens out of its corner as the section arrives and closes into it as it
 * leaves. As each layer is lowered in front of the last, its card comes up from the foot of the
 * cards' box over the card before, whose heading stays in view; the thin panel comes as RTARIUM
 * first, then its concrete. In the box, quietly: which layer is in (top left), a step back or on
 * (top right), and the six along its foot in the order they stand in the unit, each line filling
 * as its layer comes in, from the frame on the right to the panel on the left. All of it follows
 * the scroll; a step, like a card, takes the page there.
 */

export const LAYER_NAME: Record<Layer, string> = {
  panel: 'Thin panel',
  insulation: 'Insulation',
  vapour: 'Vapour barrier',
  gasket: 'Gasket',
  window: 'Glazing window',
  frame: 'Mounting frame',
}

const LAYER_LINE: Record<Layer, string> = {
  frame: 'Carries the unit and hangs it from the slab.',
  window: 'Glazed off-site and fixed in the frame.',
  gasket: 'Seals the joints against wind and rain.',
  vapour: 'Stops indoor moisture reaching the insulation.',
  insulation: 'Keeps the heat in, behind the thin panel.',
  panel: 'RTARIUM textile, cast in 20 mm of concrete.',
}

const LABELS: LabelSpec[] = [
  ...BUILD.map((l) => ({ id: `n-${l}`, anchor: `b-${l}`, text: null, num: NUMBER[l], dx: -18, dy: -30 })),
  { id: 'mark', anchor: 'b-thick', text: '20 mm', dx: 44, dy: -40 },
  // the textile in the cut, marked as the skin is: out into the room left of the unit
  { id: 'rtarium', anchor: 'b-mesh', text: 'RTARIUM', dx: -48, dy: -44 },
]

/** the run of the section, in screens: long enough that each layer has its own stretch of scroll */
const RUN = 5.6

/** where the page rests once a layer is in (a fraction of the run) */
const restP = (l: Layer) => (l === 'panel' ? CAST[1] + 0.012 : ARRIVE[BUILD.indexOf(l)][1] + 0.008)
/** where a step back or on can take the page: each layer in, RTARIUM before its concrete, the unit closed */
const STOPS = [...BUILD.slice(0, -1).map(restP), ARRIVE[BUILD.length - 1][1] + 0.008, restP('panel'), CLOSE[1] + 0.01]
/** how near a stop counts as at it */
const NEAR = 0.006
/** the track along the box's foot reads as the unit stands in it: the thin panel on the left, the frame on the right */
const SEEN = [...BUILD].reverse()
/** the camera stands a little further off than the shots ask, so the unit has room round it in the box */
const ROOM = 1.08

export function Layers() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const rx = useRef<HTMLSpanElement>(null)
  const ry = useRef<HTMLSpanElement>(null)
  const [progress] = useScrollProgress(section, 1, 'run')
  const bus = useMemo(createBus, [])
  const live = useLive(box)
  const [focus, setFocus] = useState<Layer | null>(null)
  const shotAt = useMemo(
    () => (p: number) => {
      const s = burstShot(p, compact)
      return { ...s, dist: s.dist * ROOM }
    },
    [compact],
  )
  useCornerBox(section, box, rx, ry)

  const deck = useRef<HTMLOListElement>(null)
  const cards = useRef<(HTMLLIElement | null)[]>([])
  const count = useRef<HTMLSpanElement>(null)
  const current = useRef<HTMLSpanElement>(null)
  const track = useRef<(HTMLLIElement | null)[]>([])
  const back = useRef<HTMLButtonElement>(null)
  const on = useRef<HTMLButtonElement>(null)
  /** the stop a step last sent the page to, while it is on its way there */
  const aim = useRef({ p: -1, t: 0 })

  // the cards, the box's read-outs and its track follow the run, as the unit does
  useEffect(() => {
    let shown = ''
    const paint = () => {
      const p = progress.value
      const { arrive, cast, close } = burstAt(p)
      const a = arrive.map((v) => smooth(0, 1, Math.min(1, v * 1.15)))
      paintCards(deck.current, cards.current, a)
      let latest = -1
      a.forEach((v, k) => v > 0.5 && (latest = k))
      cards.current.forEach((c, k) => c?.toggleAttribute('data-current', k === latest))
      // the track: each line fills as its layer comes in (the panel's with its concrete too)
      const all = close > 0.5
      track.current.forEach((c, k) => {
        if (!c) return
        const f = k === BUILD.length - 1 ? a[k] * 0.5 + cast * 0.5 : a[k]
        c.style.setProperty('--f', f.toFixed(4))
        const state = all || k < latest ? 'past' : k === latest ? 'now' : 'next'
        if (c.dataset.state !== state) c.dataset.state = state
      })
      // a step back or on, while there is one
      const atStart = p <= STOPS[0] + NEAR
      const atEnd = p >= STOPS[STOPS.length - 1] - NEAR
      back.current?.setAttribute('aria-disabled', String(atStart))
      on.current?.setAttribute('aria-disabled', String(atEnd))
      const now = latest < 0 ? '' : all ? 'all' : `${BUILD[latest]}${BUILD[latest] === 'panel' && cast < 0.5 ? '-mesh' : ''}`
      if (now !== shown) {
        shown = now
        const n = now === 'all' ? 'One unit' : latest < 0 ? '' : `${String(NUMBER[BUILD[latest]]).padStart(2, '0')} / 06`
        const name = now === 'all' ? 'Six layers, closed' : latest < 0 ? '' : now === 'panel-mesh' ? 'RTARIUM, before the concrete' : LAYER_NAME[BUILD[latest]]
        if (count.current) count.current.textContent = n
        if (current.current) current.current.textContent = name
      }
    }
    paint()
    progress.listeners.add(paint)
    window.addEventListener('resize', paint)
    return () => {
      progress.listeners.delete(paint)
      window.removeEventListener('resize', paint)
    }
  }, [progress])

  /** the page's scroll for a point of the run */
  const yAt = (p: number) => {
    const el = section.current
    if (!el) return 0
    return el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * p
  }
  const restAt = (l: Layer) => yAt(restP(l))

  /** a step back or on: from where the last step was going, if the page is still on its way */
  const step = (dir: 1 | -1) => {
    const from = performance.now() - aim.current.t < 1200 ? aim.current.p : progress.value
    const to = dir > 0 ? STOPS.find((s) => s > from + NEAR) : [...STOPS].reverse().find((s) => s < from - NEAR)
    if (to === undefined) return
    aim.current = { p: to, t: performance.now() }
    scrollToY(yAt(to))
  }

  const point = (l: Layer) => ({
    onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && setFocus(l),
    onPointerLeave: (e: PointerEvent) => e.pointerType === 'mouse' && setFocus(null),
    onFocus: () => setFocus(l),
    onBlur: () => setFocus(null),
    onClick: () => scrollToY(restAt(l)),
  })

  return (
    <section ref={section} id="layers" className="fu-layers on-yellow" aria-labelledby="fu-layers-title" style={{ '--run': RUN } as CSSProperties}>
      <div className="fu-layers__pin">
        <div className="fu-layers__copy">
          <h2 id="fu-layers-title" className="fu-layers__title">
            Six layers,
            <br /> one unit.
            <ReviewNote>{REVIEW.layerOrder}</ReviewNote>
          </h2>

          {/* the cards: the layers in the order the unit is put together, the frame first */}
          <ol ref={deck} className="fu-deck fu-deck--layers" aria-label="The layers, in the order the unit is put together" style={{ '--n': BUILD.length } as CSSProperties}>
            {BUILD.map((l, k) => (
              <li key={l} ref={(el) => void (cards.current[k] = el)} className="fu-card" style={{ zIndex: k + 1 }}>
                <button type="button" className="fu-card__btn" {...point(l)}>
                  <span className="fu-card__head">
                    <span className="fu-card__num num">{String(NUMBER[l]).padStart(2, '0')}</span>
                    <span className="fu-card__name">{LAYER_NAME[l]}</span>
                  </span>
                  <span className="fu-card__body">{LAYER_LINE[l]}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <figure className="fu-sheet" aria-label="The unit, put together layer by layer">
          <div ref={box} className="fu-box fu-sheet__box">
            <div className="fu-box__clip fu-sheet__view on-black">
              <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-back.webp" alt="" />}>
                <ScrubRig progress={progress} shotAt={shotAt} sway={1.5} live={live} />
                <MovingKeyLight focus={[1.2, 1.6, 1.6]} reach={6.5} offset={[-5, 10, 8]} />
                <BurstUnit progress={progress} focus={focus} bus={bus} live={live} />
                <FollowScroll progress={progress} />
                <LabelProjector bus={bus} bottom={compact ? 40 : 76} />
              </Stage3D>
              <Labels bus={bus} labels={LABELS} shown={[]} />

              {/* which layer is in: its number of the six, and its name */}
              <p className="fu-sheet__now" aria-live="polite">
                <span ref={count} className="num" />
                <span ref={current} className="fu-sheet__name" />
              </p>

              {/* a layer back or on: the page scrolls there */}
              <div className="fu-sheet__steps">
                <button ref={back} type="button" className="fu-sheet__go fu-sheet__go--back" aria-label="Previous layer" onClick={() => step(-1)}>
                  <Arrow />
                </button>
                <button ref={on} type="button" className="fu-sheet__go" aria-label="Next layer" onClick={() => step(1)}>
                  <Arrow />
                </button>
              </div>

              {/* the six along the foot, in the order they stand in the unit (the frame, which goes on first, on
                  the right): each line fills from the right as its layer comes in */}
              <ol className="fu-track" aria-label="Go to a layer">
                {SEEN.map((l) => (
                  <li key={l} ref={(el) => void (track.current[BUILD.indexOf(l)] = el)} className="fu-track__cell" data-state="next">
                    <button type="button" className="fu-track__btn" {...point(l)}>
                      <span className="fu-track__line" aria-hidden="true" />
                      <span className="fu-track__name">{LAYER_NAME[l]}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <i className="fu-box__dot" aria-hidden="true">
              <span ref={rx} className="fu-box__x num" />
              <span ref={ry} className="fu-box__y num" />
            </i>
          </div>
        </figure>
      </div>
    </section>
  )
}
