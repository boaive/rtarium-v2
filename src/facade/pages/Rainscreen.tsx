import { useMemo, useState, type CSSProperties } from 'react'
import { FacadePage, SystemsNav, usePageMeta } from '../Shell'
import { Story, Words, useInView, type StoryStep } from '../Story'
import { Stage3D, Rig, LabelProjector, Labels, type LabelSpec } from '../three/Stage3D'
import { RainscreenModel, RAINSCREEN_SHOTS, type RainscreenView } from '../three/RainscreenModel'
import { createBus } from '../three/kit'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useIsCompact } from '../../lib/motion'

const VIEWS: RainscreenView[] = ['finished', 'buildup', 'cavity', 'panel']

const LABELS: LabelSpec[] = [
  { id: 'fix', anchor: 'r-fix', text: 'Fixing at an anchor cast into the panel', dx: -60, dy: -80 },
  { id: 'rail-back', anchor: 'r-rail-back', text: 'Vertical rail', dx: -90, dy: 60 },
  { id: 'panel', anchor: 'r-panel', text: 'RTARIUM concrete panel', dx: -60, dy: -90 },
  { id: 'rail', anchor: 'r-rail', text: 'Vertical rail', dx: 70, dy: -70 },
  { id: 'bracket', anchor: 'r-bracket', text: 'Wall bracket', dx: 80, dy: 50 },
  { id: 'cavity', anchor: 'r-cavity', text: 'Ventilated cavity', dx: 40, dy: 90 },
  { id: 'wall', anchor: 'r-wall', text: 'Backing wall', dx: 60, dy: -80, wide: true },
  { id: 'air-in', anchor: 'r-air-in', text: 'Air in at the base', dx: 70, dy: 30 },
  { id: 'air-out', anchor: 'r-air-out', text: 'and out at the top', dx: 70, dy: -10 },
  { id: 'cavity-end', anchor: 'r-cavity-end', text: 'Ventilated cavity', dx: 80, dy: 0 },
  { id: 'wall-end', anchor: 'r-wall-end', text: 'Wall', dx: -70, dy: 0, wide: true },
  { id: 'panel-end', anchor: 'r-panel-end', text: 'Panel', dx: 70, dy: -40, wide: true },
  { id: 'mesh', anchor: 'r-mesh', text: 'RTARIUM inside the panel', dx: 90, dy: 80 },
]
const SHOWN: string[][] = [[], ['panel', 'rail', 'bracket', 'cavity', 'wall'], ['air-in', 'air-out', 'cavity-end', 'wall-end', 'panel-end'], ['mesh', 'fix', 'rail-back']]

export default function Rainscreen() {
  usePageMeta(
    'Rainscreen Cladding',
    'RTARIUM rainscreen cladding: thin concrete panels in 4, 5 and 8 m sizes, held off the wall in front of a ventilated cavity, reinforced by a three-dimensional basalt mesh.',
  )
  const bus = useMemo(createBus, [])
  const compact = useIsCompact()

  const steps: StoryStep[] = [
    {
      id: 'skin',
      place: 'bl',
      body: (
        <>
          <Words as="h1" className="fc-title" lines={['Rainscreen', 'Cladding']} />
          <p className="fc-lede fc-rv">
            A weather-resistant outer skin of thin RTARIUM concrete panels, held off the wall in front of a ventilated cavity.
          </p>
        </>
      ),
    },
    {
      id: 'build-up',
      place: 'right',
      body: (
        <>
          <Words lines={['Built out', 'from the wall.']} />
          <p className="fc-lede fc-rv">
            With half the cladding left off: brackets on the wall carry vertical rails, the panels are fixed to the rails, and the space
            left between panel and wall is the ventilated cavity.
          </p>
          <ReviewNote>{REVIEW.subframe}</ReviewNote>
        </>
      ),
    },
    {
      id: 'cavity',
      place: 'bl',
      body: (
        <>
          <Words lines={['Air moves', 'behind the panels.']} />
          <p className="fc-lede fc-rv">
            The panels take the weather. Behind them, air moves up through the cavity, so moisture that gets past the joints can drain
            and dry before it reaches the structure.
          </p>
          <ReviewNote>
            {REVIEW.rain} {REVIEW.wrb}
          </ReviewNote>
        </>
      ),
    },
    {
      id: 'panel',
      place: 'right',
      plate: true,
      body: (
        <>
          <Words lines={['Seen from', 'the cavity.']} />
          <p className="fc-lede fc-rv">
            The back of a panel, cut open: RTARIUM runs through it at mid-thickness, and the panel is fixed to the rails at anchors cast
            into it. A concrete face, reinforced through its depth.
          </p>
          <ReviewNote>{REVIEW.subframe}</ReviewNote>
        </>
      ),
    },
  ]

  return (
    <FacadePage>
      <Story
        id="rainscreen"
        ground="light"
        label="The rainscreen, layer by layer"
        steps={steps}
        stage={(step) => (
          <>
            <Stage3D fallback={<img className="fc-still" src="/img/facade/panel-face.webp" alt="" />}>
              <Rig shot={RAINSCREEN_SHOTS[VIEWS[step]][compact ? 'compact' : 'wide']} />
              <RainscreenModel view={VIEWS[step]} bus={bus} />
              <LabelProjector bus={bus} />
            </Stage3D>
            <Labels bus={bus} labels={LABELS} shown={SHOWN[step]} />
          </>
        )}
      />
      <Bridge />
      <Lengths />
      <SystemsNav current="rainscreen" />
    </FacadePage>
  )
}

/** the client's positioning: the best of composite panels and of GRC / UHPC (site map), as one statement */
function Bridge() {
  const [ref, inView] = useInView<HTMLElement>()
  return (
    <section ref={ref} className={`fc-band fc-reveal on-black ${inView ? 'is-in' : ''}`} aria-labelledby="bridge-title">
      <div className="fc-bridge">
        <Words id="bridge-title" lines={['Bridging composite', 'and concrete.']} />
        <div className="fc-bridge__text">
          <p className="fc-lede fc-rv">
            ACP and metal composite panels are light and simple to engineer, but they are not concrete. GRC and UHPC give a concrete face,
            yet their weight and engineering cost often decide against them.
          </p>
          <p className="fc-lede fc-rv" style={{ '--i': 1 } as CSSProperties}>
            RTARIUM rainscreen sets out to close that gap: thin concrete panels, reinforced by one 3D mesh instead of fibres.
          </p>
          <ReviewNote>{REVIEW.composite}</ReviewNote>
        </div>
      </div>
    </section>
  )
}

const RUN = 40
const OPTIONS = [4, 5, 8] as const

/** the panel sizes the client names, drawn to scale along one 40 m elevation */
function Lengths() {
  const [ref, inView] = useInView<HTMLElement>()
  const [len, setLen] = useState<(typeof OPTIONS)[number]>(5)
  const count = RUN / len
  const joints = count - 1
  const W = 1000
  const scale = W / RUN
  return (
    <section ref={ref} className={`fc-band fc-reveal on-yellow ${inView ? 'is-in' : ''}`} aria-labelledby="lengths-title">
      <div className="fc-lengths">
        <header className="fc-band__head">
          <Words id="lengths-title" lines={['Long panels,', 'fewer joints.']} />
          <p className="fc-lede fc-rv">
            RTARIUM rainscreen panels can be made in <span className="num">4</span>, <span className="num">5</span> and{' '}
            <span className="num">8 m</span> sizes. Along a <span className="num">40 m</span> elevation, the longer the panel, the fewer
            vertical joints in each row.
          </p>
          <ReviewNote>{REVIEW.panelSizes}</ReviewNote>
        </header>
        <div className="fc-seg fc-rv" role="group" aria-label="Panel length">
          {OPTIONS.map((o) => (
            <button key={o} type="button" aria-pressed={len === o} onClick={() => setLen(o)}>
              <span className="num">{o} m</span>
            </button>
          ))}
        </div>
        <figure className="fc-elev fc-rv" style={{ '--i': 1 } as CSSProperties}>
          <svg viewBox={`0 0 ${W} 150`} role="img" aria-label={`${count} panels of ${len} m along 40 m: ${joints} vertical joints per row`}>
            <g className="fc-elev__dim">
              <line x1="0" y1="18" x2={W} y2="18" />
              <line x1="0.75" y1="10" x2="0.75" y2="26" />
              <line x1={W - 0.75} y1="10" x2={W - 0.75} y2="26" />
            </g>
            <text x={W / 2} y="12" className="fc-elev__label" textAnchor="middle">
              40 m
            </text>
            {Array.from({ length: count }, (_, i) => (
              <g key={`${len}-${i}`} className="fc-elev__panel" style={{ '--k': i } as CSSProperties}>
                <rect x={i * len * scale + 2} y="42" width={len * scale - 4} height="62" />
                <text x={i * len * scale + (len * scale) / 2} y="80" textAnchor="middle">
                  {len} m
                </text>
              </g>
            ))}
          </svg>
          <figcaption className="fc-elev__read">
            <span className="fc-elev__big num">{joints}</span>
            <span>
              vertical joints per row with <span className="num">{len} m</span> panels
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
