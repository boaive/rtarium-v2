import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

export function FailCards({ id, title, label, reasons, beats, labels, scene, fallback }: { id: string; title: string; label: string; reasons: Reason[]; beats: [number, number][]; labels: LabelSpec[]; scene: FailSceneOf; fallback: ReactNode }) {
  const compact = useIsCompact()
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
