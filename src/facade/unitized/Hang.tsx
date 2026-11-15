import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useIsCompact } from '../../lib/motion'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus } from '../three/kit'
import { ScrubRig } from '../three/ScrubRig'
import { FollowScroll, smooth, useScrollProgress, type Progress } from '../progress'
import { scrollToY } from '../../lib/scroll'
import { HANG, HangScene, hangShot } from '../three/unit/HangScene'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useLive } from './live'
import { REPLAY_HINT, StepBar } from './StepBar'
import { StepFloor } from './StepFloor'

/**
 * Slab to slab, and onto the building. One scene on the warm white page, edge to edge and sharp (the
 * title and the bar stand over it; the camera keeps the drawing clear of both): the connection made solid part by part,
 * then the unit's neighbours, the apartment block as a drawing, the crane bringing the next unit, and the rest of the
 * façade going up by itself. It is stepped, one scroll a step (STOPS: each part solid, the joints, the unit lifted in,
 * the façade up), the step played as the page glides there and back the same way. The answers' bar along the foot
 * (EnduroSat's phase bar) fills with the scroll, closes the passed steps to their numbers, and takes you to any of them.
 * A phone sets the same steps as veedo.space sets "One system. Six footprints." (StepFloor): each a clip of the scene
 * standing on a floor drawn in perspective, played one after another by themselves, a dash a step along the foot and
 * the step's number large across from them; the page scrolls past it as past any screen.
 */

/** the steps along the bar; each starts once the one before has played out (and past its hold), so the bar never runs ahead of the scene */
const PHASES = [
  { name: 'Mounting bracket', line: 'The bracket is fixed at the edge of the slab, where the unit will hang.', from: 0, to: HANG.bracket[1] },
  { name: 'Fire & smoke barrier', line: 'The barrier goes in along the slab edge, between the slab and the unit.', from: HANG.bracket[1] + 0.04, to: HANG.barrier[1] },
  { name: 'Connection to the frame', line: 'The unit is lowered onto the brackets and hooks on.', from: HANG.unit[0], to: HANG.drop[1] },
  { name: 'Unit to unit', line: 'Its neighbours join it: one beside it at the side joint, one above at the stack joint.', from: HANG.pull[0], to: HANG.stack[1] },
  { name: 'Onto the building', line: 'The crane lifts the next unit into place, and the façade goes up floor by floor.', from: HANG.stack[1] + 0.04, to: HANG.fill },
]
const LABELS: LabelSpec[] = [
  { id: 'j-side', text: 'Side joint', dx: -70, dy: 50 },
  { id: 'j-stack', text: 'Stack joint', dx: 60, dy: -56 },
]
/** the run, in screens of scroll past the first: the scene follows it */
const RUN = 5
/** where the page rests, as points of the run: each part made solid, the joints made, the unit lifted in, the façade up */
const STOPS = [HANG.bracket[1], HANG.barrier[1], HANG.drop[1], HANG.stack[1], HANG.lift[1], HANG.fill + 0.04].map((p) => p + 0.012)
/** each step of the bar's stop: where its part has played out (the last, the façade up) */
const PHASE_STOP = [0, 1, 2, 3, 5]
/** which step the run is in at `p` */
const phaseAt = (p: number) => PHASES.reduce((now, ph, i) => (p >= ph.from - 0.02 ? i : now), 0)
/** how far step `i` has filled at `p` */
const fillAt = (i: number, p: number) => smooth(PHASES[i].from, PHASES[i].to, p)

/** the page's scroll for a point of the section's run */
function yOf(el: HTMLElement | null, p: number) {
  return el ? el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * p : 0
}

export function Hang() {
  return useIsCompact() ? <HangStations /> : <HangWide />
}

/** the scene, in the canvas it is given: the connection, the joints, the block, the crane and the façade going up */
function HangStage({ progress, live, compact }: { progress: Progress; live: { current: boolean }; compact: boolean }) {
  const bus = useMemo(createBus, [])
  const settle = useRef(0)
  const shotAt = useMemo(() => (p: number) => hangShot(p, compact, settle.current), [compact])
  return (
    <>
      <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-back.webp" alt="" />}>
        <ScrubRig progress={progress} shotAt={shotAt} sway={1} live={live} aspect={1.6} />
        <MovingKeyLight focus={[12, 12, -2]} reach={24} />
        <HangScene progress={progress} bus={bus} live={live} settle={settle} />
        <FollowScroll progress={progress} />
        <LabelProjector bus={bus} />
      </Stage3D>
      <Labels bus={bus} labels={LABELS} shown={[]} />
    </>
  )
}

function HangWide() {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [progress] = useScrollProgress(section, 1, 'run')
  const live = useLive(stage)
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const [step, setStep] = useState(0)
  /** played to its end: its bar says its steps can be picked to be seen again */
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    const paint = () => {
      const p = progress.value
      setEnded(p >= STOPS[STOPS.length - 1] - 0.01)
      PHASES.forEach((_, i) => {
        const el = cells.current[i]
        if (!el) return
        el.style.setProperty('--f', fillAt(i, p).toFixed(4))
        // a step closes to its number as the next one starts
        const next = PHASES[i + 1]
        el.style.setProperty('--c', (next ? smooth(next.from - 0.03, next.from + 0.005, p) : 0).toFixed(4))
      })
      setStep(phaseAt(p))
    }
    paint()
    progress.listeners.add(paint)
    return () => void progress.listeners.delete(paint)
  }, [progress])

  return (
    <section
      ref={section}
      id="hang"
      className="fu-hang on-light"
      aria-labelledby="fu-hang-title"
      data-stops={STOPS.join(',')}
      data-no-top=""
      data-back="all"
      style={{ '--run': RUN + 1 } as CSSProperties}
    >
      <div className="fu-hang__pin">
        <h2 id="fu-hang-title" className="fu-hang__title">
          Hang. Seal. Join. Done.
          <ReviewNote>{REVIEW.connection}</ReviewNote>
        </h2>
        <div ref={stage} className="fu-hang__stage" aria-hidden="true">
          <HangStage progress={progress} live={live} compact={false} />
        </div>
        <StepBar
          label="How a unit is hung, and the façade goes up"
          names={PHASES.map((ph) => ph.name)}
          step={step}
          onGo={(i) => scrollToY(yOf(section.current, STOPS[PHASE_STOP[i]]))}
          cellRef={(i, el) => void (cells.current[i] = el)}
          hint={ended ? REPLAY_HINT : null}
        />
      </div>
    </section>
  )
}

/**
 * a phone: each step's clip, rendered from the scene a frame at a time (the dev film page, src/dev/FilmUnitized.tsx),
 * and how long it runs, its last frame's hold included (ms): the next step comes in as it ends
 */
const CLIP_MS = [2617, 2617, 3034, 3034, 5700]

/** a phone: the steps on a floor, playing themselves, each step a clip of the scene (StepFloor) */
function HangStations() {
  const section = useRef<HTMLElement>(null)
  return (
    <StepFloor
      sectionRef={section}
      id="hang"
      title="Hang. Seal. Join. Done."
      kicker={['On site', 'Installation']}
      sub="Five steps — slab to slab"
      items={PHASES.map((ph, i) => ({
        name: ph.name,
        line: ph.line,
        clip: `/img/facade/unitized/hang-step-${i + 1}.webp`,
        ms: CLIP_MS[i],
      }))}
    />
  )
}
