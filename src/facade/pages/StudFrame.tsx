import { useMemo, type CSSProperties } from 'react'
import { FacadePage, SystemsNav, usePageMeta } from '../Shell'
import { Story, Words, useInView, type StoryStep } from '../Story'
import { Stage3D, Rig, LabelProjector, Labels, type LabelSpec } from '../three/Stage3D'
import { StudFrameModel, STUD_SHOTS, type StudView } from '../three/StudFrameModel'
import { createBus } from '../three/kit'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useIsCompact } from '../../lib/motion'

const VIEWS: StudView[] = ['outcome', 'components', 'anchor', 'site']

const LABELS: LabelSpec[] = [
  { id: 'head', anchor: 's-head', text: 'Head with cornice', dx: -110, dy: 40, wide: true },
  { id: 'jamb', anchor: 's-jamb', text: 'Jamb', dx: 80, dy: 0, wide: true },
  { id: 'sill', anchor: 's-sill', text: 'Sill', dx: 80, dy: 40, wide: true },
  { id: 'skin', anchor: 's-skin', text: 'Architectural skin', dx: -80, dy: -90 },
  { id: 'frame', anchor: 's-frame', text: 'Steel stud frame', dx: -70, dy: 80 },
  { id: 'stiffener', anchor: 's-stiffener', text: 'Stiffener', dx: 70, dy: 70, wide: true },
  { id: 'anchors', anchor: 's-anchor', text: 'Flex anchors', dx: -40, dy: 120 },
  { id: 'plate', anchor: 's-plate', text: 'Flexible L plate', dx: -100, dy: 80 },
  { id: 'ferrule', anchor: 's-ferrule', text: 'Ferrule insert, cast into the skin', dx: 100, dy: 70 },
  { id: 'tube', anchor: 's-tube', text: 'Galvanized steel tube', dx: -80, dy: -80 },
  { id: 'lframe', anchor: 's-lframe', text: 'L frame on the building', dx: 80, dy: 70 },
  { id: 'lock', anchor: 's-lock', text: 'Locked from the top', dx: -100, dy: -70 },
  { id: 'bolt', anchor: 's-bolt', text: 'Levelling bolt', dx: -70, dy: 80, wide: true },
  { id: 'joint', anchor: 's-joint', text: 'Sealed joint', dx: 90, dy: -80 },
]
const SHOWN: string[][] = [['head', 'jamb', 'sill'], ['skin', 'frame', 'stiffener', 'anchors'], ['plate', 'ferrule', 'tube'], ['lframe', 'lock', 'bolt', 'joint']]

export default function StudFrame() {
  usePageMeta(
    'Stud Frame Cladding',
    'RTARIUM stud frame cladding: architectural concrete skins of 16 to 20 mm on galvanized steel stud frames, joined by flex anchors, with RTARIUM as the intermediate reinforcement.',
  )
  const bus = useMemo(createBus, [])
  const compact = useIsCompact()

  const steps: StoryStep[] = [
    {
      id: 'outcome',
      place: 'bl',
      body: (
        <>
          <Words as="h1" className="fc-title" lines={['Stud Frame', 'Cladding']} />
          <p className="fc-lede fc-rv">
            Architectural concrete skins on structural steel stud frames, for intricate, classical or sweeping modern façades. Its
            profiles connect into one building envelope.
          </p>
          <p className="fc-small fc-rv" style={{ '--i': 1 } as CSSProperties}>
            Used on luxury villas and beachside properties in the Middle East, where extreme summer heat and high wind loads meet a
            demand for detailed profiles.
            <ReviewNote>{REVIEW.profiles}</ReviewNote>
          </p>
        </>
      ),
    },
    {
      id: 'components',
      place: 'right',
      body: (
        <>
          <Words lines={['Two components.']} />
          <p className="fc-lede fc-rv">
            The architectural skin, and a structural stud frame of galvanized steel tubes with stiffeners. RTARIUM is the intermediate
            reinforcement inside the skin.
          </p>
        </>
      ),
    },
    {
      id: 'anchors',
      place: 'bl',
      plate: true,
      body: (
        <>
          <Words lines={['Joined to move.']} />
          <p className="fc-lede fc-rv">
            Flex anchors, flexible L-shaped plates, join frame and skin at ferrule inserts cast into the skin. They let the skin
            expand in the <span className="num">45 °C</span> heat of the day and contract at night, instead of holding it rigid.
          </p>
          <ReviewNote>{REVIEW.heat}</ReviewNote>
        </>
      ),
    },
    {
      id: 'site',
      place: 'bl',
      plate: true,
      body: (
        <>
          <Words lines={['Dropped on,', 'locked from the top.']} />
          <p className="fc-lede fc-rv">
            A small crane lowers each element onto L frames on the building, where it is locked from the top. Levelling bolts align the
            joints to the millimetre; polyurethane backing rods and architectural sealant then close them.
          </p>
        </>
      ),
    },
  ]

  return (
    <FacadePage>
      <Story
        id="stud"
        ground="yellow"
        label="The stud frame element, from outcome to installation"
        steps={steps}
        stage={(step) => (
          <>
            <Stage3D fallback={<img className="fc-still" src="/img/facade/panel-back.webp" alt="" />}>
              <Rig shot={STUD_SHOTS[VIEWS[step]][compact ? 'compact' : 'wide']} />
              <StudFrameModel view={VIEWS[step]} bus={bus} />
              <LabelProjector bus={bus} />
            </Stage3D>
            <Labels bus={bus} labels={LABELS} shown={SHOWN[step]} />
          </>
        )}
      />
      <Skin />
      <Cast />
      <SystemsNav current="stud" />
    </FacadePage>
  )
}

/** the skin in section: face coat, RTARIUM, backing; a ferrule insert in the back (site map, casting step 3) */
function Skin() {
  const [ref, inView] = useInView<HTMLElement>()
  return (
    <section ref={ref} className={`fc-band fc-reveal on-light ${inView ? 'is-in' : ''}`} aria-labelledby="skin-title">
      <div className="fc-split fc-split--even">
        <div>
          <header className="fc-band__head">
            <Words id="skin-title" lines={['16 to 20 mm,', 'RTARIUM between', 'the coats.']} />
            <p className="fc-lede fc-rv">
              The skin is sprayed into its mould: a <span className="num">5 mm</span> face coat for the finish, then RTARIUM formed to
              the mould with its ferrule inserts and pressed into the partly set face coat, then the rest of the thickness over the mesh.
            </p>
            <ReviewNote>{REVIEW.skin}</ReviewNote>
          </header>
          <figure className="fc-section fc-rv" style={{ '--i': 1 } as CSSProperties}>
            <SectionDrawing />
            <figcaption className="fc-caption">Section through the skin, as cast face down. Drawing, not to a project.</figcaption>
          </figure>
        </div>
        <figure className="fc-figure fc-rv" style={{ '--i': 2 } as CSSProperties}>
          <img src="/img/facade/ferrule-in-mesh.webp" alt="A ferrule insert set into the RTARIUM mesh, a threaded bolt above it" loading="lazy" decoding="async" width={720} height={1280} />
          <figcaption className="fc-caption">A ferrule insert set into the mesh before the backing is sprayed. Production shoot.</figcaption>
        </figure>
      </div>
    </section>
  )
}

/** drawn at 8 px to the millimetre: back face at the top, face coat (against the mould) at the bottom */
function SectionDrawing() {
  const x0 = 140
  const x1 = 620
  const back = 52
  const face = 196
  const coat = face - 40
  return (
    <svg className="fc-draw" viewBox="0 0 800 250" role="img" aria-label="Section through the skin: a 5 mm face coat against the mould, RTARIUM above it, the backing over the mesh, 16 to 20 mm in all; a ferrule insert in the back">
      <defs>
        <pattern id="fc-coat" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.7" className="fc-draw__grain" />
        </pattern>
        <pattern id="fc-backing" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="4" r="1" className="fc-draw__grain" />
          <circle cx="10" cy="10" r="1.4" className="fc-draw__grain" />
        </pattern>
      </defs>
      <rect x={x0} y={back} width={x1 - x0} height={coat - back} className="fc-draw__backing" fill="url(#fc-backing)" />
      <rect x={x0} y={coat} width={x1 - x0} height={face - coat} className="fc-draw__coat" fill="url(#fc-coat)" />
      {/* RTARIUM: two woven faces and the fibres between them, pressed onto the face coat */}
      <g className="fc-draw__mesh">
        <line x1={x0} y1={coat - 4} x2={x1} y2={coat - 4} />
        <line x1={x0} y1={back + 46} x2={x1} y2={back + 46} />
        <polyline points={Array.from({ length: 25 }, (_, i) => `${x0 + i * 20},${i % 2 ? back + 46 : coat - 4}`).join(' ')} />
      </g>
      {/* a ferrule insert in the back */}
      <rect x={430} y={back} width={22} height={64} className="fc-draw__ferrule" />
      <line x1={441} y1={back - 30} x2={441} y2={back + 50} className="fc-draw__bolt" />
      {/* the mould under the face */}
      <line x1={x0 - 20} y1={face + 10} x2={x1 + 20} y2={face + 10} className="fc-draw__mould" />
      <text x={x1 + 22} y={face + 14} className="fc-draw__note">
        mould
      </text>
      {/* dimensions */}
      <g className="fc-draw__dim">
        <line x1={x0 - 46} y1={back} x2={x0 - 46} y2={face} />
        <line x1={x0 - 54} y1={back} x2={x0 - 38} y2={back} />
        <line x1={x0 - 54} y1={face} x2={x0 - 38} y2={face} />
        <line x1={x0 - 18} y1={coat} x2={x0 - 18} y2={face} />
        <line x1={x0 - 24} y1={coat} x2={x0 - 12} y2={coat} />
      </g>
      <text x={x0 - 58} y={(back + face) / 2 - 6} textAnchor="end" className="fc-draw__dimtext">
        16–20
      </text>
      <text x={x0 - 58} y={(back + face) / 2 + 12} textAnchor="end" className="fc-draw__note">
        mm
      </text>
      <text x={x0 - 26} y={face + 34} textAnchor="middle" className="fc-draw__dimtext">
        5
      </text>
      {/* callouts on the right */}
      <g className="fc-draw__lead">
        <line x1={x1 - 30} y1={(coat + face) / 2} x2={x1 + 30} y2={(coat + face) / 2} />
        <line x1={x1 - 30} y1={back + 70} x2={x1 + 30} y2={back + 70} />
        <line x1={x1 - 30} y1={back + 20} x2={x1 + 30} y2={back + 20} />
        <line x1={452} y1={back + 40} x2={500} y2={back - 28} />
      </g>
      <text x={x1 + 36} y={(coat + face) / 2 + 5} className="fc-draw__note">
        face coat, 5 mm
      </text>
      <text x={x1 + 36} y={back + 75} className="fc-draw__note fc-draw__note--mesh">
        RTARIUM
      </text>
      <text x={x1 + 36} y={back + 25} className="fc-draw__note">
        backing
      </text>
      <text x={506} y={back - 32} className="fc-draw__note">
        ferrule insert
      </text>
    </svg>
  )
}

const CAST = [
  { name: 'Stud frame', text: 'Galvanized steel tubes with stiffeners, drilled at the intervals of the ferrule inserts.', img: null, alt: '', pos: '' },
  { name: 'Mould', text: 'CNC-routed timber, FRP or silicone. Here, a timber carpentry mould.', img: '/img/facade/mould-timber.webp', pos: '50% 86%', alt: 'An empty timber mould for a thin panel with a stepped edge, on the factory floor' },
  { name: 'Spray-up', text: 'Face coat, then RTARIUM with its ferrule inserts pressed in, then the rest of the thickness.', img: '/img/facade/mesh-on-face-coat.webp', pos: '50% 50%', alt: 'RTARIUM mesh pressed onto the red face coat in the mould, a ferrule insert standing up from it' },
  { name: 'Frame and skin', text: 'The frame is placed on the skin and locked to the ferrule inserts.', img: '/img/facade/panel-back.webp', pos: '50% 42%', alt: 'The back of a thin panel standing upright, with two steel members bolted to its cast-in inserts' },
  { name: 'Curing and packing', text: 'Cured in a controlled environment, then packed on wooden pallets for transport.', img: '/img/facade/panel-face.webp', pos: '50% 50%', alt: 'The finished face of a thin panel, standing upright in the factory' },
]

/** the client's casting steps 1 to 5 (site map), with the production shoot where it shows the step */
function Cast() {
  const [ref, inView] = useInView<HTMLElement>()
  return (
    <section ref={ref} className={`fc-band fc-reveal on-black ${inView ? 'is-in' : ''}`} aria-labelledby="cast-title">
      <header className="fc-band__head">
        <Words id="cast-title" lines={['Cast in five steps.']} />
        <p className="fc-lede fc-rv">Once packed, the elements travel stacked and wrapped to protect their profiles and surfaces.</p>
      </header>
      <ol className="fc-process" style={{ '--cols': 5 } as CSSProperties}>
        {CAST.map((c, i) => (
          <li key={c.name} className="fc-process__step fc-rv" style={{ '--i': i + 1 } as CSSProperties}>
            {c.img ? <img className="fc-process__img" src={c.img} alt={c.alt} loading="lazy" decoding="async" width={720} height={1280} style={{ objectPosition: c.pos }} /> : <FrameDrawing />}
            <span className="fc-process__num">{i + 1}</span>
            <h3 className="fc-process__name">{c.name}</h3>
            <p className="fc-process__text">{c.text}</p>
          </li>
        ))}
      </ol>
      <p className="fc-caption fc-process__source">Photographs: RTARIUM production shoot. Step 1 is a drawing.</p>
    </section>
  )
}

/** a stud frame in elevation: chords, studs, two stiffeners and the holes for the ferrule inserts */
function FrameDrawing() {
  const studs = [30, 100, 170, 240]
  return (
    <svg className="fc-process__img fc-draw fc-draw--frame" viewBox="0 0 270 338" role="img" aria-label="Drawing of a stud frame: two chords, four studs, two diagonal stiffeners, holes at the ferrule intervals">
      <g className="fc-draw__steel">
        <rect x="20" y="40" width="230" height="14" />
        <rect x="20" y="284" width="230" height="14" />
        {studs.map((x) => (
          <rect key={x} x={x - 7} y="54" width="14" height="230" />
        ))}
        <line x1="37" y1="270" x2="93" y2="68" />
        <line x1="177" y1="68" x2="233" y2="270" />
      </g>
      {studs.flatMap((x) => [110, 230].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="3.5" className="fc-draw__hole" />))}
    </svg>
  )
}
