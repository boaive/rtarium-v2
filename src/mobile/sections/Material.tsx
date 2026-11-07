import type { CSSProperties } from 'react'
import { Eyebrow, Words } from '../ui'

const MAKING = ['Basalt rock', 'Melted', 'Drawn into filaments', 'Woven into the mesh']

/** Where the mesh comes from: volcanic rock, in four stations, and the real thing close up. */
export function Material() {
  return (
    <section id="material" className="m-sec m-material on-yellow" data-m-ground="yellow" data-m-chapter="about" aria-labelledby="material-title">
      <div className="m-sec__head">
        <Eyebrow>Material</Eyebrow>
        <Words id="material-title" lines={['Woven from', 'volcanic rock.']} className="m-display" />
      </div>
      <p className="m-lead" data-reveal="">
        Made from natural basalt, transformed into continuous filaments and woven into a reinforcing mesh.
      </p>
      <ol className="m-chain" aria-label="How the mesh is made" data-reveal="">
        {MAKING.map((m, i) => (
          <li key={m} style={{ '--d': i } as CSSProperties}>
            <span className="m-chain__n num">0{i + 1}</span>
            {m}
          </li>
        ))}
      </ol>
      <figure className="m-material__photo" data-reveal="">
        <img src="/img/shoot/mesh-macro.webp" alt="RTARIUM basalt mesh close up: the woven faces and the fibres between them" width={1280} height={720} loading="lazy" decoding="async" />
      </figure>
    </section>
  )
}
