import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
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
        <Statement text="Thin concrete traditionally relies on steel fibre, glass fibre and flat mesh. Each has its own inherent weaknesses." />
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
/** the rows' way in, as shares of the screen's rise (as the flooring pages' table): the first starts at FROM, each takes SPAN */
const FROM = 0.3
const SPAN = 0.36

/**
 * On a phone the table is three cards, one for each strength of RTARIUM, each set against the compromise it
 * replaces (the client's columns line up: steel fibre corrodes, the mesh does not; AR-glass fibre is vulnerable to
 * alkali, the mesh is alkali-resistant; a flat mesh works in one plane, the mesh in three). Under the strength, the
 * reinforcement it replaces, struck through, its weakness and what it is. RTARIUM is set above them; the cards stack
 * as the page scrolls (mobile.css).
 */
function Cards({ list }: { list: RefObject<HTMLOListElement | null> }) {
  return (
    <>
      <p className="vs__word">RTARIUM</p>
      <ol ref={list} className="vs">
        {ROWS.map((r, i) => (
          <li key={r.name} className="vs__card" style={{ '--i': i } as CSSProperties}>
            <div className="vs__top">
              <span className="vs__count num">
                <b>0{i + 1}</b> / 0{ROWS.length}
              </span>
              <img className="vs__mark" src="/brand/rtarium-emblem.png" alt="" width={256} height={256} loading="lazy" decoding="async" />
            </div>
            <p className="vs__strength">{STRENGTHS[i]}</p>
            <dl className="vs__other">
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
        ))}
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
  useScreen(section, 'replaces', 'light')
  const rows = useRef<HTMLTableSectionElement>(null)
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -20% 0px')
  // on a phone the section runs past one screen: it is read at its own pace, never brought to a screen inside it (lib/scroll.ts)
  const compact = useIsCompact()
  const cards = useRef<HTMLOListElement>(null)
  useMarkIn(cards, '.vs__card', compact)
  // the band plays when it is itself on screen, not when the table above it is
  const [band, bandIn] = useInView<HTMLDivElement>('0px 0px -8% 0px')

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
    <section id="replaces" ref={section} className="ledger on-light" data-screen="light" data-flow={compact ? '' : undefined} aria-labelledby="replaces-title">
      <div ref={ref} className={`ledger__in ${inView ? 'is-in' : ''}`}>
        <h2 id="replaces-title" className="ledger__title">
          One mesh in place of three compromises.
        </h2>
        {compact ? (
          <Cards list={cards} />
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
