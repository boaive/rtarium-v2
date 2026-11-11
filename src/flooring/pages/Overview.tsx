import { useEffect, useMemo, useRef } from 'react'
import '../../facade/overview.css'
import '../../facade/overview-mobile.css'
import '../../facade/unitized.css'
import '../flooring.css'
import { useIsCompact } from '../../lib/motion'
import { setShared, type Ground } from '../../three/stageStore'
import { Say } from '../../components/Say'
import { FacadePage, usePageMeta } from '../../facade/Shell'
import { usePageSteps } from '../../facade/pageSteps'
import { Words } from '../../facade/Story'
import { Stage3D, MovingKeyLight } from '../../facade/three/Stage3D'
import { createBus, type Shot } from '../../facade/three/kit'
import { ScrubRig, mixShot } from '../../facade/three/ScrubRig'
import { FollowScroll, useScrollProgress } from '../../facade/progress'
import { FLOORING } from '../content'
import { FloorHero } from '../three/FloorHero'
import { More } from '../data/More'
import { Layer } from '../Layer'
import { Features } from '../Features'

/**
 * Advanced Flooring, the overview, in the Façade overview's grammar. One continuous scroll, yellow the
 * ground that stays:
 *
 *   the opening    the section's name, what it is, one line, over a sample of the floor: the screed poured
 *                  across RTARIUM on its slab
 *   the statement  what RTARIUM is in flooring, alone on black, as the homepage's challenge stands
 *   the layer      what it does between the slab and the screed, in the overview story's boxes
 *   the features   six, each played out on one floor (the Rainscreen bridge's stage)
 *   the ways       the three applications side by side, their floors rising in turn
 */

/** low on the right, looking down onto the floor, as the Façade overview's panel stands */
function heroShots(compact: boolean): [Shot, Shot] {
  const k = compact ? 1.7 : 1
  const f = (a: [number, number], b: [number, number]): [number, number] => (compact ? b : a)
  return [
    { target: [0.02, -0.02, 0], dist: (compact ? 2.6 : 1.74) * k, azim: 36, elev: 26, frame: f([0.7, 0.52], [0.5, 0.48]) },
    { target: [0.02, -0.02, 0], dist: (compact ? 2.2 : 1.48) * k, azim: 52, elev: 38, frame: f([0.68, 0.38], [0.5, 0.4]) },
  ]
}

const STATEMENT = 'RTARIUM is the first independent three-dimensional mineral reinforcement mesh for high-performance concrete overlays, built for floors that cannot stop.'

/** the section whose run plays with the scroll itself, left to the scroll: the features */
const FREE = ['features']

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

  // which canvases are on screen: only those keep moving in time
  const heroLive = useRef(false)
  useEffect(() => {
    const live = new Map<Element, { current: boolean }>([[hero.current!, heroLive]])
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
      [say.current!, 'black'],
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

  // one scroll, one step, the whole page through, as the façade pages (usePageSteps): the layer stepped through by it,
  // the features playing with the scroll
  usePageSteps(FREE)

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
          </Stage3D>
        </div>
        {/* what the page is, top left, as the Facade overview names itself */}
        <header className="fco-head">
          <h1 id="ffo-title" className="fco-head__name">
            {FLOORING.title}
          </h1>
          <p className="fco-head__kind">High-performance concrete overlays, reinforced with RTARIUM’s 3D basalt mesh.</p>
        </header>
        <div className="fco-hero__copy">
          <Words as="p" className="fco-mega" lines={['Flooring,', 'built to last.']} />
        </div>
        <span className="fco-cue" aria-hidden="true">
          Scroll
        </span>
      </section>

      {/* ---- the statement, alone on the screen ---- */}
      <Say sectionRef={say} label="RTARIUM in industrial flooring" text={STATEMENT} />

      {/* ---- the layer between the slab and the screed ---- */}
      <Layer sectionRef={layer} paged />

      {/* ---- the core features, each on one floor ---- */}
      <Features sectionRef={features} />

      {/* ---- the three applications, side by side: the application pages' close, all three ---- */}
      <More current={null} id="applications" sectionRef={ways} />
    </FacadePage>
  )
}
