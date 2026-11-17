import { useEffect, useMemo, useRef, useState } from 'react'
import { useIsCompact } from '../../lib/motion'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus } from '../three/kit'
import { FollowScroll, type Progress } from '../progress'
import { FlawPanel, type FlawMix } from '../three/unit/FlawPanel'
import { CardNav, cardState, loopAt, OPEN_REACH, useCardClock, useCardFocus, useOpenCard, useReplay } from './CardOpen'
import { useLive } from './live'
import { DeckCards, type DeckItem } from '../DeckCards'
import { RiseWords, useRise } from './Rise'

/**
 * Four problems of thin precast panels, on black, on one screen: the title along the top, then four
 * cards in the columns of the systems block at the foot of the page, each with its own panel over its
 * number, name and line. Everything follows the scroll as the section comes up:
 * the title's words rise into place, a line runs along the top of the cards, and the frames pop up one after
 * another, the last landing as the section reaches the
 * top, so the page is never held. Their panels keep playing on their own clock while they can be seen (the crack
 * opens, the fibres clump, the fixing pulls out, the panel grows), without labels: those are for the opened view.
 * Pointing at a card draws a yellow line over its words, lights its name and turns its panel to the visitor; clicking
 * one opens it across the whole panel and plays it again (`CardOpen`).
 */

const FLAWS = [
  { name: 'Direction weakness', line: 'Fibres settle in one direction. Load the panel across them and it cracks first.', fix: 'Reinforced in 3D' },
  { name: 'Clumping', line: 'Loose fibre bunches together. Between the bunches, nothing reinforces the panel.', fix: 'Mesh in textile form' },
  { name: 'Isolated anchorage', line: 'Each fixing holds on a small cone of concrete.', fix: 'In-built ferrule inserts' },
  { name: 'Length to weight ratio', line: 'A longer panel has to be thicker and heavier.', fix: 'Up to 6 m high, no extra thickness' },
]

const LABELS: LabelSpec[] = [
  { id: 'l0', anchor: 'f-crack', text: 'Crack along the fibres', dx: -64, dy: -96 },
  { id: 'l1', anchor: 'f-bare', text: 'Bare zone', dx: 44, dy: 84 },
  { id: 'l2', anchor: 'f-cone', text: 'Pull-out cone', dx: 40, dy: -56 },
  { id: 'l3', anchor: 'f-edge', text: 'Thicker, heavier', dx: -72, dy: -56 },
]

function Card({ k, progress, live, compact, open, onOpen }: { k: number; progress: Progress; live: { current: boolean }; compact: boolean; open: number | null; onOpen: (k: number | null) => void }) {
  const flaw = FLAWS[k]
  const isOpen = open === k
  const bus = useMemo(createBus, [])
  const [hover, setHover] = useState(false)
  const [done, setDone] = useState(false)
  const mix = useRef<FlawMix>({ w: FLAWS.map((_, i) => Number(i === k)), act: [0, 0, 0, 0] })
  const { opener, closer } = useCardFocus(isOpen, open)

  const show = (a: number) => {
    mix.current.act = FLAWS.map((_, i) => (i === k ? a : 0))
    setDone(a > 0.9)
  }

  useEffect(() => {
    if (isOpen) return
    const paint = () => show(loopAt(progress.value, k))
    paint()
    progress.listeners.add(paint)
    return () => void progress.listeners.delete(paint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, k, isOpen])

  useReplay(isOpen, show)

  // pointing at a card shows it played out; the larger view plays on its own
  const pointing = hover && !isOpen
  const marks = useMemo(() => [isOpen ? { ...LABELS[k], dx: LABELS[k].dx * OPEN_REACH, dy: LABELS[k].dy * OPEN_REACH } : LABELS[k]], [isOpen, k])

  return (
    <li
      className={`fu-prob ${hover ? 'is-hover' : ''} ${cardState(k, open)}`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <div className="fu-prob__stage" role="img" aria-label={`A conventional thin panel showing ${flaw.name.toLowerCase()}`}>
        <div className="fu-prob__frame">
          <Stage3D shadows keyLight={false}>
            <MovingKeyLight focus={[0, 0, 0]} reach={1.6} />
            <FlawPanel mix={mix} hover={pointing ? k : null} bus={bus} live={live} compact={compact} card />
            <FollowScroll progress={progress} />
            <LabelProjector bus={bus} bottom={8} />
          </Stage3D>
          {/* a label's reach is read once, when it first shows: a new view takes new ones */}
          <Labels key={isOpen ? 'open' : 'card'} bus={bus} labels={marks} shown={isOpen && done ? [`l${k}`] : []} />
        </div>
      </div>
      <div className="fu-prob__text">
        <span className="fct-col__num num">0{k + 1}</span>
        <h3 className="fct-col__name fu-prob__name">{flaw.name}</h3>
        <p className="fct-col__line fu-prob__line">{flaw.line}</p>
        {isOpen && <CardNav k={k} total={FLAWS.length} onOpen={onOpen} />}
      </div>
      {isOpen && (
        <button ref={closer} type="button" className="fu-prob__close" onClick={() => onOpen(null)}>
          Close <span aria-hidden="true">×</span>
        </button>
      )}
      {open === null && (
        <button ref={opener} type="button" className="fu-prob__open" aria-label={`Open ${flaw.name} in a larger view`} onClick={() => onOpen(k)}>
          <span aria-hidden="true">+</span>
        </button>
      )}
    </li>
  )
}

export function Flaws() {
  return useIsCompact() ? <FlawsCards /> : <FlawsGrid />
}

function FlawsGrid() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const progress = useCardClock(section)
  const live = useLive(section)
  const cols = useRef<HTMLOListElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const { open, setOpen, tracks } = useOpenCard(FLAWS.length, compact)

  useRise(section, title, rail, cols, compact)

  return (
    <section ref={section} id="problems" className="fu-flaws on-black" aria-labelledby="fu-flaws-title">
      <div className="fu-probs">
        <h2 ref={title} id="fu-flaws-title" className="fu-flaws__title fu-probs__title">
          <RiseWords text="Four problems with thin panels." />
        </h2>
        <div ref={rail} className="fu-probs__rail" aria-hidden="true" />
        <ol ref={cols} className="fu-probs__cols fu-probs__cols--open" style={tracks} aria-label="The four problems">
          {FLAWS.map((f, k) => (
            <Card key={f.name} k={k} progress={progress} live={live} compact={compact} open={open} onOpen={setOpen} />
          ))}
        </ol>
      </div>
    </section>
  )
}

/**
 * A phone: the four problems as veedo.space sets "How is Vee different?", cards one after another down the page (not
 * stacked), each wider than it is tall: its number at the top left and, where veedo has its drawing, a still of its
 * panel played out (rendered from the 3D, not the 3D itself); then its name, large, its line, and at its foot, under a
 * hairline, the RTARIUM answer to it (the answers further down the page).
 */
/**
 * a phone: the four as Home's deck deals its cards (DeckCards), each with a drawing of its own in place of its panel's
 * still: plain hairlines, a touch of yellow. Direction weakness: fibres all one way, a crack across them. Clumping: the
 * fibre bunched, bare between. Isolated anchorage: a fixing on its small cone of concrete. Length to weight: a tall panel,
 * the weight it takes on as it grows.
 */
const FLAW_ICONS = [
  <svg key="dir" viewBox="0 0 40 40">
    <path d="M7 10h26M7 16h26M7 22h26M7 28h26" />
    <path className="vs__glyph-fill" d="M20 5l-3 9 5 3-4 9 3 3-2 7 7-11-5-3 4-8z" />
  </svg>,
  <svg key="clump" viewBox="0 0 40 40">
    <path d="M7 9l6 4M9 14l5-4M6 12h8M26 25l6 4M28 30l5-4M25 28h8" />
    <circle className="vs__glyph-fill" cx="10" cy="12" r="3.4" />
    <circle className="vs__glyph-fill" cx="29" cy="28" r="3.4" />
    <path d="M17 33l6-26" strokeDasharray="2 3" />
  </svg>,
  <svg key="anchor" viewBox="0 0 40 40">
    <path d="M6 9h28M20 9v16" />
    <path className="vs__glyph-fill" d="M20 25l-9 9h18z" />
    <path d="M16 13h8M16 18h8" />
  </svg>,
  <svg key="length" viewBox="0 0 40 40">
    <path d="M14 5h9v30h-9z" />
    <path d="M30 6v28M27 9l3-3 3 3M27 31l3 3 3-3" />
    <path className="vs__glyph-fill" d="M6 30h7v5H6z" />
  </svg>,
]

function FlawsCards() {
  const items: DeckItem[] = FLAWS.map((f, k) => ({
    id: `problem-${k + 1}`,
    name: f.name,
    icon: (
      <span className="vs__glyph" aria-hidden="true">
        {FLAW_ICONS[k]}
      </span>
    ),
    parts: [
      { label: 'The problem', text: f.line },
      { label: 'With RTARIUM', text: `${f.fix}.` },
    ],
  }))
  // (on black, its cards white)
  return <DeckCards id="problems" title="Four problems with thin panels." items={items} ground="black" />
}
