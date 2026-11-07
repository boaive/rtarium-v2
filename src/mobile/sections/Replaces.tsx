import type { CSSProperties } from 'react'
import { Eyebrow, Words } from '../ui'

/**
 * Why RTARIUM, and what the desktop's Innovation chapter argues, in one place: the three things
 * thin concrete has been reinforced with until now, each struck through as it comes into view
 * with its weakness under it, and RTARIUM on black with the three answers, numbered for the
 * compromises they answer. (The weaknesses are the client's own positioning, see sections/Why.tsx.)
 */
const ROWS = [
  { name: 'Steel fibre', weak: 'Corrodes.', what: 'Short steel fibres, mixed through the concrete.' },
  { name: 'AR-glass fibre', weak: 'Vulnerable to alkali.', what: 'Chopped glass strands, mixed through the concrete.' },
  { name: 'Flat 2D mesh', weak: 'Works in one plane.', what: 'A single grid that reinforces only along the sheet.' },
]

const ANSWERS = [
  { title: 'Non-corrosive.', text: 'Basalt does not corrode.' },
  { title: 'Alkali-resistant.', text: 'By its mineral nature, so it needs no chemical top-coating to wear off.' },
  { title: 'Three-dimensional.', text: 'Its fibres cross the weak plane a flat mesh leaves, and tie both sides together.' },
]

export function Replaces() {
  return (
    <>
      <section id="why" className="m-sec m-why on-light" data-m-ground="light" data-m-chapter="innovation" aria-labelledby="why-title">
        <div className="m-sec__head">
          <Eyebrow>Why RTARIUM</Eyebrow>
          <Words id="why-title" lines={['One mesh in', 'place of three', 'compromises.']} className="m-display" />
        </div>
        <ol className="m-ledger">
          {ROWS.map((r, i) => (
            <li key={r.name} className="m-ledger__row" data-reveal="" style={{ '--d': i } as CSSProperties}>
              <span className="m-ledger__n num">0{i + 1}</span>
              <span className="m-ledger__body">
                <s className="m-ledger__name">{r.name}</s>
                <span className="m-ledger__weak">{r.weak}</span>
                <span className="m-ledger__what">{r.what}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section className="m-sec m-answer on-black" data-m-ground="black" data-m-chapter="innovation" aria-labelledby="answer-title">
        <p className="m-answer__n num" data-reveal="">
          04
        </p>
        <h2 id="answer-title" className="m-answer__word" data-reveal="">
          RTARIUM
        </h2>
        <p className="m-answer__what" data-reveal="">
          3D basalt mesh that reinforces concrete through an interconnected structure woven into its depth.
        </p>
        <ul className="m-answer__list">
          {ANSWERS.map((a, i) => (
            <li key={a.title} data-reveal="" style={{ '--d': i } as CSSProperties}>
              <span className="m-answer__ref num" aria-hidden="true">
                0{i + 1}
              </span>
              <span className="m-answer__title">{a.title}</span>
              <span className="m-answer__text">{a.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
