import type { CSSProperties } from 'react'
import { VideoLoop } from '../../components/Media'
import { Eyebrow, Words } from '../ui'

const NOTES = [
  { name: 'Open cavity', text: 'Mortar flows right through it.' },
  { name: 'Locking mesh', text: 'Held in three dimensions.' },
  { name: 'Concrete matrix', text: 'Cast round both faces.' },
]

/**
 * The film's open core, filled: the production footage of mortar running into the mesh, shot
 * upright (the tall cut, made for phones), and the three things it shows, as numbered notes.
 */
export function InConcrete() {
  return (
    <section id="in-concrete" className="m-sec m-cast on-black" data-m-ground="black" data-m-chapter="about" aria-labelledby="cast-title">
      <div className="m-sec__head">
        <Eyebrow>In concrete</Eyebrow>
        <Words id="cast-title" lines={['Concrete flows in.', 'And locks it.']} className="m-display" />
      </div>
      <figure className="m-cast__film" data-reveal="">
        <VideoLoop src="/video/mortar-flow-tall.mp4" poster="/video/mortar-flow-tall.jpg" label="Mortar flowing into the RTARIUM mesh, close up" className="m-cast__loop" />
        <figcaption className="m-caption">Footage from the RTARIUM production shoot.</figcaption>
      </figure>
      <p className="m-lead" data-reveal="">
        Mortar fills the open cavity between the faces, locking mesh and matrix together in three dimensions.
      </p>
      <ol className="m-notes">
        {NOTES.map((n, i) => (
          <li key={n.name} data-reveal="" style={{ '--d': i } as CSSProperties}>
            <span className="m-notes__n num">0{i + 1}</span>
            <span className="m-notes__name">{n.name}</span>
            <span className="m-notes__text">{n.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
