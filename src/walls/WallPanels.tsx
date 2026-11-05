import { useEffect, useRef } from 'react'
import '../facade/facade.css'
import '../facade/unitized.css'
import '../facade/overview.css'
import './walls.css'
import { setShared, type Ground } from '../three/stageStore'
import { FacadePage, usePageMeta } from '../facade/Shell'
import { Hero } from './Hero'
import { Story } from './Story'
import { Answers } from './Answers'
import { Say } from '../components/Say'
import { Panels } from './Panels'
import { Streams } from './Streams'
import { SOLID } from './content'

/**
 * Wall Panels: one page, one continuous scroll, the grounds taking turns as on the other pages:
 *
 *   the opening    yellow: one panel, a storey high, going from 30 mm solid to 100 mm SIP and back
 *   two walls      the Façade overview's story: the precast concrete wall and the insulated metal
 *                  panel, each struck as it goes, then RTARIUM's own layout (concrete muscle, cladding speed)
 *   the answers    yellow, pinned: the client's six points over one scene of panels between two columns
 *   solid panel    black: its promise, the site's statement
 *   the panels     yellow, pinned: two bursts, one after the other, in a studio box: the solid panel, then the same
 *                  panel taking its core and opening as the SIP panel; each one's parts in a table to click
 *   streams        warm white: choose a stream; its building drawn as the panels go on; its case study
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */
export default function WallPanels() {
  usePageMeta(
    'Wall Panels',
    'RTARIUM modular wall panels: 30 mm solid panels and 100 mm SIP insulated panels, reinforced with a three-dimensional basalt mesh. Non-magnetic, fire-rated, interlocking on all four sides and bolted, not welded, for logistics hubs, cleanroom plants, data centres, housing and frame structures.',
  )
  const hero = useRef<HTMLElement>(null)
  const story = useRef<HTMLElement>(null)

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
      setShared({ ground, chapter: 'walls' })
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
        <Story sectionRef={story} />
      </div>
      <div className="fu" data-ground="yellow">
        <Answers />
      </div>
      <div className="fu" data-ground="black">
        <Say kicker={SOLID.name} label={SOLID.name} text={SOLID.usp} />
      </div>
      <div className="fu" data-ground="yellow">
        <Panels />
      </div>
      <div className="fu" data-ground="light">
        <Streams />
      </div>
    </FacadePage>
  )
}
