import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import { Say } from '../../components/Say'

/**
 * Conventional screed against RTARIUM. The title stands alone on a black screen first (`Say`), where it falls apart and
 * RTARIUM's answer pops up; then every problem on one black screen, a row to each, a line between them: its number,
 * dropping out from under the line as the screen rises, then what goes wrong, quiet, and what RTARIUM does about it,
 * in yellow, the words alone. The Data & AI Centres page's by default; the other applications bring their own title
 * and rows.
 */

export interface Problem {
  id: string
  name: string
  problem: string
  head: string
  line: string
}

/*
 * The client's segment brief for hyperscale data centres (RTARIUM Flooring Strategic Briefing):
 * 40–50 mm micro-concrete toppings add dead weight to hollow-core and post-tensioned slabs; RTARIUM's
 * screed cuts it by up to 60 % (20 mm here, the client's own build: 5 + 10 mm mesh + 5); steel-fibre
 * screeds erode into conductive dust; RTARIUM is a dense, crack-free anchor for ESD coatings.
 */
const PROBLEMS: Problem[] = [
  {
    id: 'deflect',
    name: 'Slab deflection',
    problem: 'A 40–50 mm topping adds dead weight that bends prestressed slabs over time.',
    head: '20 mm instead of 50',
    line: 'Up to 60% less dead weight. The slab stays level; the racks keep their clearance.',
  },
  {
    id: 'dust',
    name: 'Conductive dust',
    problem: 'Steel fibres wear into metal dust that the cooling air carries into the servers.',
    head: 'No metal to wear away.',
    line: 'A basalt mesh has nothing in it that can turn into conductive dust.',
  },
  {
    id: 'esd',
    name: 'ESD coat failure',
    problem: 'Cracks, and gas escaping from the screed, can break the ESD coating, so static no longer reaches ground.',
    head: 'Dense and crack-free.',
    line: 'A flat, uniform anchor for a continuous ESD coating.',
  },
]
const TITLE = 'Conventional screeds were never built for data centres.'
const ANSWER = 'RTARIUM was.'
/** the rows' way in, as shares of the screen's rise: the first starts at FROM, each takes SPAN, the last lands at the top */
const FROM = 0.3
const SPAN = 0.36

export function Problems({ problems = PROBLEMS, title = TITLE, answer = ANSWER }: { problems?: Problem[]; title?: string; answer?: string }) {
  const section = useRef<HTMLElement>(null)
  const rows = useRef<HTMLOListElement>(null)

  // as the screen rises, row after row: its line draws across and its number drops out from under the line, straight
  // with the scroll, no easing of its own: the page's glide (Lenis) is what makes it smooth. All landed as it reaches the top
  useEffect(() => {
    const el = section.current
    const items = rows.current ? ([...rows.current.children] as HTMLElement[]) : []
    if (!el) return
    const still = prefersReducedMotion()
    const step = (1 - FROM - SPAN) / Math.max(1, items.length - 1)
    let raf = 0
    const read = () => {
      raf = 0
      const vh = window.innerHeight
      const rise = (vh - el.getBoundingClientRect().top) / vh
      items.forEach((row, k) => {
        const t = still ? 1 : Math.min(1, Math.max(0, (rise - FROM - k * step) / SPAN))
        row.style.setProperty('--g', t.toFixed(4))
      })
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [])

  return (
    <div data-ground="black">
      <Say label={`${title} ${answer}`} text={title} then={answer} />
      <section ref={section} id="problems" className="fr-steps on-black" aria-label="Conventional screed against RTARIUM">
        <p className="fr-step fr-steps__head" aria-hidden="true">
          <span />
          <span>Conventional screed</span>
          <span>With RTARIUM</span>
        </p>
        <ol ref={rows}>
          {problems.map((p, i) => (
            <li key={p.id} className="fr-step">
              <span className="fr-step__num num" aria-hidden="true">
                0{i + 1}
              </span>
              <div className="fr-step__tab">
                <h3 className="fr-step__name">{p.name}</h3>
                <p className="fr-step__line">{p.problem}</p>
              </div>
              <div className="fr-step__tab fr-step__tab--ours">
                <p className="fr-step__head">{p.head}</p>
                <p className="fr-step__line">{p.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
