import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY } from '../lib/scroll'
import { Arrow } from '../facade/Shell'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus } from '../facade/three/kit'
import { sectionY, type Progress } from '../facade/progress'
import { useCornerBox, useLive } from '../facade/unitized/live'
import { HintTag, StepBar, type Hint } from '../facade/unitized/StepBar'
import { ORDER100, ORDER30, PieceStage, RUN_AT, STILL100, STILL30 } from './three/PieceStage'
import type { Room } from './three/fit'
import { Block, Figures, Sheet, Steps, useSheet } from './Sheet'
import { PanelPlan, Section100, Section30, TiePlate } from './Diagrams'
import { PAIRED, REVIEW, SOLID } from './content'

/**
 * The panels, on yellow, pinned for a short run, in the format of the Unitized page's six layers: on the left the
 * panel's name, every part of it in a table, its figures and the way to its technical sheet; on the right the panel in
 * a black studio box: its parts numbered on the model, which one is chosen at the top left, a part back or on at the top
 * right, the parts along the foot. Under them both, a bar with the panel's parts, a step each, as the answers' bar.
 *
 * One section a panel (`which`), the scroll its clock: the solid panel stands whole, then opens; the SIP panel starts as
 * the solid one, closed, and divides, takes its core, joins and opens. Each then rests through its parts, a scroll each,
 * and closes up whole. On a phone there is no run: the panel rests opened.
 */

/** the word in the box: how to go through the parts */
const HOW: Hint = { text: 'Scroll or use the arrows', icon: 'scroll' }
/** once the panel has been scrolled through: its parts are the buttons' */
const PICK: Hint = { text: 'Use the arrows or pick a part', icon: 'pick' }

interface Part {
  /** the model's anchor */
  id: string
  name: string
  /** its name along the box's foot */
  short: string
  value: string
  /** its headline, while it is shown on the model */
  head: string
  /** a line on what it is, under its headline */
  about: string
  /** where its number stands from its point (px) */
  dx: number
  dy: number
}
const PARTS30: Part[] = [
  { id: 'pp-cover', name: 'Cover, inner face', short: 'Inner cover', head: "Covered inside, 7.5 mm.", about: "Concrete over the mesh on the inside face.", value: '7.5 mm', dx: -8, dy: -30 },
  { id: 'pp-tie', name: 'Tie hole, to lift by', short: 'Tie hole', head: "Lifted by its tie hole.", about: "A 20 mm hole through the panel, to lift and place it by.", value: '20 mm', dx: -40, dy: 26 },
  { id: 'pp-ferrule', name: 'Ferrule inserts, for fixing', short: 'Ferrules', head: "Fixed by M8 ferrules.", about: "Inserts cast in at set intervals: the panel is fixed by them.", value: 'M8', dx: -44, dy: -22 },
  { id: 'pp-zone', name: 'RTARIUM, 3D basalt mesh', short: 'RTARIUM', head: "RTARIUM at its heart.", about: "A 15 mm 3D basalt mesh, its two faces held apart by fibres.", value: '15 mm', dx: -8, dy: -30 },
  { id: 'pp-grp', name: 'GRP grid: 4 rods 120 mm apart, across every 600', short: 'GRP grid', head: "A GRP grid, 3 mm.", about: "Four rods 120 mm apart, and across every 600 mm.", value: '3 mm', dx: 40, dy: 30 },
  { id: 'pp-back', name: 'Cover, outer face', short: 'Outer cover', head: "Covered outside, 7.5 mm.", about: "Concrete over the mesh on the outside face.", value: '7.5 mm', dx: -8, dy: -30 },
]
const PARTS100: Part[] = [
  { id: 'pp-inner7', name: 'Cover, inner face', short: 'Inner cover', head: "Covered inside, 7 mm.", about: "The inner leaf's face: concrete over its mesh.", value: '7 mm', dx: -8, dy: -30 },
  { id: 'pp-ferrule100', name: 'Ferrule inserts, for fixing', short: 'Ferrules', head: "Fixed by M8 ferrules.", about: "Inserts cast into the leaf, to fix the panel by.", value: 'M8', dx: -44, dy: 22 },
  { id: 'pp-mesh6i', name: 'RTARIUM, 3D basalt mesh', short: 'RTARIUM', head: "RTARIUM in each leaf.", about: "A 6 mm 3D basalt mesh, reinforcing each concrete leaf.", value: '6 mm', dx: -8, dy: -30 },
  { id: 'pp-rod', name: 'GRP rods: along, 100 mm in; across at each clip', short: 'GRP rods', head: "GRP rods, 3 mm.", about: "Along the panel 100 mm in, and across at each clip.", value: '3 mm', dx: 6, dy: 36 },
  { id: 'pp-cover2', name: 'Cover', short: 'Cover', head: "A thin 2 mm cover.", about: "A thin layer of concrete between the mesh and the core.", value: '2 mm', dx: -8, dy: -30 },
  { id: 'pp-clip', name: 'GI tie-clip: joins two meshes with concrete', short: 'Tie-clip', head: "Tied by GI clips.", about: "2 mm plates joining the two leaves' meshes through the core.", value: '2 mm plate', dx: 44, dy: 26 },
  { id: 'pp-core', name: 'EPS/SPS core, stay-in-place', short: 'Core', head: "Insulated at its core.", about: "70 mm of EPS/SPS: the form the leaves are cast on, left in as the insulation.", value: '70 mm', dx: -8, dy: -30 },
  { id: 'pp-outer', name: 'Outer leaf: 2 + 6 + 7', short: 'Outer leaf', head: "A 15 mm outer leaf.", about: "2 mm cover, 6 mm RTARIUM and 7 mm cover: the panel's outer face.", value: '15 mm', dx: -8, dy: -30 },
]
const LABELS: LabelSpec[] = [
  ...PARTS30.map((p, i) => ({ id: `a${i}`, anchor: p.id, text: null, num: i + 1, dx: p.dx, dy: p.dy })),
  ...PARTS100.map((p, i) => ({ id: `b${i}`, anchor: p.id, text: null, num: i + 1, dx: p.dx, dy: p.dy })),
]
// (the lists' order is the model's)
if (import.meta.env.DEV && (PARTS30.some((p, i) => p.id !== ORDER30[i]) || PARTS100.some((p, i) => p.id !== ORDER100[i]))) console.warn('Panels: the parts lists are out of the model\'s order')

/**
 * Each panel's run, in screens of scroll, as the Unitized page's six layers: the panel opens (the solid panel from whole;
 * the SIP panel from the solid one, taking its core); then its parts, a scroll each, each row coming up as its part is
 * shown on the model; then it closes up whole.
 */
type Which = 30 | 100
/** a part's stretch of scroll, and how much of it its words take to come up */
const PART = 0.75
const COME = 0.5
interface Run {
  open: [number, number]
  /** where its first part starts to come up */
  from: number
  whole: [number, number]
  scroll: number
  /** the page's stops through the section: each part, then the panel whole (fractions of the run) */
  stops: number[]
}
const runOf = (which: Which): Run => {
  const n = (which === 30 ? PARTS30 : PARTS100).length
  // (the SIP panel's opening is the solid panel closing, dividing, taking its core and opening again: longer)
  const open: [number, number] = which === 30 ? [0.1, 1.1] : [0.1, 1.9]
  const from = open[1] + (which === 30 ? 0.1 : 0.2)
  const whole: [number, number] = [from + n * PART + 0.05, from + n * PART + 0.65]
  const scroll = whole[1] + 0.12
  const stops = [...Array.from({ length: n }, (_, k) => from + k * PART + COME + 0.02), whole[1] + 0.02].map((x) => x / scroll)
  return { open, from, whole, scroll, stops }
}
const RUNS: Record<Which, Run> = { 30: runOf(30), 100: runOf(100) }

const ramp = ([a, b]: readonly [number, number], v: number) => Math.min(1, Math.max(0, (v - a) / (b - a)))
const lerp = ([a, b]: readonly [number, number], u: number) => a + (b - a) * u
/** the panel's sequence at a point of the scroll: opening, resting through its parts, closing up whole */
const tAt = (which: Which, x: number) => {
  const r = RUNS[which]
  if (which === 30) return x < r.whole[0] ? STILL30 * ramp(r.open, x) : lerp(RUN_AT.close30, ramp(r.whole, x))
  return x < r.whole[0] ? lerp([RUN_AT.close30[1], STILL100], ramp(r.open, x)) : lerp(RUN_AT.close100, ramp(r.whole, x))
}
/** each panel's figures under its table: value, unit, what it is */
const FIGS: Record<Which, [string, string, string][]> = {
  30: [
    ['70', 'kg/m²', 'Weight'],
    ['125', 'kg', 'Per fixing point'],
    ['M8', '', 'Ferrules'],
  ],
  100: [
    ['74', 'kg/m²', 'Weight'],
    ['72', 'kg', 'Per fixing point'],
    ['70', 'mm', 'EPS/SPS core'],
  ],
}
/** the words before the parts, and after them, the panel whole */
const WORDS: Record<Which, Record<'intro' | 'whole', { head: string; about: string }>> = {
  30: {
    intro: { head: 'Six parts, 30 mm thin.', about: 'Scroll, and the panel opens to show each one in turn.' },
    whole: { head: 'One solid panel, whole.', about: 'All six parts, cast as one 30 mm panel.' },
  },
  100: {
    intro: { head: 'Eight parts, 100 mm.', about: 'The solid panel takes its core, and opens as the SIP panel.' },
    whole: { head: 'One insulated panel, whole.', about: 'Two leaves and a core, cast as one 100 mm panel.' },
  },
}
/** how near a stop counts as at it */
const NEAR = 0.004

export function Panels({ which }: { which: Which }) {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const rx = useRef<HTMLSpanElement>(null)
  const ry = useRef<HTMLSpanElement>(null)
  const live = useLive(box)
  useCornerBox(section, box, rx, ry)
  const STILL = which === 30 ? STILL30 : STILL100
  const t = useMemo<Progress>(() => ({ value: compact ? STILL : which === 30 ? 0 : RUN_AT.close30[1], listeners: new Set() }), [compact, STILL, which])
  const bus = useMemo(createBus, [])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  /** which of its parts is chosen */
  const [part, setPart] = useState<number | null>(null)
  /** the panel closed up whole, after its parts */
  const [closed, setClosed] = useState(false)
  /** the panel has come to rest, opened: its parts can be numbered */
  const [still, setStill] = useState(compact)
  /** the part the model holds whole, read by it every frame */
  const focus = useRef<string | null>(null)
  /** the room the panel keeps to in its box: clear of the read-outs at the top and the parts along the foot */
  const room = useRef<Room>({ x: 0.04, y: 0.1, w: 0.92, h: 0.74 })
  /** where the run stands, and the stop a step last sent the page to while it is on its way there */
  const aimP = useRef(0)
  const aim = useRef({ p: -1, t: 0 })
  /** scrolled through once, to its end: from then on the scroll passes over it in one, and its parts are the buttons'
   * (the bar, the arrows, the rows), the part picked kept, whenever the visitor comes back */
  const played = useRef(false)
  const [buttons, setButtons] = useState(false)
  // played: the section one screen tall (its long run was the scroll's, and the buttons have it now), so the way in and
  // out is one screen; the page put at its top the same moment, where it looks the same (its screen held still all its
  // run), nothing below moving on the screen
  useLayoutEffect(() => {
    const el = section.current
    if (!buttons || !el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    // (the page within the run it had: its length before, in screens)
    if (window.scrollY > top + 2 && window.scrollY < top + (RUNS[which].scroll + 1) * window.innerHeight) scrollToY(top, true)
  }, [buttons, which])
  /** the point of the run picked by a button, once played; and the tick, to wake */
  const pin = useRef<number | null>(null)
  const kick = useRef<() => void>(() => {})
  const [sheet, openSheet] = useSheet()

  const run = RUNS[which]
  const parts = which === 30 ? PARTS30 : PARTS100
  const panel = which === 30 ? SOLID : PAIRED
  const prefix = which === 30 ? 'a' : 'b'
  const labels = useMemo(() => LABELS.filter((l) => l.id.startsWith(prefix)), [prefix])
  focus.current = part === null ? null : parts[part].id

  // the run: the page's scroll is the panel's clock
  useEffect(() => {
    const el = section.current
    if (!el || compact) return
    const reduced = prefersReducedMotion()
    const n = parts.length
    let raf = 0
    let last = performance.now()
    let p = -1
    /** the page leaving it upward: the panel held where it stands, never played back through its parts */
    let held = false
    /** the page's stops through it, from part k on: where it comes back to, going down (all of them again at its end) */
    const resume = (k: number) => {
      const at = run.stops
        .slice(k)
        .map((v) => v.toFixed(5))
        .join(',')
      if (el.dataset.stops !== at) el.dataset.stops = at
    }
    const end = run.stops[run.stops.length - 1]
    /** played: one stop through it, at its top (one screen on from the section before); the panel shows the part
     * picked, not the scroll, and the way on is one screen from the end of its run */
    const single = () => {
      const at = (0).toFixed(5)
      if (el.dataset.stops !== at) el.dataset.stops = at
    }
    if (played.current) single()
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const r = el.getBoundingClientRect()
      const scrolled = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)))
      const target = played.current ? (pin.current ?? end) : scrolled
      if (played.current) held = false
      // a scroll up, not one of its own steps (the arrows, the bar): the page goes back to the section before, and the
      // panel stays as it was, there too; back down, the page comes straight to the part it left (its stops start
      // there), and the panel carries on from it
      const own = now - aim.current.t < 1500
      if (played.current) {
        // (the buttons have it)
      } else if (own) {
        held = false
        resume(0)
      } else if (p >= 0 && target < p - 1e-4) {
        if (!held) resume(run.stops.reduce((m, v, i) => (v <= p + NEAR ? i : m), 0))
        held = true
      }
      if (held) {
        if (target < p) return
        held = false
      }
      // (the page already glides; the panel follows it a little behind, so a wheel's tick never jumps the layers)
      p = p < 0 || reduced ? target : damp(p, target, 6.5, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      if (!played.current && p >= end - NEAR) {
        // the first time through, at its end: from now on, its buttons
        played.current = true
        pin.current = end
        setButtons(true)
        single()
      }
      const x = p * run.scroll
      const v = tAt(which, x)
      if (t.value !== v) {
        t.value = v
        t.listeners.forEach((f) => f())
      }
      setStill(v === STILL)
      // a part a scroll; the part on the model, and its words, the newest one's
      const a = parts.map((_, k) => {
        const u = ramp([run.from + k * PART, run.from + k * PART + COME], x)
        return reduced ? Math.round(u) : 1 - Math.pow(1 - u, 3)
      })
      const whole = x >= run.whole[0]
      let latest = -1
      a.forEach((u, k) => u > 0.5 && (latest = k))
      setPart(latest < 0 || whole ? null : latest)
      setClosed(whole)
      // the bar, as the answers' bar: a part's cell fills as its part comes up, and closes to its number as the next one does
      cells.current.slice(0, n).forEach((c, k) => {
        if (!c) return
        const start = k === 0 ? run.open[0] : run.from + (k - 1) * PART + COME + 0.06
        c.style.setProperty('--f', ramp([start, run.from + k * PART + COME], x).toFixed(4))
        c.style.setProperty('--c', (k < n - 1 ? ramp([run.from + (k + 1) * PART, run.from + (k + 1) * PART + COME], x) : 0).toFixed(4))
      })
      aimP.current = p
      if (p !== target) raf = requestAnimationFrame(tick)
    }
    const on = () => {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    kick.current = on
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [compact, t, which, run, parts, STILL])

  /** to a point of the run (a part, or the panel whole): the page scrolls there, as a layer's card does on the six layers */
  const goTo = (at: number) => {
    const el = section.current
    if (!el) return
    // played: the panel goes to it where the page stands, and keeps it
    if (played.current) {
      pin.current = at
      kick.current()
      return
    }
    aim.current = { p: at, t: performance.now() }
    scrollToY(sectionY(el, at))
  }
  const goPart = (k: number) => goTo(run.stops[k])
  /** a part back or on: from where the last step was going, if the page is still on its way */
  const step = (dir: 1 | -1) => {
    if (compact) {
      const k = part === null ? (dir > 0 ? -1 : parts.length) : part
      const next = k + dir
      if (next >= 0 && next < parts.length) setPart(next)
      return
    }
    const from = played.current ? (pin.current ?? aimP.current) : performance.now() - aim.current.t < 1200 ? aim.current.p : aimP.current
    const to = dir > 0 ? run.stops.find((v) => v > from + NEAR) : [...run.stops].reverse().find((v) => v < from - NEAR)
    if (to === undefined) return
    goTo(to)
  }
  const atStart = part === null ? !closed : part === 0
  const atEnd = compact ? part === parts.length - 1 : closed

  const shown = still ? parts.map((_, i) => `${prefix}${i}`) : []
  const pick = (i: number) => {
    if (!compact) return goPart(i)
    setPart((p) => (p === i ? null : i))
  }
  const titleId = `wp-panels-title-${which}`

  return (
    <>
      <section
        ref={section}
        id={which === 30 ? 'panels' : 'panels-sip'}
        className={`fu-layers wp-panels wp-panels--${which} on-yellow`}
        // the page's one scroll a step: each part, as the six layers' each layer
        data-stops={compact ? undefined : run.stops.map((v) => v.toFixed(5)).join(',')}
        data-no-top=""
        data-leap-back=""
        aria-labelledby={titleId}
        style={{ '--run': compact || buttons ? 1 : run.scroll + 1 } as CSSProperties}
      >
        <div className="fu-layers__pin">
          <div className="fu-layers__copy wp-panels__side">
            <div className="wp-panels__head">
              <h2 id={titleId} className="fu-layers__title">
                {panel.name}
              </h2>
              <p className="wp-panels__thick num">{panel.thick} mm</p>
            </div>

            {/* the part shown, in words, as the answers' each answer: a headline and a line on it; before the parts the
                panel's, after them the panel whole. On a phone, its parts to pick from as a list */}
            {compact ? (
              <ol className="wp-parts" aria-label="The panel's parts">
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
              <div className="wp-words" aria-live="polite">
                {[
                  { key: 'intro', kicker: `${parts.length} parts`, ...WORDS[which].intro },
                  ...parts.map((p, i) => ({ key: p.id, kicker: `${String(i + 1).padStart(2, '0')} / ${String(parts.length).padStart(2, '0')} · ${p.short} · ${p.value}`, head: p.head, about: p.about })),
                  { key: 'whole', kicker: `${panel.thick} mm`, ...WORDS[which].whole },
                ].map((w, k) => {
                  const on = k === (part !== null ? part + 1 : closed ? parts.length + 1 : 0)
                  return (
                    <div key={w.key} className="wp-word" data-on={on || undefined} aria-hidden={!on || undefined}>
                      <p className="wp-word__kicker num">{w.kicker}</p>
                      <h3 className="wp-word__head">{w.head}</h3>
                      <p className="wp-word__line">{w.about}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* its figures, and the way to its technical sheet, as Home's thickness options and its buttons */}
            <div className="wp-panels__foot">
              <div className="wp-figs">
                <span className="wp-figs__label">Panel figures</span>
                <dl className="wp-figs__row">
                  {FIGS[which].map(([v, u, l]) => (
                    <div key={l} className="wp-figs__cell">
                      <dd>
                        <span className="num">{v}</span>
                        {u && <small>{u}</small>}
                      </dd>
                      <dt>{l}</dt>
                    </div>
                  ))}
                </dl>
              </div>
              <button type="button" className="explore explore--line wp-panels__more" onClick={openSheet}>
                <span className="explore__label">View all details</span>
                <span className="explore__cell" aria-hidden="true">
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </span>
              </button>
            </div>
          </div>

          <figure className="fu-sheet" aria-label={`The ${which === 30 ? 'solid' : 'SIP insulated'} panel, opened, its parts numbered`}>
            <div ref={box} className="fu-box fu-sheet__box">
              <div className="fu-box__clip fu-sheet__view on-black">
                <Stage3D shadows keyLight={false}>
                  <PieceStage t={t} bus={bus} room={room} focus={focus} live={live} />
                  <LabelProjector bus={bus} bottom={40} top={44} />
                </Stage3D>
                <Labels bus={bus} labels={labels} shown={shown} focus={part === null ? null : `${prefix}${part}`} />

                {/* which part is shown: its number of them, and its name */}
                <p className="fu-sheet__now" aria-live="polite">
                  <span className="num">{part === null ? `${panel.thick} mm` : `${String(part + 1).padStart(2, '0')} / ${String(parts.length).padStart(2, '0')}`}</span>
                  <span className="fu-sheet__name">{part === null ? `${panel.name}${closed ? ', whole' : ''}` : parts[part].short}</span>
                </p>

                <div className="fu-sheet__steps">
                  <button type="button" className="fu-sheet__go fu-sheet__go--back" aria-label="Previous part" aria-disabled={atStart} onClick={() => step(-1)}>
                    <Arrow />
                  </button>
                  <button type="button" className="fu-sheet__go" aria-label="Next part" aria-disabled={atEnd} onClick={() => step(1)}>
                    <Arrow />
                  </button>
                </div>

                {/* how to go through them: the scroll, or the arrows */}
                <HintTag key={buttons ? 'pick' : 'how'} hint={buttons ? PICK : HOW} className="fu-sheet__hint" />

              </div>
              <i className="fu-box__dot" aria-hidden="true">
                <span ref={rx} className="fu-box__x num" />
                <span ref={ry} className="fu-box__y num" />
              </i>
            </div>
          </figure>

          {/* the panel's parts on the bar, as the answers' steps: each part a step, each taking the page to it */}
          {!compact && (
            <StepBar
              label={`The ${panel.name.toLowerCase()}'s parts`}
              names={parts.map((p) => p.short)}
              step={closed ? parts.length : (part ?? -1)}
              onGo={goPart}
              cellRef={(k, el) => void (cells.current[k] = el)}
              hints="run"
            />
          )}
        </div>
      </section>

      {which === 30 ? (
        <Sheet dialog={sheet} kicker="Technical details" title={`${SOLID.name}, ${SOLID.thick} mm`}>
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
      ) : (
        <Sheet dialog={sheet} kicker="Technical details" title={`${PAIRED.name}, ${PAIRED.thick} mm`} review={REVIEW.core}>
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
      )}
    </>
  )
}
