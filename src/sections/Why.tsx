import type { CSSProperties } from 'react'
import { Chapter, Lines, Statement, type Step } from '../components/Chapter'

/**
 * Why RTARIUM: what thin concrete has been reinforced with until now, and what RTARIUM replaces.
 * The weaknesses are the client's own positioning (site-map workbook: steel and AR-glass fibre
 * are "prone to alkali, corrosion, and directional weakness"; flat meshes reinforce only parallel
 * to the sheet, technical PDF).
 */
const REPLACED = [
  { name: 'Steel fibre', weakness: 'Corrodes.' },
  { name: 'AR-glass fibre', weakness: 'Vulnerable to alkali.' },
  { name: 'Flat 2D mesh', weakness: 'Works in one plane.' },
]

const steps: Step[] = [
  {
    id: 'challenge',
    label: 'The challenge',
    ground: 'black',
    pose: 'none',
    // the whole screen is the sentence; its words arrive one by one
    render: () => (
      <div className="copy copy--full">
        <Statement text="Thin concrete has relied on steel fibre, glass fibre and flat mesh. Each brings a weakness with it." />
      </div>
    ),
  },
  {
    id: 'replaces',
    label: 'What it replaces',
    ground: 'yellow',
    pose: 'none',
    render: () => (
      <div className="replace">
        <Lines className="replace__head" lines={['One mesh in place', 'of three compromises.']} />
        <ul className="replace__list">
          {REPLACED.map((r, i) => (
            <li key={r.name} className="replace__item" style={{ '--i': i } as CSSProperties}>
              <span className="replace__name">
                {r.name}
                <span className="replace__strike" aria-hidden="true" />
              </span>
              <span className="replace__weak">{r.weakness}</span>
            </li>
          ))}
        </ul>
        <p className="replace__answer">
          <span className="replace__answer-name">RTARIUM</span>
          <span>Basalt. Non-corrosive, alkali-resistant, three-dimensional.</span>
        </p>
      </div>
    ),
  },
]

export function Why() {
  return <Chapter id="why" title="Why RTARIUM" steps={steps} />
}
