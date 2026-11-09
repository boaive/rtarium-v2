import { useMemo, useRef, type RefObject } from 'react'
import { useIsCompact } from '../lib/motion'
import { Words } from '../facade/Story'
import { Stage3D, MovingKeyLight } from '../facade/three/Stage3D'
import { createBus, type Shot } from '../facade/three/kit'
import { ScrubRig, mixShot } from '../facade/three/ScrubRig'
import { FollowScroll, useScrollProgress } from '../facade/progress'
import { useLive } from '../facade/unitized/live'
import { HERO_END, HERO_TARGET, HeroPanel } from './three/HeroPanel'

/**
 * The opening, on yellow, as the Façade & Cladding pages open: the page's name and what it is, large,
 * top left; the line, a step down, bottom left, and under it what the panels are; one panel lying on its long edge on the right,
 * turned towards the words, on its own clock: the 30 mm panel with its ferrule inserts and lifting holes; the camera
 * goes in to its far end, where it divides into two 15 mm leaves and takes the EPS core, the 100 mm SIP panel; the
 * camera comes back out along it; it goes back to 30 mm. The panel speaks for itself: no labels on it.
 */

/** the panel reports its phases for labels; the opening has none */
const noPhase = () => {}

/** the whole panel, as the scroll leaves it and as it ends; and the camera in on its far end */
function shots(compact: boolean): [Shot, Shot, Shot] {
  return compact
    ? [
        { target: HERO_TARGET, dist: 10.4, azim: 44, elev: 28, frame: [0.5, 0.5] },
        { target: HERO_TARGET, dist: 9.4, azim: 52, elev: 33, frame: [0.5, 0.34] },
        { target: HERO_END, dist: 2.6, azim: 80, elev: 18, frame: [0.6, 0.5] },
      ]
    : [
        { target: HERO_TARGET, dist: 7.3, azim: 44, elev: 27, frame: [0.68, 0.56] },
        { target: HERO_TARGET, dist: 6.6, azim: 52, elev: 33, frame: [0.68, 0.49] },
        { target: HERO_END, dist: 2.7, azim: 76, elev: 16, frame: [0.72, 0.56] },
      ]
}

export function Hero({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const compact = useIsCompact()
  const [progress] = useScrollProgress(sectionRef, 1, 'height')
  const bus = useMemo(createBus, [])
  const [s0, s1, s2] = useMemo(() => shots(compact), [compact])
  /** how far the camera is in on the far end: set by the panel's own clock, read by the camera each frame */
  const zoom = useRef(0)
  const shotAt = useMemo(() => (p: number) => mixShot(mixShot(s0, s1, p), s2, zoom.current), [s0, s1, s2])
  const live = useLive(sectionRef)

  return (
    <section ref={sectionRef} className="fu-hero wp-hero on-yellow" aria-labelledby="wp-title">
      <div className="fu-hero__stage">
        <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/shoot/load-hang.webp" alt="" />}>
          <ScrubRig progress={progress} shotAt={shotAt} sway={1.5} live={live} aspect={compact ? 0.56 : 1.6} />
          <MovingKeyLight focus={HERO_TARGET} reach={3.2} offset={[-4, 9, 6]} />
          <HeroPanel bus={bus} live={live} onPhase={noPhase} zoom={zoom} />
          <FollowScroll progress={progress} />
        </Stage3D>
      </div>

      <header className="fu-hero__head">
        <h1 id="wp-title" className="fu-hero__name">
          Wall Panels
        </h1>
        <p className="fu-hero__kind">Modular wall panel system</p>
      </header>

      <div className="fu-hero__foot">
        <Words as="p" className="fu-mega" lines={['Wall panels, insulated', 'and interlocked.']} />
        <p className="wp-hero__line">30 mm solid and 100 mm insulated concrete panels, reinforced with RTARIUM.</p>
      </div>
    </section>
  )
}
