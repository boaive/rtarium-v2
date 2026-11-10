import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY } from '../lib/scroll'
import { Arrow } from '../facade/Shell'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus } from '../facade/three/kit'
import { sectionY, type Progress } from '../facade/progress'
import { useCornerBox, useLive } from '../facade/unitized/live'
import { HintTag, StepBar, type Hint } from '../facade/unitized/StepBar'
import { paintCards } from '../facade/unitized/stack'
import { ORDER100, ORDER30, PieceStage, RUN_AT, STILL100, STILL30 } from './three/PieceStage'
import type { Room } from './three/fit'
import { Block, Figures, Sheet, Steps, useSheet } from './Sheet'
import { PanelPlan, Section100, Section30, TiePlate } from './Diagrams'
import { PAIRED, REVIEW, SOLID } from './content'

/**
 * The panels, on yellow, pinned for a short run, in the format of the Unitized page's six layers: on the left the
 * panel's name, every part of it in a table, its figures and the way to its technical sheet; on the right the panel in
 * a black studio box: its parts numbered on the model, which one is chosen at the top left, a part back or on at the top
 * right, the parts along the foot. Under them both, a bar with the two panels, so the visitor knows from the start that
 * there are two.
 *
 * Two bursts, one after the other, the scroll their clock: the solid panel stands whole, then opens; it rests, and its
 * table can be clicked, each part showing where it is on the panel; the scroll goes on and it closes, divides, takes its
 * core, joins and opens as the SIP insulated panel, which rests the same way. On a phone there is no run: the panel
 * rests opened, and an arrow takes it on to the other.
 */

/** the word in the box: how to go through the parts */
const HOW: Hint = { text: 'Scroll or use the arrows', icon: 'scroll' }

interface Part {
  /** the model's anchor */
  id: string
  name: string
  /** its name along the box's foot */
  short: string
  value: string
  /** where its number stands from its point (px) */
  dx: number
  dy: number
}
const PARTS30: Part[] = [
  { id: 'pp-cover', name: 'Cover, inner face', short: 'Inner cover', value: '7.5 mm', dx: -8, dy: -30 },
  { id: 'pp-tie', name: 'Tie hole, to lift by', short: 'Tie hole', value: '20 mm', dx: -40, dy: 26 },
  { id: 'pp-ferrule', name: 'Ferrule inserts, for fixing', short: 'Ferrules', value: 'M8', dx: -44, dy: -22 },
  { id: 'pp-zone', name: 'RTARIUM, 3D basalt mesh', short: 'RTARIUM', value: '15 mm', dx: -8, dy: -30 },
  { id: 'pp-grp', name: 'GRP grid: 4 rods 120 mm apart, across every 600', short: 'GRP grid', value: '3 mm', dx: 40, dy: 30 },
  { id: 'pp-back', name: 'Cover, outer face', short: 'Outer cover', value: '7.5 mm', dx: -8, dy: -30 },
]
const PARTS100: Part[] = [
  { id: 'pp-inner7', name: 'Cover, inner face', short: 'Inner cover', value: '7 mm', dx: -8, dy: -30 },
  { id: 'pp-ferrule100', name: 'Ferrule inserts, for fixing', short: 'Ferrules', value: 'M8', dx: -44, dy: 22 },
  { id: 'pp-mesh6i', name: 'RTARIUM, 3D basalt mesh', short: 'RTARIUM', value: '6 mm', dx: -8, dy: -30 },
  { id: 'pp-rod', name: 'GRP rods: along, 100 mm in; across at each clip', short: 'GRP rods', value: '3 mm', dx: 6, dy: 36 },
  { id: 'pp-cover2', name: 'Cover', short: 'Cover', value: '2 mm', dx: -8, dy: -30 },
  { id: 'pp-clip', name: 'GI tie-clip: joins two meshes with concrete', short: 'Tie-clip', value: '2 mm plate', dx: 44, dy: 26 },
  { id: 'pp-core', name: 'EPS/SPS core, stay-in-place', short: 'Core', value: '70 mm', dx: -8, dy: -30 },
  { id: 'pp-outer', name: 'Outer leaf: 2 + 6 + 7', short: 'Outer leaf', value: '15 mm', dx: -8, dy: -30 },
]
const LABELS: LabelSpec[] = [
  ...PARTS30.map((p, i) => ({ id: `a${i}`, anchor: p.id, text: null, num: i + 1, dx: p.dx, dy: p.dy })),
  ...PARTS100.map((p, i) => ({ id: `b${i}`, anchor: p.id, text: null, num: i + 1, dx: p.dx, dy: p.dy })),
]
// (the lists' order is the model's)
if (import.meta.env.DEV && (PARTS30.some((p, i) => p.id !== ORDER30[i]) || PARTS100.some((p, i) => p.id !== ORDER100[i]))) console.warn('Panels: the parts lists are out of the model\'s order')

/**
 * The run, in screens of scroll, as the Unitized page's six layers: the solid panel opens; then its parts, a scroll each,
 * each card coming up as its part is shown on the model; then it closes, takes its core and opens as the SIP panel, its
 * cards cleared; then its parts, a scroll each, its cards coming up anew.
 */
const OPEN: [number, number] = [0.1, 1.1]
/** a part's stretch of scroll, and how much of it its card takes to come up */
const PART = 0.75
const COME = 0.5
const FROM30 = 1.2
/** after its last part, the panel closes up whole: one scroll more */
const WHOLE30: [number, number] = [FROM30 + PARTS30.length * PART + 0.05, FROM30 + PARTS30.length * PART + 0.65]
const CHANGE_S: [number, number] = [WHOLE30[1] + 0.35, WHOLE30[1] + 2.15]
const FROM100 = CHANGE_S[1] + 0.2
const WHOLE100: [number, number] = [FROM100 + PARTS100.length * PART + 0.05, FROM100 + PARTS100.length * PART + 0.65]
const SCROLL = WHOLE100[1] + 0.12
/** screens the section takes: the scroll, and the one it stands on */
const RUN = SCROLL + 1
/** a part's card arrived: where the page rests for it (screens) */
const restS = (which: 30 | 100, k: number) => (which === 30 ? FROM30 : FROM100) + k * PART + COME + 0.02
/** the page's stops through the section: each part of each panel (fractions of the run) */
const STOPS = [...PARTS30.map((_, k) => restS(30, k)), WHOLE30[1] + 0.02, ...PARTS100.map((_, k) => restS(100, k)), WHOLE100[1] + 0.02].map((x) => x / SCROLL)
/** where each panel stands whole, closed up after its parts */
const wholeAt = (x: number) => (x >= WHOLE30[0] && x < CHANGE_S[0]) || x >= WHOLE100[0]
/** where each panel's bar step takes the page: its first part */
const REST = [STOPS[0], STOPS[PARTS30.length + 1]] as const

const ramp = ([a, b]: readonly [number, number], v: number) => Math.min(1, Math.max(0, (v - a) / (b - a)))
/** the panel's sequence at a point of the scroll: opening, resting through its parts, changing over, resting again */
const tAt = (x: number) =>
  x < WHOLE30[0]
    ? STILL30 * ramp(OPEN, x)
    : x < CHANGE_S[0]
      ? RUN_AT.close30[0] + (RUN_AT.close30[1] - RUN_AT.close30[0]) * ramp(WHOLE30, x)
      : x < WHOLE100[0]
        ? RUN_AT.close30[1] + (STILL100 - RUN_AT.close30[1]) * ramp(CHANGE_S, x)
        : RUN_AT.close100[0] + (RUN_AT.close100[1] - RUN_AT.close100[0]) * ramp(WHOLE100, x)
/** the name, the table and the figures change over as the panel takes its core */
const SWAP = (RUN_AT.divide[0] + RUN_AT.core[1]) / 2
/** each card's arrival at a point of the scroll: the panel's own, from its first part on */
const arrivals = (which: 30 | 100, x: number) =>
  (which === 30 ? PARTS30 : PARTS100).map((_, k) => {
    const a = (which === 30 ? FROM30 : FROM100) + k * PART
    return ramp([a, a + COME], x)
  })
/** how near a stop counts as at it */
const NEAR = 0.004

/** on a phone: how much of the panel's change goes by in a second, when the arrow takes it to the other panel */
const CHANGE = 0.21

export function Panels() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const rx = useRef<HTMLSpanElement>(null)
  const ry = useRef<HTMLSpanElement>(null)
  const live = useLive(box)
  useCornerBox(section, box, rx, ry)
  const t = useMemo<Progress>(() => ({ value: compact ? STILL30 : 0, listeners: new Set() }), [compact])
  const bus = useMemo(createBus, [])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  /** a part asked for while the panel was on its way: chosen once it rests */
  const want = useRef<number | null>(null)
  /** which panel is shown, and which of its parts is chosen */
  const [which, setWhich] = useState<30 | 100>(30)
  const [part, setPart] = useState<number | null>(null)
  /** the panel closed up whole, after its parts */
  const [closed, setClosed] = useState(false)
  /** the panel has come to rest, opened: its parts can be numbered */
  const [still, setStill] = useState(compact)
  /** the part the model holds whole, read by it every frame */
  const focus = useRef<string | null>(null)
  /** the room the panel keeps to in its box: clear of the read-outs at the top and the parts along the foot */
  const room = useRef<Room>({ x: 0.04, y: 0.1, w: 0.92, h: 0.74 })
  const deck = useRef<HTMLOListElement>(null)
  const track = useRef<(HTMLLIElement | null)[]>([])
  /** where the run stands, and the stop a step last sent the page to while it is on its way there */
  const aimP = useRef(0)
  const aim = useRef({ p: -1, t: 0 })
  const cards = useRef<(HTMLLIElement | null)[]>([])
  const [solidSheet, openSolid] = useSheet()
  const [sipSheet, openSip] = useSheet()

  const parts = which === 30 ? PARTS30 : PARTS100
  const prefix = which === 30 ? 'a' : 'b'
  focus.current = part === null ? null : parts[part].id

  // the run: the page's scroll is the panel's clock
  useEffect(() => {
    const el = section.current
    if (!el || compact) return
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let p = -1
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const r = el.getBoundingClientRect()
      const target = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)))
      // (the page already glides; the panel follows it a little behind, so a wheel's tick never jumps the layers)
      p = p < 0 || reduced ? target : damp(p, target, 6.5, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      const x = p * SCROLL
      const v = tAt(x)
      if (t.value !== v) {
        t.value = v
        t.listeners.forEach((f) => f())
      }
      const w: 30 | 100 = v > SWAP ? 100 : 30
      setWhich(w)
      setStill(v === STILL30 || v === STILL100)
      // the cards come up a part a scroll; the part on the model is the newest card's
      const a = arrivals(w, x).map((u) => (reduced ? Math.round(u) : 1 - Math.pow(1 - u, 3)))
      paintCards(deck.current, cards.current.slice(0, a.length), a)
      const whole = wholeAt(x)
      let latest = -1
      a.forEach((u, k) => u > 0.5 && (latest = k))
      cards.current.slice(0, a.length).forEach((c, k) => c?.toggleAttribute('data-current', !whole && k === latest))
      setPart(latest < 0 || whole ? null : latest)
      setClosed(whole)
      // the track along the box's foot: each line fills as its part comes in
      track.current.slice(0, a.length).forEach((c, k) => {
        if (!c) return
        c.style.setProperty('--f', a[k].toFixed(4))
        const state = whole || k < latest ? 'past' : k === latest ? 'now' : 'next'
        if (c.dataset.state !== state) c.dataset.state = state
      })
      // the bar: each panel's cell fills through its parts, full at its last
      cells.current[0]?.style.setProperty('--f', ramp([0, WHOLE30[1]], x).toFixed(4))
      cells.current[1]?.style.setProperty('--f', ramp([CHANGE_S[0], WHOLE100[1]], x).toFixed(4))
      aimP.current = p
      if (p !== target) raf = requestAnimationFrame(tick)
    }
    const on = () => {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [compact, t])

  // a part stays chosen only while its panel rests; one asked for on the way is chosen on arrival
  useEffect(() => {
    if (!compact) return
    if (!still) setPart(null)
    else if (want.current !== null) {
      setPart(want.current)
      want.current = null
    }
  }, [still, compact])

  // the deck changes over with the panel: painted at once by the clock, never left as it was
  useEffect(() => {
    if (compact) return
    window.dispatchEvent(new Event('scroll'))
  }, [compact, which])

  // on a phone, the arrow: the panel closes, divides, takes its core, joins and opens again (or back), in time
  useEffect(() => {
    if (!compact) return
    const goal = which === 30 ? STILL30 : STILL100
    if (t.value === goal) return
    if (prefersReducedMotion()) {
      t.value = goal
      t.listeners.forEach((f) => f())
      setStill(true)
      return
    }
    setStill(false)
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      const step = CHANGE * dt
      const v = t.value
      t.value = Math.abs(goal - v) <= step ? goal : v + Math.sign(goal - v) * step
      t.listeners.forEach((f) => f())
      if (t.value === goal) setStill(true)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [compact, which, t])

  /** to a panel, at its rest */
  const show = (next: 30 | 100) => {
    const el = section.current
    setPart(null)
    if (compact) setWhich(next)
    else if (el) scrollToY(sectionY(el, REST[next === 30 ? 0 : 1]))
  }
  /** to a part of a panel: on a desktop the page scrolls to it, as a layer's card does on the six layers */
  const goPart = (w: 30 | 100, k: number) => {
    const el = section.current
    if (!el) return
    const at = restS(w, k) / SCROLL
    aim.current = { p: at, t: performance.now() }
    scrollToY(sectionY(el, at))
  }
  /** a part back or on: from where the last step was going, if the page is still on its way */
  const step = (dir: 1 | -1) => {
    if (compact) {
      if (!still) return show(which)
      const k = part === null ? (dir > 0 ? -1 : parts.length) : part
      const n = k + dir
      if (n >= 0 && n < parts.length) setPart(n)
      else if (dir > 0 && which === 30) show(100)
      else if (dir < 0 && which === 100) show(30)
      return
    }
    const el = section.current
    if (!el) return
    const from = performance.now() - aim.current.t < 1200 ? aim.current.p : aimP.current
    const to = dir > 0 ? STOPS.find((v) => v > from + NEAR) : [...STOPS].reverse().find((v) => v < from - NEAR)
    if (to === undefined) return
    aim.current = { p: to, t: performance.now() }
    scrollToY(sectionY(el, to))
  }
  const atStart = which === 30 && (part === null || part === 0)
  const atEnd = which === 100 && part === parts.length - 1

  const shown = still ? parts.map((_, i) => `${prefix}${i}`) : []
  const pick = (i: number) => {
    if (!compact) return goPart(which, i)
    if (still) setPart((p) => (p === i ? null : i))
    else {
      want.current = i
      show(which)
    }
  }

  return (
    <>
      <section
        ref={section}
        id="panels"
        className="fu-layers wp-panels on-yellow"
        // the page's one scroll a step: each part of each panel, as the six layers' each layer
        data-stops={compact ? undefined : STOPS.map((v) => v.toFixed(5)).join(',')}
        data-no-top=""
        aria-labelledby="wp-panels-title"
        style={{ '--run': compact ? 1 : RUN } as CSSProperties}
      >
        <div className="fu-layers__pin">
          <div className="fu-layers__copy wp-panels__side">
            <div key={`name-${which}`} className="wp-panels__head">
              <h2 id="wp-panels-title" className="fu-layers__title">
                {which === 30 ? SOLID.name : PAIRED.name}
              </h2>
              <p className="wp-panels__thick num">{which === 30 ? '30 mm' : '100 mm'}</p>
            </div>

            {/* the panel's parts, as the six layers' cards: they come up one by one once the panel rests, and anew for
                the other panel; each one shows where it is on the panel */}
            {compact ? (
              <ol key={`parts-${which}`} className="wp-parts" aria-label="The panel's parts">
                {parts.map((p, i) => (
                  <li key={p.id}>
                    <button type="button" className="wp-parts__row" aria-pressed={part === i} onClick={() => pick(i)}>
                      <span className="wp-parts__num num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="wp-parts__name">{p.name}</span>
                      <span className="wp-parts__value">{p.value}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <ol
                key={`deck-${which}`}
                ref={deck}
                className="fu-deck fu-deck--layers wp-deck"
                aria-label="The panel's parts"
                style={{ '--n': parts.length } as CSSProperties}
              >
                {parts.map((p, i) => (
                  <li key={p.id} ref={(el) => void (cards.current[i] = el)} className="fu-card" style={{ zIndex: i + 1 }}>
                    <button type="button" className="fu-card__btn" aria-pressed={part === i} onClick={() => pick(i)}>
                      <span className="fu-card__head">
                        <span className="fu-card__num num">{String(i + 1).padStart(2, '0')}</span>
                        <span className="fu-card__name">{p.short}</span>
                        <b className="wp-deck__value num">{p.value}</b>
                      </span>
                      <span className="fu-card__body">{p.name}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <div className="wp-panels__foot">
              <p className="wp-panels__figs">{which === 30 ? '70 kg/m² · 125 kg per point · M8 ferrules' : '74 kg/m² · 72 kg per point · EPS/SPS core'}</p>
              <div className="wp-panels__ways">
                <button type="button" className="fc-go wp-go" onClick={which === 30 ? openSolid : openSip}>
                  <span className="fc-go__label">View all details</span>
                  <span className="fc-go__cell" aria-hidden="true">
                    <Arrow />
                  </span>
                </button>
                {compact && (
                  <button type="button" className={`wp-variant ${which === 100 ? 'is-back' : ''}`} onClick={() => show(which === 30 ? 100 : 30)}>
                    {which === 30 ? PAIRED.name : SOLID.name}
                    <Arrow />
                  </button>
                )}
              </div>
            </div>
          </div>

          <figure className="fu-sheet" aria-label={`The ${which === 30 ? 'solid' : 'SIP insulated'} panel, opened, its parts numbered`}>
            <div ref={box} className="fu-box fu-sheet__box">
              <div className="fu-box__clip fu-sheet__view on-black">
                <Stage3D shadows keyLight={false}>
                  <PieceStage t={t} bus={bus} room={room} focus={focus} live={live} />
                  <LabelProjector bus={bus} bottom={compact ? 40 : 76} top={44} />
                </Stage3D>
                <Labels bus={bus} labels={LABELS} shown={shown} focus={part === null ? null : `${prefix}${part}`} />

                {/* which part is shown: its number of them, and its name */}
                <p className="fu-sheet__now" aria-live="polite">
                  <span className="num">{part === null ? (which === 30 ? '30 mm' : '100 mm') : `${String(part + 1).padStart(2, '0')} / ${String(parts.length).padStart(2, '0')}`}</span>
                  <span className="fu-sheet__name">{part === null ? `${which === 30 ? SOLID.name : PAIRED.name}${closed ? ', whole' : ''}` : parts[part].short}</span>
                </p>

                <div className="fu-sheet__steps">
                  <button type="button" className="fu-sheet__go fu-sheet__go--back" aria-label="Previous part" aria-disabled={atStart} onClick={() => step(-1)}>
                    <Arrow />
                  </button>
                  <button type="button" className="fu-sheet__go" aria-label="Next part" aria-disabled={atEnd} onClick={() => step(1)}>
                    <Arrow />
                  </button>
                </div>

                {/* how to go through them: the parts along the foot, or the arrows */}
                <HintTag hint={HOW} className="fu-sheet__hint" />

                <ol className="fu-track" aria-label="Go to a part" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
                  {parts.map((p, i) => (
                    <li
                      key={p.id}
                      ref={(el) => void (track.current[i] = el)}
                      className="fu-track__cell"
                      data-state={compact ? (part === i ? 'now' : 'past') : undefined}
                      style={compact ? ({ '--f': 1 } as CSSProperties) : undefined}
                    >
                      <button type="button" className="fu-track__btn" onClick={() => pick(i)}>
                        <span className="fu-track__line" aria-hidden="true" />
                        <span className="fu-track__name">{p.short}</span>
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

          {/* the two panels: both named from the start, each taking the page to its rest */}
          {!compact && (
            <StepBar
              label="The two panels"
              names={[`${SOLID.name}, ${SOLID.thick} mm`, `${PAIRED.name}, ${PAIRED.thick} mm`]}
              step={which === 30 ? 0 : 1}
              onGo={(k) => show(k ? 100 : 30)}
              cellRef={(k, el) => void (cells.current[k] = el)}
            />
          )}
        </div>
      </section>

      <Sheet dialog={solidSheet} kicker="Technical details" title={`${SOLID.name}, ${SOLID.thick} mm`}>
        <div className="wp-sheet__grid">
          <Block label="Section">
            <Section30 />
          </Block>
          <div className="wp-sheet__side">
            <Block label="Panel construction">
              <Steps items={SOLID.construction} />
            </Block>
            <Block label="Panel dimensions">
              <Figures rows={SOLID.dimensions} />
            </Block>
            <Block label="Panel dynamics">
              <Figures rows={SOLID.dynamics} />
            </Block>
          </div>
          <Block label="Plan: GRP grid, ferrules, tie holes" wide>
            <PanelPlan kind="solid" />
          </Block>
        </div>
      </Sheet>

      <Sheet dialog={sipSheet} kicker="Technical details" title={`${PAIRED.name}, ${PAIRED.thick} mm`} review={REVIEW.core}>
        <div className="wp-sheet__grid">
          <Block label="Section">
            <Section100 />
          </Block>
          <div className="wp-sheet__side">
            <Block label="Panel construction">
              <Steps items={PAIRED.construction} />
            </Block>
            <Block label="Panel dimensions">
              <Figures rows={PAIRED.dimensions} />
            </Block>
            <Block label="Panel dynamics">
              <Figures rows={PAIRED.dynamics} />
            </Block>
          </div>
          <Block label="Plan: tie-clips, ferrules, tie holes" wide>
            <PanelPlan kind="sip" />
          </Block>
          <Block label="GI tie-clip" wide>
            <TiePlate />
          </Block>
        </div>
      </Sheet>
    </>
  )
}
