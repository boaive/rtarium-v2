import { useEffect, useMemo, useRef, useState } from 'react'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useIsCompact } from '../../lib/motion'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus } from '../three/kit'
import { FollowScroll, type Progress } from '../progress'
import { TradePanel } from '../three/rain/TradePanel'
import { CardNav, cardState, loopAt, OPEN_REACH, useCardClock, useCardFocus, useOpenCard, useReplay } from '../unitized/CardOpen'
import { useLive } from '../unitized/live'
import { RiseWords, useRise } from '../unitized/Rise'
import { DeckCards, type DeckItem } from '../DeckCards'

/**
 * The trade-offs, on black, on one screen, in the cards of the Unitized page's four problems (`Flaws`): the title
 * along the top, then five cards, each with its material in 3D over its number, name, figures and what it falls
 * short on. The title's words rise with the scroll, a line runs along the top of the cards and they pop up one after
 * another. Each card's scene keeps playing its trade-off on its own clock while it can be seen (`TradePanel`), without
 * labels: those are for the opened view. Pointing at a card lights it and turns its material to the visitor; clicking
 * one opens it across the whole panel and plays it again (`CardOpen`). RTARIUM's answers follow it.
 *
 * Typical figures, from published sources (REVIEW.materials): precast 125–150 mm at about 350 kg/m²
 * (Construction Canada); solid stone 20–30 mm, 30 mm granite about 75–85 kg/m², panels as small as
 * 600 × 1200 mm (manufacturer data); GRC skins 12–20 mm, thin GRC about 30 kg/m² and more with its
 * frame, AR-glass strength lost with long wet exposure (PCI Journal, 1987); UHPC 15–30 mm at 33–66
 * kg/m² (manufacturer data); aluminium composite about 4 mm and a few kilograms a square metre.
 */
const MATERIALS = [
  { id: 'precast', name: 'Precast concrete', thick: '125–150 mm', weight: '~350 kg/m²', costs: 'Heavy on the frame and the foundations.', fix: 'A 12 mm panel, under 30 kg/m².' },
  { id: 'stone', name: 'Natural stone', thick: '20–30 mm', weight: '75–85 kg/m²', costs: 'Heavy, and only in small sizes.', fix: 'Panels up to 6 m tall, cast in one piece.' },
  { id: 'grc', name: 'GRC', thick: '12–20 mm', weight: '30–45 kg/m²', costs: 'Its glass fibre loses strength with age.', fix: 'A basalt textile that keeps its strength.' },
  { id: 'uhpc', name: 'UHPC', thick: '15–30 mm', weight: '33–66 kg/m²', costs: 'A costly mix, its steel fibres can corrode.', fix: 'Basalt, which does not corrode.' },
  { id: 'acp', name: 'Metal / ACP', thick: '3–4 mm', weight: 'Under 10 kg/m²', costs: 'Dents, fades, and it isn’t concrete.', fix: 'A solid concrete face.' },
]

const LABELS: LabelSpec[] = [
  { id: 'l0', anchor: 'tr-0', text: 'Thick, and heavy on the frame', dx: 56, dy: 60 },
  { id: 'l1', anchor: 'tr-1', text: 'Small panels, many joints', dx: 60, dy: -70 },
  { id: 'l2', anchor: 'tr-2', text: 'Fibre weakened with age', dx: 50, dy: -76 },
  { id: 'l3', anchor: 'tr-3', text: 'Steel fibre rusts', dx: -60, dy: -70 },
  { id: 'l4', anchor: 'tr-4', text: 'Dented, and faded', dx: 56, dy: -64 },
]

function Card({ k, progress, live, compact, open, onOpen }: { k: number; progress: Progress; live: { current: boolean }; compact: boolean; open: number | null; onOpen: (k: number | null) => void }) {
  const mat = MATERIALS[k]
  const isOpen = open === k
  const bus = useMemo(createBus, [])
  const [hover, setHover] = useState(false)
  const [done, setDone] = useState(false)
  const act = useRef(0)
  const { opener, closer } = useCardFocus(isOpen, open)

  const show = (a: number) => {
    act.current = a
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

  const pointing = hover && !isOpen
  const marks = useMemo(() => [isOpen ? { ...LABELS[k], dx: LABELS[k].dx * OPEN_REACH, dy: LABELS[k].dy * OPEN_REACH } : LABELS[k]], [isOpen, k])

  return (
    <li
      className={`fu-prob ${hover ? 'is-hover' : ''} ${cardState(k, open)}`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <div className="fu-prob__stage" role="img" aria-label={`${mat.name}: ${mat.costs}`}>
        <div className="fu-prob__frame">
          <Stage3D shadows keyLight={false}>
            <MovingKeyLight focus={[0, 0, 0]} reach={1.6} />
            <TradePanel k={k} act={act} hover={pointing} bus={bus} live={live} compact={compact} card />
            <FollowScroll progress={progress} />
            <LabelProjector bus={bus} bottom={8} />
          </Stage3D>
          <Labels key={isOpen ? 'open' : 'card'} bus={bus} labels={marks} shown={isOpen && done ? [`l${k}`] : []} />
        </div>
      </div>
      <div className="fu-prob__text">
        <span className="fct-col__num num">0{k + 1}</span>
        <h3 className="fct-col__name fu-prob__name">{mat.name}</h3>
        <p className="fr-card__facts num">
          {mat.thick} thick · {mat.weight}
        </p>
        <p className="fct-col__line fu-prob__line">{mat.costs}</p>
        {isOpen && <CardNav k={k} total={MATERIALS.length} onOpen={onOpen} />}
      </div>
      {isOpen && (
        <button ref={closer} type="button" className="fu-prob__close" onClick={() => onOpen(null)}>
          Close <span aria-hidden="true">×</span>
        </button>
      )}
      {open === null && (
        <button ref={opener} type="button" className="fu-prob__open" aria-label={`Open ${mat.name} in a larger view`} onClick={() => onOpen(k)}>
          <span aria-hidden="true">+</span>
        </button>
      )}
    </li>
  )
}

export function Trade() {
  return useIsCompact() ? <TradeCards /> : <TradeGrid />
}

function TradeGrid() {
  const compact = false
  const section = useRef<HTMLElement>(null)
  const progress = useCardClock(section)
  const live = useLive(section)
  const title = useRef<HTMLHeadingElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const cols = useRef<HTMLOListElement>(null)
  const { open, setOpen, tracks } = useOpenCard(MATERIALS.length, compact)
  useRise(section, title, rail, cols, compact)

  return (
    <section ref={section} id="tradeoffs" className="fu-flaws on-black" data-ground="black" aria-labelledby="tradeoffs-title">
      <div className="fu-probs">
        <h2 ref={title} id="tradeoffs-title" className="fu-flaws__title fu-probs__title">
          <RiseWords text="Every material has its trade-offs." />
          <ReviewNote>{REVIEW.materials}</ReviewNote>
        </h2>
        <div ref={rail} className="fu-probs__rail" aria-hidden="true" />
        <ol ref={cols} className="fu-probs__cols fu-probs__cols--five fu-probs__cols--open" style={tracks} aria-label="The materials compared">
          {MATERIALS.map((m, k) => (
            <Card key={m.id} k={k} progress={progress} live={live} compact={compact} open={open} onOpen={setOpen} />
          ))}
        </ol>
      </div>
    </section>
  )
}

/**
 * a phone: the five as the Unitized page's four problems are dealt (FlawsCards: DeckCards, Home's deck), each with a
 * drawing of its own in place of its 3D: plain hairlines, a touch of yellow. Precast: a thick slab on its frame. Stone:
 * small tiles, many joints. GRC: glass fibre, broken as it ages. UHPC: steel fibre, rust on it. Metal: a thin sheet, dented.
 */
const MATERIAL_ICONS = [
  <svg key="precast" viewBox="0 0 40 40">
    <path d="M6 6v28M6 12h4M6 28h4" />
    <path className="vs__glyph-fill" d="M12 7h16v26H12z" />
    <path d="M32 9v22M30 11l2-2 2 2M30 29l2 2 2-2" />
  </svg>,
  <svg key="stone" viewBox="0 0 40 40">
    <path d="M7 7h26v26H7zM7 16h26M7 25h26M16 7v9M25 7v9M12 16v9M21 16v9M29 16v9M16 25v8M25 25v8" />
    <path className="vs__glyph-fill" d="M21 16h8v9h-8z" />
  </svg>,
  <svg key="grc" viewBox="0 0 40 40">
    <path d="M6 12h28M6 20h11M23 20h11M6 28h28" />
    <path className="vs__glyph-fill" d="M17 17l3 2-2 2 3 2 2-6z" />
  </svg>,
  <svg key="uhpc" viewBox="0 0 40 40">
    <path d="M8 10l10 4M22 8l9 6M7 22l11 2M24 21l9 4M10 32l9-3M23 30l10 2" />
    <circle className="vs__glyph-fill" cx="18" cy="24" r="2.6" />
    <circle className="vs__glyph-fill" cx="31" cy="14" r="2.2" />
  </svg>,
  <svg key="acp" viewBox="0 0 40 40">
    <path d="M8 8h24M8 32h24M8 8v24M32 8v24" />
    <path className="vs__glyph-fill" d="M15 17c3-2 7-2 9 1-2 3-6 4-9 2z" />
  </svg>,
]

function TradeCards() {
  const items: DeckItem[] = MATERIALS.map((m, k) => ({
    id: m.id,
    name: m.name,
    full: `${m.thick} thick · ${m.weight}`,
    icon: (
      <span className="vs__glyph" aria-hidden="true">
        {MATERIAL_ICONS[k]}
      </span>
    ),
    parts: [
      { label: 'The trade-off', text: m.costs },
      { label: 'With RTARIUM', text: m.fix },
    ],
  }))
  // (on black, its cards white, as the Unitized page's problems)
  return <DeckCards id="tradeoffs" title="Every material has its trade-offs." items={items} ground="black" />
}
