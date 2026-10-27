import { useMemo, type RefObject } from 'react'
import { useIsCompact } from '../../lib/motion'
import { Link } from '../../lib/router'
import { Words } from '../Story'
import { SYSTEMS } from '../content'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus, type Shot } from '../three/kit'
import { ScrubRig, mixShot } from '../three/ScrubRig'
import { FollowScroll, useScrollProgress } from '../progress'
import { HERO_TARGET, HeroUnit } from '../three/unit/HeroUnit'
import { useLive } from './live'

/**
 * The opening, on yellow, kept to a few things: the page's name, small, top left; the line that says
 * why RTARIUM, large, bottom left, and under it a quiet way to the other two systems; one unit low on
 * the right, turned towards the words, its skin cut back to the textile, the one thing labelled.
 */

const LABELS: LabelSpec[] = [{ id: 'h-mesh', anchor: 'hu-mesh', text: 'RTARIUM', dx: 74, dy: -104, delay: 2200 }]

function shots(compact: boolean): [Shot, Shot] {
  return compact
    ? [
        { target: HERO_TARGET, dist: 17, azim: 34, elev: 7, frame: [0.5, 0.42] },
        { target: HERO_TARGET, dist: 15, azim: 46, elev: 13, frame: [0.5, 0.34] },
      ]
    : [
        { target: HERO_TARGET, dist: 12.4, azim: 34, elev: 6, frame: [0.7, 0.53] },
        { target: HERO_TARGET, dist: 11, azim: 46, elev: 12, frame: [0.7, 0.47] },
      ]
}

export function Hero({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const compact = useIsCompact()
  const [progress] = useScrollProgress(sectionRef, 1, 'height')
  const bus = useMemo(createBus, [])
  const [s0, s1] = useMemo(() => shots(compact), [compact])
  const shotAt = useMemo(() => (p: number) => mixShot(s0, s1, p), [s0, s1])
  const live = useLive(sectionRef)
  const others = SYSTEMS.filter((s) => s.id !== 'unitized')

  return (
    <section ref={sectionRef} className="fu-hero on-yellow" aria-labelledby="fu-title">
      <div className="fu-hero__stage">
        <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-face.webp" alt="" />}>
          <ScrubRig progress={progress} shotAt={shotAt} sway={1.5} live={live} aspect={compact ? 0.56 : 1.6} />
          <MovingKeyLight focus={HERO_TARGET} reach={4.2} offset={[6, 9, 7]} />
          <HeroUnit bus={bus} play />
          <FollowScroll progress={progress} />
          <LabelProjector bus={bus} bottom={compact ? 260 : 60} />
        </Stage3D>
        <Labels bus={bus} labels={LABELS} shown={LABELS.map((l) => l.id)} />
      </div>

      <header className="fu-hero__head">
        <h1 id="fu-title" className="fu-hero__name">
          Unitized Thin Concrete Façade
        </h1>
        <p className="fu-hero__kind">Advanced prefabricated building envelope system</p>
      </header>

      <div className="fu-hero__foot">
        <Words as="p" className="fu-mega" lines={['Thin skin.', 'Anchored from within.']} />
        <p className="fu-hero__also">
          <span>Also</span>
          {others.map((s) => (
            <Link key={s.id} to={s.path}>
              {s.title}
            </Link>
          ))}
        </p>
      </div>
    </section>
  )
}
