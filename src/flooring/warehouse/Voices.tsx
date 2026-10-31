import { useMemo, useRef } from 'react'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus } from '../../facade/three/kit'
import { useLive } from '../../facade/unitized/live'
import { CARBON_BAND, Voices as Ledger, type Band } from '../data/Voices'
import { BuildUp } from './three/BuildUp'

/**
 * Specified. Approved. Built.: the Data & AI Centres ledger on warm white, with the client's three
 * messages to the market, then the sustainability win on black, its carbon meter winding down. An open
 * band is a spread: whose it is and the message on the left, large; on the right what backs it, the
 * floor's build-up turning in 3D for the consultant, the aisle for the owner, the site for the contractor.
 */

/* The client's three messages, word for word, split at their first sentence as the ledger sets them; then the sustainability win. */
const BANDS: Band[] = [
  {
    id: 'consultant',
    role: 'Consultant & Engineer',
    head: 'Specify maximum structural toughness.',
    line: 'A high-ductility, jointless floor matrix that eliminates reflective cracking over dynamic PT and SFRC slabs while comfortably achieving demanding TR34 DM1 flatness specs.',
    media: { kind: '3d' },
  },
  {
    id: 'owner',
    role: 'Logistics Developer & Owner',
    head: 'Maximize warehouse uptime.',
    line: 'Eliminate wheel-shattering joint failures, surface spalling, and alignment-killing ruts. A continuous, abrasion-resistant system engineered for endless 24/7 robotic cycles.',
    media: { kind: 'photo', src: '/img/flooring/aw-lgv-aisle.webp', alt: 'Laser-guided trucks in a narrow aisle between towering racks, on a smooth floor', pos: '50% 60%' },
  },
  {
    id: 'contractor',
    role: 'Concrete Flooring Contractor',
    head: 'Unmatched execution speed.',
    line: 'A self-consolidating, high-fluidity 800 mm slump mix that easily pumps through a lightweight, rust-proof 3D basalt grid — drastically cutting labor hours and eliminating joint-cutting steps.',
    media: { kind: 'photo', src: '/img/flooring/aw-site-pour.webp', alt: 'RTARIUM on site: a crew pumping self-levelling concrete through a hose onto the mesh', pos: '60% 50%' },
  },
  CARBON_BAND,
]

const LABELS: LabelSpec[] = [
  { id: 'coat', anchor: 'bw-coat', text: 'Resin wear coat', dx: 56, dy: -70 },
  { id: 'mesh', anchor: 'bw-mesh', text: 'RTARIUM, 10 mm', dx: -50, dy: -84 },
  { id: 'screed', anchor: 'bw-screed', text: '20 mm screed', dx: -56, dy: 64 },
  { id: 'slab', anchor: 'bw-slab', text: 'PT or SFRC slab', dx: 50, dy: 64 },
]

function Model() {
  const host = useRef<HTMLDivElement>(null)
  const live = useLive(host)
  const bus = useMemo(createBus, [])
  return (
    <div ref={host} className="fdc-v__model" aria-hidden="true">
      <Stage3D shadows keyLight={false}>
        <BuildUp bus={bus} live={live} />
        <LabelProjector bus={bus} bottom={12} />
      </Stage3D>
      <Labels bus={bus} labels={LABELS} shown={LABELS.map((l) => l.id)} />
    </div>
  )
}

export function Voices() {
  return <Ledger bands={BANDS} model={<Model />} />
}
