import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D } from '../../facade/three/Stage3D'
import { smooth } from '../../facade/progress'
import { useLive } from '../../facade/unitized/live'
import { ProblemSample, type ProblemKind } from './three/ProblemSample'

/**
 * Where traditional floors fail, and how RTARIUM solves each, in the Rainscreen trade-offs' deck.
 * On the opening's yellow, the line that follows it; the black rises from the foot of the screen over
 * it, carrying the title. Then the three problems come in from the right, one card at a time.
 * Each card arrives as its problem: a photograph with its own sample turning in front of it, the
 * problem in one line. Then, in the same card, it is answered: its name and its line are struck, the
 * photograph slides over to RTARIUM's, the sample turns into RTARIUM's, and the answer comes in, in
 * yellow. The next card comes in under it; the one before stays above as a tab that keeps its struck
 * name and its answer, so the deck builds into the three answers, read down the tabs. As the page goes
 * on, the deck recedes and the client's line takes the title's place. Everything follows the scroll;
 * the samples turn in time.
 */

export interface Problem {
  id: string
  name: string
  problem: string
  /** the answer, short, for the tab */
  tab: string
  head: string
  line: string
  photos: [Photo, Photo]
}
export interface Photo {
  src: string
  alt: string
  credit?: string
  pos?: string
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
    tab: '20 mm, up to 60 % lighter',
    head: '20 mm, not 50.',
    line: 'Up to 60 % less dead weight. The slab stays level; the racks keep their clearance.',
    photos: [
      { src: '/img/flooring/dc-hollowcore.webp', alt: 'Prestressed hollow-core planks laid side by side on a building site', credit: 'Photo: Elie Malti, CC BY-SA 4.0' },
      { src: '/img/flooring/dc-site-strip.webp', alt: 'A strip of RTARIUM screed, finished, on the slab of a building under construction', pos: '30% 50%' },
    ],
  },
  {
    id: 'dust',
    name: 'Conductive dust',
    problem: 'Steel fibres wear into metal dust that the cooling air carries into the servers.',
    tab: '100 % non-metallic',
    head: 'Non-metallic. Zero dust.',
    line: 'A basalt mesh: nothing in the floor that can wear into a conductor.',
    photos: [
      { src: '/img/facade/uhpc-fibres.webp', alt: 'Short steel fibres standing out of broken concrete', credit: 'Photo: B. P. Maffezzoli, CC BY-SA 4.0' },
      { src: '/img/shoot/mesh-macro.webp', alt: 'RTARIUM basalt mesh, close up' },
    ],
  },
  {
    id: 'esd',
    name: 'ESD coat failure',
    problem: 'Cracks and outgassing in the screed break the ESD coating’s path to ground.',
    tab: 'A crack-free anchor',
    head: 'Dense and crack-free.',
    line: 'A flat, uniform anchor for a continuous ESD coating.',
    photos: [
      { src: '/img/flooring/dc-cracked.webp', alt: 'Concrete cracked into pieces across its surface', credit: 'Photo: Dimitrios Savva, Poly Haven, CC0' },
      { src: '/img/flooring/dc-site-gloss.webp', alt: 'A long, level strip of freshly laid RTARIUM screed, glossy, between the columns of a hall' },
    ],
  },
]
/** the client's closing line, set in the title's place as the deck recedes */
const CLOSE = ['Deflection mitigated.', 'Zero dust.', 'Zero downtime.']
/** a problem's sample, for its card, turning in its own canvas */
export type SampleOf = (id: string, solved: { current: number }, live: { current: boolean }) => ReactNode
const dcSample: SampleOf = (id, solved, live) => <ProblemSample kind={id as ProblemKind} solved={solved} live={live} />

/** screens of scroll in the pin, and when each thing happens along it (0..1) */
const RUN = 7.5
const NIGHT: [number, number] = [0.02, 0.11]
const CARD_AT = (k: number): [number, number] => [0.13 + k * 0.25, 0.13 + k * 0.25 + 0.07]
const SOLVE_AT = (k: number): [number, number] => [CARD_AT(k)[1] + 0.07, CARD_AT(k)[1] + 0.14]
const ASIDE: [number, number] = [0.88, 0.97]

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** a card's sample, in its own small canvas, turning while the card is on screen */
function SampleView({ id, sample, solved }: { id: string; sample: SampleOf; solved: { current: number } }) {
  const host = useRef<HTMLDivElement>(null)
  const live = useLive(host)
  return (
    <div ref={host} className="fr-card__sample" aria-hidden="true">
      <Stage3D>{sample(id, solved, live)}</Stage3D>
    </div>
  )
}

/**
 * The deck; the Data & AI Centres page's by default. Another application brings its own three problems,
 * its closing line and its samples.
 */
export function Problems({ problems = PROBLEMS, close: closing = CLOSE, sample = dcSample }: { problems?: Problem[]; close?: string[]; sample?: SampleOf }) {
  const N = problems.length
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const night = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const close = useRef<HTMLParagraphElement>(null)
  const names = useRef<(HTMLLIElement | null)[]>([])
  const deck = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLElement | null)[]>([])
  /** how far each card has been answered, read by its sample every frame */
  const solved = useMemo(() => problems.map(() => ({ current: 0 })), [problems])
  const [now, setNow] = useState(-1)

  useEffect(() => {
    const el = section.current
    if (!el) return
    const reduced = prefersReducedMotion()
    let raf = 0
    const read = () => {
      raf = 0
      const vh = window.innerHeight
      const r = el.getBoundingClientRect()
      const p = clamp01(-r.top / Math.max(1, r.height - vh))
      // the black, rising from the foot of the screen; the header follows it
      const n = reduced ? Number(p > NIGHT[0]) : ease(smooth(NIGHT[0], NIGHT[1], p))
      night.current?.style.setProperty('--n', n.toFixed(4))
      el.dataset.ground = n > 0.5 ? 'black' : 'yellow'
      // at the end the title gives way to the client's line, in its place
      // the title goes first; only once it has gone does the client's line come in, never over it
      const away = reduced ? Number(p > ASIDE[0]) : smooth(ASIDE[0], ASIDE[0] + 0.035, p)
      const back = reduced ? Number(p > ASIDE[0]) : smooth(ASIDE[0] + 0.04, ASIDE[1] - 0.01, p)
      if (title.current) {
        title.current.style.opacity = (1 - away).toFixed(3)
        title.current.style.visibility = away < 0.99 ? '' : 'hidden'
      }
      if (close.current) {
        close.current.style.opacity = back.toFixed(3)
        close.current.style.transform = `translate3d(0, ${((1 - back) * 14).toFixed(2)}px, 0)`
        close.current.style.visibility = back > 0.01 ? '' : 'hidden'
      }
      // the cards: each in from the right edge to its place, one tab below the card before it; the ones
      // above pushed back into the depth, their tabs still read
      const d = deck.current
      if (!d) return
      const W = d.clientWidth
      const first = cards.current[0]
      const tab = first?.querySelector<HTMLElement>('.fr-card__tab')?.offsetHeight ?? 56
      const from = window.innerWidth - d.getBoundingClientRect().left + 24
      const arrive = problems.map((_, k) => (reduced ? Number(p > CARD_AT(k)[0]) : ease(smooth(CARD_AT(k)[0], CARD_AT(k)[1], p))))
      const aside = reduced ? 0 : ease(smooth(ASIDE[0], ASIDE[1], p))
      let current = -1
      cards.current.forEach((c, k) => {
        if (!c) return
        const a = arrive[k]
        if (a > 0.5) current = k
        let depth = 0
        for (let j = k + 1; j < N; j++) depth += arrive[j]
        const x = (1 - a) * from + aside * W * 0.1
        const y = k * tab
        const s = (1 - Math.min(depth, 4) * 0.012) * (1 - aside * 0.12)
        c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`
        c.style.visibility = a > 0.001 ? 'visible' : 'hidden'
        c.style.setProperty('--depth', Math.min(1, depth * 0.5 + aside * 0.55).toFixed(3))
        c.toggleAttribute('data-front', a > 0.5 && depth < 0.5)
        // answered in place: struck, the photograph over to RTARIUM's, the answer in
        const v = reduced ? Number(p > SOLVE_AT(k)[0]) : smooth(SOLVE_AT(k)[0], SOLVE_AT(k)[1], p)
        c.style.setProperty('--s', v.toFixed(4))
        c.toggleAttribute('data-solved', v > 0.5)
        solved[k].current = v
      })
      // the names on the left, one by one as their cards come in, struck as they are answered
      names.current.forEach((li, k) => {
        if (!li) return
        const a = arrive[k]
        li.style.opacity = (a * (1 - away)).toFixed(3)
        li.style.transform = `translate3d(0, ${((1 - a) * 10).toFixed(2)}px, 0)`
        li.style.visibility = a > 0.01 ? 'visible' : 'hidden'
        li.style.setProperty('--s', (reduced ? Number(p > SOLVE_AT(k)[0]) : smooth(SOLVE_AT(k)[0], SOLVE_AT(k)[1], p)).toFixed(4))
      })
      setNow(current)
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
  }, [compact, solved, problems, N])

  /** to where a problem's card has been answered */
  const go = (k: number) => {
    const el = section.current
    if (!el) return
    const at = SOLVE_AT(k)[1] + 0.02
    scrollToY(el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * at)
  }

  return (
    <section ref={section} id="problems" className="fr-trade fdc-fail" data-ground="yellow" aria-labelledby="fdc-fail-title" style={{ '--run': RUN } as CSSProperties}>
      <div className="fr-trade__pin">
        {/* the first line on warm white; the black rises over it, carrying the title in its place */}
        <div className="fr-trade__copy">
          <p className="fr-trade__first">
            Traditional screeds <br />
            were not built <br />
            for this.
          </p>
        </div>
        <div ref={night} className="fr-trade__night">
          <div className="fr-trade__copy">
            <h2 ref={title} id="fdc-fail-title" className="fr-trade__title">
              RTARIUM was <br />
              built for this.
            </h2>
          </div>
        </div>

        <div className="fr-trade__copy fr-trade__copy--front">
          <div className="fr-trade__head">
            <p ref={close} className="fr-trade__title fdc-fail__close" style={{ visibility: 'hidden' }}>
              {closing.map((l, i) => (
                <span key={l}>
                  {i > 0 && <br />}
                  {l}
                </span>
              ))}
            </p>
            <ol className="fr-trade__nav" aria-label="The problems">
              {problems.map((pr, k) => (
                <li key={pr.id} ref={(el) => void (names.current[k] = el)} style={{ visibility: 'hidden' }}>
                  <button type="button" className="fr-trade__go fdc-fail__go" aria-current={now === k ? 'true' : undefined} onClick={() => go(k)}>
                    <span className="num">0{k + 1}</span>
                    <span className="fdc-strike">{pr.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div ref={deck} className="fr-trade__deck" style={{ '--n': N } as CSSProperties}>
          {problems.map((pr, k) => (
            <article key={pr.id} ref={(el) => void (cards.current[k] = el)} className="fr-card fdc-card" style={{ visibility: 'hidden', zIndex: k + 1 } as CSSProperties} aria-labelledby={`fdc-card-${pr.id}`} onClick={() => go(k)}>
              {/* the tab: what stays in view once the next card lies on it: the struck problem and the answer */}
              <header className="fr-card__tab fdc-card__tab">
                <span className="fr-card__num num">0{k + 1}</span>
                <h3 id={`fdc-card-${pr.id}`} className="fr-card__name">
                  <span className="fdc-strike">{pr.name}</span>
                </h3>
                <p className="fdc-card__answer">
                  <span className="fdc-card__by">RTARIUM</span>
                  {pr.tab}
                </p>
              </header>
              <div className="fr-card__body">
                <div className="fr-card__media fdc-card__media">
                  <img className="fdc-card__photo" src={pr.photos[0].src} alt={pr.photos[0].alt} loading="lazy" decoding="async" style={pr.photos[0].pos ? { objectPosition: pr.photos[0].pos } : undefined} />
                  <img className="fdc-card__photo fdc-card__photo--after" src={pr.photos[1].src} alt={pr.photos[1].alt} loading="lazy" decoding="async" style={pr.photos[1].pos ? { objectPosition: pr.photos[1].pos } : undefined} />
                  <SampleView id={pr.id} sample={sample} solved={solved[k]} />
                  {pr.photos[0].credit && <p className="fr-card__credit fdc-card__credit">{pr.photos[0].credit}</p>}
                </div>
                <div className="fr-card__words fdc-card__words">
                  <div className="fdc-card__was">
                    <p className="fdc-card__label">The problem</p>
                    <p className="fdc-card__problem">
                      <span className="fdc-strike">{pr.problem}</span>
                    </p>
                  </div>
                  <div className="fdc-card__now">
                    <p className="fdc-card__label">RTARIUM</p>
                    <p className="fdc-card__head">{pr.head}</p>
                    <p className="fdc-card__line">{pr.line}</p>
                  </div>
                </div>
              </div>
              <i className="fr-card__shade" aria-hidden="true" />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
