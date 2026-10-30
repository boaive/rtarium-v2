import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import '../../facade/overview.css'
import '../../facade/unitized.css'
import '../flooring.css'
import { Link } from '../../lib/router'
import { useIsCompact } from '../../lib/motion'
import { setShared, type Ground } from '../../three/stageStore'
import { Arrow, FacadePage, usePageMeta } from '../../facade/Shell'
import { Words, useInView } from '../../facade/Story'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus, type Shot } from '../../facade/three/kit'
import { ScrubRig, mixShot } from '../../facade/three/ScrubRig'
import { FollowScroll, useScrollProgress } from '../../facade/progress'
import { FLOORING, FLOORING_APPS } from '../content'
import { FloorHero } from '../three/FloorHero'
import { FlooringTrio } from '../three/FlooringTrio'
import { Layer } from '../Layer'
import { Features } from '../Features'

/**
 * Advanced Flooring, the overview, in the Façade overview's grammar. One continuous scroll, yellow the
 * ground that stays:
 *
 *   the opening    one sentence, over a sample of the floor: the screed poured across RTARIUM on its slab
 *   the statement  what RTARIUM is in flooring, alone on the screen
 *   the layer      what it does between the slab and the screed, in the overview story's boxes
 *   the features   six, each played out on one floor (the Rainscreen bridge's stage)
 *   the ways       the three applications side by side, their floors rising in turn
 */

const HERO_LABELS: LabelSpec[] = [
  { id: 'h-mesh', anchor: 'fl-mesh', text: 'RTARIUM 3D basalt mesh', dx: -60, dy: -110, delay: 2300 },
  { id: 'h-screed', anchor: 'fl-screed', text: 'High-strength screed', dx: 70, dy: -100, delay: 2600, wide: true },
  { id: 'h-slab', anchor: 'fl-slab', text: 'Structural slab', dx: -70, dy: 60, delay: 2900 },
]

/** low on the right, looking down onto the floor, as the Façade overview's panel stands */
function heroShots(compact: boolean): [Shot, Shot] {
  const k = compact ? 1.7 : 1
  const f = (a: [number, number], b: [number, number]): [number, number] => (compact ? b : a)
  return [
    { target: [0.02, -0.02, 0], dist: 1.8 * k, azim: 36, elev: 26, frame: f([0.68, 0.52], [0.5, 0.4]) },
    { target: [0.02, -0.02, 0], dist: 1.5 * k, azim: 52, elev: 38, frame: f([0.67, 0.38], [0.5, 0.3]) },
  ]
}

const STATEMENT = [
  'RTARIUM is disrupting the industrial flooring sector as the world’s first independent, three-dimensional mineral',
  'reinforcement mesh for high-performance concrete overlays.',
]

export default function Overview() {
  usePageMeta(
    FLOORING.title,
    'RTARIUM in advanced flooring: the first independent 3D mineral reinforcement mesh for high-performance concrete overlays. Crack-free, jointless, vibration-dampening and rust-proof floors for data and AI centres, automated warehouses and semiconductor plants.',
  )
  const compact = useIsCompact()
  const hero = useRef<HTMLElement>(null)
  const say = useRef<HTMLElement>(null)
  const layer = useRef<HTMLElement>(null)
  const features = useRef<HTMLElement>(null)
  const ways = useRef<HTMLElement>(null)
  const [heroP] = useScrollProgress(hero, 1, 'height')
  const heroBus = useMemo(createBus, [])
  const [hs0, hs1] = useMemo(() => heroShots(compact), [compact])
  const heroShot = useMemo(() => (p: number) => mixShot(hs0, hs1, p), [hs0, hs1])
  const [sayRef, sayIn] = useInView<HTMLDivElement>('0px 0px -30% 0px')
  const [waysRef, waysIn] = useInView<HTMLDivElement>('0px 0px -25% 0px')
  const [hover, setHover] = useState<number | null>(null)

  // which canvases are on screen: only those keep moving in time
  const heroLive = useRef(false)
  const waysLive = useRef(false)
  useEffect(() => {
    const live = new Map<Element, { current: boolean }>([
      [hero.current!, heroLive],
      [ways.current!, waysLive],
    ])
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) live.get(e.target)!.current = e.isIntersecting
    })
    live.forEach((_, el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // the header takes the ground of whatever is under it, the footer included, read on every scroll
  useEffect(() => {
    const footer = document.querySelector<HTMLElement>('.footer')
    const sections: [HTMLElement, Ground][] = [
      [hero.current!, 'yellow'],
      [say.current!, 'yellow'],
      [layer.current!, 'yellow'],
      [features.current!, 'yellow'],
      [ways.current!, 'light'],
      ...(footer ? [[footer, 'yellow'] as [HTMLElement, Ground]] : []),
    ]
    document.documentElement.setAttribute('data-own-ground', '')
    let raf = 0
    const read = () => {
      raf = 0
      let ground: Ground = 'light'
      for (const [el, g] of sections) {
        const r = el.getBoundingClientRect()
        if (r.top <= 40 && r.bottom > 40) ground = g
      }
      setShared({ ground, chapter: 'facade' })
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      document.documentElement.removeAttribute('data-own-ground')
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [])

  return (
    <FacadePage>
      {/* ---- the opening, on yellow ---- */}
      <section ref={hero} className="fco-hero on-yellow" aria-labelledby="ffo-title">
        <div className="fco-hero__stage">
          <Stage3D shadows keyLight={false} fallback={<img className="fco-still" src="/img/site-strip.webp" alt="" />}>
            <ScrubRig progress={heroP} shotAt={heroShot} sway={3} live={heroLive} aspect={compact ? 0.56 : 1.6} />
            <MovingKeyLight focus={[0, 0, 0]} reach={0.9} />
            <FloorHero bus={heroBus} play />
            <FollowScroll progress={heroP} />
            <LabelProjector bus={heroBus} bottom={compact ? 220 : 24} />
          </Stage3D>
          <Labels bus={heroBus} labels={HERO_LABELS} shown={HERO_LABELS.map((l) => l.id)} />
        </div>
        <div className="fco-hero__copy">
          <Words as="h1" id="ffo-title" className="fco-mega" lines={['Floors that', 'never crack.']} />
        </div>
        <span className="fco-cue" aria-hidden="true">
          Scroll
        </span>
      </section>

      {/* ---- the statement, alone on the screen ---- */}
      <section ref={say} className="ffo-say on-yellow" aria-label="RTARIUM in industrial flooring">
        <div ref={sayRef} className={`ffo-say__in fc-reveal ${sayIn ? 'is-in' : ''}`}>
          <Words as="p" className="ffo-say__text" lines={STATEMENT} />
        </div>
      </section>

      {/* ---- the layer between the slab and the screed ---- */}
      <Layer sectionRef={layer} />

      {/* ---- the core features, each on one floor ---- */}
      <Features sectionRef={features} />

      {/* ---- the three applications, side by side ---- */}
      <section ref={ways} id="applications" className="fct on-light" aria-labelledby="ffo-ways-title">
        <div ref={waysRef} className={`fct__inner ${waysIn ? 'is-in' : ''}`}>
          <header className="fct__head">
            <Words id="ffo-ways-title" className="fct__title" lines={['Three ways', 'onto a floor.']} />
          </header>
          <div className="fct__stage">
            <div className="fct__canvas">
              <Stage3D shadows keyLight={false} fallback={<img className="fco-still" src="/img/site-strip.webp" alt="" />}>
                <FlooringTrio play={waysIn} hover={hover} live={waysLive} />
              </Stage3D>
            </div>
            <ol className="fct__cols">
              {FLOORING_APPS.map((a, i) => (
                <li
                  key={a.id}
                  className={`fct-col ${hover === i ? 'is-hover' : ''}`}
                  style={{ '--i': i } as CSSProperties}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                >
                  <div className="fct-col__text">
                    <span className="fct-col__num num">0{i + 1}</span>
                    <h3 className="fct-col__name">{a.title}</h3>
                    <p className="fct-col__line">{a.line}</p>
                    <Link to={a.path} className="fc-go fct-col__go">
                      <span className="fc-go__label">Explore</span>
                      <span className="fc-go__cell" aria-hidden="true">
                        <Arrow />
                      </span>
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </FacadePage>
  )
}
