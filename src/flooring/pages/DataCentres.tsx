import { useEffect, useRef } from 'react'
import '../../facade/unitized.css'
import '../../facade/rainscreen.css'
import '../data.css'
import { setShared, type Ground } from '../../three/stageStore'
import { FacadePage, usePageMeta } from '../../facade/Shell'
import { Hero } from '../data/Hero'
import { Problems } from '../data/Problems'
import { Build } from '../data/Build'
import { FloorFrame } from '../data/FloorFrame'
import { Voices } from '../data/Voices'
import { More } from '../data/More'

/**
 * Data & AI Centres. One continuous scroll in the Façade system pages' grammar, the grounds taking
 * turns:
 *
 *   the opening    yellow: a piece of the hall's floor, a rack drawn on it, RTARIUM in its corner
 *   three failures yellow rising to black: three cards, each a problem struck and solved in place
 *   built up       yellow, pinned: the floor made in six steps from the bare slab, a bar along the foot
 *   frame to floor warm white, pinned: that floor takes its racks, grows into a data hall, and the AI
 *                  centre is drawn round it
 *   sign-offs      warm white: what it means for the consultant, the owner and the contractor, then
 *                  the sustainability win on black
 *   more ways      warm white: the other two applications
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */
export default function DataCentres() {
  usePageMeta(
    'Data & AI Centres',
    'RTARIUM for data and AI centre floors: a 20 mm screed reinforced with a non-metallic 3D basalt mesh on prestressed hollow-core slabs. Less dead weight, no conductive dust, a flawless anchor for ESD coatings.',
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
    // read a frame late: the sign-offs' ledger lays its bands out in the frame the scroll arrives in
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
      <div className="fu" data-ground="yellow">
        <Build />
      </div>
      <div className="fu" data-ground="light">
        <FloorFrame />
      </div>
      <div className="fu" data-ground="light">
        <Voices />
      </div>
      <div className="fu" data-ground="light">
        <More current="data" />
      </div>
    </FacadePage>
  )
}
