import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY } from '../lib/scroll'
import { Arrow } from '../facade/Shell'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus } from '../facade/three/kit'
import { sectionY, type Progress } from '../facade/progress'
import { useCornerBox, useLive } from '../facade/unitized/live'
import { StepBar } from '../facade/unitized/StepBar'
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

/** screens the section takes: one to stand on, the rest for the two bursts */
const RUN = 3.4
/** over the run: the solid panel opens; then, after its rest, it closes, takes its core and opens as the SIP panel */
const OPEN_AT = [0.02, 0.2] as const
const CHANGE_AT = [0.36, 0.84] as const
/** where each panel rests: where the bar and the table take the page */
const REST = [0.28, 0.93] as const

const ramp = ([a, b]: readonly [number, number], v: number) => Math.min(1, Math.max(0, (v - a) / (b - a)))
/**
 * The panel's sequence at a point of the run. (From the solid panel's rest it goes straight to where it starts to close:
 * the stretch of the sequence between them is its marks, which the table does here.)
 */
const tAt = (p: number) => (p < CHANGE_AT[0] ? STILL30 * ramp(OPEN_AT, p) : RUN_AT.close30[0] + (STILL100 - RUN_AT.close30[0]) * ramp(CHANGE_AT, p))
/** the name, the table and the figures change over as the panel takes its core */
const SWAP = (RUN_AT.divide[0] + RUN_AT.core[1]) / 2

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
  /** the panel has come to rest, opened: its parts can be numbered */
  const [still, setStill] = useState(compact)
  /** the part the model holds whole, read by it every frame */
  const focus = useRef<string | null>(null)
  /** the room the panel keeps to in its box: clear of the read-outs at the top and the parts along the foot */
  const room = useRef<Room>({ x: 0.04, y: 0.1, w: 0.92, h: 0.74 })
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
      const v = reduced ? (p < (REST[0] + REST[1]) / 2 ? STILL30 : STILL100) : tAt(p)
      if (t.value !== v) {
        t.value = v
        t.listeners.forEach((f) => f())
      }
      setWhich(v > SWAP ? 100 : 30)
      setStill(v === STILL30 || v === STILL100)
      // the bar: each panel's cell fills as it is shown; both keep their names, so both stay in sight
      cells.current[0]?.style.setProperty('--f', ramp([0, CHANGE_AT[0]], p).toFixed(4))
      cells.current[1]?.style.setProperty('--f', ramp([CHANGE_AT[0], 1], p).toFixed(4))
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
    if (!still) setPart(null)
    else if (want.current !== null) {
      setPart(want.current)
      want.current = null
    }
  }, [still])

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
  /** a part back or on; past the last of the solid panel's, on to the SIP panel, and back */
  const step = (dir: 1 | -1) => {
    if (!still) return show(which)
    const k = part === null ? (dir > 0 ? -1 : parts.length) : part
    const n = k + dir
    if (n >= 0 && n < parts.length) setPart(n)
    else if (dir > 0 && which === 30) show(100)
    else if (dir < 0 && which === 100) show(30)
  }
  const atStart = which === 30 && (part === null || part === 0)
  const atEnd = which === 100 && part === parts.length - 1

  const shown = still ? parts.map((_, i) => `${prefix}${i}`) : []
  const pick = (i: number) => {
    if (still) setPart((p) => (p === i ? null : i))
    else {
      want.current = i
      show(which)
    }
  }

  return (
    <>
      <section ref={section} id="panels" className="fu-layers wp-panels on-yellow" aria-labelledby="wp-panels-title" style={{ '--run': compact ? 1 : RUN } as CSSProperties}>
        <div className="fu-layers__pin">
          <div className="fu-layers__copy wp-panels__side">
            <div key={`name-${which}`} className="wp-panels__head">
              <h2 id="wp-panels-title" className="fu-layers__title">
                {which === 30 ? SOLID.name : PAIRED.name}
              </h2>
              <p className="wp-panels__thick num">{which === 30 ? '30 mm' : '100 mm'}</p>
            </div>

            {/* the panel's parts: each one shows where it is on the panel */}
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
                  <span className="fu-sheet__name">{part === null ? (which === 30 ? SOLID.name : PAIRED.name) : parts[part].short}</span>
                </p>

                <div className="fu-sheet__steps">
                  <button type="button" className="fu-sheet__go fu-sheet__go--back" aria-label="Previous part" aria-disabled={atStart} onClick={() => step(-1)}>
                    <Arrow />
                  </button>
                  <button type="button" className="fu-sheet__go" aria-label="Next part" aria-disabled={atEnd} onClick={() => step(1)}>
                    <Arrow />
                  </button>
                </div>

                <ol className="fu-track" aria-label="Go to a part" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
                  {parts.map((p, i) => (
                    <li key={p.id} className="fu-track__cell" data-state={part === i ? 'now' : 'past'} style={{ '--f': 1 } as CSSProperties}>
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
