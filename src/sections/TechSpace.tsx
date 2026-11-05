import { useRef, type CSSProperties, type RefObject } from 'react'
import { Chapter, Lines, type Step } from '../components/Chapter'
import { ReviewNote } from '../components/Media'
import { StageLabel } from '../three/Stage'
import { CONCRETE_FIGURES, DATA_SHEET, MESH_SPECS, SFRC_SWAP, YARN } from '../content/technical'

/** the summary: one figure for each of the three elements; the rest is in the data sheet */
const SUMMARY = [
  { label: 'Mesh thickness options', value: '3 / 6 / 10 / 15', unit: 'mm' },
  { label: 'Yarn tensile strength', value: YARN[0].figure, unit: YARN[0].unit },
  { label: 'Flexural strength in UHPC', value: SFRC_SWAP[1].change, unit: '' },
]

/** Every figure, on one warm-white sheet, for the visitor who wants the table. */
function FiguresSheet({ dialog }: { dialog: RefObject<HTMLDialogElement | null> }) {
  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="sheet-title" data-lenis-prevent onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}>
      <div className="sheet__inner">
        <header className="sheet__head">
          <h2 id="sheet-title">All details</h2>
          <div className="sheet__tools">
            <a className="pill pill--line" href={DATA_SHEET} download>
              Download the data sheet
            </a>
            <button type="button" className="pill pill--line" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
        </header>
        <div className="sheet__grid">
          {MESH_SPECS.map((g) => (
            <table key={g.label} className="table">
              <caption>Mesh · {g.label}</caption>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td>
                      <span className="num">{r.value}</span> {r.unit}
                      {r.note && <span className="table__note">{r.note}</span>}
                      {r.review && <ReviewNote>{r.review}</ReviewNote>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <table className="table">
            <caption>Impregnated yarn</caption>
            <tbody>
              {YARN.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.title}</th>
                  <td>
                    <span className="num">{c.figure}</span> {c.unit}
                    <span className="table__note">{c.reading}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="table">
            <caption>Concrete reinforced with RTARIUM</caption>
            <tbody>
              {CONCRETE_FIGURES.map((f) => (
                <tr key={f.id}>
                  <th scope="row">{f.label}</th>
                  <td>
                    <span className="num">{f.value}</span> {f.unit}
                    <span className="table__note">{f.context}</span>
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
        </div>
        <p className="sheet__fine">
          Figures describe the tested materials and configuration. Performance in a particular element depends on its mix,
          thickness and detailing.
        </p>
      </div>
    </dialog>
  )
}

/**
 * Tech Space, one screen on black: the system pulled apart in 3D on a diagonal of words, a brief summary
 * (one figure for each element), and the way to the rest: the data sheet to download, or every figure on
 * a sheet over the page.
 */
export function TechSpace() {
  const dialog = useRef<HTMLDialogElement>(null)

  const steps: Step[] = [
    {
      id: 'system',
      label: 'System',
      ground: 'black',
      pose: 'stack',
      // a diagonal: the first half of the line top left, the second bottom right, the system between
      render: (active) => (
        <div className="system">
          <Lines slab className="system__a" lines={['Three elements.']} />
          <Lines slab className="system__b" lines={['One system.']} start={2} />
          <div className="system__more">
            <p className="lead rv" style={{ '--i': 3 } as CSSProperties}>
              The mesh, the basalt yarn it is woven from, and the concrete it reinforces.
            </p>
            <dl className="system__figs rv" style={{ '--i': 4 } as CSSProperties}>
              {SUMMARY.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd className="num">
                    {f.value}
                    {f.unit && <small>{f.unit}</small>}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="system__cta rv" style={{ '--i': 5 } as CSSProperties}>
              <a className="explore explore--yellow" href={DATA_SHEET} download tabIndex={active ? 0 : -1}>
                <span className="explore__label">Download the data sheet</span>
                <span className="explore__cell" aria-hidden="true">
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <path d="M10 3v12M5 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </span>
              </a>
              <button type="button" className="system__all" tabIndex={active ? 0 : -1} onClick={() => dialog.current?.showModal()}>
                View all details
              </button>
            </div>
          </div>
        </div>
      ),
    },
  ]

  return (
    <>
      <Chapter id="tech" title="Tech Space" steps={steps} className="chapter--tech" />
      <FiguresSheet dialog={dialog} />
      <StageLabel anchor="slab-top">Concrete</StageLabel>
      <StageLabel anchor="slab-mesh">RTARIUM mesh</StageLabel>
      <StageLabel anchor="slab-yarn" side="left">
        Basalt yarn
      </StageLabel>
      <StageLabel anchor="slab-bottom">Concrete</StageLabel>
    </>
  )
}
