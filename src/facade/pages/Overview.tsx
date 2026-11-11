import { useEffect, useMemo, useRef } from 'react'
import '../overview.css'
import '../overview-mobile.css'
import '../unitized.css'
import { useIsCompact } from '../../lib/motion'
import { setShared, type Ground } from '../../three/stageStore'
import { FacadePage, usePageMeta } from '../Shell'
import { Words } from '../Story'
import { Lineage } from '../Lineage'
import { Stage3D, MovingKeyLight } from '../three/Stage3D'
import { createBus, type Shot } from '../three/kit'
import { ScrubRig, mixShot } from '../three/ScrubRig'
import { HeroPanel } from '../three/HeroPanel'
import { FollowScroll, useScrollProgress } from '../progress'
import { More } from '../unitized/More'

/**
 * Façade & Cladding, the overview. One continuous scroll, yellow the ground that stays:
 *
 *   the opening   the section's name and its line, over a thin façade panel poured as the page opens
 *   the story     one façade reinforced four ways (steel bar, GFRC / GRC, UHPC, RTARIUM): the façade
 *                 in 3D beside cards that stack as they are read (see Lineage)
 *   the systems   all three façade systems side by side, their models rising in turn: the system pages' own block
 *                 (More), a band under the header, its line, the whole screen
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */

/* ---- the opening ---------------------------------------------------------------------------- */

/** low on the right, turned well to the side, so its thin edge and the pour front both show */
function heroShots(compact: boolean): [Shot, Shot] {
  const k = compact ? 1.7 : 1
  const f = (a: [number, number], b: [number, number]): [number, number] => (compact ? b : a)
  return [
    { target: [0.02, -0.02, 0], dist: (compact ? 1.72 : 1.42) * k, azim: 42, elev: 9, frame: f([0.69, 0.54], [0.5, 0.48]) },
    { target: [0.02, -0.02, 0], dist: (compact ? 1.45 : 1.2) * k, azim: 58, elev: 22, frame: f([0.68, 0.38], [0.5, 0.4]) },
  ]
}

/* ---- the page -------------------------------------------------------------------------------- */

/** where the page rests after the story: the three systems, the whole screen; then the page's foot */
function afterStory() {
  const el = document.getElementById('systems')
  const end = document.documentElement.scrollHeight - window.innerHeight
  return el ? [Math.round(el.getBoundingClientRect().top + window.scrollY), end] : [end]
}

export default function Overview() {
  usePageMeta(
    'Façade & Cladding',
    'RTARIUM in façades and cladding: concrete façades, re-engineered. One 3D basalt mesh replaces steel bar, AR-glass fibre and steel fibre in thin façade panels: unitized thin concrete façades, rainscreen cladding and stud frame cladding.',
  )
  const compact = useIsCompact()
  const hero = useRef<HTMLElement>(null)
  const story = useRef<HTMLElement>(null)
  const systems = useRef<HTMLElement>(null)
  const [heroP] = useScrollProgress(hero, 1, 'height')
  const heroBus = useMemo(createBus, [])
  const [hs0, hs1] = useMemo(() => heroShots(compact), [compact])
  const heroShot = useMemo(() => (p: number) => mixShot(hs0, hs1, p), [hs0, hs1])

  // which canvases are on screen: only those keep moving in time
  const heroLive = useRef(false)
  const storyLive = useRef(false)
  useEffect(() => {
    const live = new Map<Element, { current: boolean }>([
      [hero.current!, heroLive],
      [story.current!, storyLive],
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
      // RTARIUM's closing card, a full screen: the header's words over its black
      ...((c) => (c ? [[c, 'black'] as [HTMLElement, Ground]] : []))(story.current?.querySelector<HTMLElement>('.fs-block--last')),
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
          </Stage3D>
        </div>
        {/* what the page is, top left, as the system pages name themselves */}
        <header className="fco-head">
          <h1 id="fco-title" className="fco-head__name">
            Façade & Cladding
          </h1>
          <p className="fco-head__kind">Thin concrete façade panels, reinforced with RTARIUM’s 3D basalt mesh.</p>
        </header>
        <div className="fco-hero__copy">
          <Words as="p" className="fco-mega" lines={['Concrete façades,', 're-engineered.']} />
        </div>
        <span className="fco-cue" aria-hidden="true">
          Scroll
        </span>
      </section>

      {/* ---- the story: one façade, four versions, stacked as the page scrolls ---- */}
      <Lineage sectionRef={story} live={storyLive} fromTop after={afterStory} />

      {/* ---- the three systems, side by side: the system pages' block, all three ---- */}
      <More current={null} id="systems" sectionRef={systems} />
    </FacadePage>
  )
}
