import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { Chapter, CountUp, Lines, goToStep, type Step } from '../components/Chapter'
import { ReviewNote } from '../components/Media'
import { StageLabel } from '../three/Stage'
import { setShared, stage, useStageValue, type Inspect } from '../three/stageStore'
import { CONCRETE_FIGURES, CONCRETE_REVIEW, MESH_SPECS, SFRC_SWAP, THICKNESS_OPTIONS, YARN, type Thickness } from '../content/technical'
import { prefersReducedMotion, useCoarsePointer } from '../lib/motion'

/** While the Mesh step is on screen the model steps through the four thickness options, in time, until a figure is inspected. */
function useThicknessCycle(active: boolean, paused: boolean) {
  useEffect(() => {
    if (!active) {
      setShared({ thickness: 10 })
      return
    }
    if (paused || prefersReducedMotion()) return
    let i = THICKNESS_OPTIONS.indexOf(10)
    const id = window.setInterval(() => {
      i = (i + 1) % THICKNESS_OPTIONS.length
      setShared({ thickness: THICKNESS_OPTIONS[i] })
    }, 2600)
    return () => window.clearInterval(id)
  }, [active, paused])
}

/**
 * Which figure the mesh is showing. Pointing at a figure or focusing it shows it while it is under
 * the cursor; a click or tap keeps it shown (for touch) until it is pressed again.
 */
function useInspect(active: boolean) {
  const [hover, setHover] = useState<Inspect | null>(null)
  const [kept, setKept] = useState<Inspect | null>(null)
  const current = active ? (hover ?? kept) : null
  useEffect(() => {
    stage.inspect = current
  }, [current])
  useEffect(() => {
    if (!active) {
      setHover(null)
      setKept(null)
    }
  }, [active])
  useEffect(() => () => void (stage.inspect = null), [])
  const bind = (key: Inspect) => ({
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => void (e.pointerType === 'mouse' && setHover(key)),
    onPointerLeave: () => setHover(null),
    onFocus: () => setHover(key),
    onBlur: () => setHover(null),
    onClick: () => setKept((k) => (k === key ? null : key)),
    'aria-pressed': current === key,
  })
  return { current, bind, keep: setKept }
}

function Readout({ label, value, unit, note, active, i, count = true, show, bindProps, children }: { label: string; value: string; unit: string; note?: string; active: boolean; i: number; count?: boolean; show: string; bindProps: ReturnType<ReturnType<typeof useInspect>['bind']>; children?: ReactNode }) {
  return (
    <button type="button" className="readout readout--inspect rv" style={{ '--i': i } as CSSProperties} tabIndex={active ? 0 : -1} {...bindProps}>
      <span className="readout__label">{label}</span>
      <span className="readout__value">
        {count ? <CountUp value={value} active={active} /> : <span className="count">{value}</span>}
        <span className="readout__unit">{unit}</span>
      </span>
      {note && <span className="readout__note">{note}</span>}
      <span className="readout__show">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="6" cy="6" r="1.4" fill="currentColor" />
        </svg>
        {show}
      </span>
      {children}
    </button>
  )
}

function MeshStep({ active, onAll }: { active: boolean; onAll: () => void }) {
  const { current, bind, keep } = useInspect(active)
  useThicknessCycle(active, current !== null)
  const thickness = useStageValue('thickness')
  const coarse = useCoarsePointer()
  const failed = useStageValue('failed')
  const pick = (t: Thickness) => setShared({ thickness: t })
  return (
    <div className="spec">
      <div className="spec__head">
        <Lines slab lines={['The sheet.']} />
        {!failed && (
          <p className="spec__hint rv" style={{ '--i': 1 } as CSSProperties}>
            {coarse ? 'Tap a figure to see it on the mesh.' : 'Point at a figure to see it on the mesh.'}
          </p>
        )}
      </div>
      <div className="spec__col spec__col--left">
        <div className={`readout readout--thickness rv ${current === 'thickness' ? 'is-on' : ''}`} style={{ '--i': 1 } as CSSProperties}>
          <span className="readout__label">Thickness option</span>
          <span className="readout__value">
            <span className="count count--live" key={thickness}>
              {thickness}
            </span>
            <span className="readout__unit">mm</span>
          </span>
          <span className="readout__chips" role="group" aria-label="Show a thickness option on the mesh">
            {THICKNESS_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className="chip"
                tabIndex={active ? 0 : -1}
                {...bind('thickness')}
                aria-pressed={thickness === t}
                onPointerEnter={(e) => {
                  bind('thickness').onPointerEnter(e)
                  if (e.pointerType === 'mouse') pick(t)
                }}
                onFocus={() => {
                  bind('thickness').onFocus()
                  pick(t)
                }}
                onClick={() => {
                  pick(t)
                  keep('thickness')
                }}
              >
                {t} mm
              </button>
            ))}
          </span>
        </div>
        <Readout label="Sheet width" value="1,220" unit="mm" active={active} i={2} show="Measures the width" bindProps={bind('width')} />
        <Readout label="Sheet lengths" value="2.4 / 3.4 / 5.8" unit="m" count={false} active={active} i={3} show="Shows the three lengths" bindProps={bind('length')}>
          <ReviewNote>From the PDF margin note; its table says 6 m.</ReviewNote>
        </Readout>
      </div>
      <div className="spec__col spec__col--right">
        <Readout label="Tensile strength" value="> 50" unit="kN/m" active={active} i={4} show="Loads the faces" bindProps={bind('tensile')} />
        <Readout label="Elastic modulus" value="79,600" unit="MPa" active={active} i={5} show="Strikes the sheet: it springs back" bindProps={bind('modulus')} />
        <Readout label="Elongation at break" value="3.4" unit="%" active={active} i={6} show="Stretches it 3.4 %" bindProps={bind('elongation')} />
      </div>
      <button type="button" className="pill pill--line spec__all rv" style={{ '--i': 7 } as CSSProperties} tabIndex={active ? 0 : -1} onClick={onAll}>
        All figures
      </button>
    </div>
  )
}

function YarnStep({ active }: { active: boolean }) {
  const tensile = YARN[0]
  const max = Math.max(...tensile.bars.map((b) => b.value))
  return (
    <div className="race">
      <div className="race__head">
        <Lines slab lines={['The yarn.']} />
        <p className="race__figure rv" style={{ '--i': 1 } as CSSProperties}>
          <CountUp value="2.62" active={active} duration={1800} />
          <span className="race__unit">GPa</span>
        </p>
        <p className="lead rv" style={{ '--i': 2 } as CSSProperties}>
          Tensile strength of the impregnated basalt yarn the mesh is woven from.
        </p>
      </div>
      <ul className="race__bars">
        {tensile.bars.map((b, i) => (
          <li key={b.label} className={`race__bar ${b.rtarium ? 'is-rt' : ''}`} style={{ '--i': i, '--v': b.value / max } as CSSProperties}>
            <span className="race__label">{b.label}</span>
            <span className="race__track" aria-hidden="true">
              <span className="race__fill" />
            </span>
            <span className="race__value num">{b.value.toLocaleString('en-GB')} MPa</span>
          </li>
        ))}
      </ul>
      <div className="race__more">
        {YARN.slice(1).map((c, i) => (
          <p key={c.id} className="rv" style={{ '--i': 8 + i } as CSSProperties}>
            <span className="race__more-figure num">
              {c.figure} {c.unit}
            </span>
            <span className="race__more-text">
              <span className="race__more-title">{c.title}.</span> <span className="race__more-reading">{c.reading}</span>
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

function ConcreteStep({ active }: { active: boolean }) {
  const flexural = SFRC_SWAP[1]
  const tensile = SFRC_SWAP[0]
  return (
    <div className="cast">
      <div className="cast__head">
        <Lines slab lines={['The concrete.']} />
        <p className="cast__figure rv" style={{ '--i': 1 } as CSSProperties}>
          <CountUp value="+77" active={active} duration={1800} />
          <span className="cast__unit">%</span>
        </p>
        <p className="lead rv" style={{ '--i': 2 } as CSSProperties}>
          Flexural strength, when the steel fibres in ultra-high-performance concrete are swapped for RTARIUM.
        </p>
      </div>
      <div className="cast__pairs">
        {[flexural, tensile].map((r, i) => (
          <div key={r.metric} className="pair rv" style={{ '--i': 3 + i } as CSSProperties}>
            <span className="pair__metric">{r.metric}</span>
            <span className="pair__row">
              <span className="pair__name">Steel fibre</span>
              <span className="pair__bar" style={{ '--v': Number(r.sfrc) / 50.6 } as CSSProperties} />
              <span className="num">{r.sfrc} MPa</span>
            </span>
            <span className="pair__row is-rt">
              <span className="pair__name">RTARIUM</span>
              <span className="pair__bar" style={{ '--v': Number(r.rtarium) / 50.6 } as CSSProperties} />
              <span className="num">{r.rtarium} MPa</span>
            </span>
          </div>
        ))}
      </div>
      <div className="cast__facts rv" style={{ '--i': 5 } as CSSProperties}>
        {CONCRETE_FIGURES.map((f) => (
          <p key={f.id}>
            <span className="num">
              {f.value} {f.unit}
            </span>
            <span>{f.label}</span>
          </p>
        ))}
      </div>
      <p className="caption cast__note rv" style={{ '--i': 6 } as CSSProperties}>
        Figures describe the tested materials and configuration. The mesh, seen through the concrete in the 3D model.
        <ReviewNote>{CONCRETE_REVIEW}</ReviewNote>
      </p>
    </div>
  )
}

/** Every figure, on one warm-white sheet, for the visitor who wants the table. */
function FiguresSheet({ dialog }: { dialog: RefObject<HTMLDialogElement | null> }) {
  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="sheet-title" onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}>
      <div className="sheet__inner">
        <header className="sheet__head">
          <h2 id="sheet-title">All figures</h2>
          <button type="button" className="pill pill--line" onClick={() => dialog.current?.close()}>
            Close
          </button>
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

export function TechSpace() {
  const dialog = useRef<HTMLDialogElement>(null)
  const openAll = () => dialog.current?.showModal()

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
            <div className="jump rv" style={{ '--i': 4 } as CSSProperties}>
              {['Mesh', 'Yarn', 'Concrete'].map((l, i) => (
                <button key={l} type="button" className="pill pill--line" tabIndex={active ? 0 : -1} onClick={() => goToStep('tech', i + 1)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    { id: 'mesh', label: 'Mesh', ground: 'black', pose: 'spec', render: (active) => <MeshStep active={active} onAll={openAll} /> },
    { id: 'yarn', label: 'Yarn', ground: 'black', pose: 'roving', render: (active) => <YarnStep active={active} /> },
    { id: 'concrete', label: 'Concrete', ground: 'black', pose: 'xray', render: (active) => <ConcreteStep active={active} /> },
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
      <ThicknessLabel />
      <StageLabel anchor="dim-width">1,220 mm wide</StageLabel>
      <StageLabel anchor="strain">+3.4 % at break</StageLabel>
    </>
  )
}

function ThicknessLabel() {
  const t = useStageValue('thickness')
  return <StageLabel anchor="dimension">{t} mm</StageLabel>
}

