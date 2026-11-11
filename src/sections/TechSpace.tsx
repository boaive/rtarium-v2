import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react'
import { Chapter, Lines, Rows, type Step } from '../components/Chapter'
import { useIsCompact } from '../lib/motion'
import { ReviewNote } from '../components/Media'
import { StageLabel } from '../three/Stage'
import { setShared, useStageValue } from '../three/stageStore'
import { CONCRETE_FIGURES, DATA_SHEET, MESH_SPECS, SFRC_SWAP, THICKNESS_OPTIONS, YARN } from '../content/technical'

/**
 * The mesh's thickness, chosen here: the four options as switches, and the system in 3D is rebuilt in the one
 * picked (the stage's shared thickness).
 */
function ThicknessSwitch({ active }: { active: boolean }) {
  const thickness = useStageValue('thickness')
  const label = useId()
  return (
    <div className="system__thick rv" style={{ '--i': 4 } as CSSProperties}>
      <span id={label} className="system__thick-label">
        Mesh thickness options
      </span>
      <div className="system__seg" role="group" aria-labelledby={label}>
        {THICKNESS_OPTIONS.map((t) => (
          <button key={t} type="button" className="system__seg-btn" aria-pressed={thickness === t} tabIndex={active ? 0 : -1} onClick={() => setShared({ thickness: t })}>
            <span className="num">{t}</span>
            <small>mm</small>
          </button>
        ))}
      </div>
    </div>
  )
}

/** one figure on the sheet: what it is, the value large, and what it means under it */
interface Figure {
  label: string
  value: string
  unit?: string
  note?: string
  review?: string
}

/** the sheet's tabs, a group of figures each */
const GROUPS: { id: string; label: string; title: string; figures: Figure[] }[] = [
  ...MESH_SPECS.map((g) => ({
    id: `mesh-${g.label.toLowerCase()}`,
    label: `Mesh ${g.label.toLowerCase()}`,
    title: `The mesh: ${g.label.toLowerCase()}`,
    figures: g.rows.map((r) => ({ label: r.label, value: r.value, unit: r.unit, note: r.note, review: r.review })),
  })),
  {
    id: 'yarn',
    label: 'Basalt yarn',
    title: 'The impregnated basalt yarn',
    figures: YARN.map((y) => ({ label: y.title, value: y.figure, unit: y.unit, note: y.reading })),
  },
  {
    id: 'concrete',
    label: 'In concrete',
    title: 'Concrete reinforced with RTARIUM',
    figures: [
      ...SFRC_SWAP.map((r) => ({
        label: `${r.metric} in UHPC`,
        value: r.change,
        note: `${r.sfrc} → ${r.rtarium} ${r.unit}, with RTARIUM in place of steel fibre.`,
      })),
      ...CONCRETE_FIGURES.map((f) => ({ label: f.label, value: f.value, unit: f.unit, note: f.context })),
    ],
  },
]

/**
 * Every figure, on one warm-white sheet, for the visitor who wants them all: a tab for each group, and the group's
 * figures as tiles, each value large with what it means under it.
 */
function FiguresSheet({ dialog }: { dialog: RefObject<HTMLDialogElement | null> }) {
  const [open, setOpen] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const base = useId()
  // the arrow keys move along the tabs, Home and End to either end
  const onKey = (e: KeyboardEvent) => {
    const n = GROUPS.length
    const to = e.key === 'ArrowRight' ? (open + 1) % n : e.key === 'ArrowLeft' ? (open - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (to < 0) return
    e.preventDefault()
    setOpen(to)
    tabs.current[to]?.focus()
  }
  const group = GROUPS[open]
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
        <div className="sheet__tabs" role="tablist" aria-label="Groups of figures" onKeyDown={onKey}>
          {GROUPS.map((g, i) => (
            <button
              key={g.id}
              ref={(el) => void (tabs.current[i] = el)}
              type="button"
              role="tab"
              id={`${base}-tab-${g.id}`}
              className="sheet__tab"
              aria-selected={i === open}
              aria-controls={`${base}-panel`}
              tabIndex={i === open ? 0 : -1}
              onClick={() => setOpen(i)}
            >
              {g.label}
              <span className="sheet__count num">{g.figures.length}</span>
            </button>
          ))}
        </div>
        <section key={group.id} id={`${base}-panel`} className="sheet__panel" role="tabpanel" aria-labelledby={`${base}-tab-${group.id}`}>
          <h3 className="sheet__group">{group.title}</h3>
          <dl className="spec">
            {group.figures.map((f) => (
              <div key={f.label} className="spec__item">
                <dt className="spec__label">{f.label}</dt>
                <dd className="spec__value">
                  <span className="num">{f.value}</span>
                  {f.unit && <small>{f.unit}</small>}
                </dd>
                {f.note && <dd className="spec__note">{f.note}</dd>}
                {f.review && (
                  <dd>
                    <ReviewNote>{f.review}</ReviewNote>
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </section>
        <p className="sheet__fine">
          Figures describe the tested materials and configuration. Performance in a particular element depends on its mix,
          thickness and detailing.
        </p>
      </div>
    </dialog>
  )
}

/**
 * Tech Space, one screen on black: the system pulled apart in 3D on a diagonal of words, the mesh's thickness to
 * choose (the 3D follows), and the way to the rest: the data sheet to download, or every figure on a sheet over
 * the page.
 */
export function TechSpace() {
  const dialog = useRef<HTMLDialogElement>(null)
  const compact = useIsCompact()

  /*
   * On a phone, a row as About's and Innovation's are, and only what a first read needs: the line, what the three
   * are, the thickness to choose (the system in the figure is rebuilt in it), the data sheet, and the way to every
   * figure as a quiet link.
   */
  const phone: Step[] = [
    {
      id: 'system',
      label: 'System',
      ground: 'yellow',
      pose: 'stack',
      render: (active) => (
        <div className="copy system-m">
          <Lines lines={['Three elements.', 'One system.']} />
          <p className="lead rv" style={{ '--i': 2 } as CSSProperties}>
            The mesh, its basalt yarn, and the concrete it reinforces.
          </p>
          <ThicknessSwitch active={active} />
          <div className="system-m__cta rv" style={{ '--i': 5 } as CSSProperties}>
            <a className="system-m__sheet" href={DATA_SHEET} download>
              Data sheet
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                <path d="M10 3v12M5 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </a>
            <button type="button" className="system-m__all" onClick={() => dialog.current?.showModal()}>
              All figures
            </button>
          </div>
        </div>
      ),
    },
  ]

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
            <ThicknessSwitch active={active} />
            <div className="system__cta rv" style={{ '--i': 5 } as CSSProperties}>
              <a className="explore explore--yellow" href={DATA_SHEET} download tabIndex={active ? 0 : -1}>
                <span className="explore__label">Download the data sheet</span>
                <span className="explore__cell" aria-hidden="true">
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <path d="M10 3v12M5 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </span>
              </a>
              <button type="button" className="explore explore--line" tabIndex={active ? 0 : -1} onClick={() => dialog.current?.showModal()}>
                <span className="explore__label">View all details</span>
                <span className="explore__cell" aria-hidden="true">
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      ),
    },
  ]

  return (
    <>
      {compact ? <Rows id="tech" title="Tech Space" steps={phone} ground="yellow" /> : <Chapter id="tech" title="Tech Space" steps={steps} className="chapter--tech" />}
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
