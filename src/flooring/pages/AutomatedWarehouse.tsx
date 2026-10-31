import { useEffect, useRef } from 'react'
import '../../facade/unitized.css'
import '../../facade/rainscreen.css'
import '../data.css'
import '../warehouse.css'
import { setShared, type Ground } from '../../three/stageStore'
import { FacadePage, usePageMeta } from '../../facade/Shell'
import { More } from '../data/More'
import { Hero } from '../warehouse/Hero'
import { Problems } from '../warehouse/Problems'
import { Failure } from '../warehouse/Failure'
import { Solution } from '../warehouse/Solution'
import { FloorFrame } from '../warehouse/FloorFrame'
import { Voices } from '../warehouse/Voices'

/**
 * Automated Warehouse. The Data & AI Centres page's grammar, its story moved from the electrical to
 * speed, wear and precision. One continuous scroll, the grounds taking turns:
 *
 *   the opening    yellow: a piece of the hall's floor, a laser-guided truck drawn on it, RTARIUM in its corner
 *   four failures  yellow to black: the line, centred; four cards, each a problem struck and solved in place
 *   the failure    black and red, pinned: the fast floor, and how it stops, in five beats
 *   the solution   yellow and black, pinned: the floor made again from its base, ending on the fast floor
 *   frame to floor warm white, pinned: that floor takes its racks, grows into a hall, the building drawn round it
 *   sign-offs      warm white: what it means for the consultant, the owner and the contractor
 *   more ways      warm white: the other two applications
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */
export default function AutomatedWarehouse() {
  usePageMeta(
    'Automated Warehouse',
    'RTARIUM for automated warehouse floors: a jointless 20 mm screed reinforced with a non-metallic 3D basalt mesh on structural PT and SFRC slabs. Zero curling and zero sensor interference for AGVs and robotic cranes, 24/7.',
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
      if (!raf) raf = requestAnimationFrame(() => (raf = requestAnimationFrame(read)))
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
      <div className="fu">
        <Problems />
      </div>
      <div className="fu">
        <Failure />
      </div>
      <div className="fu" data-ground="yellow">
        <Solution />
      </div>
      <div className="fu" data-ground="light">
        <FloorFrame />
      </div>
      <div className="fu" data-ground="light">
        <Voices />
      </div>
      <div className="fu" data-ground="light">
        <More current="warehouse" />
      </div>
    </FacadePage>
  )
}
