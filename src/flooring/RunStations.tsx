import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Zoom } from '../facade/unitized/Zoom'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus, type LabelBus } from '../facade/three/kit'
import type { Progress } from '../facade/progress'
import { Stations } from '../facade/unitized/Stations'
import { useStepClock } from '../facade/unitized/stepClock'
import { useLive } from '../facade/unitized/live'
import type { BuildRoom } from './data/three/BuildScene'

/**
 * A phone's build (data centres' "Built up from the slab", the warehouse's "How RTARIUM holds", the semiconductor plant's
 * "How yield is maintained"), set as the Unitized page's answers (Stations, the solution's card): each step played live in
 * the card, one after another by themselves, the bar, and the steps in a strip; the page scrolls past it as past any
 * screen. A step is played on its own clock from where the last left off to where the wide screen's run has played it
 * out (as its scroll did), its labels up once it has.
 */

export interface RunStep {
  id: string
  name: string
  line: string
  labels: string[]
}

export type RunScene = (t: Progress, bus: LabelBus, room: RefObject<BuildRoom>, live: { current: boolean }) => ReactNode

/** the room the scene keeps to in the card */
const CARD_ROOM: BuildRoom = { x: 0.08, y: 0.1, w: 0.84, h: 0.8 }
/** the labels' reach in the card, a share of the wide screen's */
const REACH = 0.6

function RunLive({ k, turn, steps, ms, hold, scene, labels, fallback, section, zoom, keyLight = true }: { k: number; turn: number; steps: RunStep[]; ms: number[]; hold: number[]; scene: RunScene; labels: LabelSpec[]; fallback: ReactNode; section: RefObject<HTMLElement | null>; zoom?: number[]; keyLight?: boolean }) {
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const room = useRef<BuildRoom>(CARD_ROOM)
  const live = useLive(section)
  const [lit, setLit] = useState('')
  const n = steps.length
  useEffect(() => setLit(''), [k, turn])
  useStepClock(t, k, turn, k + (k === n - 1 ? 0.9 : 0.76), Math.max(400, ms[k] - hold[k]), 0, () => setLit(steps[k].id))
  // (the labels change after the frame that moved the scene: one more frame, so they are placed for the new step)
  useEffect(() => {
    t.listeners.forEach((f) => f())
  }, [lit, t])
  const near = useMemo(() => labels.map((l) => ({ ...l, dx: l.dx * REACH, dy: l.dy * REACH })), [labels])
  const shown = steps.find((s) => s.id === lit)?.labels ?? []
  return (
    <div className="fst__live" aria-hidden="true">
      <Stage3D shadows keyLight={keyLight} fallback={fallback}>
        {scene(t, bus, room, live)}
        <Zoom by={zoom?.[k] ?? 1.45} />
        <LabelProjector bus={bus} bottom={8} />
      </Stage3D>
      <Labels bus={bus} labels={near} shown={shown} />
    </div>
  )
}

export function RunStations({ id, title, steps, stretch, scene, labels, fallback, zoom, thumbs, manual, center, controls, keyLight, foot, action }: { id: string; title: string; steps: RunStep[]; stretch: number[]; scene: RunScene; labels: LabelSpec[]; fallback: ReactNode; /** each step's zoom in the card (Zoom) */ zoom?: number[]; /** where each step's still for the strip is (`${thumbs}-${n}.webp`) */ thumbs?: string; /** a step a swipe (Stations) */ manual?: boolean; /** the card midway between words and bar (Stations) */ center?: boolean; /** small back, on, again buttons (Stations) */ controls?: boolean; /** the stage's fixed key light (off: the scene brings its own) */ keyLight?: boolean; /** after the strip (Stations) */ foot?: ReactNode; /** under the step's words, over the card (Stations) */ action?: ReactNode }) {
  const section = useRef<HTMLElement>(null)
  const n = steps.length
  // (a step's time from its share of the wide screen's scroll; the last held a little longer on its labels)
  const hold = useMemo(() => steps.map((_, k) => (k === n - 1 ? 1200 : 500)), [steps, n])
  const ms = useMemo(() => stretch.map((st, k) => Math.round(st * 1800 + hold[k])), [stretch, hold])
  return (
    <Stations
      sectionRef={section}
      id={id}
      title={title}
      label="Step"
      ground="yellow"
      presentation="solution"
      manual={manual}
      center={center}
      controls={controls}
      foot={foot}
      action={action}
      scene={(k, turn) => <RunLive k={k} turn={turn} steps={steps} ms={ms} hold={hold} scene={scene} labels={labels} fallback={fallback} section={section} zoom={zoom} keyLight={keyLight} />}
      items={steps.map((st, i) => ({ name: st.name, line: st.line, clip: '', ms: ms[i], thumb: thumbs ? `${thumbs}-${i + 1}.webp` : undefined }))}
    />
  )
}
