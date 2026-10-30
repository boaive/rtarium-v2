import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, MovingKeyLight } from '../three/Stage3D'
import { ScrubRig } from '../three/ScrubRig'
import { FollowScroll, smooth, useScrollProgress } from '../progress'
import { INSTALL, INSTALL_FOCUS, INSTALL_REACH, InstallScene, installShot } from '../three/stud/InstallScene'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useLive } from '../unitized/live'
import { StepBar } from '../unitized/StepBar'

/**
 * On site: the Rainscreen page's wall to skin, the same stage and the same run. One scene on the warm
 * white page, edge to edge (the title and the bar stand over it), pinned for its run: a bay of the tower
 * given its two L frames, the tower crane bringing the element that sits on them, its top locked and its
 * joint sealed, then the tower and the rest of its bands going up by themselves, wrapping round it, and
 * the building finished under a rising scan, its glass see-through. The bar along the foot
 * fills each step as it runs and takes you to any of them.
 */

const PHASES = [
  { name: 'L frames', from: 0, to: INSTALL.seats[1] },
  { name: 'Lifted on', from: INSTALL.seats[1] + 0.03, to: INSTALL.hook[1] },
  { name: 'Locked from the top', from: INSTALL.lock[0], to: INSTALL.look[1] },
  { name: 'Sealed', from: INSTALL.rod[0], to: INSTALL.bead[1] },
  { name: 'Onto the building', from: INSTALL.wide[0], to: INSTALL.fill[1] },
  { name: 'Finished', from: INSTALL.finish[0], to: INSTALL.finish[1] },
]
const RUN = 8

export function Site() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [progress] = useScrollProgress(section, 1, 'run')
  const live = useLive(stage)
  const settle = useRef(0)
  const shotAt = useMemo(() => (p: number) => installShot(p, compact, settle.current), [compact])
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
  /** where each step of the bar takes you: the L frames solid, the element set, locked, sealed, the tower banded, finished */
  const holds = [INSTALL.seats[1], INSTALL.hook[1], INSTALL.look[0] + 0.05, INSTALL.bead[1], INSTALL.fill[1], INSTALL.finish[1]].map((p) => p + 0.012)

  return (
    <section ref={section} id="site" className="fu-hang on-light" aria-labelledby="fs-site-title" style={{ '--run': RUN } as CSSProperties}>
      <div className="fu-hang__pin">
        <h2 id="fs-site-title" className="fu-hang__title">
          On site.
          <ReviewNote>{REVIEW.profiles}</ReviewNote>
        </h2>
        <div ref={stage} className="fu-hang__stage" aria-hidden="true">
          <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-back.webp" alt="" />}>
            <ScrubRig progress={progress} shotAt={shotAt} sway={1} live={live} aspect={1.6} />
            <MovingKeyLight focus={INSTALL_FOCUS} reach={INSTALL_REACH} />
            <InstallScene progress={progress} live={live} settle={settle} />
            <FollowScroll progress={progress} />
          </Stage3D>
        </div>
        <StepBar label="How a stud frame element goes onto the building" names={PHASES.map((ph) => ph.name)} step={step} onGo={(i) => go(holds[i])} cellRef={(i, el) => void (cells.current[i] = el)} />
      </div>
    </section>
  )
}
