import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Zoom } from '../unitized/Zoom'
import { useIsCompact } from '../../lib/motion'
import { Stage3D, MovingKeyLight } from '../three/Stage3D'
import { ScrubRig } from '../three/ScrubRig'
import { FollowScroll, smooth, usePlay, type Progress } from '../progress'
import { INSTALL, INSTALL_FOCUS, INSTALL_REACH, InstallScene, installShot } from '../three/stud/InstallScene'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useLive } from '../unitized/live'
import { REPLAY_HINT, StepBar } from '../unitized/StepBar'
import { StepFloor } from '../unitized/StepFloor'

/**
 * On site: the Rainscreen page's wall to skin, the same stage and the same run. One scene on the warm
 * white page, edge to edge (the title and the bar stand over it), one screen, played on one scroll: a bay of the tower
 * given its two L frames, the tower crane bringing the element that sits on them, its top locked and its
 * joint sealed, then the tower and the rest of its bands going up by themselves, wrapping round it, and
 * the building finished under a rising scan, its glass see-through. The bar along the foot
 * fills each step as it runs and takes you to any of them.
 */

/** the steps along the bar; each starts once the one before has played out (and past its hold), so the bar never runs ahead of the scene */
const PHASES = [
  { name: 'L frames', line: 'Two L frames are fixed to the bay, where the element will sit.', from: 0, to: INSTALL.seats[1] },
  { name: 'Lifted on', line: 'The tower crane lifts the element onto its seats.', from: INSTALL.seats[1] + 0.04, to: INSTALL.hook[1] },
  { name: 'Locked from the top', line: 'Its top is locked to the structure.', from: INSTALL.hook[1] + 0.035, to: INSTALL.look[0] + 0.06 },
  { name: 'Sealed', line: 'The joint is backed with a rod and sealed.', from: INSTALL.rod[0], to: INSTALL.bead[1] },
  { name: 'Onto the building', line: 'Band by band, the elements go up and wrap the tower.', from: INSTALL.bead[1] + 0.035, to: INSTALL.fill[1] },
  { name: 'Finished', line: 'The building finished, its glass see-through.', from: INSTALL.fill[1] + 0.035, to: INSTALL.finish[1] },
]
/** seconds for the whole sequence, played on one scroll once the section is on screen (as the warehouse's frame to floor) */
const PLAY = 12

export function Site() {
  return useIsCompact() ? <SiteStations /> : <SiteWide />
}

function SiteWide() {
  const compact = false
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [progress, seek] = usePlay(section, PLAY)
  const live = useLive(stage)
  const settle = useRef(0)
  const shotAt = useMemo(() => (p: number) => installShot(p, compact, settle.current), [compact])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const [step, setStep] = useState(0)
  /** played to its end: its bar says its steps can be picked to be seen again */
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    const paint = () => {
      const p = progress.value
      setEnded(p >= 0.995)
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

  const go = (p: number, from?: number) => seek(p, from)
  /** where each step of the bar takes you: the L frames solid, the element set, locked, sealed, the tower banded, finished */
  const holds = [INSTALL.seats[1], INSTALL.hook[1], INSTALL.look[0] + 0.05, INSTALL.bead[1], INSTALL.fill[1], INSTALL.finish[1]].map((p) => p + 0.012)

  return (
    <section ref={section} id="site" className="fu-hang on-light" aria-labelledby="fs-site-title" style={{ '--run': 1 } as CSSProperties}>
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
        <StepBar label="How a stud frame element goes onto the building" names={PHASES.map((ph) => ph.name)} step={step} onGo={(i) => go(holds[i], i ? holds[i - 1] : 0)} cellRef={(i, el) => void (cells.current[i] = el)} hint={ended ? REPLAY_HINT : null} />
      </div>
    </section>
  )
}

/**
 * a phone: as the Unitized page's slab to slab (Hang: StepFloor), the six steps on a floor, playing themselves one after
 * another, the scene live: each step played out from where the last left off over its share of the wide screen's play,
 * then held a moment before the next comes in
 */
const STEP_MS = PHASES.map((ph, i) => Math.round((ph.to - (i ? PHASES[i - 1].to : 0)) * PLAY * 1000 + 700))

/** a phone: how far the camera stands back from the wide screen's shots, so the tower keeps clear of the words */
const SITE_BACK = 1
/** a phone: each step's scene drawn as large as the Unitized page's slab to slab (the bay close, the tower whole) */
const ZOOM = [1.1, 1.15, 1.15, 1.15, 1.15, 1.2]

function SiteLive({ k, turn, section }: { k: number; turn: number; section: RefObject<HTMLElement | null> }) {
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const live = useLive(section)
  const settle = useRef(0)
  // (framed as the Unitized page's slab to slab, hangShot: a close look a little under the middle, clear of the words; the
  // tower whole just under it; between, by how far the camera stands)
  const shotAt = useMemo(
    () => (p: number) => {
      const s = installShot(p, true, settle.current)
      return { ...s, dist: s.dist * SITE_BACK, frame: [0.5, 0.62 - 0.06 * smooth(15, 40, s.dist)] as [number, number] }
    },
    [],
  )
  useEffect(() => {
    // (back to the start as it comes round; on from where it is otherwise)
    const from = k === 0 ? 0 : progress.value
    const to = PHASES[k].to
    const ms = Math.max(400, STEP_MS[k] - 700)
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      progress.value = from + (to - from) * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
      progress.listeners.forEach((f) => f())
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [k, turn, progress])
  return (
    <div className="fsf__live" aria-hidden="true">
      <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-back.webp" alt="" />}>
        <ScrubRig progress={progress} shotAt={shotAt} sway={1} live={live} aspect={1.6} />
        <MovingKeyLight focus={INSTALL_FOCUS} reach={INSTALL_REACH} />
        <InstallScene progress={progress} live={live} settle={settle} />
        <FollowScroll progress={progress} />
        <Zoom by={ZOOM[k]} />
      </Stage3D>
    </div>
  )
}

function SiteStations() {
  const section = useRef<HTMLElement>(null)
  return (
    <StepFloor
      scene={(k, turn) => <SiteLive k={k} turn={turn} section={section} />}
      once
      sectionRef={section}
      id="site"
      title="On site."
      kicker={['On site', 'Installation']}
      sub="Six steps — frame to finish"
      items={PHASES.map((ph, i) => ({ name: ph.name, line: ph.line, clip: '', ms: STEP_MS[i] }))}
    />
  )
}
