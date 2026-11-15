import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Chapter, Statement, useScreen, type Step } from '../components/Chapter'
import { useInView } from '../facade/Story'
import { prefersReducedMotion, useIsCompact } from '../lib/motion'
import { useMarkIn } from '../lib/reveal'

/**
 * Why RTARIUM: what thin concrete has been reinforced with until now, and what RTARIUM replaces, in one
 * look. The weaknesses are the client's own positioning (site-map workbook: steel and AR-glass fibre are
 * "prone to alkali, corrosion, and directional weakness"; flat meshes reinforce only parallel to the
 * sheet, technical PDF).
 */
const steps: Step[] = [
  {
    id: 'challenge',
    label: 'The challenge',
    ground: 'black',
    pose: 'none',
    // the whole screen is the sentence; its words arrive one by one
    render: () => (
      <div className="copy copy--full">
        <Statement text="Thin concrete traditionally relies on steel fibre, glass fibre and flat mesh. Each has its own inherent limitations." />
      </div>
    ),
  },
]

const ROWS = [
  { name: 'Steel fibre', what: 'Short steel fibres, mixed through the concrete.', weak: 'Corrodes.' },
  { name: 'AR-glass fibre', what: 'Chopped glass strands, mixed through the concrete.', weak: 'Vulnerable to alkali.' },
  { name: 'Flat 2D mesh', what: 'A single grid that reinforces only along the sheet.', weak: 'Works in one plane.' },
]
const STRENGTHS = ['Non-corrosive.', 'Alkali-resistant.', 'Three-dimensional.']
/**
 * a phone's cards: each strength drawn from the mesh itself, in hairlines with a touch of yellow. Non-corrosive: a roving
 * of two twisted filaments, a drop running off it. Alkali-resistant: the roving straight through a ring of chemistry, untouched.
 * Three-dimensional: one cell of the mesh, its two faces and the fibres standing between them.
 */
const GLYPHS = [
  <svg key="nc" viewBox="0 0 40 40">
    <path d="M5.0 34.0 L6.2 34.1 L7.4 34.1 L8.5 34.0 L9.5 33.8 L10.3 33.3 L11.0 32.7 L11.5 31.8 L11.9 30.8 L12.2 29.7 L12.5 28.5 L12.8 27.3 L13.1 26.2 L13.5 25.2 L14.0 24.3 L14.7 23.7 L15.5 23.2 L16.5 23.0 L17.6 22.9 L18.8 22.9 L20.0 23.0 L21.2 23.1 L22.4 23.1 L23.5 23.0 L24.5 22.8 L25.3 22.3 L26.0 21.7 L26.5 20.8 L26.9 19.8 L27.2 18.7 L27.5 17.5 L27.8 16.3 L28.1 15.2 L28.5 14.2 L29.0 13.3 L29.7 12.7 L30.5 12.2 L31.5 12.0 L32.6 11.9 L33.8 11.9 L35.0 12.0" />
    <path d="M5.0 34.0 L5.3 32.8 L5.6 31.7 L6.0 30.7 L6.5 29.8 L7.2 29.2 L8.0 28.7 L9.0 28.5 L10.1 28.4 L11.3 28.4 L12.5 28.5 L13.7 28.6 L14.9 28.6 L16.0 28.5 L17.0 28.3 L17.8 27.8 L18.5 27.2 L19.0 26.3 L19.4 25.3 L19.7 24.2 L20.0 23.0 L20.3 21.8 L20.6 20.7 L21.0 19.7 L21.5 18.8 L22.2 18.2 L23.0 17.7 L24.0 17.5 L25.1 17.4 L26.3 17.4 L27.5 17.5 L28.7 17.6 L29.9 17.6 L31.0 17.5 L32.0 17.3 L32.8 16.8 L33.5 16.2 L34.0 15.3 L34.4 14.3 L34.7 13.2 L35.0 12.0" />
    <path className="vs__glyph-fill" d="M11 4.5c2.4 3.1 3.6 5.3 3.6 6.9a3.6 3.6 0 0 1-7.2 0c0-1.6 1.2-3.8 3.6-6.9Z" />
  </svg>,
  <svg key="ar" viewBox="0 0 40 40">
    <path d="M20 7.5 30.8 13.75v12.5L20 32.5 9.2 26.25v-12.5Z" />
    <circle className="vs__glyph-fill" cx="20" cy="20" r="3.4" />
    <path d="M3 20h13.6M23.4 20H37" />
  </svg>,
  <svg key="3d" viewBox="0 0 40 40">
    <path d="M6 26 20 33 34 26" />
    <path d="M6 12 9.5 27.75 13 15.5 16.5 31.25 20 19 23.5 31.25 27 15.5 30.5 27.75 34 12" />
    <path className="vs__glyph-fill" d="M20 5 34 12 20 19 6 12Z" />
    <path d="M13 8.5 27 15.5M27 8.5 13 15.5" />
  </svg>,
]
/** a phone's swipe stops through the deck the first time (Hero's useSwipePager), shares of its run: a card a swipe */
const DECK_STOPS = '0,0.5,1'
/** the rows' way in, as shares of the screen's rise (as the flooring pages' table): the first starts at FROM, each takes SPAN */
const FROM = 0.3
const SPAN = 0.36

/**
 * On a phone the table is three cards, one for each strength of RTARIUM, each set against the compromise it
 * replaces (the client's columns line up: steel fibre corrodes, the mesh does not; AR-glass fibre is vulnerable to
 * alkali, the mesh is alkali-resistant; a flat mesh works in one plane, the mesh in three). Under the strength, the
 * reinforcement it replaces, struck through, its weakness and what it is. RTARIUM is set above them; the first time,
 * the scroll stacks the cards a swipe each, and stacked they stay, a tap shuffling one to the front (Cards).
 */
/** a shuffle: how long the card takes to lift out of the deck before it goes to the front, and to settle there (ms) */
const SHUFFLE = { lift: 200, land: 420 }

function Cards({ list, dealt }: { list: RefObject<HTMLOListElement | null>; dealt: boolean }) {
  /*
   * A deck, all three on one screen: the ones behind tucked up under the one in front, their numbers and their
   * strengths still showing. It is dealt once, the first time it comes into view (`dealt`: each card rises onto the
   * one before), and then holds still, the page scrolling past it as past any other. A tap on one tucked behind
   * shuffles it to the front: it lifts up out of the deck, goes to the front as the others close up behind it, and
   * settles. The cards keep their place in the page (only their slot, `--pos`, changes), so they glide to their new
   * slots rather than jump. The front card is read in full.
   */
  const [front, setFront] = useState(ROWS.length - 1)
  const [moving, setMoving] = useState<{ i: number; phase: 'lift' | 'land' } | null>(null)
  const order = [...ROWS.keys()].filter((i) => i !== front).concat(front)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  const shuffle = (i: number) => {
    if (moving) return
    if (prefersReducedMotion()) return setFront(i)
    setMoving({ i, phase: 'lift' })
    timers.current.push(
      window.setTimeout(() => {
        setFront(i)
        setMoving({ i, phase: 'land' })
      }, SHUFFLE.lift),
      window.setTimeout(() => setMoving(null), SHUFFLE.lift + SHUFFLE.land),
    )
  }
  return (
    <>
      <p className="vs__word">RTARIUM</p>
      <ol ref={list} className={`vs vs--deck ${dealt ? 'is-dealt' : ''}`} style={dealt ? ({ '--deck': ROWS.length - 1 } as CSSProperties) : undefined}>
        {[...ROWS.keys()].map((i) => {
          const pos = order.indexOf(i)
          const r = ROWS[i]
          const isFront = i === front
          return (
            <li
              key={r.name}
              className={`vs__card ${isFront ? 'is-front' : 'is-tucked'} ${moving?.i === i ? `is-${moving.phase}` : ''}`}
              style={{ '--i': i, '--pos': pos } as CSSProperties}
              onClick={isFront ? undefined : () => shuffle(i)}
              onKeyDown={isFront ? undefined : (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), shuffle(i))}
              role={isFront ? undefined : 'button'}
              tabIndex={isFront ? undefined : 0}
              aria-label={isFront ? undefined : `${STRENGTHS[i]} Show this card`}
            >
              <div className="vs__top">
                <span className="vs__count num">
                  <b>0{i + 1}</b> / 0{ROWS.length}
                </span>
                <span className="vs__glyph" aria-hidden="true">
                  {GLYPHS[i]}
                </span>
              </div>
              <p className="vs__strength">{STRENGTHS[i]}</p>
              <dl className="vs__other" aria-hidden={!isFront}>
                <div className="vs__pair vs__pair--name">
                  <dt>Reinforcement</dt>
                  <dd className="vs__name">{r.name}</dd>
                </div>
                <div className="vs__pair vs__pair--weak">
                  <dt className="vs__hidden">Its weakness</dt>
                  <dd className="vs__weak">{r.weak}</dd>
                </div>
                <div className="vs__pair vs__pair--what">
                  <dt className="vs__hidden">What it is</dt>
                  <dd className="vs__what">{r.what}</dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ol>
    </>
  )
}

/**
 * The three compromises and the mesh in their place, on one warm-white screen: a table to take in at a
 * glance, nothing to scroll open. It comes in as the flooring pages' table does: as the screen rises, row after
 * row, its line draws across, its number drops out from under the line and its words rise, straight with the
 * scroll. RTARIUM closes it on black: the band opens up from its foot, the name rises out of it, and the three
 * strengths follow, each line drawn under the column it answers.
 */
function Replaces() {
  const section = useRef<HTMLElement>(null)
  // on a phone the section runs past one screen: it is read at its own pace, never brought to a screen inside it (lib/scroll.ts)
  const compact = useIsCompact()
  // (a phone sets the deck on yellow, its cards white on it)
  const ground = compact ? 'yellow' : 'light'
  useScreen(section, 'replaces', ground)
  const rows = useRef<HTMLTableSectionElement>(null)
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -20% 0px')
  const cards = useRef<HTMLOListElement>(null)
  useMarkIn(cards, '.vs__card', compact)
  // the band plays when it is itself on screen, not when the table above it is
  const [band, bandIn] = useInView<HTMLDivElement>('0px 0px -8% 0px')

  /*
   * A phone, the first time: the section holds still (pinned) while the scroll stacks the deck, a card a swipe (Hero's
   * swipe stops, `data-swipe-stops`), `--deck` 0 to 2 across its run. Once all three are stacked it stays so (`dealt`):
   * the section becomes one screen scrolled past as any other, and a tap shuffles a card to the front. The run it had is
   * taken off the page as it closes up, in the same frame, so nothing on the screen moves.
   */
  const [dealt, setDealt] = useState(false)
  /** the run the section had as it closed up, and where its top stood then (null once taken off the page) */
  const closing = useRef<{ run: number; top: number } | null>(null)
  useEffect(() => {
    const el = section.current
    const deck = cards.current
    if (!compact || dealt || !el || !deck) return
    if (prefersReducedMotion()) return setDealt(true)
    let raf = 0
    const measure = () => {
      const r = el.getBoundingClientRect()
      // (the run is what the pinned panel stands still through: the section less the panel, as tall as the screen gets)
      const pin = el.querySelector<HTMLElement>('[data-swipe-pin]')
      const run = Math.max(1, r.height - (pin?.offsetHeight ?? window.innerHeight))
      return { r, run, p: Math.min(1, Math.max(0, -r.top / run)) }
    }
    const read = () => {
      raf = 0
      const { p } = measure()
      deck.style.setProperty('--deck', (p * (ROWS.length - 1)).toFixed(4))
      // (the deck stays with the scroll both ways, never closed up: closing up to one screen moved the page under the
      // finger, a twitch, and left the way back up through it unlike the way down; a card a swipe either way)
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
  }, [compact, dealt])
  // closed up to one screen: the page taken back by the run it lost above the screen, before it is painted
  useLayoutEffect(() => {
    const c = closing.current
    if (!dealt || !c) return
    closing.current = null
    if (c.top < 0) window.scrollTo({ top: window.scrollY - c.run, behavior: 'instant' as ScrollBehavior })
  }, [dealt])

  // the rows with the scroll, no easing of their own: the page's glide (Lenis) is what makes it smooth
  useEffect(() => {
    const el = section.current
    const items = rows.current ? ([...rows.current.children] as HTMLElement[]) : []
    if (!el) return
    const still = prefersReducedMotion()
    const step = (1 - FROM - SPAN) / Math.max(1, items.length - 1)
    let raf = 0
    const read = () => {
      raf = 0
      const rise = (window.innerHeight - el.getBoundingClientRect().top) / window.innerHeight
      // each row's share of the table's height: its number is set to it, as large as the row allows
      const table = rows.current?.parentElement as HTMLTableElement | null
      if (table && items.length) table.style.setProperty('--rh', `${((table.clientHeight - (table.tHead?.offsetHeight ?? 0)) / items.length).toFixed(1)}px`)
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
    <section
      id="replaces"
      ref={section}
      className={`ledger on-${ground} ${compact && dealt ? 'is-dealt' : ''}`}
      data-screen={ground}
      data-flow={compact ? '' : undefined}
      data-swipe-stops={compact ? DECK_STOPS : undefined}
      aria-labelledby="replaces-title"
    >
      <div ref={ref} className={`ledger__in ${inView ? 'is-in' : ''}`} data-swipe-pin="">
        <h2 id="replaces-title" className="ledger__title">
          One mesh in place of three compromises.
        </h2>
        {compact ? (
          <Cards list={cards} dealt={dealt} />
        ) : (
          <>
            <table className="ledger__table">
              <thead>
                <tr>
                  <td aria-hidden="true" />
                  <th scope="col">Reinforcement</th>
                  <th scope="col">What it is</th>
                  <th scope="col">Its weakness</th>
                </tr>
              </thead>
              <tbody ref={rows}>
                {ROWS.map((r, i) => (
                  <tr key={r.name} style={{ '--i': i } as CSSProperties}>
                    <td className="ledger__n" aria-hidden="true">
                      <span className="ledger__num">
                        <span className="num">0{i + 1}</span>
                      </span>
                    </td>
                    <th scope="row">{r.name}</th>
                    <td>{r.what}</td>
                    <td className="ledger__weak">{r.weak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div ref={band} className={`ledger__answer on-black ${bandIn ? 'is-in' : ''}`}>
              <p className="ledger__word">
                <span>RTARIUM</span>
              </p>
              <ul className="ledger__strengths">
                {STRENGTHS.map((a, j) => (
                  <li key={a} style={{ '--j': j } as CSSProperties}>
                    <span className="num" aria-hidden="true">
                      0{j + 1}
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export function Why() {
  return (
    <>
      <Chapter id="why" title="Why RTARIUM" steps={steps} />
      <Replaces />
    </>
  )
}
