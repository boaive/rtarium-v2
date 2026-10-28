import { useMemo, useRef, type RefObject } from 'react'
import { useIsCompact } from '../../lib/motion'
import { Link } from '../../lib/router'
import { Words } from '../Story'
import { SYSTEMS } from '../content'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus, type Shot } from '../three/kit'
import { ScrubRig, mixShot } from '../three/ScrubRig'
import { FollowScroll, useScrollProgress } from '../progress'
import { HERO_FOCUS, HERO_TARGET, HeroWall } from '../three/rain/HeroWall'
import { useLive } from '../unitized/live'

/**
 * The opening, on yellow, in the Unitized page's own arrangement: the page's name, small, top left;
 * the line that says what a rainscreen is for, large, bottom left, and under it a quiet way to the
 * other two systems; a piece of the façade low on the right, turned towards the words, its near end
 * cut through to the rainscreen and one panel opened to RTARIUM, the one thing labelled.
 */

const LABELS: LabelSpec[] = [{ id: 'h-mesh', anchor: 'hr-mesh', text: 'RTARIUM', dx: 74, dy: -96, delay: 2300 }]

function shots(compact: boolean): [Shot, Shot] {
  return compact
    ? [
        { target: HERO_TARGET, dist: 34, azim: 36, elev: 7, frame: [0.5, 0.42] },
        { target: HERO_TARGET, dist: 30, azim: 48, elev: 12, frame: [0.5, 0.34] },
      ]
    : [
        { target: HERO_TARGET, dist: 25, azim: 36, elev: 6, frame: [0.7, 0.53] },
        { target: HERO_TARGET, dist: 22.5, azim: 48, elev: 12, frame: [0.7, 0.47] },
      ]
}

export function Hero({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const compact = useIsCompact()
  const [progress] = useScrollProgress(sectionRef, 1, 'height')
  const bus = useMemo(createBus, [])
  const focus = useRef(0)
  const [s0, s1] = useMemo(() => shots(compact), [compact])
  // the moment on RTARIUM: a little closer to the cut, and back (only near the top of the page)
  const shotAt = useMemo(
    () => (p: number) => {
      const s = mixShot(s0, s1, p)
      const f = focus.current * 0.3 * (1 - Math.min(1, p * 3))
      if (f <= 0) return s
      return mixShot(s, { ...s, target: HERO_FOCUS, dist: s.dist * 0.6, azim: s.azim + 4 }, f)
    },
    [s0, s1],
  )
  const live = useLive(sectionRef)
  const others = SYSTEMS.filter((s) => s.id !== 'rainscreen')

  return (
    <section ref={sectionRef} className="fu-hero on-yellow" aria-labelledby="fr-title">
      <div className="fu-hero__stage">
        <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-face.webp" alt="" />}>
          <ScrubRig progress={progress} shotAt={shotAt} sway={1.2} live={live} aspect={compact ? 0.56 : 1.6} />
          <MovingKeyLight focus={HERO_TARGET} reach={7} offset={[-8, 11, 8]} />
          <HeroWall bus={bus} play focus={focus} />
          <FollowScroll progress={progress} />
          <LabelProjector bus={bus} bottom={compact ? 260 : 60} />
        </Stage3D>
        <Labels bus={bus} labels={LABELS} shown={LABELS.map((l) => l.id)} />
      </div>

      <header className="fu-hero__head">
        <h1 id="fr-title" className="fu-hero__name">
          Rainscreen Cladding
        </h1>
        <p className="fu-hero__kind">A ventilated weather-resistance barrier</p>
      </header>

      <div className="fu-hero__foot">
        <Words as="p" className="fu-mega" lines={['Weather out.', 'Dry within.']} />
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
