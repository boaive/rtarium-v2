import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'

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

/**
 * Cards stacked as veedo.space stacks its six points on a phone (vee.build: Difference.astro, sections.css `.diff__cell`):
 * on its ground, white cards, each `position: sticky` a band lower than the one before, so as the page scrolls each card
 * stops under the header and the next comes up over it, every card passed still showing its number and name. Nothing in
 * code moves them: the browser scrolls and stacks them itself (CLAUDE.md rule 1). It was dealt by a scroll listener
 * setting each card's transform a frame at a time, eased after the page, and read as cards lagging the finger, the last
 * one riding the page out. A card: its number on a yellow chip and its drawing top right, its name and what it is, and
 * its parts, one open at a time, the first open to begin with (a minus), each a thin plus that turns into a minus as it
 * opens; a foot under a hairline. Its styles: minimal.css (`.fdeck`, and the deck's own `.vs`).
 */
export function DeckCards({ id, title, items, sectionRef, ground = 'yellow' }: { id: string; title: string; items: DeckItem[]; sectionRef?: RefObject<HTMLElement | null>; ground?: 'yellow' | 'black' | 'light' }) {
  const n = items.length
  /** which part of each card is open: the first, to begin with */
  const [open, setOpen] = useState<number[]>(() => items.map(() => 0))
  const flip = (i: number, k: number) => setOpen((o) => o.map((x, a) => (a === i ? (x === k ? -1 : k) : x)))
  const list = useRef<HTMLOListElement>(null)
  /** a small screen's height (100svh) in px, which the browser's bars never change */
  const svh = useRef<HTMLElement>(null)

  // each card only as tall as the deck's fullest needs (its fullest part open), not the one height every deck had: a deck
  // of short cards no longer carries an empty band under its words
  useEffect(() => {
    const deck = list.current
    if (!deck) return
    /** the height the fullest card needs, as its words are set now */
    const measure = () => {
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
      return need
    }
    const fit = () => {
      deck.style.removeProperty('--deck-scale')
      const need = measure()
      if (need <= 0) return
      const cardH = Math.ceil(need + 8)
      deck.style.setProperty('--card-h', `${cardH}px`)
      // and the whole deck on the one screen: where the cards passed, each showing its number and name, would carry the
      // one in front past the screen's foot, each shows a band a little shorter (its name's top half at the least)
      const first = deck.querySelector<HTMLElement>('.fdeck__card')
      const name = first?.querySelector<HTMLElement>('.fdeck__name')
      deck.style.removeProperty('--peek')
      deck.classList.remove('is-tight')
      if (!first || !name || n < 2) return
      // (the small screen's height, which the browser's bars never change: fitted to the window's, the deck was fitted
      // again as the bar slid away on the first scroll, and the cards jumped to a new size)
      const screenH = svh.current?.offsetHeight || window.innerHeight
      // (the stack whole on the screen under where the first card stops, its sticky top)
      const stop = parseFloat(getComputedStyle(first).top) || 0
      const room = () => screenH - stop - 14
      const band = () => name.offsetTop + name.offsetHeight + 8
      const spare = room() - cardH - (n - 1) * band()
      if (spare >= 0) {
        // (room to spare under it: the words set larger, up to a quarter, and the cards as tall as they then need, so a card
        // that grows is filled by its words, not by space; what is left, half of it over the deck, so the deck stands in
        // the screen rather than leave a band of empty ground under it. Too large, it is tried again a little smaller)
        const base = cardH + (n - 1) * band()
        let scale = Math.min(1.25, (base + spare) / base)
        for (let tries = 0; tries < 5; tries++) {
          deck.style.setProperty('--deck-scale', scale.toFixed(3))
          const h = Math.ceil(measure() + 8)
          const left = room() - h - (n - 1) * band()
          if (left >= 0 || tries === 4) {
            if (left < 0) deck.style.removeProperty('--deck-scale')
            deck.style.setProperty('--card-h', `${left < 0 ? cardH : h}px`)
            return
          }
          scale = 1 + (scale - 1) * 0.55
        }
        return
      }
      // (tight: each card's top drawn closer, its name a little smaller, so the band each shows still holds its name whole)
      deck.classList.add('is-tight')
      const tight = Math.ceil(need + 8 - 12)
      deck.style.setProperty('--card-h', `${tight}px`)
      const fits = (room() - tight) / (n - 1)
      const full = band()
      if (fits < full) deck.style.setProperty('--peek', `${Math.max(name.offsetTop + name.offsetHeight * 0.75, Math.floor(fits))}px`)
      else deck.style.setProperty('--peek', `${full}px`)
    }
    // fitted, then shown: until its words are in and it has its size, the deck is kept out of sight (it showed at a
    // first size and then jumped to its own). Fitted again only when the screen's width changes, never its height
    // (the browser's bars)
    let shown = false
    const show = () => {
      if (shown) return
      shown = true
      deck.classList.add('is-fit')
    }
    fit()
    const fonts = document.fonts?.ready ?? Promise.resolve()
    fonts.then(() => {
      fit()
      show()
    })
    const late = window.setTimeout(show, 1500)
    let width = window.innerWidth
    const onResize = () => {
      if (window.innerWidth === width) return
      width = window.innerWidth
      fit()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(late)
      window.removeEventListener('resize', onResize)
    }
  }, [items])

  return (
    <section
      ref={(el) => {
        if (sectionRef) (sectionRef as { current: HTMLElement | null }).current = el
      }}
      id={id}
      className={`fdeck on-${ground}`}
      data-ground={ground}
      data-flow=""
      style={{ '--n': n } as CSSProperties}
      aria-labelledby={`${id}-title`}
    >
      <div className="fdeck__in">
        <h2 id={`${id}-title`} className="fdeck__title">
          {title}
        </h2>
        <i ref={svh} className="fdeck__svh" aria-hidden="true" />
        <ol ref={list} className="vs vs--deck fdeck__list">
          {items.map((v, i) => (
            <li
              key={v.id}
              className={`vs__card fdeck__card ${i === n - 1 ? 'is-front' : 'is-under'}`}
              style={{ '--i': i } as CSSProperties}
              aria-labelledby={`${id}-${v.id}`}
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
