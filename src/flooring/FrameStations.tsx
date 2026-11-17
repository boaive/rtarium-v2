import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus, type LabelBus } from '../facade/three/kit'
import { FollowScroll, type Progress } from '../facade/progress'
import { StepFloor } from '../facade/unitized/StepFloor'
import { useStepClock } from '../facade/unitized/stepClock'
import type { BuildRoom } from './data/three/BuildScene'

/**
 * A phone's frame to floor (data centres, warehouse, semiconductor), set as the Unitized page's slab to slab (Hang:
 * StepFloor): the steps on a floor, playing themselves one after another, the scene live, each step played out from
 * where the last left off over its share of the wide screen's play, then held a moment before the next comes in.
 */

export interface FramePhase {
  name: string
  line: string
  /** where the step has played out, as a point of the scene's run */
  to: number
}

type FrameSceneProps = { progress: Progress; bus: LabelBus; room: RefObject<BuildRoom> }

/** the room the scene keeps to on a phone: under the heading and its line, over the dashes */
const PHONE_ROOM: BuildRoom = { x: 0.02, y: 0.31, w: 0.96, h: 0.52 }
/** how long a step holds once it has played out, before the next comes in (ms) */
const HOLD = 700

function FrameLive({ k, turn, phases, ms, Scene, labels, shownAt, fallback }: { k: number; turn: number; phases: FramePhase[]; ms: number[]; Scene: ComponentType<FrameSceneProps>; labels: LabelSpec[]; shownAt: (p: number) => string[]; fallback: ReactNode }) {
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const room = useRef<BuildRoom>(PHONE_ROOM)
  const [shown, setShown] = useState<string[]>([])
  // (a new step: its labels go until it has played out)
  useEffect(() => setShown([]), [k, turn])
  useStepClock(progress, k, turn, phases[k].to, Math.max(400, ms[k] - HOLD), 0, () => setShown(shownAt(progress.value)))
  return (
    <div className="fsf__live" aria-hidden="true">
      <Stage3D fallback={fallback}>
        <Scene progress={progress} bus={bus} room={room} />
        <FollowScroll progress={progress} />
        <LabelProjector bus={bus} bottom={110} />
      </Stage3D>
      <Labels bus={bus} labels={labels} shown={shown} />
    </div>
  )
}

export function FrameStations({ id, title, sub, phases, play, Scene, labels, shownAt, fallback }: { id: string; title: string; sub: string; phases: FramePhase[]; play: number; Scene: ComponentType<FrameSceneProps>; labels: LabelSpec[]; shownAt: (p: number) => string[]; fallback: ReactNode }) {
  const section = useRef<HTMLElement>(null)
  const ms = useMemo(() => phases.map((ph, i) => Math.round((ph.to - (i ? phases[i - 1].to : 0)) * play * 1000 + HOLD)), [phases, play])
  return (
    <StepFloor
      scene={(k, turn) => <FrameLive k={k} turn={turn} phases={phases} ms={ms} Scene={Scene} labels={labels} shownAt={shownAt} fallback={fallback} />}
      once
      sectionRef={section}
      id={id}
      title={title}
      kicker={['On site', 'The building']}
      sub={sub}
      items={phases.map((ph, i) => ({ name: ph.name, line: ph.line, clip: '', ms: ms[i] }))}
    />
  )
}
