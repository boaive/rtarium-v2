import { useEffect, useRef } from 'react'
import '../unitized.css'
import { setShared, type Ground } from '../../three/stageStore'
import { FacadePage, usePageMeta } from '../Shell'
import { Hero } from '../unitized/Hero'
import { Layers } from '../unitized/Layers'
import { Hang } from '../unitized/Hang'
import { Flaws } from '../unitized/Flaws'
import { Answers } from '../unitized/Answers'
import { Made } from '../unitized/Made'
import { More } from '../unitized/More'

/**
 * Unitized Thin Concrete Façade. One continuous scroll, the grounds taking turns as on the homepage:
 *
 *   the opening    yellow: one unit, its skin cut back to RTARIUM; why RTARIUM, in one line
 *   six layers     yellow, pinned: the layers as stacking cards beside the unit, put together layer
 *                  by layer in a black studio box (which layer, a step back or on, the six along its foot)
 *   slab to slab   warm white, pinned: how a unit hangs, then the façade going up on the building
 *   pain points    black, pinned: four stacking cards, struck as they are covered, and one panel on an
 *                  open stage showing each
 *   the answers    yellow, pinned: five answers over one scene of the textile, a bar along the foot
 *   made face down warm white: the production shoot
 *   more ways      warm white: the other two systems
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */
export default function Unitized() {
  usePageMeta(
    'Unitized Thin Concrete Façade',
    'Unitized thin concrete façade: an advanced prefabricated building envelope system. Thin concrete panels reinforced with RTARIUM, insulation, vapour barrier, gasket, glazing and a main mounting frame, built off-site as modular units with in-built anchorage and hung from slab to slab.',
  )
  const hero = useRef<HTMLElement>(null)

  // the header takes the ground of whatever is under it, the footer included
  useEffect(() => {
    const read = () => {
      raf = 0
      let ground: Ground = 'light'
      document.querySelectorAll<HTMLElement>('[data-ground]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.top <= 40 && r.bottom > 40) ground = el.dataset.ground as Ground
      })
      const footer = document.querySelector<HTMLElement>('.footer')
      if (footer && footer.getBoundingClientRect().top <= 40) ground = 'yellow'
      setShared({ ground, chapter: 'facade' })
    }
    let raf = 0
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    document.documentElement.setAttribute('data-own-ground', '')
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
      <div className="fu" data-ground="yellow">
        <Hero sectionRef={hero} />
      </div>
      <div className="fu" data-ground="yellow">
        <Layers />
      </div>
      <div className="fu" data-ground="light">
        <Hang />
      </div>
      <div className="fu" data-ground="black">
        <Flaws />
      </div>
      <div className="fu" data-ground="yellow">
        <Answers />
      </div>
      <div className="fu" data-ground="light">
        <Made />
      </div>
      <div className="fu" data-ground="light">
        <More />
      </div>
    </FacadePage>
  )
}
