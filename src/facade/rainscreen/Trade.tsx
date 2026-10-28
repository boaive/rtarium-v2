import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D } from '../three/Stage3D'
import { Sample, type SampleKind } from '../three/rain/Sample'
import { smooth } from '../progress'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useLive } from '../unitized/live'

/**
 * The trade-offs: why a concrete rainscreen is not simply chosen. On warm white, the line every
 * architect starts from; the black rises from the foot of the screen over it (the line turning yellow
 * where it passes). Then what the market offers comes in from the right, one card at a time: precast
 * concrete, natural stone, GRC, UHPC, metal. Each card has its photograph with its own sample turning
 * in front of it, how thick and how heavy it is, what it gives and what it costs. Each new card comes
 * in under the last, which stays above it as a tab (its name, thickness and weight), so the deck builds
 * into one comparison, read down the columns. The names on the left come in one by one with their cards
 * and, like the tabs, take you back. As the page goes on to RTARIUM the deck recedes. Everything follows
 * the scroll; the samples turn in time.
 */

interface Material {
  id: SampleKind
  name: string
  full: string
  thick: string
  weight: string
  gives: string
  costs: string
  photo: { src: string; alt: string; credit?: string; pos?: string }
}

/*
 * Typical figures, from published sources (REVIEW.materials): precast 125–150 mm at about 350 kg/m²
 * (Construction Canada); solid stone 20–30 mm, 30 mm granite about 75–85 kg/m², panels as small as
 * 600 × 1200 mm (manufacturer data); GRC skins 12–20 mm, thin GRC about 30 kg/m² and more with its
 * frame, AR-glass strength lost with long wet exposure (PCI Journal, 1987); UHPC 15–30 mm at 33–66
 * kg/m² (manufacturer data); aluminium composite about 4 mm and a few kilograms a square metre.
 */
const MATERIALS: Material[] = [
  {
    id: 'precast',
    name: 'Precast concrete',
    full: 'Architectural precast panels',
    thick: '125–150 mm',
    weight: '~350 kg/m²',
    gives: 'A solid concrete face.',
    costs: 'Heavy on the frame and the foundations.',
    photo: { src: '/img/facade/precast-joint.webp', alt: 'The joint between two precast concrete façade panels, a rusting fixing at their corner', credit: 'Photo: Achim Hering, CC BY 3.0' },
  },
  {
    id: 'stone',
    name: 'Natural stone',
    full: 'Granite, limestone, marble',
    thick: '20–30 mm',
    weight: '75–85 kg/m²',
    gives: 'A premium, natural face.',
    costs: 'Heavy, and only in small sizes.',
    photo: { src: '/img/facade/granite.webp', alt: 'Polished granite, close up: grey, rose and black grains', credit: 'Photo: Eurico Zimbres, CC BY-SA 2.5' },
  },
  {
    id: 'grc',
    name: 'GRC',
    full: 'Glass fibre reinforced concrete',
    thick: '12–20 mm',
    weight: '30–45 kg/m²',
    gives: 'A thin concrete face.',
    costs: 'Its glass fibre loses strength with age.',
    photo: { src: '/img/facade/glass-fibre.webp', alt: 'A heap of short chopped glass fibre strands' },
  },
  {
    id: 'uhpc',
    name: 'UHPC',
    full: 'Ultra-high performance concrete',
    thick: '15–30 mm',
    weight: '33–66 kg/m²',
    gives: 'Thin and very strong.',
    costs: 'A costly mix, its steel fibres can corrode.',
    photo: {
      src: '/img/facade/uhpc-fibres.webp',
      alt: 'A broken sample of ultra-high performance concrete with steel fibres standing out of the break',
      // CC BY-SA 4.0: the licence asks for this credit
      credit: 'Photo: B. P. Maffezzoli, CC BY-SA 4.0',
    },
  },
  {
    id: 'acp',
    name: 'Metal / ACP',
    full: 'Aluminium and metal composite panels',
    thick: '3–4 mm',
    weight: 'Under 10 kg/m²',
    gives: 'Very light and simple.',
    costs: 'Dents, fades, and it isn’t concrete.',
    photo: {
      src: '/img/facade/acp-edge.webp',
      alt: 'The edge of an aluminium composite panel: two thin aluminium skins on a black core',
      // CC BY-SA 4.0 (Wikimedia Commons, "Aluminium composite material.jpg"): the licence asks for this credit
      credit: 'Photo: Temdor, CC BY-SA 4.0',
    },
  },
]
const N = MATERIALS.length

/** screens of scroll in the pin, and when each thing happens along it (0..1) */
const RUN = 6
const NIGHT: [number, number] = [0.02, 0.14]
const CARD_AT = (k: number): [number, number] => [0.16 + k * 0.14, 0.16 + k * 0.14 + 0.1]
const ASIDE: [number, number] = [0.9, 1]

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** a card's sample, in its own small canvas, turning while the card is on screen */
function SampleView({ kind }: { kind: SampleKind }) {
  const host = useRef<HTMLDivElement>(null)
  const live = useLive(host)
  return (
    <div ref={host} className="fr-card__sample" aria-hidden="true">
      <Stage3D>
        <Sample kind={kind} live={live} />
      </Stage3D>
    </div>
  )
}

export function Trade() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const night = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const names = useRef<(HTMLLIElement | null)[]>([])
  const deck = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLElement | null)[]>([])
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
      el.dataset.ground = n > 0.5 ? 'black' : 'light'
      // the black carries the title: where it has passed, the first line has become the title
      const away = reduced ? 0 : smooth(ASIDE[0], ASIDE[1] - 0.03, p)
      if (title.current) title.current.style.opacity = (1 - away).toFixed(3)
      // the cards: each in from the right edge to its place, one tab below the card before it; the ones
      // above pushed back into the depth, their tabs still read
      const d = deck.current
      if (!d) return
      const W = d.clientWidth
      const first = cards.current[0]
      const tab = first?.querySelector<HTMLElement>('.fr-card__tab')?.offsetHeight ?? 56
      const from = window.innerWidth - d.getBoundingClientRect().left + 24
      const arrive = MATERIALS.map((_, k) => (reduced ? Number(p > CARD_AT(k)[0]) : ease(smooth(CARD_AT(k)[0], CARD_AT(k)[1], p))))
      const aside = reduced ? 0 : ease(smooth(ASIDE[0], ASIDE[1], p))
      let current = -1
      cards.current.forEach((c, k) => {
        if (!c) return
        const a = arrive[k]
        if (a > 0.5) current = k
        let depth = 0
        for (let j = k + 1; j < N; j++) depth += arrive[j]
        const x = (1 - a) * from + aside * W * 0.06
        const y = k * tab
        const s = (1 - Math.min(depth, 4) * 0.012) * (1 - aside * 0.12)
        c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`
        c.style.visibility = a > 0.001 ? 'visible' : 'hidden'
        c.style.setProperty('--depth', Math.min(1, depth * 0.5 + aside * 0.55).toFixed(3))
        c.toggleAttribute('data-front', a > 0.5 && depth < 0.5)
      })
      // the names on the left, one by one as their cards come in
      names.current.forEach((li, k) => {
        if (!li) return
        const a = arrive[k]
        li.style.opacity = (a * (1 - away)).toFixed(3)
        li.style.transform = `translate3d(0, ${((1 - a) * 10).toFixed(2)}px, 0)`
        li.style.visibility = a > 0.01 ? 'visible' : 'hidden'
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
  }, [compact])

  /** to where a material's card has just settled in front */
  const go = (k: number) => {
    const el = section.current
    if (!el) return
    const at = CARD_AT(k)[1] + 0.02
    scrollToY(el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * at)
  }

  return (
    <section ref={section} id="tradeoffs" className="fr-trade" data-ground="light" aria-labelledby="fr-trade-title" style={{ '--run': RUN } as CSSProperties}>
      <div className="fr-trade__pin">
        {/* the first line on warm white; the black rises over it, carrying the title in its place */}
        <div className="fr-trade__copy">
          <p className="fr-trade__first">
            A concrete façade <br />
            is the architect’s <br />
            first choice.
          </p>
        </div>
        <div ref={night} className="fr-trade__night">
          <div className="fr-trade__copy">
            <h2 ref={title} id="fr-trade-title" className="fr-trade__title">
              Every material <br />
              has its trade-offs.
            </h2>
          </div>
        </div>

        <div className="fr-trade__copy fr-trade__copy--front">
          <div className="fr-trade__head">
            <ol className="fr-trade__nav" aria-label="The materials">
              {MATERIALS.map((m, k) => (
                <li key={m.id} ref={(el) => void (names.current[k] = el)} style={{ visibility: 'hidden' }}>
                  <button type="button" className="fr-trade__go" aria-current={now === k ? 'true' : undefined} onClick={() => go(k)}>
                    <span className="num">0{k + 1}</span>
                    {m.name}
                  </button>
                </li>
              ))}
            </ol>
            <ReviewNote>{REVIEW.materials}</ReviewNote>
          </div>
        </div>

        <div ref={deck} className="fr-trade__deck" style={{ '--n': N } as CSSProperties}>
          {MATERIALS.map((m, k) => (
            <article key={m.id} ref={(el) => void (cards.current[k] = el)} className="fr-card" style={{ visibility: 'hidden', zIndex: k + 1 } as CSSProperties} aria-labelledby={`fr-card-${m.id}`} onClick={() => go(k)}>
              {/* the tab: what stays in view once the next card lies on it */}
              <header className="fr-card__tab">
                <span className="fr-card__num num">0{k + 1}</span>
                <h3 id={`fr-card-${m.id}`} className="fr-card__name">
                  {m.name}
                </h3>
                <dl className="fr-card__figs">
                  <div>
                    <dt>Thickness</dt>
                    <dd className="num">{m.thick}</dd>
                  </div>
                  <div>
                    <dt>Weight</dt>
                    <dd className="num">{m.weight}</dd>
                  </div>
                </dl>
              </header>
              <div className="fr-card__body">
                <div className="fr-card__media">
                  <img src={m.photo.src} alt={m.photo.alt} loading="lazy" decoding="async" style={m.photo.pos ? { objectPosition: m.photo.pos } : undefined} />
                  <SampleView kind={m.id} />
                  {m.photo.credit && <p className="fr-card__credit">{m.photo.credit}</p>}
                </div>
                <div className="fr-card__words">
                  <p className="fr-card__full">{m.full}</p>
                  <dl className="fr-card__trade">
                    <div>
                      <dt>Gives</dt>
                      <dd>{m.gives}</dd>
                    </div>
                    <div className="fr-card__cost">
                      <dt>Costs</dt>
                      <dd>{m.costs}</dd>
                    </div>
                  </dl>
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
