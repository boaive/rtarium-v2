import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { scrollToY } from '../lib/scroll'
import { prefersReducedMotion } from '../lib/motion'

/** a card's parts: each a heading with its sign, what it says folded until the sign is pressed */
export type DeckPart = { label: string; text: string }

export interface DeckItem {
  id: string
  name: string
  /** what it is, small under the name */
  full?: string
  /** its drawing, top right (a line icon, or a mark) */
  icon?: ReactNode
  parts: DeckPart[]
  /** a line under a hairline at the card's foot */
  foot?: ReactNode
}

/** how far of the screen's height the scroll deals each card */
const DECK_RUN = 75

/**
 * Cards dealt as Home's "One mesh in place of three compromises" deals them (Why: Cards), on a phone: on yellow, white
 * cards, the section holding still while the scroll deals them one onto another, a band lower each time, so every card
 * passed still shows its number and name. A tap on a card under the one in front shuffles it to the front, as Home's.
 * A card: its number on a yellow chip and its drawing top right, its name and what it is, and its parts, one open at a
 * time, the first open to begin with (a minus), each a thin plus that turns into a minus as it opens; a foot under a
 * hairline. Its styles: minimal.css (`.fdeck`, and the deck's own `.vs`).
 */
export function DeckCards({ id, title, items, sectionRef, ground = 'yellow' }: { id: string; title: string; items: DeckItem[]; sectionRef?: RefObject<HTMLElement | null>; ground?: 'yellow' | 'black' }) {
  const n = items.length
  /** which part of each card is open: the first, to begin with */
  const [open, setOpen] = useState<number[]>(() => items.map(() => 0))
  const flip = (i: number, k: number) => setOpen((o) => o.map((x, a) => (a === i ? (x === k ? -1 : k) : x)))
  const section = useRef<HTMLElement | null>(null)
  const list = useRef<HTMLOListElement>(null)

  // the deal: the section's run, read as the page scrolls, `--deck` 0 to n - 1 (the deck's own CSS, as Home's)
  useEffect(() => {
    const el = section.current
    const deck = list.current
    if (!el || !deck) return
    if (prefersReducedMotion()) return void deck.style.setProperty('--deck', String(n - 1))
    let raf = 0
    const read = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const pin = el.querySelector<HTMLElement>('.fdeck__in')
      const run = Math.max(1, r.height - (pin?.offsetHeight ?? window.innerHeight))
      deck.style.setProperty('--deck', (Math.min(1, Math.max(0, -r.top / run)) * (n - 1)).toFixed(4))
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
  }, [n])

  // each card only as tall as the deck's fullest needs (its fullest part open), not the one height every deck had: a deck
  // of short cards no longer carries an empty band under its words
  useEffect(() => {
    const deck = list.current
    if (!deck) return
    const fit = () => {
      let need = 0
      deck.querySelectorAll<HTMLElement>('.fdeck__card').forEach((card) => {
        const cs = getComputedStyle(card)
        const kids = [...card.children] as HTMLElement[]
        let h = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.rowGap || '0') * Math.max(0, kids.length - 1)
        for (const el of kids) {
          if (!el.classList.contains('fdeck__parts')) {
            h += el.offsetHeight
            continue
          }
          // (the parts folded, and the tallest of what they say, open)
          let parts = parseFloat(getComputedStyle(el).borderTopWidth) || 0
          let body = 0
          el.querySelectorAll<HTMLElement>('.fdeck__part').forEach((part) => {
            const head = part.querySelector<HTMLElement>('.fdeck__part-head')
            parts += (head?.offsetHeight ?? 0) + (parseFloat(getComputedStyle(part).borderBottomWidth) || 0)
            body = Math.max(body, part.querySelector<HTMLElement>('.fdeck__body p')?.offsetHeight ?? 0)
          })
          h += parts + body
        }
        need = Math.max(need, h)
      })
      if (need <= 0) return
      const cardH = Math.ceil(need + 8)
      deck.style.setProperty('--card-h', `${cardH}px`)
      // and the whole deck on the one screen: where the cards passed, each showing its number and name, would carry the
      // one in front past the screen's foot, each shows a band a little shorter (its name's top half at the least)
      const pin = deck.closest<HTMLElement>('.fdeck__in')
      const first = deck.querySelector<HTMLElement>('.fdeck__card')
      const name = first?.querySelector<HTMLElement>('.fdeck__name')
      deck.style.removeProperty('--peek')
      deck.classList.remove('is-tight')
      if (!pin || !first || !name || n < 2) return
      const room = () => Math.min(pin.clientHeight, window.innerHeight) - (deck.getBoundingClientRect().top - pin.getBoundingClientRect().top) - 14
      const band = () => name.offsetTop + name.offsetHeight + 8
      if ((room() - cardH) / (n - 1) >= band()) return
      // (tight: each card's top drawn closer, its name a little smaller, so the band each shows still holds its name whole)
      deck.classList.add('is-tight')
      const tight = Math.ceil(need + 8 - 12)
      deck.style.setProperty('--card-h', `${tight}px`)
      const fits = (room() - tight) / (n - 1)
      const full = band()
      if (fits < full) deck.style.setProperty('--peek', `${Math.max(name.offsetTop + name.offsetHeight * 0.75, Math.floor(fits))}px`)
      else deck.style.setProperty('--peek', `${full}px`)
    }
    fit()
    document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [items])

  /*
   * A tap on a card under the one in front, once all are dealt: shuffled to the front as Home's deck shuffles (Why: Cards):
   * it lifts out of the deck, goes to the front as the others close up behind it, and settles. Before all are dealt, the
   * page goes back to that card's own step instead (shuffled then, a card not yet dealt would be thrown off the screen).
   */
  const [front, setFront] = useState(n - 1)
  const [moving, setMoving] = useState<{ i: number; phase: 'lift' | 'land' } | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  const order = [...items.keys()].filter((i) => i !== front).concat(front)
  const dealt = () => Number(list.current?.style.getPropertyValue('--deck') || 0) >= n - 1 - 0.02
  const shuffle = (i: number) => {
    if (moving || i === front) return
    if (prefersReducedMotion()) return setFront(i)
    setMoving({ i, phase: 'lift' })
    timers.current.push(
      window.setTimeout(() => {
        setFront(i)
        setMoving({ i, phase: 'land' })
      }, 200),
      window.setTimeout(() => setMoving(null), 620),
    )
  }
  // (scrolled back up into the deal, the cards go back to their own order: the deal undone as it was done)
  useEffect(() => {
    const el = section.current
    if (!el) return
    const back = () => {
      if (front !== n - 1 && !dealt()) setFront(n - 1)
    }
    window.addEventListener('scroll', back, { passive: true })
    return () => window.removeEventListener('scroll', back)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front, n])

  const goToCard = (i: number) => {
    const el = section.current
    const deck = list.current
    if (!el || !deck) return
    if (dealt()) return shuffle(i)
    const now = Math.round(Number(deck.style.getPropertyValue('--deck') || 0))
    if (i >= now) return
    const pin = el.querySelector<HTMLElement>('.fdeck__in')
    const run = Math.max(1, el.offsetHeight - (pin?.offsetHeight ?? window.innerHeight))
    scrollToY(el.getBoundingClientRect().top + window.scrollY + (run * i) / Math.max(1, n - 1))
  }

  return (
    <section
      ref={(el) => {
        section.current = el
        if (sectionRef) (sectionRef as { current: HTMLElement | null }).current = el
      }}
      id={id}
      className={`fdeck on-${ground}`}
      data-ground={ground}
      data-flow=""
      style={{ '--n': n, '--run': DECK_RUN } as CSSProperties}
      aria-labelledby={`${id}-title`}
    >
      <div className="fdeck__in">
        <h2 id={`${id}-title`} className="fdeck__title">
          {title}
        </h2>
        <ol ref={list} className="vs vs--deck fdeck__list">
          {items.map((v, i) => (
            <li
              key={v.id}
              className={`vs__card fdeck__card ${i === front ? 'is-front' : 'is-tucked'} ${moving?.i === i ? `is-${moving.phase}` : ''}`}
              style={{ '--i': i, '--pos': order.indexOf(i) } as CSSProperties}
              aria-labelledby={`${id}-${v.id}`}
              onClick={() => goToCard(i)}
            >
              <div className="vs__top">
                <span className="vs__count num">
                  <b>0{i + 1}</b> / 0{n}
                </span>
                {v.icon}
              </div>
              <h3 id={`${id}-${v.id}`} className="vs__strength fdeck__name">
                {v.name}
              </h3>
              {v.full && <p className="fdeck__full">{v.full}</p>}
              <div className="fdeck__parts">
                {v.parts.map((p, k) => {
                  const on = open[i] === k
                  const body = `${id}-${v.id}-part${k}`
                  return (
                    <div key={p.label} className={`fdeck__part ${on ? 'is-open' : ''}`}>
                      <button
                        type="button"
                        className="fdeck__part-head"
                        aria-expanded={on}
                        aria-controls={body}
                        onClick={(e) => {
                          // (a sign opens or closes its part; it never moves the deck)
                          e.stopPropagation()
                          flip(i, k)
                        }}
                      >
                        <span className="fdeck__label">{p.label}</span>
                        <span className="fdeck__sign" aria-hidden="true">
                          <span className="fdeck__icon" />
                        </span>
                      </button>
                      <div id={body} className="fdeck__body" role="region" aria-label={p.label} inert={!on}>
                        <div className="fdeck__body-in">
                          <p>{p.text}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {v.foot && <p className="fdeck__foot">{v.foot}</p>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
