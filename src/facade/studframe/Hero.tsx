import { useMemo, useRef, type RefObject } from 'react'
import { useIsCompact } from '../../lib/motion'
import { Link } from '../../lib/router'
import { Words } from '../Story'
import { SYSTEMS } from '../content'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../three/Stage3D'
import { createBus, type Shot } from '../three/kit'
import { ScrubRig, mixShot } from '../three/ScrubRig'
import { FollowScroll, useScrollProgress } from '../progress'
import { HERO_FOCUS, HERO_TARGET, HeroCornice } from '../three/stud/HeroCornice'
import { useLive } from '../unitized/live'

/**
 * The opening, on yellow, in the other system pages' arrangement: the page's name, small, top left; the
 * line, large, bottom left, and under it a quiet way to the other two systems; one cornice element low
 * on the right in a hard midday sun, a window cut back to RTARIUM, the one thing labelled. The view
 * leans in on the window for a moment as the page opens, and lets it go.
 */

const LABELS: LabelSpec[] = [{ id: 'hs-mesh', text: 'RTARIUM', dx: 74, dy: -104, delay: 2600 }]

function shots(compact: boolean): [Shot, Shot] {
  return compact
    ? [
        { target: HERO_TARGET, dist: 9.4, azim: 50, elev: 9, frame: [0.5, 0.4] },
        { target: HERO_TARGET, dist: 8.4, azim: 60, elev: 15, frame: [0.5, 0.33] },
      ]
    : [
        { target: HERO_TARGET, dist: 5.0, azim: 54, elev: 8, frame: [0.7, 0.5] },
        { target: HERO_TARGET, dist: 4.5, azim: 64, elev: 14, frame: [0.7, 0.45] },
      ]
}

export function Hero({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const compact = useIsCompact()
  const [progress] = useScrollProgress(sectionRef, 1, 'height')
  const focus = useRef(0)
  const bus = useMemo(createBus, [])
  const [s0, s1] = useMemo(() => shots(compact), [compact])
  // the moment on RTARIUM: closer to the window, and back (only near the top of the page)
  const shotAt = useMemo(
    () => (p: number) => {
      const s = mixShot(s0, s1, p)
      const f = focus.current * 0.42 * (1 - Math.min(1, p * 3))
      if (f <= 0) return s
      return mixShot(s, { ...s, target: HERO_FOCUS, dist: s.dist * 0.42, azim: s.azim + 12, elev: s.elev + 4 }, f)
    },
    [s0, s1],
  )
  const live = useLive(sectionRef)
  const others = SYSTEMS.filter((s) => s.id !== 'stud')

  return (
    <section ref={sectionRef} className="fu-hero fs-hero on-yellow" aria-labelledby="fs-title">
      <div className="fu-hero__stage">
        <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-back.webp" alt="" />}>
          <ScrubRig progress={progress} shotAt={shotAt} sway={1.1} live={live} aspect={compact ? 0.56 : 1.6} />
          <HeroCornice bus={bus} play focus={focus} />
          <FollowScroll progress={progress} />
          <LabelProjector bus={bus} bottom={compact ? 260 : 60} />
        </Stage3D>
        <Labels bus={bus} labels={LABELS} shown={LABELS.map((l) => l.id)} />
      </div>

      <header className="fu-hero__head">
        <h1 id="fs-title" className="fu-hero__name">
          Stud Frame Cladding
        </h1>
        <p className="fu-hero__kind">Architectural concrete skins on structural steel stud frames</p>
      </header>

      <div className="fu-hero__foot">
        <Words as="p" className="fu-mega" lines={['Moves with the heat.', 'Holds in the wind.']} />
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
