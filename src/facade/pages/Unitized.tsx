import { useEffect, useRef } from 'react'
import '../unitized.css'
import '../unitized-phone.css'
import { setShared, type Ground } from '../../three/stageStore'
import { FacadePage, usePageMeta } from '../Shell'
import { usePageSteps } from '../pageSteps'
import { useIsCompact } from '../../lib/motion'
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
 *   slab to slab   warm white, pinned: how a unit hangs, then the façade going up on the building (a phone: as
 *                  veedo.space's factory stations, one screen: each step a clip of the scene, played by itself)
 *   pain points    black, one screen: the four at a glance, and one panel on an open stage playing each (a phone:
 *                  veedo.space's cards one after another, each with a still of its panel)
 *   the answers    yellow, pinned: five answers over one scene of the textile, a bar along the foot (a phone: as the
 *                  slab to slab's stations, each answer a clip)
 *   inverted casting warm white: the production shoot (not on a phone)
 *   more ways      warm white: the other two systems
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time. On a phone every section's
 * heading is set alike, as the opening's name (`fu-unit`: unitized-phone.css).
 */
/**
 * No section's run is left to the scroll to play freely: each pinned one (the six layers; on a wide screen slab to slab
 * and the answers) is stepped, one scroll a step, the step played out as the page glides there and its bar filling
 * with it; a scroll up steps back the same way, the bar emptying (`data-back`). Free runs took many scrolls a step, and
 * leaving one jumped the page. (A phone's slab to slab and answers play by themselves: a screen each, scrolled past.)
 */
const FREE: string[] = []

export default function Unitized() {
  usePageMeta(
    'Unitized Thin Concrete Façade',
    'Unitized thin concrete façade: an advanced prefabricated building envelope system. Thin concrete panels reinforced with RTARIUM, insulation, vapour barrier, gasket, glazing and a main mounting frame, built off-site as modular units with in-built anchorage and hung from slab to slab.',
  )
  const hero = useRef<HTMLElement>(null)
  const compact = useIsCompact()

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

  // one scroll, one step, the whole page through (usePageSteps), back as well as on
  usePageSteps(FREE)

  return (
    <FacadePage>
      {/* (the page's own: its headings on a phone are set alike, here only) */}
      <div className="fu-unit">
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
        {/* the production shoot: a wide screen's only; a phone goes from the answers straight on to the other systems */}
        {!compact && (
          <div className="fu" data-ground="light">
            <Made />
          </div>
        )}
        <div className="fu" data-ground="light">
          <More />
        </div>
      </div>
    </FacadePage>
  )
}
