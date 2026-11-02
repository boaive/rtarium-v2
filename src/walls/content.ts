/**
 * Wall Panels: the one page's copy and figures. Everything here is the client's (the wall-panel brief
 * of 2 Nov 2026, and the 100 mm panel's section, plan and tie-plate sketches of 28 Oct 2026) or the
 * owner's answers; where the page has to draw something the client has not given (the 30 mm panel's
 * ferrule spacing and joint size, the case studies), `REVIEW` says so beside it under `?review`.
 */

export const WALLS = { path: '/wall-panels', title: 'Wall Panels' } as const

/** the two panels, as the client gives them (m and mm as published) */
export const SOLID = {
  name: 'Solid panel',
  thick: 30,
  width: 600,
  length: 5.8,
  usp: 'High impact resistant. Thin, blind-mountable panels. Durable. Custom lengths.',
  construction: ['15 mm RTARIUM mesh', '7.5 mm concrete cover, both sides', 'Ferrule inserts at set intervals', 'Male / female joint, all four sides'],
  dimensions: [
    ['Thickness', '30', 'mm'],
    ['Width', '600', 'mm'],
    ['Length', 'Up to 5.8', 'm'],
  ],
  dynamics: [
    ['Dry density', '2,350', 'kg/m³'],
    ['Panel weight', '70', 'kg/m²'],
    ['Ferrule', 'M8 / 10 mm', 'insert'],
    ['Load snapping limit', '125', 'kg per point'],
  ],
} as const

export const PAIRED = {
  /** a SIP: the core is stay-in-place, the form the two leaves are cast against, and stays in as the insulation */
  name: 'SIP insulated panel',
  kind: 'Stay-in-place',
  thick: 100,
  width: 600,
  length: 5.8,
  /** the client's layout, outside in */
  layers: [
    ['Concrete cover', 7],
    ['RTARIUM', 6],
    ['Concrete cover', 2],
    ['EPS/SPS core', 70],
    ['Concrete cover', 2],
    ['RTARIUM', 6],
    ['Concrete cover', 7],
  ] as [string, number][],
  construction: [
    '15 mm concrete leaf, both sides',
    '70 mm EPS/SPS core in the centre, stay-in-place',
    '7 + 6 RTARIUM + 2 | 70 EPS/SPS | 2 + 6 RTARIUM + 7',
    'GI tie-clips join the two meshes',
    '3 mm GRP rods secure the tie-clips',
    '20 mm male / female recess in the core',
  ],
  dimensions: [
    ['Thickness', '100', 'mm'],
    ['Width', '600', 'mm'],
    ['Length', 'Up to 5.8', 'm'],
  ],
  dynamics: [
    ['Dry density', '2,350', 'kg/m³'],
    ['Panel weight', '74', 'kg/m²'],
    ['Ferrule', 'M8 / 10 mm', 'insert'],
    ['Load snapping limit', '72', 'kg per point'],
  ],
} as const

/** Built for the envelope: the client's points in six slides (weld-free and rust-proof in one, owner 2 Nov 2026), the name and the line each */
export interface Answer {
  id: string
  /** the name as it is set, in two lines (each short enough for the words' column) */
  head: [string, string]
  /** its cell in the bar */
  bar: string
  line: string
}
export const ANSWERS: Answer[] = [
  { id: 'span', head: ['Massive', 'spanning'], bar: 'Spanning', line: 'Hyper-slender 30 mm solid panels cross 5.8 m column bays with absolute deflection control.' },
  {
    id: 'weld',
    head: ['Rust-free,', 'weld-free.'],
    bar: 'Rust-free, weld-free',
    line: 'Inert basalt: no galvanic corrosion. Threaded ferrule inserts, fixed on the RTARIUM and cast in at the factory.',
  },
  { id: 'bolt', head: ['Bolt-down', 'assembly'], bar: 'Bolt-down', line: 'Lifted by its ferrules, bolted through its tie holes: immediate, high-velocity assembly.' },
  { id: 'joint', head: ['Interlocking', 'geometry'], bar: 'Interlocking', line: 'A four-sided tongue and groove aligns every panel and spreads horizontal wind shear.' },
  { id: 'zoned', head: ['Zoned capex', 'optimisation'], bar: 'Zoned capex', line: 'Insulated panels for the climate-controlled zone below, thin solid panels for the clear height above.' },
  { id: 'space', head: ['Maximised', 'internal space'], bar: 'Internal space', line: 'Slender walls give the floor back to automated racking and routing tracks.' },
]

/** the streams: each one's building, drawn as the panels go onto it; its card shows a still of that build, finished (owner: our own renders, no stock photographs) */
export type StreamId = 'housing' | 'industrial' | 'frame'
export interface Stream {
  id: StreamId
  name: string
  /** the name as it is set, in two lines, so the three start on one line */
  head: [string, string]
  line: string
  still: { src: string; alt: string }
}
export const STREAMS: Stream[] = [
  {
    id: 'housing',
    name: 'Affordable housing',
    head: ['Affordable', 'housing'],
    line: 'A single-storey home of storey-high SIP panels, on its slab.',
    still: { src: '/img/walls/streams/housing.webp', alt: 'The single-storey home built in 3D: storey-high RTARIUM panels on a slab, a pitched roof drawn over them' },
  },
  {
    id: 'industrial',
    name: 'Industrial building',
    head: ['Industrial', 'building'],
    line: 'A logistics hub: insulated to the docks’ head, solid above.',
    still: { src: '/img/walls/streams/hub.webp', alt: 'The logistics hub built in 3D: RTARIUM panels round a steel frame, four dock doors on its front' },
  },
  {
    id: 'frame',
    name: 'Frame structure',
    head: ['Frame', 'structure'],
    line: 'An RC frame infilled, or a steel portal clad.',
    still: { src: '/img/walls/streams/frame.webp', alt: 'A G+3 RC frame built in 3D, its bays infilled with RTARIUM panels' },
  },
]

/** open questions shown beside a figure when the page is opened with `?review` */
export const REVIEW = {
  core: 'The client\'s brief says "70mm XPS core"; the section sketch says "70mm THK EPS/SPS". Published as EPS/SPS (owner, 2 Nov 2026).',
  caseStudy: 'Illustrative case study, drafted from the brief\'s figures (owner, 2 Nov 2026); its quantities are computed from the 3D building and the panels\' own figures. No programme, cost or result is given by the client, so none is claimed. Review before publishing.',
}

/**
 * The case studies, one for each build, as illustrative case studies (owner, 2 Nov 2026): the brief, the challenge,
 * the RTARIUM wall, the quantities (computed from the 3D building and the panels' own figures), how it goes up, a
 * drawing, a still of the build, what it needs, its advantages and its limits. No programme, cost or result is
 * claimed: none is given by the client; see REVIEW.caseStudy.
 */
export interface CaseStudy {
  title: string
  brief: string
  challenge: string
  wall: string[]
  sequence: string[]
  needs: string[]
  pros: string[]
  limits: string[]
}
export const CASES: Record<'housing' | 'hub' | 'rc' | 'peb', CaseStudy> = {
  housing: {
    title: 'A single-storey home',
    brief: 'An affordable home, 7.2 × 6.2 m: one storey on a 150 mm slab, its walls of storey-high RTARIUM panels, a pitched roof on light trusses.',
    challenge: 'Homes that go up quickly with a small crew, stay dry and last without rust or rot, built in numbers to one layout.',
    wall: [
      'Storey-high 100 mm SIP panels, 600 mm wide, all round: insulated, with concrete faces inside and out',
      'The door and windows left in the panel layout: no wall is cut on site',
      'Light steel posts at the corners and the door, a light steel ring beam on top',
      'Each panel lifted by its ferrule inserts and bolted through its tie holes',
    ],
    sequence: ['Cast the slab and set out the wall lines', 'Stand the light steel posts and the ring beam', 'Stand the panels, tongue into groove, and bolt them through their tie holes', 'Lift the trusses onto the ring beam, sheet the roof, hang the door and windows'],
    needs: ['A level slab, true to the wall lines', 'A small hoist: a 3 m SIP panel 600 mm wide weighs about 133 kg (74 kg/m²)', 'M8 bolts, the light steel posts and ring beam', 'Openings fixed in the layout before the panels are cast'],
    pros: ['Dry, bolted walls: no welding, no wet trades for the walls', 'Insulated all round, concrete faces inside and out', 'Basalt reinforcement: nothing to rust', 'Fire-rated, non-magnetic', 'One layout, panels made to the millimetre'],
    limits: ['The light steel frame and the roof are designed for each site', 'Openings are planned before casting', 'Thermal and acoustic figures for the SIP panel are not yet published', 'Joints are sealed on site'],
  },
  hub: {
    title: 'A logistics hub',
    brief: 'A 34.8 × 24 m logistics hub on a steel frame: six 5.8 m bays, 9 m to the eaves, four dock doors on its front.',
    challenge: 'A conditioned working zone at the docks, a tall clear height above it for racking, and an envelope that goes up fast without welding.',
    wall: ['100 mm SIP panels up to 4.8 m, the docks’ head: the conditioned zone', '30 mm solid panels above it, up to the eaves', 'Every course spans 5.8 m from column to column', 'The dock doors left in the panel layout'],
    sequence: ['The steel frame: columns, rafters, gable posts', 'One bay: its courses lifted by their ferrules and bolted to the columns through their tie holes', 'The dock face: SIP to the doors’ head, solid above, the doors left open', 'The back and the gables; the roof sheeted; the docks’ canopies and buffers'],
    needs: ['Columns or posts at up to 5.8 m centres', 'A levelled base for the first course', 'A crane or telehandler, lifting by the ferrule inserts', 'M8 bolts and column brackets'],
    pros: ['Hyper-slender 30 mm panels cross 5.8 m bays', 'Insulation only where the conditioned zone needs it', 'Weld-free, bolted assembly', 'High impact resistance at the working level', 'Non-magnetic, rust-proof, fire-rated; no out-dusting'],
    limits: ['Bays over 5.8 m need intermediate posts', 'The panels clad the frame; the frame carries the building', 'Thermal figures for the SIP panel are not yet published', 'Joints are sealed on site'],
  },
  rc: {
    title: 'An RC frame, infilled',
    brief: 'A G+3 reinforced-concrete frame, four 5.8 m bays by two (23.2 × 11.6 m), 3.45 m storeys: its walls are RTARIUM SIP infill, set within the frame.',
    challenge: 'Infill walls that are thin, light and dry, set storey by storey once the frame is up, with a window band in every bay.',
    wall: ['100 mm SIP courses from the slab to the beam’s soffit, from column face to column face', 'Their outer face on the columns’ face; a window band from 1.2 to 2.4 m in every bay', 'Bolted to plates cast in the columns, through the panels’ tie holes', 'A sealed movement joint under every beam'],
    sequence: ['The RC frame: columns, beams, slabs and the stair core', 'One infill: five courses in a bay, slab to beam', 'The front, floor by floor from the ground', 'The other faces; the windows set in their bands'],
    needs: ['Up to 5.8 m between column faces', 'Slab edges and beam soffits true to line', 'Plates cast in the columns for the bolts', 'Lifting by the panels’ ferrule inserts'],
    pros: ['Thin, light infill: 74 kg/m²', 'More floor inside the same frame', 'Dry, bolted, made to the millimetre', 'Rust-proof, fire-rated, non-magnetic'],
    limits: ['Infill only: the frame carries the floors', 'Openings are planned before casting', 'Fire, thermal and acoustic ratings to be confirmed for each project', 'Joints are sealed on site'],
  },
  peb: {
    title: 'A steel portal, clad',
    brief: 'A pre-engineered steel portal on the same footprint as the RC frame: four 5.8 m bays by an 11.6 m span, 7.2 m to the eaves; tapered columns and rafters, purlins, girts and bracing.',
    challenge: 'A steel building walled in solid concrete outside its frame, without a weld on the steel.',
    wall: ['Panels outside the frame, bolted to its girts and columns through their tie holes', '100 mm SIP to 3 m, 30 mm solid above to the eaves', 'Courses span 5.8 m from portal to portal', 'The gables span 5.8 m to a wind post at their middle'],
    sequence: ['The steel portal: tapered columns and rafters, purlins, girts, bracing', 'One bay of the side wall, outside the girts', 'The side wall, bay by bay, a door left in its middle bay', 'The back and the gables; the roof sheeted'],
    needs: ['Portals at up to 5.8 m centres', 'Girts set out to the panels’ courses', 'A crane, lifting by the ferrule inserts', 'M8 bolts and cleats on the girts'],
    pros: ['A concrete wall on a steel frame, bolted, no welding', 'Panels outside the frame: the steel stays inside, dry', 'Insulated where needed, solid above', 'Rust-proof, fire-rated, non-magnetic'],
    limits: ['The portal is designed for the panels’ weight (70–74 kg/m²)', 'Bays over 5.8 m need intermediate posts', 'Thermal figures for the SIP panel are not yet published', 'Joints are sealed on site'],
  },
}
