import { useMemo, useState, type CSSProperties } from 'react'
import { FacadePage, SystemsNav, usePageMeta } from '../Shell'
import { Story, Words, useInView, type StoryStep } from '../Story'
import { Stage3D, Rig, LabelProjector, Labels, type LabelSpec } from '../three/Stage3D'
import { UnitizedModel, UNITIZED_SHOTS, type UnitPart, type UnitizedView } from '../three/UnitizedModel'
import { createBus } from '../three/kit'
import { REVIEW } from '../content'
import { ReviewNote, VideoLoop } from '../../components/Media'
import { useIsCompact } from '../../lib/motion'

const VIEWS: UnitizedView[] = ['facade', 'panel', 'exploded', 'slab', 'double']

/** the six components, in the client's order (corrections PDF, item 6) */
const COMPONENTS: { part: UnitPart; name: string; note: string }[] = [
  { part: 'panel', name: 'Thin concrete panel', note: 'The outer skin, its anchors cast in.' },
  { part: 'window', name: 'Pre-glazed window', note: 'Glazed off-site, sealed to the panel with gaskets.' },
  { part: 'drywall', name: 'Drywall-ready accessories', note: 'Tracks and studs on the room side, ready for the lining.' },
  { part: 'insulation', name: 'Insulation padding', note: 'Between the frame members, a vapour barrier on its warm side.' },
  { part: 'firestop', name: 'Firestopping and smoke barriers', note: 'Close the gaps at slab edges and columns.' },
  { part: 'frame', name: 'Main mounting frame', note: 'Carries the unit and connects it slab to slab.' },
]

const LABELS: LabelSpec[] = [
  { id: 'mesh', anchor: 'u-mesh', text: 'RTARIUM, mid-thickness', dx: 120, dy: 110 },
  { id: 'cover', anchor: 'u-cover', text: 'Concrete cover', dx: -110, dy: -70, wide: true },
  { id: 'return', anchor: 'u-return', text: 'Return into the window opening', dx: 110, dy: -90, wide: true },
  // the exploded unit carries numbered balloons, named in the list beside it, as on a drawing
  ...COMPONENTS.map((c, i) => ({
    id: `n-${c.part}`,
    anchor: { panel: 'u-panel', window: 'u-window', drywall: 'u-drywall', insulation: 'u-insulation', firestop: 'u-firestop', frame: 'u-frame' }[c.part],
    text: null,
    num: i + 1,
    dx: 26,
    dy: -30,
  })),
  { id: 'bracket', anchor: 'u-bracket', text: 'Bracket on the slab above', dx: 90, dy: -70 },
  { id: 'fire-edge', anchor: 'u-firestop-edge', text: 'Firestopping and smoke barrier', dx: 100, dy: 50 },
  { id: 'frame-edge', anchor: 'u-frame-edge', text: 'Main mounting frame', dx: -120, dy: 50, wide: true },
  { id: 'panel-edge', anchor: 'u-panel-edge', text: 'Thin concrete panel', dx: 100, dy: 100, wide: true },
  { id: 'mid', anchor: 'u-mid-slab', text: 'Connected at each slab', dx: -100, dy: -70 },
]

const SHOWN: string[][] = [
  [],
  ['mesh', 'cover', 'return'],
  COMPONENTS.map((c) => `n-${c.part}`),
  ['bracket', 'fire-edge', 'frame-edge', 'panel-edge'],
  ['mid'],
]

export default function Unitized() {
  usePageMeta(
    'Unitized Thin Concrete Façade',
    'Unitized thin concrete façade units: thin concrete panels reinforced with RTARIUM, pre-glazed windows, insulation and a main mounting frame, assembled off-site and connected slab to slab.',
  )
  const bus = useMemo(createBus, [])
  const compact = useIsCompact()
  const [focus, setFocus] = useState<UnitPart | null>(null)

  const steps: StoryStep[] = [
    {
      id: 'unit',
      place: 'bl',
      body: (
        <>
          <Words as="h1" className="fc-title" lines={['Unitized Thin', 'Concrete Façade']} />
          <p className="fc-lede fc-rv">
            An advanced prefabricated building envelope: thin concrete panels, glazing and insulation are built into modular units
            off-site, then hung from slab to slab.
          </p>
          <ul className="fc-tags fc-rv" style={{ '--i': 1 } as CSSProperties} aria-label="In short">
            <li>Thin panels</li>
            <li>In-built anchorage</li>
            <li>Off-site</li>
            <li>Modular units</li>
          </ul>
        </>
      ),
    },
    {
      id: 'panel',
      place: 'right',
      plate: true,
      body: (
        <>
          <Words lines={['A thin panel,', 'reinforced through', 'its depth.']} />
          <p className="fc-lede fc-rv">
            Cut open beside the window, the panel shows RTARIUM inside it at mid-thickness. The mesh runs through the whole panel and is
            bent with it into the returns that frame the window: one mesh, reinforcing in X, Y and Z.
          </p>
        </>
      ),
    },
    {
      id: 'components',
      place: 'left',
      body: (
        <>
          <Words lines={['Six components,', 'one unit.']} />
          <ol className="fc-legend fc-rv" data-focus={focus ?? undefined} aria-label="Components of a unit">
            {COMPONENTS.map((c, i) => (
              <li key={c.part}>
                <button
                  type="button"
                  aria-pressed={focus === c.part}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setFocus(c.part)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && setFocus(null)}
                  onFocus={() => setFocus(c.part)}
                  onBlur={() => setFocus(null)}
                  onClick={() => setFocus((f) => (f === c.part ? null : c.part))}
                >
                  <span>{i + 1}</span>
                  <span>
                    {c.name}
                    <small>{c.note}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="fc-small fc-rv" style={{ '--i': 2 } as CSSProperties}>
            Point at a component to single it out in the unit.
            <ReviewNote>{REVIEW.layerOrder}</ReviewNote>
          </p>
        </>
      ),
    },
    {
      id: 'slab',
      place: 'bl',
      body: (
        <>
          <Words lines={['Slab to slab.']} />
          <p className="fc-lede fc-rv">
            The main mounting frame hangs from a bracket on the slab above and is held at the slab below. Firestopping and a smoke
            barrier close the gap between the slab edge and the unit.
          </p>
          <ReviewNote>{REVIEW.connection}</ReviewNote>
        </>
      ),
    },
    {
      id: 'double',
      place: 'bl',
      body: (
        <>
          <Words lines={['One unit,', 'two storeys.']} />
          <p className="fc-lede fc-rv">A unit can also reach double height, connected to three slabs in one piece.</p>
          <ReviewNote>{REVIEW.doubleHeight}</ReviewNote>
        </>
      ),
    },
  ]

  return (
    <FacadePage>
      <Story
        id="unit"
        ground="black"
        label="The unit, component by component"
        steps={steps}
        onStep={(i) => i !== 2 && setFocus(null)}
        stage={(step) => (
          <>
            <Stage3D fallback={<img className="fc-still" src="/img/facade/panel-ivory.webp" alt="" />}>
              <Rig shot={UNITIZED_SHOTS[VIEWS[step]][compact ? 'compact' : 'wide']} />
              <UnitizedModel view={VIEWS[step]} focus={step === 2 ? focus : null} bus={bus} />
              <LabelProjector bus={bus} />
            </Stage3D>
            <Labels bus={bus} labels={LABELS} shown={SHOWN[step]} focus={step === 2 && focus ? `n-${focus}` : null} />
          </>
        )}
      />
      <Answers />
      <Made />
      <SystemsNav current="unitized" />
    </FacadePage>
  )
}

/** the client's pain points of thin precast panels, each with RTARIUM's answer (site map) */
function Answers() {
  const [ref, inView] = useInView<HTMLElement>()
  return (
    <section ref={ref} className={`fc-band fc-reveal on-yellow ${inView ? 'is-in' : ''}`} aria-labelledby="answers-title">
      <div className="fc-split">
        <div>
          <header className="fc-band__head">
            <Words id="answers-title" lines={['Four pain points.', 'Four answers.']} />
          </header>
          <dl className="fc-ledger fc-ledger--two">
            <div className="fc-ledger__row fc-ledger__row--head" aria-hidden="true">
              <span className="fc-ledger__head">Pain point</span>
              <span className="fc-ledger__head">With RTARIUM</span>
            </div>
            <div className="fc-ledger__row">
              <dt className="fc-ledger__key">Directional weakness</dt>
              <dd className="fc-ledger__to">XYZ strength: a 3D spacer structure reinforces in all three directions.</dd>
            </div>
            <div className="fc-ledger__row">
              <dt className="fc-ledger__key">Clumping</dt>
              <dd className="fc-ledger__to">Mesh in textile form: one continuous sheet, laid in, with no loose fibre to clump in the mix.</dd>
            </div>
            <div className="fc-ledger__row">
              <dt className="fc-ledger__key">Isolated anchorage</dt>
              <dd className="fc-ledger__to">
                In-built ferrule inserts, set into the mesh before the backing is sprayed.
                <ReviewNote>{REVIEW.ferrules}</ReviewNote>
              </dd>
            </div>
            <div className="fc-ledger__row">
              <dt className="fc-ledger__key">Length to weight</dt>
              <dd className="fc-ledger__to">
                Up to <span className="num">6 m</span> high in a single thickness.
                <ReviewNote>{REVIEW.sixMetres}</ReviewNote>
              </dd>
            </div>
          </dl>
        </div>
        <figure className="fc-figure fc-rv">
          <VideoLoop src="/video/eyebolt-insert.mp4" poster="/video/eyebolt-insert.jpg" label="An eye bolt threaded into an insert cast into a thin RTARIUM panel" className="fc-figure__loop" />
          <figcaption className="fc-caption">An eye bolt in an insert cast into a thin panel. Production shoot.</figcaption>
        </figure>
      </div>
    </section>
  )
}

const MADE = [
  { img: '/img/facade/mould-release.webp', pos: '50% 62%', name: 'The mould', text: 'A flat, inverted mould in the shape of the panel, coated with release agent.', alt: 'A worker brushing release agent into a timber mould lined for a thin panel' },
  { img: '/img/facade/face-coat.webp', pos: '50% 72%', name: 'Face coat', text: 'Sprayed into the mould first. It becomes the face of the building.', alt: 'A face coat being sprayed into the mould with a hopper gun' },
  { img: '/img/facade/mesh-formed.webp', pos: '50% 78%', name: 'RTARIUM', text: 'Laid in after the face coat, bent along the form of the mould into its returns.', alt: 'A sheet of RTARIUM mesh bent up at both edges to the shape of the mould' },
  { img: '/img/facade/backing-coat.webp', pos: '50% 40%', name: 'Backing', text: 'Sprayed over the mesh to the full thickness, then finished.', alt: 'The backing mix being sprayed over the mesh in the mould' },
]

/** the panel's manufacture, from the production shoot (corrections PDF: inverted mould, face coat, spray, finishing) */
function Made() {
  const [ref, inView] = useInView<HTMLElement>()
  return (
    <section ref={ref} className={`fc-band fc-reveal on-light ${inView ? 'is-in' : ''}`} aria-labelledby="made-title">
      <header className="fc-band__head">
        <Words id="made-title" lines={['Made face down.']} />
        <p className="fc-lede fc-rv">The panel is sprayed, not poured: the face coat first, then RTARIUM, then the backing.</p>
      </header>
      <ol className="fc-process" style={{ '--cols': 4 } as CSSProperties}>
        {MADE.map((m, i) => (
          <li key={m.name} className="fc-process__step fc-rv" style={{ '--i': i + 1 } as CSSProperties}>
            <img className="fc-process__img" src={m.img} alt={m.alt} loading="lazy" decoding="async" width={720} height={1280} style={{ objectPosition: m.pos }} />
            <span className="fc-process__num">{i + 1}</span>
            <h3 className="fc-process__name">{m.name}</h3>
            <p className="fc-process__text">{m.text}</p>
          </li>
        ))}
      </ol>
      <p className="fc-caption fc-process__source">Photographs: RTARIUM production shoot.</p>
    </section>
  )
}
