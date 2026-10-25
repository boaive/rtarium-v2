import type { CSSProperties } from 'react'
import { Lines, Track, type Step } from '../components/Chapter'
import { VideoLoop } from '../components/Media'
import { StageLabel } from '../three/Stage'

const MAKING = ['Basalt rock', 'Melted', 'Drawn into filaments', 'Woven into the mesh']

/** the notes on the cast panel at the close of "In concrete" */
const NOTES = [
  { anchor: 'pour-cavity', name: 'Open cavity', text: 'Mortar flows right through it.' },
  { anchor: 'pour-mesh', name: 'Locking mesh', text: 'Held in three dimensions.' },
  { anchor: 'pour-matrix', name: 'Concrete matrix', text: 'Cast round both faces.' },
]

const steps: Step[] = [
  {
    id: 'structure',
    label: 'Structure',
    ground: 'yellow',
    pose: 'structure',
    // the corner of the sheet fills the upper left; the copy answers it from the lower right
    render: () => (
      <div className="copy copy--br">
        <Lines lines={['A mesh with', 'a third dimension.']} />
        <p className="lead rv" style={{ '--i': 3 } as CSSProperties}>
          Two basalt mesh faces, held apart by fibres that run through the depth.
        </p>
        <p className="figure rv" style={{ '--i': 4 } as CSSProperties}>
          <span className="figure__label">Thickness options</span>
          <span className="figure__value num">3 / 6 / 10 / 15 mm</span>
        </p>
      </div>
    ),
  },
  {
    id: 'material',
    label: 'Material',
    ground: 'yellow',
    pose: 'material',
    // a band across the top; the rovings run underneath it as a panorama
    render: () => (
      <div className="copy copy--band">
        <Lines lines={['Woven from', 'volcanic rock.']} />
        <div className="copy__aside">
          <p className="lead rv" style={{ '--i': 3 } as CSSProperties}>
            100% natural basalt, melted, drawn into continuous filaments, then woven.
          </p>
          <ol className="chain" aria-label="How the mesh is made">
            {MAKING.map((m, i) => (
              <li key={m} className="chain__step" style={{ '--i': i } as CSSProperties}>
                {m}
              </li>
            ))}
          </ol>
        </div>
      </div>
    ),
  },
  {
    id: 'flow',
    label: 'In concrete',
    ground: 'yellow',
    pose: 'pour',
    // three movements, in time: the mesh carries on from the rovings to the left of the screen, the
    // copy top right and the footage, for reference, bottom right; mortar flows in across the mesh;
    // then the camera stands back to the whole panel while the copy moves top left and the footage
    // top right, and the panel takes its notes
    render: (active) => (
      <>
        <figure className="pourfilm" aria-hidden={!active}>
          <div className="pourfilm__frame">
            {active ? (
              <VideoLoop src="/video/mortar-flow-wide.mp4" poster="/video/mortar-flow-wide.jpg" label="Mortar flowing into the RTARIUM mesh, close up" className="pourfilm__video" />
            ) : (
              <img className="pourfilm__poster" src="/video/mortar-flow-wide.jpg" alt="" />
            )}
          </div>
          <figcaption className="caption">Footage from the RTARIUM production shoot.</figcaption>
        </figure>
        <div className="copy copy--pour">
          <Lines lines={['Concrete flows in.', 'And locks it.']} />
          <p className="lead rv" style={{ '--i': 3 } as CSSProperties}>
            Mortar fills the open cavity between the faces, locking mesh and matrix together in three dimensions.
          </p>
        </div>
      </>
    ),
  },
]

export function About() {
  return (
    <>
      <Track id="about" title="About RTARIUM" steps={steps} />
      <StageLabel anchor="upper-face">Upper face</StageLabel>
      <StageLabel anchor="fibres">Connecting fibres</StageLabel>
      <StageLabel anchor="lower-face" side="left">
        Lower face
      </StageLabel>
      {NOTES.map((n, i) => (
        <StageLabel key={n.anchor} anchor={n.anchor} columnAt=".scene--flow .copy--pour" note>
          <span className="note">
            <span className="note__num num">0{i + 1}</span>
            <span className="note__name">{n.name}</span>
            <span className="note__text">{n.text}</span>
          </span>
        </StageLabel>
      ))}
    </>
  )
}
