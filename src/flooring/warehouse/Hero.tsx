import { useMemo, type RefObject } from 'react'
import { useIsCompact } from '../../lib/motion'
import { Link } from '../../lib/router'
import { Words } from '../../facade/Story'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus, type Shot } from '../../facade/three/kit'
import { ScrubRig, mixShot } from '../../facade/three/ScrubRig'
import { FollowScroll, useScrollProgress } from '../../facade/progress'
import { useLive } from '../../facade/unitized/live'
import { FLOORING_APPS } from '../content'
import { HERO_TARGET, HeroFloor } from './three/HeroFloor'

/**
 * The opening, on yellow, the Data & AI Centres opening's few things in their same places: the page's
 * name, small, top left; the line, large, bottom left, and under it the other two applications; one
 * piece of the floor low on the right with a laser-guided truck drawn on it, RTARIUM labelled where its
 * corner is stepped back.
 */

const LABELS: LabelSpec[] = [{ id: 'h-mesh', anchor: 'hw-mesh', text: 'RTARIUM', dx: -70, dy: -96, delay: 2600 }]

function shots(compact: boolean): [Shot, Shot] {
  return compact
    ? [
        { target: HERO_TARGET, dist: 15.5, azim: 32, elev: 27, frame: [0.5, 0.44] },
        { target: HERO_TARGET, dist: 14.5, azim: 44, elev: 34, frame: [0.5, 0.36] },
      ]
    : [
        { target: HERO_TARGET, dist: 11.2, azim: 33, elev: 27, frame: [0.73, 0.55] },
        { target: HERO_TARGET, dist: 10.2, azim: 45, elev: 34, frame: [0.73, 0.47] },
      ]
}

export function Hero({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const compact = useIsCompact()
  const [progress] = useScrollProgress(sectionRef, 1, 'height')
  const bus = useMemo(createBus, [])
  const [s0, s1] = useMemo(() => shots(compact), [compact])
  const shotAt = useMemo(() => (p: number) => mixShot(s0, s1, p), [s0, s1])
  const live = useLive(sectionRef)
  const others = FLOORING_APPS.filter((a) => a.id !== 'warehouse')

  return (
    <section ref={sectionRef} className="fu-hero on-yellow" aria-labelledby="faw-title">
      <div className="fu-hero__stage">
        <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/flooring/aw-lgv-aisle.webp" alt="" />}>
          <ScrubRig progress={progress} shotAt={shotAt} sway={1.5} live={live} aspect={compact ? 0.56 : 1.6} />
          <MovingKeyLight focus={HERO_TARGET} reach={2.2} offset={[-4, 7, 5]} />
          <HeroFloor bus={bus} play />
          <FollowScroll progress={progress} />
          <LabelProjector bus={bus} bottom={compact ? 260 : 60} />
        </Stage3D>
        <Labels bus={bus} labels={LABELS} shown={LABELS.map((l) => l.id)} />
      </div>

      <header className="fu-hero__head">
        <h1 id="faw-title" className="fu-hero__name">
          Automated Warehouse
        </h1>
        <p className="fu-hero__kind">A 20 mm RTARIUM screed on structural PT and SFRC slabs</p>
      </header>

      <div className="fu-hero__foot">
        <Words as="p" className="fu-mega" lines={['Zero curling.', 'Zero interference.']} />
        <p className="fu-hero__also">
          <span>Also</span>
          {others.map((a) => (
            <Link key={a.id} to={a.path}>
              {a.title}
            </Link>
          ))}
        </p>
      </div>
    </section>
  )
}
