import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus } from '../three/kit'
import { ScrubRig } from '../three/ScrubRig'
import { FollowScroll, smooth, useScrollProgress } from '../progress'
import { HANG, HangScene, hangShot } from '../three/unit/HangScene'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useLive } from './live'
import { StepBar } from './StepBar'

/**
 * Slab to slab, and onto the building. One scene on the warm white page, edge to edge and sharp (the
 * title and the bar stand over it; the camera keeps the drawing clear of both), pinned for its run: the connection made solid part by part, then the unit's
 * neighbours, the apartment block as a drawing, the crane bringing the next unit, and the rest of the
 * façade going up by itself. The answers' bar along the foot (EnduroSat's phase bar) fills each step
 * as it runs, closes the passed ones to their numbers, and takes you to any of them.
 */

const PHASES = [
  { name: 'Mounting bracket', from: 0, to: HANG.bracket[1] },
  { name: 'Fire & smoke barrier', from: HANG.bracket[1] + 0.04, to: HANG.barrier[1] },
  { name: 'Connection to the frame', from: HANG.unit[0], to: HANG.drop[1] },
  { name: 'Unit to unit', from: HANG.pull[0], to: HANG.stack[1] },
  { name: 'Onto the building', from: HANG.block[0], to: HANG.fill },
]
const LABELS: LabelSpec[] = [
  { id: 'j-side', text: 'Side joint', dx: -70, dy: 50 },
  { id: 'j-stack', text: 'Stack joint', dx: 60, dy: -56 },
]
const RUN = 8.4

export function Hang() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [progress] = useScrollProgress(section, 1, 'run')
  const bus = useMemo(createBus, [])
  const live = useLive(stage)
  const settle = useRef(0)
  const shotAt = useMemo(() => (p: number) => hangShot(p, compact, settle.current), [compact])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const [step, setStep] = useState(0)

  useEffect(() => {
    const paint = () => {
      const p = progress.value
      let now = 0
      PHASES.forEach((ph, i) => {
        if (p >= ph.from - 0.02) now = i
        const el = cells.current[i]
        if (!el) return
        el.style.setProperty('--f', smooth(ph.from, ph.to, p).toFixed(4))
        // a step closes to its number as the next one starts
        const next = PHASES[i + 1]
        el.style.setProperty('--c', (next ? smooth(next.from - 0.03, next.from + 0.005, p) : 0).toFixed(4))
      })
      setStep(now)
    }
    paint()
    progress.listeners.add(paint)
    return () => void progress.listeners.delete(paint)
  }, [progress])

  const go = (p: number) => {
    const el = section.current
    if (!el) return
    scrollToY(el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * p)
  }
  /** where each step of the bar takes you: each part made solid, the joints made, the block drawn, the unit set, the façade up */
  const holds = [HANG.bracket[1], HANG.barrier[1], HANG.drop[1], HANG.stack[1], HANG.crane[1], HANG.lift[1], HANG.fill + 0.04].map((p) => p + 0.012)

  return (
    <section ref={section} id="hang" className="fu-hang on-light" aria-labelledby="fu-hang-title" style={{ '--run': RUN } as CSSProperties}>
      <div className="fu-hang__pin">
        <h2 id="fu-hang-title" className="fu-hang__title">
          Slab to slab.
          <ReviewNote>{REVIEW.connection}</ReviewNote>
        </h2>
        <div ref={stage} className="fu-hang__stage" aria-hidden="true">
          <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-back.webp" alt="" />}>
            <ScrubRig progress={progress} shotAt={shotAt} sway={1} live={live} aspect={1.6} />
            <MovingKeyLight focus={[12, 12, -2]} reach={24} />
            <HangScene progress={progress} bus={bus} live={live} settle={settle} />
            <FollowScroll progress={progress} />
            <LabelProjector bus={bus} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={[]} />
        </div>
        <StepBar
          label="How a unit is hung, and the façade goes up"
          names={PHASES.map((ph) => ph.name)}
          step={step}
          onGo={(i) => go(holds[Math.min(holds.length - 1, [0, 1, 2, 3, 6][i])])}
          cellRef={(i, el) => void (cells.current[i] = el)}
        />
      </div>
    </section>
  )
}
