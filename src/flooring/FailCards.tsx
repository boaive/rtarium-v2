import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useIsCompact } from '../lib/motion'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus, type LabelBus } from '../facade/three/kit'
import type { Progress } from '../facade/progress'
import { useLive } from '../facade/unitized/live'
import { CardNav, cardState, loopAt, OPEN_REACH, useCardClock, useCardFocus, useOpenCard, useReplay } from '../facade/unitized/CardOpen'
import { RiseWords, useRise } from '../facade/unitized/Rise'
import { Wake } from '../facade/three/rain/lines'
import type { BuildRoom } from './data/three/BuildScene'

/**
 * Where the conventional floor fails, as the Unitized page's four problems: on black, on one screen, the title along
 * the top and a card to each reason, its own piece of the scene over its number, name and line. The cards pop up with
 * the scroll; each loops its stretch of the scene (`beats`, in the scene's own time) on its own clock while it can
 * be seen, without labels: those are for the opened view. Clicking one opens it across the whole panel (`CardOpen`).
 */

export interface Reason {
  id: string
  name: string
  line: string
  labels: string[]
}

export type FailSceneOf = (t: Progress, bus: LabelBus, compact: boolean, room: { current: BuildRoom }, live: { current: boolean }) => ReactNode

/** the scene keeps to the whole of its card */
const ROOM: BuildRoom = { x: 0.05, y: 0.06, w: 0.9, h: 0.86 }

interface CardProps {
  k: number
  total: number
  beat: [number, number]
  reason: Reason
  labels: LabelSpec[]
  scene: FailSceneOf
  fallback: ReactNode
  play: Progress
  live: { current: boolean }
  open: number | null
  onOpen: (k: number | null) => void
}

function Card({ k, total, beat, reason, labels, scene, fallback, play, live, open, onOpen }: CardProps) {
  const isOpen = open === k
  const bus = useMemo(createBus, [])
  const t = useMemo<Progress>(() => ({ value: beat[0], listeners: new Set() }), [beat])
  const room = useRef<BuildRoom>(ROOM)
  const [done, setDone] = useState(false)
  const [hover, setHover] = useState(false)
  const { opener, closer } = useCardFocus(isOpen, open)

  const show = (a: number) => {
    const v = beat[0] + (beat[1] - beat[0]) * a
    if (t.value !== v) {
      t.value = v
      t.listeners.forEach((f) => f())
    }
    setDone(a > 0.9)
  }

  useEffect(() => {
    if (isOpen) return
    const paint = () => show(loopAt(play.value, k))
    paint()
    play.listeners.add(paint)
    return () => void play.listeners.delete(paint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, t, k, beat, isOpen])

  useReplay(isOpen, show)

  // in the larger view the words stand further out, clear of the larger model
  const marks = useMemo(() => (isOpen ? labels.map((l) => ({ ...l, dx: l.dx * OPEN_REACH, dy: l.dy * OPEN_REACH })) : labels), [isOpen, labels])

  return (
    <li className={`fu-prob ${hover ? 'is-hover' : ''} ${cardState(k, open)}`} onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)} onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}>
      <div className="fu-prob__stage" aria-hidden="true">
        <div className="fu-prob__frame">
          <Stage3D shadows fallback={fallback}>
            <Wake live={live} />
            {scene(t, bus, false, room, live)}
            <LabelProjector bus={bus} bottom={8} />
          </Stage3D>
          {/* a label's reach is read once, when it first shows: a new view takes new ones */}
          <Labels key={isOpen ? 'open' : 'card'} bus={bus} labels={marks} shown={isOpen && done ? reason.labels : []} />
        </div>
      </div>
      <div className="fu-prob__text">
        <span className="fct-col__num num">0{k + 1}</span>
        <h3 className="fct-col__name fu-prob__name">{reason.name}</h3>
        <p className="fct-col__line fu-prob__line">{reason.line}</p>
        {isOpen && <CardNav k={k} total={total} onOpen={onOpen} />}
      </div>
      {isOpen && (
        <button ref={closer} type="button" className="fu-prob__close" onClick={() => onOpen(null)}>
          Close <span aria-hidden="true">×</span>
        </button>
      )}
      {open === null && (
        <button ref={opener} type="button" className="fu-prob__open" aria-label={`Open ${reason.name} in a larger view`} onClick={() => onOpen(k)}>
          <span aria-hidden="true">+</span>
        </button>
      )}
    </li>
  )
}

type FailCardsProps = { id: string; title: string; label: string; reasons: Reason[]; beats: [number, number][]; labels: LabelSpec[]; scene: FailSceneOf; fallback: ReactNode }

export function FailCards(props: FailCardsProps) {
  return useIsCompact() ? <FailScreen {...props} /> : <FailGrid {...props} />
}

/** a phone: the scene keeps to the room under the words and over the dashes */
const PHONE_ROOM: BuildRoom = { x: 0.04, y: 0.3, w: 0.92, h: 0.52 }

/**
 * A phone: the reasons as the Unitized page's six layers are on one (Layers): one black screen held while the page
 * scrolls, the reason in play at the top (its number and name in yellow, its line), its piece of the scene in the middle,
 * a dash a reason along the foot. The scroll plays the scene on, a reason a swipe (the page's stepper rests where each
 * has played out: `data-stops`); between two, the scene runs on into the next one's stretch.
 */
function FailScreen({ id, title, reasons, beats, labels, scene, fallback }: FailCardsProps) {
  const n = reasons.length
  const section = useRef<HTMLElement>(null)
  const live = useLive(section)
  const bus = useMemo(createBus, [])
  const t = useMemo<Progress>(() => ({ value: beats[0][0], listeners: new Set() }), [beats])
  const room = useRef<BuildRoom>(PHONE_ROOM)
  const [k, setK] = useState(0)
  const [lit, setLit] = useState(false)
  /** each reason's stretch of the scene: from its beat's start on to the next one's (the last, to its own end) */
  const span = useMemo(() => beats.map((b, i) => [b[0], i < n - 1 ? beats[i + 1][0] : b[1]] as [number, number]), [beats, n])
  /** where in its stretch each reason has played out (its beat's end): the page rests there */
  const rest = useMemo(() => beats.map((b, i) => Math.min(0.96, (b[1] - span[i][0]) / Math.max(1e-3, span[i][1] - span[i][0]))), [beats, span])
  const stops = useMemo(() => rest.map((a, i) => ((i + a) / n).toFixed(4)).join(','), [rest, n])

  useEffect(() => {
    const el = section.current
    if (!el) return
    let raf = 0
    const read = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const run = Math.max(1, r.height - window.innerHeight)
      const s = Math.min(n - 1e-4, Math.max(0, (-r.top / run) * n))
      const i = Math.floor(s)
      const a = s - i
      const v = span[i][0] + (span[i][1] - span[i][0]) * a
      if (t.value !== v) {
        t.value = v
        t.listeners.forEach((f) => f())
      }
      setK(i)
      setLit(a >= rest[i] * 0.85)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [n, span, rest, t])

  const reason = reasons[k]
  return (
    <section ref={section} id={id} className="ffail on-black" data-ground="black" data-stops={stops} data-no-top="" data-back="all" aria-labelledby={`${id}-title`} style={{ '--n': n } as CSSProperties}>
      <div className="ffail__pin">
        <div className="ffail__stage" aria-hidden="true">
          <Stage3D shadows fallback={fallback}>
            <Wake live={live} />
            {/* (framed in its room under the words: a scene's own phone framing was the old cards') */}
            {scene(t, bus, false, room, live)}
            <LabelProjector bus={bus} bottom={8} />
          </Stage3D>
          <Labels bus={bus} labels={labels} shown={lit ? reason.labels : []} />
        </div>
        {/* the section's title at the top, the reason in play under it; its number large at the foot, on the right */}
        <div className="ffail__top">
          <h2 id={`${id}-title`} className="ffail__title">
            {title}.
          </h2>
          <div key={reason.id} className="ffail__words" aria-live="polite">
            <h3 className="ffail__name">{reason.name}</h3>
            <p className="ffail__line">{reason.line}</p>
          </div>
        </div>
        <p className="ffail__count num" aria-hidden="true">
          <b key={reason.id}>0{k + 1}</b>
          <span>/ 0{n}</span>
        </p>
        <ol className="ffail__dashes" aria-hidden="true">
          {reasons.map((r, i) => (
            <li key={r.id} className={i < k ? 'is-past' : i === k ? 'is-now' : ''} />
          ))}
        </ol>
      </div>
    </section>
  )
}

function FailGrid({ id, title, label, reasons, beats, labels, scene, fallback }: FailCardsProps) {
  const compact = false
  const section = useRef<HTMLElement>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const cols = useRef<HTMLOListElement>(null)
  const play = useCardClock(section)
  const live = useLive(section)
  const { open, setOpen, tracks } = useOpenCard(reasons.length, compact)
  useRise(section, head, rail, cols, compact)

  return (
    <section ref={section} id={id} className="fu-flaws on-black" data-ground="black" aria-labelledby={`${id}-title`}>
      <div className="fu-probs">
        <h2 ref={head} id={`${id}-title`} className="fu-flaws__title fu-probs__title">
          <RiseWords text={title} />
        </h2>
        <div ref={rail} className="fu-probs__rail" aria-hidden="true" />
        <ol ref={cols} className="fu-probs__cols fu-probs__cols--open fu-probs__cols--five" style={tracks} aria-label={label}>
          {reasons.map((r, k) => (
            <Card
              key={r.id}
              k={k}
              total={reasons.length}
              beat={beats[k]}
              reason={r}
              labels={labels.filter((l) => r.labels.includes(l.id))}
              scene={scene}
              fallback={fallback}
              play={play}
              live={live}
              open={open}
              onOpen={setOpen}
            />
          ))}
        </ol>
      </div>
    </section>
  )
}
