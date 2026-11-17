import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Zoom } from '../unitized/Zoom'
import { useIsCompact } from '../../lib/motion'
import { Stage3D, MovingKeyLight } from '../three/Stage3D'
import { ScrubRig } from '../three/ScrubRig'
import { FollowScroll, smooth, usePlay, type Progress } from '../progress'
import { INSTALL, INSTALL_FOCUS, INSTALL_REACH, InstallScene, installShot } from '../three/rain/InstallScene'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useLive } from '../unitized/live'
import { REPLAY_HINT, StepBar } from '../unitized/StepBar'
import { StepFloor } from '../unitized/StepFloor'

/**
 * From structure to facade: the rainscreen put up, in the order the installation films show. One scene on the
 * warm white page, edge to edge (the title and the bar stand over it), one screen, played on one scroll: a bay of
 * the wall given its brackets, its wool and its rails, then the tower crane bringing the panel that
 * hooks on, then the block and the rest of the façade going up by itself. Slab to slab's bar along
 * the foot fills each step as it runs and takes you to any of them.
 */

/** the steps along the bar; each starts once the one before has played out (and past its hold), so the bar never runs ahead of the scene */
const PHASES = [
  { name: 'Brackets', line: 'Brackets are fixed to the structure, bay by bay.', from: 0, to: INSTALL.bracket[1] },
  { name: 'Insulation', line: 'Mineral wool goes on between them, unbroken across the wall.', from: INSTALL.bracket[1] + 0.04, to: INSTALL.wool[1] },
  { name: 'Rails', line: 'Rails are hung on the brackets, ready for the panels.', from: INSTALL.wool[1] + 0.04, to: INSTALL.hanger[1] },
  { name: 'Panel, by crane', line: 'The tower crane brings the panel, and it hooks onto the rails.', from: INSTALL.crane[0], to: INSTALL.hook[1] + 0.02 },
  { name: 'Onto the building', line: 'Panel by panel, the façade goes up over the whole block.', from: INSTALL.hook[1] + 0.06, to: INSTALL.fill[1] },
]
/** seconds for the whole sequence, played on one scroll once the section is on screen (as the warehouse's frame to floor) */
const PLAY = 11

export function Install() {
  return useIsCompact() ? <InstallStations /> : <InstallWide />
}

function InstallWide() {
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
  /** where each step of the bar takes you: each part made solid, the panel hooked on, the façade up */
  const holds = [INSTALL.bracket[1], INSTALL.wool[1], INSTALL.hanger[1], INSTALL.hook[1] + 0.02, INSTALL.out[1]].map((p) => p + 0.012)

  return (
    <section ref={section} id="install" className="fu-hang on-light" aria-labelledby="fr-install-title" style={{ '--run': 1 } as CSSProperties}>
      <div className="fu-hang__pin">
        <h2 id="fr-install-title" className="fu-hang__title">
          From structure to façade.
          <ReviewNote>{REVIEW.subframe}</ReviewNote>
        </h2>
        <div ref={stage} className="fu-hang__stage" aria-hidden="true">
          <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-back.webp" alt="" />}>
            <ScrubRig progress={progress} shotAt={shotAt} sway={1} live={live} aspect={1.6} />
            <MovingKeyLight focus={INSTALL_FOCUS} reach={INSTALL_REACH} />
            <InstallScene progress={progress} live={live} settle={settle} />
            <FollowScroll progress={progress} />
          </Stage3D>
        </div>
        <StepBar label="How the rainscreen goes up" names={PHASES.map((ph) => ph.name)} step={step} onGo={(i) => go(holds[i], i ? holds[i - 1] : 0)} cellRef={(i, el) => void (cells.current[i] = el)} hint={ended ? REPLAY_HINT : null} />
      </div>
    </section>
  )
}

/**
 * a phone: as the Unitized page's slab to slab (Hang: StepFloor), the five steps on a floor, playing themselves one after
 * another, the scene live: each step played out from where the last left off over its share of the wide screen's play,
 * then held a moment before the next comes in
 */
const STEP_MS = PHASES.map((ph, i) => Math.round((ph.to - (i ? PHASES[i - 1].to : 0)) * PLAY * 1000 + 700))

/** a phone: each step's scene drawn as large as the Unitized page's slab to slab (the bay close, the building whole) */
const ZOOM = [1.9, 1.9, 1.9, 1.05, 1.05]

function InstallLive({ k, turn, section }: { k: number; turn: number; section: RefObject<HTMLElement | null> }) {
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const live = useLive(section)
  const settle = useRef(0)
  const shotAt = useMemo(() => (p: number) => installShot(p, true, settle.current), [])
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

function InstallStations() {
  const section = useRef<HTMLElement>(null)
  return (
    <StepFloor
      scene={(k, turn) => <InstallLive k={k} turn={turn} section={section} />}
      once
      sectionRef={section}
      id="install"
      title="From structure to façade."
      kicker={['On site', 'Installation']}
      sub="Five steps — bracket to building"
      items={PHASES.map((ph, i) => ({ name: ph.name, line: ph.line, clip: '', ms: STEP_MS[i] }))}
    />
  )
}
