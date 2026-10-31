import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ReviewNote } from '../../components/Media'
import { prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D } from '../../facade/three/Stage3D'
import { smooth } from '../../facade/progress'
import { useLive } from '../../facade/unitized/live'
import { glide, useDeckUnderWords } from '../data/Problems'
import { ProblemSample, type ProblemKind } from './three/ProblemSample'

/**
 * The Data & AI Centres problems' deck, on the warehouse's four failures. On the opening's yellow, the
 * line that follows it, alone in the middle of the screen; the black rises from the foot of the screen
 * over it, carrying the answer in the same place, which then goes over to its corner. Each card arrives
 * as its problem and is answered in place: its name and line struck, the photograph slid over to
 * RTARIUM's, the sample turned into RTARIUM's, the answer in, in yellow. Each comes in square on the
 * one before, which goes dark under it to its tab. As the page goes on the deck recedes as one and the
 * client's messages take the title's place, in few words.
 */

interface Problem {
  id: ProblemKind
  name: string
  problem: string
  tab: string
  head: string
  line: string
  photos: [Photo, Photo]
}
interface Photo {
  src: string
  alt: string
  credit?: string
  pos?: string
}

/*
 * The owner's brief for this page and the client's segment brief for advanced warehouses (RTARIUM
 * Flooring Strategic Briefing): jointless pours that eliminate curling; a multi-layered mesh that arrests
 * micro-cracks at the surface; non-metallic and magnetically inert, so zero sensor interference; 5 mm
 * cover either side of a 10 mm mesh; a polished floor under a polyurethane or polyaspartic wear coat.
 */
const PROBLEMS: Problem[] = [
  {
    id: 'spall',
    name: 'Joint spalling',
    problem: 'Rolling shear spalls and pits every saw-cut joint.',
    tab: 'Jointless pours',
    head: 'No joint to spall.',
    line: 'Monolithic bays: the wheels run on unbroken floor.',
    photos: [
      { src: '/img/flooring/aw-site-joint.webp', alt: 'A rough, pitted slab either side of a line of joints, running away down a hall', pos: '10% 80%' },
      { src: '/img/flooring/dc-site-gloss.webp', alt: 'A long, level strip of freshly laid RTARIUM screed, glossy, between the columns of a hall' },
    ],
  },
  {
    id: 'crack',
    name: 'Micro-cracking',
    problem: 'Micro-cracks open at the joints, then run deeper.',
    tab: '5 + 10 + 5 mm',
    head: '5 + 10 + 5 mm.',
    line: 'A 10 mm 3D mesh, centred, arrests micro-cracks at the surface.',
    photos: [
      { src: '/img/flooring/dc-cracked.webp', alt: 'Concrete cracked into pieces across its surface', credit: 'Photo: Dimitrios Savva, Poly Haven, CC0' },
      { src: '/img/shoot/mesh-macro.webp', alt: 'RTARIUM basalt mesh, close up' },
    ],
  },
  {
    id: 'agv',
    name: 'Sensor failure',
    problem: 'A wheel catches, the laser loses alignment, the system stops.',
    tab: 'Zero sensor interference',
    head: 'Flat. Magnetically inert.',
    line: 'TR34 DM1 flatness for the wheels; non-metallic for the sensors.',
    photos: [
      { src: '/img/flooring/aw-agv-aisle.webp', alt: 'An automated truck with a laser scanner on a jointed warehouse floor, between pallet racks', pos: '32% 50%' },
      { src: '/img/flooring/aw-lgv-aisle.webp', alt: 'Laser-guided trucks in a narrow aisle between towering racks, on a smooth floor', pos: '72% 50%' },
    ],
  },
  {
    id: 'dust',
    name: 'Abrasion and dust',
    problem: 'Constant traffic wears the surface away as dust.',
    tab: 'Polished, then armoured',
    head: 'Polished, then armoured.',
    line: 'Glass-smooth, under a polyurethane or polyaspartic coat.',
    photos: [
      { src: '/img/flooring/aw-site-dust.webp', alt: 'A pale, dusty and worn slab beside a darker fresh strip', pos: '10% 90%' },
      { src: '/img/flooring/dc-site-strip.webp', alt: 'A strip of RTARIUM screed, finished, on the slab of a building', pos: '30% 50%' },
    ],
  },
]
const N = PROBLEMS.length

/**
 * What takes the left side once the deck has been read: the client's line, cut to its few words, and
 * the second message the owner is yet to send (its place is kept; nothing is shown until it arrives).
 */
const MESSAGES: (string[] | null)[] = [['Zero interference.', 'Zero curling.', '24/7 precision.'], null]

const RUN = 9.4
const NIGHT: [number, number] = [0.016, 0.088]
/** the title, from the middle of the screen to its corner: once the black is past its top, before the first card */
const GLIDE: [number, number] = [0.075, 0.13]
const CARD_AT = (k: number): [number, number] => [0.135 + k * 0.19, 0.135 + k * 0.19 + 0.055]
const SOLVE_AT = (k: number): [number, number] => [CARD_AT(k)[1] + 0.055, CARD_AT(k)[1] + 0.11]
const ASIDE: [number, number] = [0.9, 0.975]

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function SampleView({ kind, solved }: { kind: ProblemKind; solved: { current: number } }) {
  const host = useRef<HTMLDivElement>(null)
  const live = useLive(host)
  return (
    <div ref={host} className="fr-card__sample" aria-hidden="true">
      <Stage3D>
        <ProblemSample kind={kind} solved={solved} live={live} />
      </Stage3D>
    </div>
  )
}

export function Problems() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const night = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLParagraphElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const close = useRef<HTMLDivElement>(null)
  const names = useRef<(HTMLLIElement | null)[]>([])
  const deck = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLElement | null)[]>([])
  const solved = useMemo(() => PROBLEMS.map(() => ({ current: 0 })), [])
  const [now, setNow] = useState(-1)
  useDeckUnderWords(deck, compact)

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
      // the title stands where the first line stood while the black rises over it, then goes over to its corner
      glide(title.current, first.current, reduced ? Number(p < GLIDE[0]) : 1 - ease(smooth(GLIDE[0], GLIDE[1], p)))
      // the title goes first; only once it has gone do the client's messages come in, never over it
      const away = reduced ? Number(p > ASIDE[0]) : smooth(ASIDE[0], ASIDE[0] + 0.03, p)
      const back = reduced ? Number(p > ASIDE[0]) : smooth(ASIDE[0] + 0.035, ASIDE[1] - 0.005, p)
      if (title.current) {
        title.current.style.opacity = (1 - away).toFixed(3)
        title.current.style.visibility = away < 0.99 ? '' : 'hidden'
      }
      if (close.current) {
        close.current.style.opacity = back.toFixed(3)
        close.current.style.transform = `translate3d(0, ${((1 - back) * 14).toFixed(2)}px, 0)`
        close.current.style.visibility = back > 0.01 ? '' : 'hidden'
      }
      // the cards: each in from the right edge, one tab below and square on the one before, which goes
      // dark under it to its tab
      const d = deck.current
      if (!d) return
      const W = d.clientWidth
      const tab = cards.current[0]?.querySelector<HTMLElement>('.fr-card__tab')?.offsetHeight ?? 56
      const from = window.innerWidth - d.offsetLeft + 24
      const arrive = PROBLEMS.map((_, k) => (reduced ? Number(p > CARD_AT(k)[0]) : ease(smooth(CARD_AT(k)[0], CARD_AT(k)[1], p))))
      const aside = reduced ? 0 : ease(smooth(ASIDE[0], ASIDE[1], p))
      // the deck recedes as one, so no card ever slips out from under another
      d.style.transform = aside > 0 ? `translate3d(${(aside * W * 0.1).toFixed(1)}px, 0, 0) scale(${(1 - aside * 0.12).toFixed(4)})` : ''
      let current = -1
      cards.current.forEach((c, k) => {
        if (!c) return
        const a = arrive[k]
        if (a > 0.5) current = k
        let depth = 0
        for (let j = k + 1; j < N; j++) depth += arrive[j]
        c.style.transform = `translate3d(${((1 - a) * from).toFixed(1)}px, ${(k * tab).toFixed(1)}px, 0)`
        c.style.visibility = a > 0.001 ? 'visible' : 'hidden'
        c.style.setProperty('--cover', Math.min(1, depth * 1.5).toFixed(3))
        c.style.setProperty('--depth', Math.min(1, depth * 0.5 + aside * 0.55).toFixed(3))
        c.toggleAttribute('data-front', a > 0.5 && depth < 0.5)
        const v = reduced ? Number(p > SOLVE_AT(k)[0]) : smooth(SOLVE_AT(k)[0], SOLVE_AT(k)[1], p)
        c.style.setProperty('--s', v.toFixed(4))
        c.toggleAttribute('data-solved', v > 0.5)
        solved[k].current = v
      })
      names.current.forEach((li, k) => {
        if (!li) return
        const a = arrive[k]
        li.style.opacity = (a * (1 - away)).toFixed(3)
        li.style.transform = `translate3d(0, ${((1 - a) * 10).toFixed(2)}px, 0)`
        li.style.visibility = a > 0.01 && away < 0.99 ? 'visible' : 'hidden'
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
  }, [compact, solved])

  const go = (k: number) => {
    const el = section.current
    if (!el) return
    const at = SOLVE_AT(k)[1] + 0.02
    scrollToY(el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * at)
  }

  return (
    <section ref={section} id="problems" className="fr-trade fdc-fail" data-ground="yellow" aria-labelledby="faw-fail-title" style={{ '--run': RUN } as CSSProperties}>
      <div className="fr-trade__pin">
        {/* the first line in the middle of the yellow; the black rises over it, carrying the title in its place */}
        <div className="fr-trade__copy fdc-fail__open">
          <p ref={first} className="fr-trade__first">
            Traditional screeds <br />
            were not built <br />
            for this.
          </p>
        </div>
        <div ref={night} className="fr-trade__night">
          <div className="fr-trade__copy">
            <h2 ref={title} id="faw-fail-title" className="fr-trade__title fdc-fail__lines">
              <span>RTARIUM was</span> <span>built for this.</span>
            </h2>
          </div>
        </div>

        <div className="fr-trade__copy fr-trade__copy--front">
          <div className="fr-trade__head">
            <div ref={close} className="faw-trade__close" style={{ visibility: 'hidden' }}>
              {MESSAGES.map((m, k) =>
                m ? (
                  <p key={k} className="fr-trade__title fdc-fail__close">
                    {m.map((l) => (
                      <span key={l} style={{ display: 'block' }}>
                        {l}
                      </span>
                    ))}
                  </p>
                ) : (
                  <ReviewNote key={k}>The second message here is still to come from the owner.</ReviewNote>
                ),
              )}
            </div>
            <ol className="fr-trade__nav" aria-label="The problems">
              {PROBLEMS.map((pr, k) => (
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
          {PROBLEMS.map((pr, k) => (
            <article key={pr.id} ref={(el) => void (cards.current[k] = el)} className="fr-card fdc-card" style={{ visibility: 'hidden', zIndex: k + 1 } as CSSProperties} aria-labelledby={`faw-card-${pr.id}`} onClick={() => go(k)}>
              <header className="fr-card__tab fdc-card__tab">
                <span className="fr-card__num num">0{k + 1}</span>
                <h3 id={`faw-card-${pr.id}`} className="fr-card__name">
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
                  <SampleView kind={pr.id} solved={solved[k]} />
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
