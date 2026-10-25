import type { CSSProperties } from 'react'
import { Chapter, Lines, type Step } from '../components/Chapter'
import { VideoLoop } from '../components/Media'
import { StageLabel } from '../three/Stage'

const MAKING = ['Basalt rock', 'Melted', 'Drawn into filaments', 'Woven into the mesh']

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
    ground: 'black',
    pose: 'none',
    className: 'scene--film',
    render: (active) => (
      <>
        <div className="film" aria-hidden={!active}>
          {active && <VideoLoop src="/video/mortar-flow-wide.mp4" poster="/video/mortar-flow-wide.jpg" label="Mortar flowing into the RTARIUM mesh, close up" className="film__video" />}
          {!active && <img className="film__poster" src="/video/mortar-flow-wide.jpg" alt="" />}
        </div>
        <div className="copy copy--br copy--film">
          <Lines lines={['Concrete flows in.', 'And locks it.']} />
          <p className="lead rv" style={{ '--i': 3 } as CSSProperties}>
            Mortar fills the open cavity between the faces, locking mesh and matrix together in three dimensions.
          </p>
          <p className="caption rv" style={{ '--i': 4 } as CSSProperties}>
            Footage from the RTARIUM production shoot.
          </p>
        </div>
      </>
    ),
  },
]

export function About() {
  return (
    <>
      <Chapter id="about" title="About RTARIUM" steps={steps} />
      <StageLabel anchor="upper-face">Upper face</StageLabel>
      <StageLabel anchor="fibres">Connecting fibres</StageLabel>
      <StageLabel anchor="lower-face" side="left">
        Lower face
      </StageLabel>
    </>
  )
}
