import { useMemo, useState, type RefObject } from 'react'
import { useIsCompact } from '../lib/motion'
import { Words } from '../facade/Story'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../facade/three/Stage3D'
import { createBus, type Shot } from '../facade/three/kit'
import { ScrubRig, mixShot } from '../facade/three/ScrubRig'
import { FollowScroll, useScrollProgress } from '../facade/progress'
import { useLive } from '../facade/unitized/live'
import { HERO_TARGET, HeroPanel } from './three/HeroPanel'

/**
 * The opening, on yellow, as the Façade & Cladding pages open: the page's name, small, top left; the
 * line, large, bottom left, and under it one quiet line; one panel standing on the right, a storey
 * high, turned towards the words, going from 30 mm to 100 mm and back on its own clock. Only its
 * thickness is marked.
 */

const LABELS: LabelSpec[] = [
  { id: 'h-30', anchor: 'hp-thick', text: '30 mm solid', dx: 46, dy: -110, delay: 1600 },
  { id: 'h-100', anchor: 'hp-thick', text: '100 mm SIP insulated', dx: 46, dy: -110 },
]

function shots(compact: boolean): [Shot, Shot] {
  return compact
    ? [
        { target: HERO_TARGET, dist: 8.4, azim: 44, elev: 28, frame: [0.5, 0.42] },
        { target: HERO_TARGET, dist: 7.6, azim: 52, elev: 33, frame: [0.5, 0.34] },
      ]
    : [
        { target: HERO_TARGET, dist: 5.9, azim: 44, elev: 27, frame: [0.68, 0.56] },
        { target: HERO_TARGET, dist: 5.3, azim: 52, elev: 33, frame: [0.68, 0.49] },
      ]
}

export function Hero({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const compact = useIsCompact()
  const [progress] = useScrollProgress(sectionRef, 1, 'height')
  const bus = useMemo(createBus, [])
  const [s0, s1] = useMemo(() => shots(compact), [compact])
  const shotAt = useMemo(() => (p: number) => mixShot(s0, s1, p), [s0, s1])
  const live = useLive(sectionRef)
  const [thick, setThick] = useState<30 | 100>(30)

  return (
    <section ref={sectionRef} className="fu-hero wp-hero on-yellow" aria-labelledby="wp-title">
      <div className="fu-hero__stage">
        <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/shoot/load-hang.webp" alt="" />}>
          <ScrubRig progress={progress} shotAt={shotAt} sway={1.5} live={live} aspect={compact ? 0.56 : 1.6} />
          <MovingKeyLight focus={HERO_TARGET} reach={2.6} offset={[-4, 9, 6]} />
          <HeroPanel bus={bus} live={live} onState={setThick} />
          <FollowScroll progress={progress} />
          <LabelProjector bus={bus} bottom={compact ? 260 : 60} />
        </Stage3D>
        <Labels bus={bus} labels={LABELS} shown={[thick === 30 ? 'h-30' : 'h-100']} />
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
