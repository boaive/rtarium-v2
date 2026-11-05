import { useRef, type CSSProperties } from 'react'
import { Chapter, Statement, useScreen, type Step } from '../components/Chapter'
import { useInView } from '../facade/Story'

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

/**
 * The three compromises and the mesh in their place, on one warm-white screen: a table to take in at a
 * glance, nothing to scroll open. RTARIUM closes it on black, its three strengths under the columns they
 * answer.
 */
function Replaces() {
  const section = useRef<HTMLElement>(null)
  useScreen(section, 'replaces', 'light')
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -20% 0px')

  return (
    <section id="replaces" ref={section} className="ledger on-light" data-screen="light" aria-labelledby="replaces-title">
      <div ref={ref} className={`ledger__in ${inView ? 'is-in' : ''}`}>
        <h2 id="replaces-title" className="ledger__title">
          One mesh in place of three compromises.
        </h2>
        <table className="ledger__table">
          <thead>
            <tr>
              <th scope="col">Reinforcement</th>
              <th scope="col">What it is</th>
              <th scope="col">Its weakness</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={r.name} style={{ '--i': i } as CSSProperties}>
                <th scope="row">
                  <span className="num">0{i + 1}</span>
                  {r.name}
                </th>
                <td>{r.what}</td>
                <td className="ledger__weak">{r.weak}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ledger__answer on-black">
          <p className="ledger__word">RTARIUM</p>
          <ul className="ledger__strengths">
            {STRENGTHS.map((a, j) => (
              <li key={a}>
                <span className="num" aria-hidden="true">
                  0{j + 1}
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
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
