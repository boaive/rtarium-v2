import { useEffect, useRef } from 'react'
import '../unitized.css'
import '../rainscreen.css'
import '../studframe.css'
import { setShared, type Ground } from '../../three/stageStore'
import { FacadePage, usePageMeta } from '../Shell'
import { Hero } from '../studframe/Hero'
import { Components } from '../studframe/Components'
import { Cast } from '../studframe/Cast'
import { Site } from '../studframe/Site'
import { Made } from '../studframe/Made'
import { More } from '../unitized/More'

/**
 * Stud Frame Cladding. For luxury villas and beachside houses in the Middle East: extreme summer heat,
 * high wind, and intricate, classical or sweeping façades. One continuous scroll in the Rainscreen
 * page's grammar and styles, three colours only (yellow, black, white), the heat told by hard light and
 * dark shadow:
 *
 *   the opening      yellow: one cornice element in a hard midday sun, a window cut back to RTARIUM
 *   two components   yellow: the barrier's listings, skin and frame, each its own black box on the
 *                    studio's grid (the skin cut back to RTARIUM, the frame's L plates breathing), rows
 *                    docking under the header
 *   cast             yellow, pinned, in the answers' stage: the words on the left, the casting right of
 *                    them, the bar along the foot; concrete in the mould, RTARIUM cut and stitched
 *   on site          warm white, pinned: the Rainscreen page's wall to skin, on a stadium-plan tower
 *                    (L frames, lifted on, locked, sealed, the bands going up); the bar along the foot
 *   made             warm white: the factory's steps in photographs (the Unitized page's strip)
 *   more ways        warm white: the other two systems
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */
export default function StudFrame() {
  usePageMeta(
    'Stud Frame Cladding',
    'RTARIUM stud frame cladding: architectural concrete skins of 16 to 20 mm on galvanized steel stud frames, joined by flexible L plates that let the skin move with the heat. Sprayed face down with RTARIUM cut and stitched inside, craned onto L frames on site, levelled and sealed.',
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
        <Components />
      </div>
      <div className="fu" data-ground="yellow">
        <Cast />
      </div>
      <div className="fu" data-ground="light">
        <Site />
      </div>
      <div className="fu" data-ground="light">
        <Made />
      </div>
      <div className="fu" data-ground="light">
        <More current="stud" />
      </div>
    </FacadePage>
  )
}
