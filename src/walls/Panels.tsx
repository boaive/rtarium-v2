import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY } from '../lib/scroll'
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
 * The panels, on yellow, pinned for one scroll, in the format of the Unitized page's six layers: on the left the panel's
 * name, the part picked in words, and the way to its technical sheet; on the right the panel in a black studio box, its
 * parts numbered in a row over it and a row under it, clear of the model; under them both, the panel's parts on a bar to
 * pick from.
 *
 * One section a panel (`which`). It comes in whole, then opens on its own clock, slowly (the SIP panel first divides,
 * takes its core and joins): the burst, every part in view. A part picked, on the bar or by its number, is the one seen,
 * the rest faded back; picked again, they are all seen. The first scroll on closes it up whole, the next goes on to the
 * next section, and not before it has closed; back up, the same the other way: whole, opened, the section before. On a
 * phone there is no run: the panel rests opened, its parts in a list.
 */

/** the word in the box: what can be done with the burst */
const PICK: Hint = { text: 'Pick a part to see it alone', icon: 'pick' }
const ALL: Hint = { text: 'Pick it again to see every part', icon: 'pick' }

interface Part {
  /** the model's anchor */
  id: string
  name: string
  /** its name along the bar */
  short: string
  value: string
  /** its headline, while it is picked */
  head: string
  /** a line on what it is, under its headline */
  about: string
  /** which row its number stands in: over the panel (a layer, numbered at its top edge) or under it (what is in a layer) */
  row: 'top' | 'foot'
}
const PARTS30: Part[] = [
  { id: 'pp-cover', name: 'Cover, inner face', short: 'Inner cover', head: 'Covered inside, 7.5 mm.', about: 'Concrete over the mesh on the inside face.', value: '7.5 mm', row: 'top' },
  { id: 'pp-tie', name: 'Tie hole, to lift by', short: 'Tie hole', head: 'Lifted by its tie hole.', about: 'A 20 mm hole through the panel, to lift and place it by.', value: '20 mm', row: 'foot' },
  { id: 'pp-ferrule', name: 'Ferrule inserts, for fixing', short: 'Ferrules', head: 'Fixed by M8 ferrules.', about: 'Inserts cast in at set intervals: the panel is fixed by them.', value: 'M8', row: 'foot' },
  { id: 'pp-zone', name: 'RTARIUM, 3D basalt mesh', short: 'RTARIUM', head: 'RTARIUM at its heart.', about: 'A 15 mm 3D basalt mesh, its two faces held apart by fibres.', value: '15 mm', row: 'top' },
  { id: 'pp-grp', name: 'GRP grid: 4 rods 120 mm apart, across every 600', short: 'GRP grid', head: 'A GRP grid, 3 mm.', about: 'Four rods 120 mm apart, and across every 600 mm.', value: '3 mm', row: 'foot' },
  { id: 'pp-back', name: 'Cover, outer face', short: 'Outer cover', head: 'Covered outside, 7.5 mm.', about: 'Concrete over the mesh on the outside face.', value: '7.5 mm', row: 'top' },
]
const PARTS100: Part[] = [
  { id: 'pp-inner7', name: 'Cover, inner face', short: 'Inner cover', head: 'Covered inside, 7 mm.', about: "The inner leaf's face: concrete over its mesh.", value: '7 mm', row: 'top' },
  { id: 'pp-ferrule100', name: 'Ferrule inserts, for fixing', short: 'Ferrules', head: 'Fixed by M8 ferrules.', about: 'Inserts cast into the leaf, to fix the panel by.', value: 'M8', row: 'foot' },
  { id: 'pp-mesh6i', name: 'RTARIUM, 3D basalt mesh', short: 'RTARIUM', head: 'RTARIUM in each leaf.', about: 'A 6 mm 3D basalt mesh, reinforcing each concrete leaf.', value: '6 mm', row: 'top' },
  { id: 'pp-rod', name: 'GRP rods: along, 100 mm in; across at each clip', short: 'GRP rods', head: 'GRP rods, 3 mm.', about: 'Along the panel 100 mm in, and across at each clip.', value: '3 mm', row: 'foot' },
  { id: 'pp-cover2', name: 'Cover', short: 'Cover', head: 'A thin 2 mm cover.', about: 'A thin layer of concrete between the mesh and the core.', value: '2 mm', row: 'top' },
  { id: 'pp-clip', name: 'GI tie-clip: joins two meshes with concrete', short: 'Tie-clip', head: 'Tied by GI clips.', about: "2 mm plates joining the two leaves' meshes through the core.", value: '2 mm plate', row: 'foot' },
  { id: 'pp-core', name: 'EPS/SPS core, stay-in-place', short: 'Core', head: 'Insulated at its core.', about: '70 mm of EPS/SPS: the form the leaves are cast on, left in as the insulation.', value: '70 mm', row: 'top' },
  { id: 'pp-outer', name: 'Outer leaf: 2 + 6 + 7', short: 'Outer leaf', head: 'A 15 mm outer leaf.', about: "2 mm cover, 6 mm RTARIUM and 7 mm cover: the panel's outer face.", value: '15 mm', row: 'top' },
]
// (the projector's rows read only the side a number is set to: over its point, or under it)
const label = (prefix: string) => (p: Part, i: number): LabelSpec => ({ id: `${prefix}${i}`, anchor: p.id, text: null, num: i + 1, dx: 0, dy: p.row === 'top' ? -30 : 30 })
const LABELS: LabelSpec[] = [...PARTS30.map(label('a')), ...PARTS100.map(label('b'))]
// (the lists' order is the model's)
if (import.meta.env.DEV && (PARTS30.some((p, i) => p.id !== ORDER30[i]) || PARTS100.some((p, i) => p.id !== ORDER100[i]))) console.warn("Panels: the parts lists are out of the model's order")

type Which = 30 | 100
/**
 * The panel's story, 0..2: 0 whole as it comes in (the SIP panel's section: still the solid panel), 1 opened, 2 closed up
 * whole. The model's sequence (`t`) at a point of it.
 */
const tAt = (which: Which, s: number) => {
  if (s <= 1) {
    const a = Math.max(0, s)
    return which === 30 ? STILL30 * a : RUN_AT.close30[1] + (STILL100 - RUN_AT.close30[1]) * a
  }
  const [c0, c1] = which === 30 ? RUN_AT.close30 : RUN_AT.close100
  return c0 + (c1 - c0) * Math.min(1, s - 1)
}
/** how long, on its own clock (s): the panel opening (the SIP panel's change and its opening, longer); closing up, or opening again */
const OPEN_S: Record<Which, number> = { 30: 2.4, 100: 4.6 }
const CLOSE_S = 1.5
/** eased at both ends over `k` of the way, steady between, so a long change keeps one pace */
const glide = (u: number, k = 0.24) => {
  const v = 1 / (1 - k)
  if (u <= 0) return 0
  if (u >= 1) return 1
  if (u < k) return (v / (2 * k)) * u * u
  if (u > 1 - k) return 1 - (v / (2 * k)) * (1 - u) * (1 - u)
  return v * (u - k / 2)
}
/** the words before a part is picked, and after it has closed, the panel whole */
const WORDS: Record<Which, Record<'intro' | 'whole', { head: string; about: string }>> = {
  30: {
    intro: { head: 'Six parts, 30 mm thin.', about: 'The panel opened, every part in view.' },
    whole: { head: 'One solid panel, whole.', about: 'All six parts, cast as one 30 mm panel.' },
  },
  100: {
    intro: { head: 'Eight parts, 100 mm.', about: 'The solid panel takes its core, and opens as the SIP panel.' },
    whole: { head: 'One insulated panel, whole.', about: 'Two leaves and a core, cast as one 100 mm panel.' },
  },
}

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
  /** which of its parts is picked */
  const [part, setPart] = useState<number | null>(null)
  /** where its story is going: 0 whole, coming in; 1 opened; 2 closed up whole */
  const [goal, setGoal] = useState<0 | 1 | 2>(compact ? 1 : 0)
  const goalNow = useRef<0 | 1 | 2>(goal)
  /** opened and come to rest: its parts can be numbered; and the same, for the story's clock to read */
  const [still, setStill] = useState(compact)
  const stillNow = useRef(still)
  stillNow.current = still
  /** the part the model holds whole, read by it every frame */
  const focus = useRef<string | null>(null)
  /** the room the panel keeps to in its box: clear of the read-out at the top left, its rows of numbers, the hint at the foot */
  const room = useRef<Room>({ x: 0.04, y: 0.15, w: 0.92, h: 0.66 })
  const [sheet, openSheet] = useSheet()

  const parts = which === 30 ? PARTS30 : PARTS100
  const panel = which === 30 ? SOLID : PAIRED
  const prefix = which === 30 ? 'a' : 'b'
  const labels = useMemo(() => LABELS.filter((l) => l.id.startsWith(prefix)), [prefix])
  focus.current = part === null ? null : parts[part].id

  // the story, on its own clock, its goal read off the page's scroll: coming in, opened; one scroll on, closed up
  useEffect(() => {
    const el = section.current
    if (!el || compact) return
    const reduced = prefersReducedMotion()
    const st = { s: 0, from: 0, to: 0, at: 0, dur: 0 }
    let raf = 0
    /** where the section stands on the page and how tall it is: read once, and again only when the page's size changes, never
     * every frame (a read after something else has written to the page makes the browser lay the whole page out there and then) */
    const at = { top: 0, height: 0, vh: 0 }
    const measure = () => {
      at.top = el.getBoundingClientRect().top + window.scrollY
      at.height = el.offsetHeight
      at.vh = window.innerHeight
    }
    measure()
    /** where the page was at the last look, so its way (down or up) is known; and whether the panel was at rest, opened */
    let lastY = window.scrollY - at.top
    let atRest = stillNow.current
    /** how long from one point of the story to another: its opening at the panel's pace, closing at its own */
    const span = (a: number, b: number) => {
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      return Math.max(0, Math.min(hi, 1) - lo) * OPEN_S[which] + Math.max(0, hi - Math.max(lo, 1)) * CLOSE_S
    }
    const show = (s: number) => {
      const v = tAt(which, s)
      if (t.value !== v) {
        t.value = v
        t.listeners.forEach((f) => f())
      }
      // (a render only when it changes: every render of the section draws its stage again)
      if (atRest !== (s === 1)) {
        atRest = s === 1
        setStill(atRest)
      }
    }
    const aimAt = (g: 0 | 1 | 2, now: number, snap: boolean) => {
      if (g !== goalNow.current) {
        goalNow.current = g
        setGoal(g)
      }
      if (snap || reduced) {
        st.s = st.from = st.to = g
        st.dur = 0
        return
      }
      if (st.to === g) return
      st.from = st.s
      st.to = g
      st.at = now
      st.dur = span(st.from, g)
    }
    const tick = (now: number) => {
      raf = 0
      const vh = at.vh
      const run = Math.max(1, at.height - vh)
      const y = window.scrollY - at.top
      const top = -y
      const bottom = at.height - y
      // which way the page is going: a step glides one way, so the goal turns once, the moment it sets off
      const down = y > lastY + 0.5
      const up = y < lastY - 0.5
      lastY = y
      const g = goalNow.current
      // out of sight below: whole, ready to open as it comes in; out of sight above: closed up, as it was left going on
      if (top >= vh - 1) aimAt(0, now, true)
      else if (bottom <= 1) aimAt(2, now, true)
      // come in (nearly at rest): it opens. At its stop, a scroll on closes it; back up from closed, it opens again
      else if (g === 0 && top < vh * 0.2) aimAt(1, now, false)
      else if (g === 1 && down && y > run * 0.06) aimAt(2, now, false)
      else if (g === 2 && up && y < run * 0.94 && y > -vh * 0.5) aimAt(1, now, false)
      // the story playing to its goal
      if (st.s !== st.to) {
        const u = st.dur > 0 ? (now - st.at) / (st.dur * 1000) : 1
        st.s = u >= 1 ? st.to : st.from + (st.to - st.from) * glide(u)
        if (st.s !== st.to) raf = requestAnimationFrame(tick)
      }
      // while it plays, the page does not leave the section (a scroll on, or back, waits for the panel to close or open)
      const busy = st.s !== st.to
      if (el.hasAttribute('data-busy') !== busy) el.toggleAttribute('data-busy', busy)
      show(st.s)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const resized = () => {
      measure()
      on()
    }
    on()
    // (the page's size changes when a section above grows or shrinks, or the window does)
    const sized = new ResizeObserver(resized)
    sized.observe(document.body)
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', resized)
    return () => {
      cancelAnimationFrame(raf)
      sized.disconnect()
      el.removeAttribute('data-busy')
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', resized)
    }
  }, [compact, t, which])

  // closed up (or not yet opened), no part is picked
  useEffect(() => {
    if (goal !== 1) setPart(null)
  }, [goal])
  // a part picked or let go: the stage is drawn again (at rest it draws nothing until asked), so the model fades to it and
  // its number comes up at once
  useEffect(() => {
    t.listeners.forEach((f) => f())
  }, [part, t])

  /** a part picked: seen alone, the rest faded back; picked again, all of them. From the panel closed up, the page goes
   * back up to it opened */
  const pick = (i: number) => {
    const el = section.current
    if (!compact && goalNow.current === 2 && el) {
      setPart(i)
      scrollToY(sectionY(el, 0))
      return
    }
    setPart((p) => (p === i ? null : i))
  }
  /** a number on the model picked */
  const pickNumber = (e: MouseEvent<HTMLElement>) => {
    const id = (e.target as Element | null)?.closest?.<HTMLElement>('.fc-pin')?.dataset.label
    if (!id || !id.startsWith(prefix)) return
    const i = Number(id.slice(prefix.length))
    if (Number.isInteger(i) && i >= 0 && i < parts.length) pick(i)
  }

  // the technical sheet, its diagrams large: made again only when its panel or its dialog changes, never on each step
  const sheetEl = useMemo(
    () =>
      which === 30 ? (
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
      ),
    [which, sheet],
  )

  const closed = goal === 2
  // every number while none is picked; the one picked alone
  const shown = still ? (part === null ? parts.map((_, i) => `${prefix}${i}`) : [`${prefix}${part}`]) : []
  const titleId = `wp-panels-title-${which}`
  const wordsOn = part !== null ? part + 1 : closed ? parts.length + 1 : 0

  return (
    <>
      <section
        ref={section}
        id={which === 30 ? 'panels' : 'panels-sip'}
        className={`fu-layers wp-panels wp-panels--${which} on-yellow`}
        // the page's one scroll a step: opened at its top, closed up a screen on; going back up, the same two
        data-stops={compact ? undefined : '0,1'}
        data-no-top=""
        data-back="all"
        aria-labelledby={titleId}
        style={{ '--run': compact ? 1 : 2 } as CSSProperties}
      >
        <div className="fu-layers__pin">
          <div className="fu-layers__copy wp-panels__side">
            <div className="wp-panels__head">
              <h2 id={titleId} className="fu-layers__title">
                {panel.name}
              </h2>
              <p className="wp-panels__thick num">{panel.thick} mm</p>
            </div>

            {/* the part picked, in words, as the answers' each answer: a headline and a line on it; before one is picked the
                panel's, closed up the panel whole. On a phone, its parts to pick from as a list */}
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
                  const on = k === wordsOn
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

            {/* the way to its technical sheet: every figure is there */}
            <div className="wp-panels__foot">
              <button type="button" className="explore explore--line wp-panels__more" onClick={openSheet}>
                <span className="explore__label">View all technical details</span>
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
              <div className="fu-box__clip fu-sheet__view on-black" onClick={pickNumber}>
                <Stage3D shadows keyLight={false} sharp>
                  <PieceStage t={t} bus={bus} room={room} focus={focus} live={live} />
                  <LabelProjector bus={bus} bottom={58} top={20} rows={34} />
                </Stage3D>
                <Labels bus={bus} labels={labels} shown={shown} focus={part === null ? null : `${prefix}${part}`} />

                {/* which part is seen: its number of them, and its name */}
                <p className="fu-sheet__now" aria-live="polite">
                  <span className="num">{part === null ? `${panel.thick} mm` : `${String(part + 1).padStart(2, '0')} / ${String(parts.length).padStart(2, '0')}`}</span>
                  <span className="fu-sheet__name">{part === null ? `${panel.name}${closed ? ', whole' : ''}` : parts[part].short}</span>
                </p>

                {/* what can be done with it, once it has opened */}
                {still && <HintTag key={part === null ? 'pick' : 'all'} hint={part === null ? PICK : ALL} className="fu-sheet__hint" />}
              </div>
              <i className="fu-box__dot" aria-hidden="true">
                <span ref={rx} className="fu-box__x num" />
                <span ref={ry} className="fu-box__y num" />
              </i>
            </div>
          </figure>

          {/* the panel's parts on a bar to pick from: each picked shown alone, picked again let go */}
          {!compact && <StepBar label={`The ${panel.name.toLowerCase()}'s parts`} names={parts.map((p) => p.short)} step={part ?? -1} onGo={pick} skip={false} pick />}
        </div>
      </section>

      {sheetEl}
    </>
  )
}
