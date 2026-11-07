import type { CSSProperties } from 'react'
import { ReviewNote } from '../../components/Media'
import { CONCRETE_FIGURES, CONCRETE_REVIEW, MESH_SPECS, SFRC_SWAP, YARN } from '../../content/technical'
import { scrollToY } from '../../lib/scroll'
import { CountUp, Eyebrow, Slabs } from '../ui'

/**
 * Tech Space on a phone: the three elements in reading order, each with its one big figure first
 * and the rest set to be scanned, then every figure in one table for whoever wants it. The desktop
 * points at figures on the 3D model; here the bars do the comparing.
 */

const SPECS = MESH_SPECS.flatMap((g) => g.rows)
const spec = (label: string) => SPECS.find((r) => r.label === label)!

/** the six figures the desktop's Mesh step sets out, from the same table */
const SHEET = [
  { label: 'Thickness options', row: spec('Thickness options'), wide: true },
  { label: 'Sheet lengths', row: spec('Sheet length'), wide: true },
  { label: 'Sheet width', row: spec('Sheet width') },
  { label: 'Tensile strength', row: spec('Tensile strength') },
  { label: 'Elastic modulus', row: spec('Elastic modulus') },
  { label: 'Elongation at break', row: spec('Elongation at break') },
]

const SHORT: Record<string, string> = { 'High-strength aircraft aluminium': 'Aircraft aluminium' }

function jump(id: string) {
  const el = document.getElementById(id)
  if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY - 72)
}

function Sheet() {
  return (
    <article id="tech-mesh" className="m-tech__block" aria-labelledby="tech-mesh-title">
      <Slabs as="h3" id="tech-mesh-title" lines={['The sheet.']} />
      <dl className="m-readouts">
        {SHEET.map((s, i) => (
          <div key={s.label} className={`m-readout ${s.wide ? 'is-wide' : ''}`} data-reveal="" style={{ '--d': i % 2 } as CSSProperties}>
            <dt>{s.label}</dt>
            <dd>
              <span className="num">{s.row.value}</span>
              {s.row.unit && <span className="m-readout__unit">{s.row.unit}</span>}
              {s.row.review && <ReviewNote>{s.row.review}</ReviewNote>}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

function Yarn() {
  const [tensile, modulus, elongation] = YARN
  const max = Math.max(...tensile.bars.map((b) => b.value))
  return (
    <article id="tech-yarn" className="m-tech__block" aria-labelledby="tech-yarn-title">
      <Slabs as="h3" id="tech-yarn-title" lines={['The yarn.']} />
      <p className="m-figure" data-reveal="">
        <CountUp value={tensile.figure} duration={1700} />
        <span className="m-figure__unit">{tensile.unit}</span>
      </p>
      <p className="m-figure__label" data-reveal="">
        Tensile strength of the basalt yarn
      </p>
      <figure className="m-bars" data-reveal="" aria-label={`Tensile strength, MPa: ${tensile.bars.map((b) => `${b.label} ${b.value.toLocaleString('en-GB')}`).join(', ')}`}>
        <ol aria-hidden="true">
          {tensile.bars.map((b, i) => (
            <li key={b.label} className={b.rtarium ? 'is-rt' : ''} style={{ '--v': b.value / max, '--d': i } as CSSProperties}>
              <span className="m-bars__name">{SHORT[b.label] ?? b.label}</span>
              <span className="m-bars__num num">{b.value.toLocaleString('en-GB')}</span>
              <span className="m-bars__track">
                <i />
              </span>
            </li>
          ))}
        </ol>
        <figcaption className="m-caption">Tensile strength, MPa</figcaption>
      </figure>
      <dl className="m-pair-figs" data-reveal="">
        {[modulus, elongation].map((c) => (
          <div key={c.id}>
            <dt>{c.title}</dt>
            <dd className="num">
              {c.figure} <span className="m-readout__unit">{c.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

function Concrete() {
  const [tensile, flexural] = SFRC_SWAP
  const top = Math.max(...SFRC_SWAP.map((r) => Number(r.rtarium)))
  return (
    <article id="tech-concrete" className="m-tech__block" aria-labelledby="tech-concrete-title">
      <Slabs as="h3" id="tech-concrete-title" lines={['The concrete.']} />
      <p className="m-figure" data-reveal="">
        <CountUp value={flexural.change.replace(/\s*%$/, '')} duration={1700} />
        <span className="m-figure__unit">%</span>
      </p>
      <p className="m-figure__label" data-reveal="">
        Flexural strength when RTARIUM replaces the steel fibres in ultra-high-performance concrete.
      </p>
      <div className="m-compare">
        {[flexural, tensile].map((r, i) => (
          <div key={r.metric} className="m-compare__group" data-reveal="" style={{ '--d': i } as CSSProperties}>
            <p className="m-compare__metric">
              {r.metric} <span className="m-compare__change num">{r.change}</span>
            </p>
            <p className="m-compare__row">
              <span className="m-compare__name">Steel fibre</span>
              <span className="m-compare__track">
                <i style={{ '--v': Number(r.sfrc) / top } as CSSProperties} />
              </span>
              <span className="num">
                {r.sfrc} {r.unit}
              </span>
            </p>
            <p className="m-compare__row is-rt">
              <span className="m-compare__name">RTARIUM</span>
              <span className="m-compare__track">
                <i style={{ '--v': Number(r.rtarium) / top } as CSSProperties} />
              </span>
              <span className="num">
                {r.rtarium} {r.unit}
              </span>
            </p>
          </div>
        ))}
      </div>
      <dl className="m-facts">
        {CONCRETE_FIGURES.map((f, i) => (
          <div key={f.id} data-reveal="" style={{ '--d': i } as CSSProperties}>
            <dd className="num">
              {f.value} <span className="m-readout__unit">{f.unit}</span>
            </dd>
            <dt>{f.label}</dt>
          </div>
        ))}
      </dl>
      <p className="m-caption m-tech__note">
        Figures describe the tested materials and configuration.
        <ReviewNote>{CONCRETE_REVIEW}</ReviewNote>
      </p>
    </article>
  )
}

/** Every figure in one place: closed by default, so the story stays short for everyone else. */
function AllFigures() {
  return (
    <details className="m-all">
      <summary>
        <span>All figures</span>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </summary>
      <div className="m-all__body">
        {MESH_SPECS.map((g) => (
          <table key={g.label} className="m-table">
            <caption>Mesh · {g.label}</caption>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td>
                    <span className="num">{r.value}</span> {r.unit}
                    {r.note && <span className="m-table__note">{r.note}</span>}
                    {r.review && <ReviewNote>{r.review}</ReviewNote>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        <table className="m-table">
          <caption>Impregnated yarn</caption>
          <tbody>
            {YARN.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.title}</th>
                <td>
                  <span className="num">{c.figure}</span> {c.unit}
                  <span className="m-table__note">{c.reading}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="m-table">
          <caption>Concrete reinforced with RTARIUM</caption>
          <tbody>
            {CONCRETE_FIGURES.map((f) => (
              <tr key={f.id}>
                <th scope="row">{f.label}</th>
                <td>
                  <span className="num">{f.value}</span> {f.unit}
                  <span className="m-table__note">{f.context}</span>
                </td>
              </tr>
            ))}
            {SFRC_SWAP.map((r) => (
              <tr key={r.metric}>
                <th scope="row">{r.metric}, steel fibre → RTARIUM in UHPC</th>
                <td>
                  <span className="num">
                    {r.sfrc} → {r.rtarium}
                  </span>{' '}
                  {r.unit} ({r.change})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-caption">Figures describe the tested materials and configuration. Performance in a particular element depends on its mix, thickness and detailing.</p>
      </div>
    </details>
  )
}

export function Tech() {
  return (
    <section id="tech" className="m-sec m-tech on-black" data-m-ground="black" data-m-chapter="tech" aria-labelledby="tech-title">
      <div className="m-sec__head">
        <Eyebrow>Tech Space</Eyebrow>
        <Slabs id="tech-title" lines={['Three elements.', 'One system.']} />
        <p className="m-lead" data-reveal="">
          The mesh, the basalt yarn it is woven from, and the concrete it reinforces.
        </p>
        <nav className="m-jump" aria-label="Tech Space" data-reveal="">
          {[
            ['tech-mesh', 'Mesh'],
            ['tech-yarn', 'Yarn'],
            ['tech-concrete', 'Concrete'],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault()
                jump(id)
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      <Sheet />
      <Yarn />
      <Concrete />
      <AllFigures />
    </section>
  )
}
