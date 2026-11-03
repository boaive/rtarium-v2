import { useMemo, useRef, useState, type RefObject } from 'react'
import { useIsCompact } from '../lib/motion'
import { Words } from '../facade/Story'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../facade/three/Stage3D'
import { createBus, type Shot } from '../facade/three/kit'
import { ScrubRig, mixShot } from '../facade/three/ScrubRig'
import { FollowScroll, useScrollProgress } from '../facade/progress'
import { useLive } from '../facade/unitized/live'
import { HERO_END, HERO_TARGET, HeroPanel, type HeroPhase } from './three/HeroPanel'

/**
 * The opening, on yellow, as the Façade & Cladding pages open: the page's name, small, top left; the
 * line, large, bottom left, and under it one quiet line; one panel lying on its long edge on the right,
 * turned towards the words, on its own clock: the 30 mm panel, its ferrule inserts and lifting holes told
 * apart; the camera goes in to its far end, where it divides into two 15 mm leaves and takes the EPS core,
 * the 100 mm SIP panel; the camera comes back out along it; it goes back to 30 mm.
 */

const LABELS: LabelSpec[] = [
  { id: 'h-30', anchor: 'hp-thick', text: '30 mm solid', dx: 46, dy: -110, delay: 1200 },
  { id: 'h-hole', anchor: 'hp-hole', text: 'Tie hole: to lift by, 20 mm through', dx: 40, dy: -64, delay: 1700 },
  { id: 'h-ferrule', anchor: 'hp-ferrule', text: 'Ferrule insert: for fixing', dx: -40, dy: 72, delay: 2100 },
  { id: 'h-leaves', anchor: 'hp-thick', text: 'Two 15 mm leaves', dx: 46, dy: -96 },
  { id: 'h-core', anchor: 'hp-core', text: '70 mm EPS/SPS core', dx: 46, dy: -96 },
  { id: 'h-100', anchor: 'hp-thick', text: '100 mm SIP insulated', dx: 46, dy: -110 },
]
const SAY: Record<HeroPhase, string[]> = {
  solid: ['h-30', 'h-hole', 'h-ferrule'],
  in: ['h-30'],
  leaves: ['h-leaves'],
  core: ['h-core'],
  sip: ['h-100'],
  back: [],
}

/** the whole panel, as the scroll leaves it and as it ends; and the camera in on its far end */
function shots(compact: boolean): [Shot, Shot, Shot] {
  return compact
    ? [
        { target: HERO_TARGET, dist: 10.4, azim: 44, elev: 28, frame: [0.5, 0.42] },
        { target: HERO_TARGET, dist: 9.4, azim: 52, elev: 33, frame: [0.5, 0.34] },
        { target: HERO_END, dist: 2.6, azim: 80, elev: 18, frame: [0.6, 0.4] },
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
  const [phase, setPhase] = useState<HeroPhase>('solid')

  return (
    <section ref={sectionRef} className="fu-hero wp-hero on-yellow" aria-labelledby="wp-title">
      <div className="fu-hero__stage">
        <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/shoot/load-hang.webp" alt="" />}>
          <ScrubRig progress={progress} shotAt={shotAt} sway={1.5} live={live} aspect={compact ? 0.56 : 1.6} />
          <MovingKeyLight focus={HERO_TARGET} reach={3.2} offset={[-4, 9, 6]} />
          <HeroPanel bus={bus} live={live} onPhase={setPhase} zoom={zoom} />
          <FollowScroll progress={progress} />
          <LabelProjector bus={bus} bottom={compact ? 260 : 60} />
        </Stage3D>
        <Labels bus={bus} labels={LABELS} shown={SAY[phase]} />
      </div>

      <header className="fu-hero__head">
        <h1 id="wp-title" className="fu-hero__name">
          Wall Panels
        </h1>
        <p className="fu-hero__kind">Modular wall panel system</p>
      </header>

      <div className="fu-hero__foot">
        <Words as="p" className="fu-mega" lines={['Solid.', 'Insulated.', 'Interlocked.']} />
        <p className="wp-hero__line">30 mm solid and 100 mm SIP insulated panels, reinforced with RTARIUM.</p>
      </div>
    </section>
  )
}
