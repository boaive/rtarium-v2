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
  construction: ['15 mm RTARIUM mesh', '7.5 mm concrete cover, both sides', 'Ferrule inserts at set intervals, for fixing', 'Tie holes, 20 mm, through: to lift by', 'Male / female joint, all four sides'],
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
  usp: 'Insulated at the core. Two thin concrete leaves, RTARIUM in each. Stay-in-place. Custom lengths.',
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
    'GI tie-clips join two meshes with concrete',
    '3 mm GRP rods: along, 100 mm in, through the clips; across at each clip',
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

/** A smarter approach to wall systems: the client's points in six slides (weld-free and rust-proof in one, owner 2 Nov 2026), the name and the line each */
export interface Answer {
  id: string
  /** the name as it is set, in two lines (each short enough for the words' column) */
  head: [string, string]
  /** its cell in the bar */
  bar: string
  line: string
}
export const ANSWERS: Answer[] = [
  { id: 'span', head: ['Span further with', 'thinner panels.'], bar: 'Span further', line: '30 mm solid panels span 5.8 m column bays while maintaining deflection control.' },
  { id: 'weld', head: ['Prevent corrosion', 'with basalt.'], bar: 'Prevent corrosion', line: 'Made with inert basalt, with ferrule inserts cast in at the factory.' },
  { id: 'bolt', head: ['Assemble', 'without welding.'], bar: 'Assemble', line: 'Lift the panels using their tie holes, clamp them and bolt them to the frame. No welding required.' },
  { id: 'joint', head: ['Align panels with', 'interlocking joints.'], bar: 'Align panels', line: 'A four-sided tongue-and-groove system aligns each panel and distributes horizontal wind shear.' },
  { id: 'zoned', head: ['Match materials', 'to each zone.'], bar: 'Match materials', line: 'Use insulated panels in climate-controlled zones below and thin solid panels above to maintain clear height.' },
  { id: 'space', head: ['Create more', 'usable floor space.'], bar: 'Floor space', line: 'Slender walls free up floor space for automated racking and routing tracks.' },
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
    line: 'A single-storey home: vertical SIP walls, a lintel over every opening.',
    still: { src: '/img/walls/streams/housing.webp', alt: 'The single-storey home built in 3D: vertical RTARIUM SIP walls, horizontal lintel panels over the door and windows, a flat roof drawn over them' },
  },
  {
    id: 'industrial',
    name: 'Industrial building',
    head: ['Industrial', 'building'],
    line: 'A logistics hub: SIP to 3.7 m, 30 mm solid above, three loading bays.',
    still: { src: '/img/walls/streams/hub.webp', alt: 'The logistics hub built in 3D: anthracite SIP panels below, light grey solid panels above, three loading bays and an access door in its front, a shutter in its side' },
  },
  {
    id: 'frame',
    name: 'Frame structure',
    head: ['Frame', 'structure'],
    line: 'An RC frame infilled, or a steel portal clad.',
    still: { src: '/img/walls/streams/frame.webp', alt: 'A G+3 RC frame built in 3D, its bays infilled with RTARIUM panels, a window in each' },
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
    brief: 'An affordable home, 7.2 × 6.2 m: one storey on a 150 mm slab, its walls of vertical RTARIUM SIP panels, a flat roof, a bedroom closed by a partition.',
    challenge: 'Homes that go up quickly with a small crew, stay dry and last without rust or rot, built in numbers to one layout.',
    wall: [
      '100 mm SIP panels, 600 mm wide, standing vertical, 3.0 m, slid into a 100 mm U-track: insulated, concrete faces inside and out',
      'Over the door and windows a steel lintel, and on it panels laid horizontal: the lintel; under the windows, short vertical panels',
      'Walls without an opening: full-height vertical panels; a top track round the heads, the flat roof on it',
      'The partition: 30 mm panels on both sides of a 40 mm light-gauge stud, the void for plumbing and wiring',
    ],
    sequence: ['Cast the slab and set out the U-track', 'The front wall: vertical panels, the steel lintels over the door and windows, the horizontal panels on them', 'The back and side walls; the top track round their heads; the flat roof’s joists', 'The partition: one side, the services in the void, the other side; then the doors and windows'],
    needs: ['A level slab, true to the wall lines', 'A small hoist: a 3 m SIP panel 600 mm wide weighs about 133 kg (74 kg/m²)', 'M8 bolts, the U-track and top track, a steel lintel for each opening', 'Openings fixed in the layout before the panels are cast'],
    pros: ['Dry, bolted walls: no welding, no wet trades for the walls', 'Insulated all round, concrete faces inside and out', 'Basalt reinforcement: nothing to rust', 'Fire-rated, non-magnetic', 'One layout, panels made to the millimetre'],
    limits: ['The roof is designed for each site', 'Openings are planned before casting', 'Thermal and acoustic figures for the SIP panel are not yet published', 'Joints are sealed on site'],
  },
  hub: {
    title: 'A logistics hub',
    brief: 'A 34.8 × 24 m logistics hub on a steel frame: six 5.8 m bays, 8 m walls, three loading bays and an access door on its front, a shutter in its side.',
    challenge: 'A conditioned working zone at the docks, a tall clear height above it for racking, and an envelope that goes up fast without welding.',
    wall: ['100 mm SIP panels, vertical, to 3.6 m, slid into a 100 mm U-track: the conditioned zone', 'A steel beam on them with a U-track on top (3.7 m); 30 mm solid panels above, vertical, to 8 m, their outer faces flush, fixed back to light-gauge studs', 'Over the loading bays (2.4 m), the access door (2.1 m) and the shutter (3.1 m): a steel lintel and panels laid horizontal', 'The roof inside the walls, on the steel frame'],
    sequence: ['The steel frame: columns, rafters, gable posts', 'One bay: the U-track, the SIP panels, the steel beam, the solid panels above', 'The loading face and the side wall: each opening under its lintel', 'The back and the other side; the doors, the shutter, the dock shelters'],
    needs: ['Columns or posts at up to 5.8 m centres', 'A levelled base for the U-track', 'A crane or telehandler, lifting by the tie holes', 'M8 bolts, the steel beam and a lintel for each opening'],
    pros: ['Hyper-slender 30 mm panels cross 5.8 m bays', 'Insulation only where the conditioned zone needs it', 'Weld-free, bolted assembly', 'High impact resistance at the working level', 'Non-magnetic, rust-proof, fire-rated; no out-dusting'],
    limits: ['Bays over 5.8 m need intermediate posts', 'The panels clad the frame; the frame carries the building', 'Thermal figures for the SIP panel are not yet published', 'Joints are sealed on site'],
  },
  rc: {
    title: 'An RC frame, infilled',
    brief: 'A G+3 reinforced-concrete frame, four 5.8 m bays by two (23.2 × 11.6 m), 3.45 m storeys: its walls are RTARIUM SIP infill, set within the frame.',
    challenge: 'Infill walls that are thin, light and dry, set storey by storey once the frame is up, with a window in every bay.',
    wall: ['100 mm SIP panels, vertical, from the slab to the beam’s soffit in a U-track, column face to column face', 'Their outer face on the columns’ face; a window in every bay (1.8 × 1.5 m): a steel lintel over it carries the horizontal panel above, short vertical panels under it', 'Bolted to plates cast in the columns', 'A sealed movement joint under every beam'],
    sequence: ['The RC frame: columns, beams, slabs and the stair core', 'One infill: its U-track, the vertical panels slab to beam, the window’s steel lintel and the panel on it', 'The front, floor by floor from the ground', 'The other faces; then the windows set'],
    needs: ['Up to 5.8 m between column faces', 'Slab edges and beam soffits true to line', 'Plates cast in the columns for the bolts', 'Lifting by the panels’ tie holes'],
    pros: ['Thin, light infill: 74 kg/m²', 'More floor inside the same frame', 'Dry, bolted, made to the millimetre', 'Rust-proof, fire-rated, non-magnetic'],
    limits: ['Infill only: the frame carries the floors', 'Openings are planned before casting', 'Fire, thermal and acoustic ratings to be confirmed for each project', 'Joints are sealed on site'],
  },
  peb: {
    title: 'A steel portal, clad',
    brief: 'A pre-engineered steel portal on the same footprint as the RC frame: four 5.8 m bays by an 11.6 m span, 7.2 m to the eaves; tapered columns and rafters, purlins and bracing.',
    challenge: 'A steel building walled in solid concrete outside its frame, without a weld on the steel.',
    wall: ['Panels outside the frame, vertical', '100 mm SIP to 3.6 m in a U-track, a steel beam with its U-track (3.7 m), 30 mm solid above on light-gauge studs to the eaves', 'A steel lintel and a horizontal panel over the shutter (3.1 m) and the access door (2.1 m)', 'The gables’ solid panels each cut to the roof’s pitch'],
    sequence: ['The steel portal: tapered columns and rafters, purlins, bracing', 'One bay of the side wall, outside the frame', 'The side wall, bay by bay: its shutter and access door', 'The back and the gables, cut to the pitch; the roof sheeted'],
    needs: ['Portals at up to 5.8 m centres', 'Light-gauge studs over the steel beam', 'A crane, lifting by the tie holes', 'M8 bolts and cleats'],
    pros: ['A concrete wall on a steel frame, bolted, no welding', 'Panels outside the frame: the steel stays inside, dry', 'Insulated where needed, solid above', 'Rust-proof, fire-rated, non-magnetic'],
    limits: ['The portal is designed for the panels’ weight (70–74 kg/m²)', 'Bays over 5.8 m need intermediate posts', 'Thermal figures for the SIP panel are not yet published', 'Joints are sealed on site'],
  },
}
