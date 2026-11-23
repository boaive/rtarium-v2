import { useEffect, useRef } from 'react'
import '../facade/facade.css'
import '../facade/unitized.css'
import '../facade/overview.css'
import '../facade/overview-mobile.css'
import './walls.css'
import { setShared, type Ground } from '../three/stageStore'
import { FacadePage, usePageMeta } from '../facade/Shell'
import { usePageSteps } from '../facade/pageSteps'
import { useIsCompact } from '../lib/motion'
import { Hero } from './Hero'
import { Story } from './Story'
import { Answers } from './Answers'
import { Say } from '../components/Say'
import { Panels } from './Panels'
import { Streams, SystemRoute } from './Streams'
import { PAIRED, SOLID, STREAMS } from './content'
import { useRoute } from '../lib/router'

/**
 * Wall Panels: one page, one continuous scroll, the grounds taking turns as on the other pages:
 *
 *   the opening    yellow: one panel, a storey high, going from 30 mm solid to 100 mm SIP and back
 *   two walls      the Façade overview's story: the precast concrete wall and the insulated metal
 *                  panel, each struck as it goes, then RTARIUM's own layout (concrete muscle, cladding speed)
 *   the answers    yellow, pinned: the client's six points over one scene of panels between two columns
 *   solid panel    black: its promise, the site's statement
 *   solid parts    yellow, pinned, in a studio box: the solid panel opening, its parts a step each on the bar
 *   SIP panel      black: its promise
 *   SIP parts      yellow, pinned: the solid panel taking its core and opening as the SIP panel, its parts the same way
 *   streams        warm white: choose a stream; its building drawn as the panels go on; its case study
 *
 * Everything on the page moves with the scroll; only the 3D has motion of its own, in time.
 */
/** the section whose run plays with the scroll itself, left to the scroll: the answers */
const FREE = ['wall-answers']
const NONE: string[] = []

export default function WallPanels() {
  const { path } = useRoute()
  const stream = STREAMS.find((s) => s.path === path) ?? null
  usePageMeta(
    stream ? `${stream.name} · Wall Panels` : 'Wall Panels',
    stream?.description ??
      'RTARIUM wall panels: 30 mm solid and 100 mm SIP insulated panels with 3D basalt mesh. Non-magnetic, fire-rated, interlocking on four sides, bolted not welded.',
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

  // one scroll, one step, the whole page through, as the façade pages (usePageSteps), the answers playing with the scroll
  // (a phone plays its build's steps in a card by themselves, not with the scroll: nothing of it runs free there. Left
  // free, its one stop and the free run's hold kept pulling the page back to its top)
  const compact = useIsCompact()
  usePageSteps(compact ? NONE : FREE)

  // a system's own address: on a phone its own page; a wide screen, the page with that system chosen
  if (stream && compact)
    return (
      <FacadePage>
        <SystemRoute id={stream.id} />
      </FacadePage>
    )
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
      <div className="fu" data-ground={compact ? 'light' : 'yellow'}>
        <Panels which={30} />
      </div>
      <div className="fu" data-ground="black">
        <Say kicker={PAIRED.name} label={PAIRED.name} text={PAIRED.usp} />
      </div>
      <div className="fu" data-ground={compact ? 'light' : 'yellow'}>
        <Panels which={100} />
      </div>
      <div className="fu" data-ground="light">
        <Streams initial={stream?.id ?? null} />
      </div>
    </FacadePage>
  )
}
