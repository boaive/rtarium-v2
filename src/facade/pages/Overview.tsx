import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import '../overview.css'
import { Link } from '../../lib/router'
import { useIsCompact } from '../../lib/motion'
import { setShared, type Ground } from '../../three/stageStore'
import { Arrow, FacadePage, usePageMeta } from '../Shell'
import { Words, useInView } from '../Story'
import { Lineage } from '../Lineage'
import { SYSTEMS } from '../content'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus, type Shot } from '../three/kit'
import { ScrubRig, mixShot } from '../three/ScrubRig'
import { HeroPanel } from '../three/HeroPanel'
import { SystemsTrio } from '../three/SystemsTrio'
import { FollowScroll, useScrollProgress } from '../progress'

/**
 * Façade & Cladding, the overview. One continuous scroll, yellow the ground that stays:
 *
 *   the opening   RTARIUM's place in the market, over a thin façade panel poured as the page opens
 *   the story     one façade reinforced four ways (steel bar, GFRC / GRC, UHPC, RTARIUM): the façade
 *                 in 3D beside cards that stack as they are read (see Lineage)
 *   the systems   all three façade systems side by side, their models rising in turn
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */

/* ---- the opening ---------------------------------------------------------------------------- */

const HERO_LABELS: LabelSpec[] = [
  { id: 'h-mesh', anchor: 'hp-mesh', text: 'RTARIUM 3D basalt textile', dx: -60, dy: -110, delay: 2300 },
  { id: 'h-cast', anchor: 'hp-cast', text: 'Thin concrete', dx: 70, dy: -100, delay: 2600, wide: true },
  { id: 'h-edge', anchor: 'hp-edge', text: '20 mm', dx: 80, dy: 46, delay: 2900 },
]

/** low on the right, turned well to the side, so its thin edge and the pour front both show */
function heroShots(compact: boolean): [Shot, Shot] {
  const k = compact ? 1.7 : 1
  const f = (a: [number, number], b: [number, number]): [number, number] => (compact ? b : a)
  return [
    { target: [0.02, -0.02, 0], dist: 1.72 * k, azim: 42, elev: 9, frame: f([0.68, 0.54], [0.5, 0.4]) },
    { target: [0.02, -0.02, 0], dist: 1.45 * k, azim: 58, elev: 22, frame: f([0.67, 0.38], [0.5, 0.3]) },
  ]
}

/* ---- the page -------------------------------------------------------------------------------- */

export default function Overview() {
  usePageMeta(
    'Façade & Cladding',
    'RTARIUM in façades and cladding: textile reinforced concrete (TRC), the upgrade to GFRC/GRC and UHPC. One 3D basalt textile replaces steel bar, AR-glass fibre and steel fibre in thin façade panels: unitized thin concrete façades, rainscreen cladding and stud frame cladding.',
  )
  const compact = useIsCompact()
  const hero = useRef<HTMLElement>(null)
  const story = useRef<HTMLElement>(null)
  const systems = useRef<HTMLElement>(null)
  const [heroP] = useScrollProgress(hero, 1, 'height')
  const heroBus = useMemo(createBus, [])
  const [hs0, hs1] = useMemo(() => heroShots(compact), [compact])
  const heroShot = useMemo(() => (p: number) => mixShot(hs0, hs1, p), [hs0, hs1])
  const [sysRef, sysIn] = useInView<HTMLDivElement>('0px 0px -25% 0px')
  const [hover, setHover] = useState<number | null>(null)

  // which canvases are on screen: only those keep moving in time
  const heroLive = useRef(false)
  const storyLive = useRef(false)
  const sysLive = useRef(false)
  useEffect(() => {
    const live = new Map<Element, { current: boolean }>([
      [hero.current!, heroLive],
      [story.current!, storyLive],
      [systems.current!, sysLive],
    ])
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) live.get(e.target)!.current = e.isIntersecting
    })
    live.forEach((_, el) => io.observe(el))
    return () => {
      io.disconnect()
    }
  }, [])

  // the header takes the ground of whatever is under it, the footer included, read on every scroll
  useEffect(() => {
    const footer = document.querySelector<HTMLElement>('.footer')
    const sections: [HTMLElement, Ground][] = [
      [hero.current!, 'yellow'],
      [story.current!, 'yellow'],
      [systems.current!, 'light'],
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
      <section ref={hero} className="fco-hero on-yellow" aria-labelledby="fco-title">
        <div className="fco-hero__stage">
          <Stage3D shadows keyLight={false} fallback={<img className="fco-still" src="/img/shoot/mould-mesh-press.webp" alt="" />}>
            <ScrubRig progress={heroP} shotAt={heroShot} sway={3} live={heroLive} aspect={compact ? 0.56 : 1.6} />
            <MovingKeyLight focus={[0, 0, 0]} reach={0.9} />
            <HeroPanel bus={heroBus} play />
            <FollowScroll progress={heroP} />
            <LabelProjector bus={heroBus} bottom={compact ? 220 : 24} />
          </Stage3D>
          <Labels bus={heroBus} labels={HERO_LABELS} shown={HERO_LABELS.map((l) => l.id)} />
        </div>
        {/* what the page is, top left, as the system pages name themselves */}
        <header className="fco-head">
          <p className="fco-head__name">Façade & Cladding</p>
          <p className="fco-head__kind">Thin concrete façade panels, reinforced with RTARIUM’s 3D basalt textile.</p>
        </header>
        <div className="fco-hero__copy">
          <Words as="h1" id="fco-title" className="fco-mega" lines={['Beyond GRC', 'and UHPC.']} />
          {/* the three systems, straight from the opening (the system pages' own "Also" row) */}
          <p className="fco-also">
            <span>Explore</span>
            {SYSTEMS.map((s) => (
              <Link key={s.id} to={s.path}>
                {s.title}
              </Link>
            ))}
          </p>
        </div>
        <span className="fco-cue" aria-hidden="true">
          Scroll
        </span>
      </section>

      {/* ---- the story: one façade, four versions, stacked as the page scrolls ---- */}
      <Lineage sectionRef={story} live={storyLive} />

      {/* ---- the three systems, side by side ---- */}
      <section ref={systems} id="systems" className="fct on-light" aria-labelledby="fct-title">
        <div ref={sysRef} className={`fct__inner ${sysIn ? 'is-in' : ''}`}>
          <header className="fct__head">
            <Words id="fct-title" className="fct__title" lines={['Three ways', 'onto a building.']} />
          </header>
          <div className="fct__stage">
            <div className="fct__canvas">
              <Stage3D shadows keyLight={false} fallback={<img className="fco-still" src="/img/facade/panel-ivory.webp" alt="" />}>
                <SystemsTrio play={sysIn} hover={hover} live={sysLive} />
              </Stage3D>
            </div>
            <ol className="fct__cols">
              {SYSTEMS.map((s, i) => (
                <li
                  key={s.id}
                  className={`fct-col ${hover === i ? 'is-hover' : ''}`}
                  style={{ '--i': i } as CSSProperties}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                >
                  <div className="fct-col__text">
                    <span className="fct-col__num num">0{i + 1}</span>
                    <h3 className="fct-col__name">{s.title}</h3>
                    <p className="fct-col__line">{s.short}</p>
                    <Link to={s.path} className="fc-go fct-col__go">
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
