import { useEffect, useRef } from 'react'
import '../unitized.css'
import '../rainscreen.css'
import { setShared, type Ground } from '../../three/stageStore'
import { FacadePage, usePageMeta } from '../Shell'
import { usePageSteps } from '../pageSteps'
import { Hero } from '../rainscreen/Hero'
import { Barrier } from '../rainscreen/Barrier'
import { Install } from '../rainscreen/Install'
import { Trade } from '../rainscreen/Trade'
import { Bridge } from '../rainscreen/Bridge'
import { More } from '../unitized/More'

/**
 * Rainscreen Cladding. One continuous scroll in the Unitized page's grammar, the grounds taking turns:
 *
 *   the opening    yellow: a piece of the façade, cut through to the rainscreen and to RTARIUM
 *   the barrier    yellow, pinned: a black 3D box opens out of the right edge;
 *                  the 3D plays rain, the ventilated cavity and the wind as the scroll goes on, each
 *                  outcome docking a row at the top
 *   structure to façade  warm white, pinned: the rainscreen put up on an X-ray building, the crane
 *                  bringing the panels
 *   the trade-offs black, one screen: precast, stone, GRC, UHPC and metal in one table
 *   the bridge     yellow, pinned: how RTARIUM closes the gap, a bar along the foot
 *   more ways      warm white: the other two systems
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */
/** the section whose run plays with the scroll itself, left to the scroll: the bridge */
const FREE = ['bridge']

export default function Rainscreen() {
  usePageMeta(
    'Rainscreen Cladding',
    'RTARIUM rainscreen cladding: a ventilated system for weather protection, of thin concrete panels reinforced with a 3D basalt textile. A solid concrete face, a lightweight 12 mm panel, under 30 kg/m², integrated fixing points, non-corrosive, panels up to 6 m tall.',
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

  // one scroll, one step, the whole page through, as the Unitized page (usePageSteps), the bridge playing with the scroll
  usePageSteps(FREE)

  return (
    <FacadePage>
      <div className="fu" data-ground="yellow">
        <Hero sectionRef={hero} />
      </div>
      <div className="fu" data-ground="yellow">
        <Barrier />
      </div>
      <div className="fu" data-ground="light">
        <Install />
      </div>
      <div className="fu" data-ground="black">
        <Trade />
      </div>
      <div className="fu" data-ground="yellow">
        <Bridge />
      </div>
      <div className="fu" data-ground="light">
        <More current="rainscreen" />
      </div>
    </FacadePage>
  )
}
