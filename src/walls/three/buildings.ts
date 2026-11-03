import { Lines } from '../../flooring/data/three/dc'
import type { Box } from './fit'

/**
 * The streams' buildings, as the Unitized page's slab to slab and the Data & AI Centres page's frame to floor draw
 * theirs: everything round the panels is a drawing (black lines), the panels are in their own concrete. Each build
 * goes up as it would on site: the frame first (nothing is hung before what it is fixed to); then ONE wall's panels,
 * close; then the panels where the building needs them; then the rest, and the finish. The RC frame and the steel
 * portal stand on one footprint and one bay grid (4 x 2 bays of 5.8 m).
 *
 * The panels stand VERTICAL, 600 mm wide, the client's rule (3 Nov 2026): over an opening, panels laid HORIZONTAL span
 * it and one panel either side, as its lintel, and under a window horizontal panels make its sill; the panels either side
 * of an opening stop at its head. The 100 mm SIP panels slide into a 100 mm U-track at their foot. In the industrial
 * builds the SIP zone is topped by an inverted beam, and the 30 mm solid panels above it are fixed to light-gauge studs.
 *
 *   housing  a single-storey affordable home: 3.0 m vertical SIP walls on a slab, door and windows framed by lintel
 *            and sill panels, the gables' panels cut to the roof's slope, SIP roof panels along the trusses; an internal
 *            partition of 30 mm panels on both sides of a 40 mm light-gauge stud (its void for plumbing and wiring)
 *   hub      a logistics hub on a steel frame, six 5.8 m bays, 8.0 m to the eaves: 100 mm SIP to 3.7 m on its U-track,
 *            the inverted beam, 30 mm solid above on light-gauge studs; two loading bays (2.4 m) and an access door
 *            (2.1 m) on its front, a shutter (3.1 m) in its gable
 *   rc       a G+3 reinforced-concrete frame on a 5.8 m grid: vertical SIP infill within the frame, slab to beam, column
 *            face to column face, a window in every bay with its lintel and sill
 *   peb      a pre-engineered steel portal: tapered columns and rafters, purlins, bracing; the panels outside the frame:
 *            SIP to 3.7 m, the inverted beam, 30 mm solid above on studs to the eaves, the gables cut to the roof
 */

export type Kind = 'sip' | 'solid'
export type BuildId = 'housing' | 'hub' | 'rc' | 'peb'
type V = [number, number, number]
export interface Slab {
  a: V
  b: V
  kind: Kind
  /** the step it goes up in: 1 the first wall, 2 as the building needs, 3 the rest (0 is the frame's) */
  step: number
  /** a panel cut to a slope at its top (a gable's): its top's height at its low end and at its high end along the wall */
  cut?: { axis: 'x' | 'z'; y0: number; y1: number }
  /** a roof panel: the box a..b, turned about x through its middle by this angle (rad) */
  tilt?: number
}
export interface Mark {
  id: string
  text: string
  at: V
  dx: number
  dy: number
  /** the step it is shown in */
  step: number
}
export interface Building {
  id: BuildId
  /** the structure, drawn first, out from where the first wall will be */
  frame: Lines
  /** what is drawn once the walls are up: roof, doors, windows, docks */
  finish: Lines
  panels: Slab[]
  /** the first wall (the opening view frames it) and the whole building */
  first: Box
  box: Box
  /** where the frame is drawn out from */
  origin: V
  steps: [string, string, string, string]
  marks: Mark[]
  /** the opening view's and the whole view's angles (azimuth, elevation) */
  views: { first: [number, number]; whole: [number, number] }
}

export const T = { sip: 0.1, solid: 0.03 }
const C = 0.6
/** half a joint between two panels (m) */
const J = 0.004

interface Hole {
  /** along the wall */
  u0: number
  u1: number
  /** up the wall */
  y0: number
  y1: number
}

/** a wall's run of panels: along x (or z) from u0 to u1, from y0 up to y1, its face on the plane w, its thickness on the
 *  side `dir` points to; its openings; and, for a gable, the height its top is cut to along it */
interface Run {
  axis: 'x' | 'z'
  w: number
  dir: 1 | -1
  u0: number
  u1: number
  y0: number
  y1: number
  kind: Kind
  step: (u: number) => number
  holes?: Hole[]
  top?: (u: number) => number
}

/**
 * The client's rule: panels VERTICAL, 600 mm wide, from y0 to y1 (a gable's cut to its slope). Over each opening,
 * HORIZONTAL panels span it and one panel either side, from its head up: its lintel; under a window, horizontal panels
 * from the foot to its sill. The panel either side of an opening stops at its head (the lintel bears on it).
 */
function verticals(out: Slab[], o: Run) {
  const t = T[o.kind]
  const [w0, w1] = [Math.min(o.w, o.w + o.dir * t), Math.max(o.w, o.w + o.dir * t)]
  const put = (a: number, b: number, y0: number, y1: number, cut?: [number, number]) => {
    const step = o.step((a + b) / 2)
    // (a fine joint round every panel, so each one reads)
    ;[a, b, y0, y1] = [a + J, b - J, y0 + J, y1 - J]
    if (cut) cut = [cut[0] - J, cut[1] - J]
    const s: Slab = o.axis === 'x' ? { a: [a, y0, w0], b: [b, y1, w1], kind: o.kind, step } : { a: [w0, y0, a], b: [w1, y1, b], kind: o.kind, step }
    if (cut) s.cut = { axis: o.axis, y0: cut[0], y1: cut[1] }
    out.push(s)
  }
  const holes = o.holes ?? []
  for (let a = o.u0; a < o.u1 - 0.05; a += C) {
    const b = Math.min(o.u1, a + C)
    const m = (a + b) / 2
    if (holes.some((h) => m > h.u0 && m < h.u1)) continue
    const bear = holes.find((h) => (m > h.u0 - C && m < h.u0) || (m > h.u1 && m < h.u1 + C))
    if (bear) put(a, b, o.y0, bear.y1)
    else if (o.top) {
      const [ya, yb] = [o.top(a), o.top(b)]
      put(a, b, o.y0, Math.max(ya, yb), [ya, yb])
    } else put(a, b, o.y0, o.y1)
  }
  for (const h of holes) {
    for (let y = h.y1; y < o.y1 - 0.05; y += C) put(Math.max(o.u0, h.u0 - C), Math.min(o.u1, h.u1 + C), y, Math.min(o.y1, y + C))
    for (let y = o.y0; y < h.y0 - 0.05; y += C) put(h.u0, h.u1, y, Math.min(h.y0, y + C))
  }
}

/** the 100 mm U-track a run of SIP panels slides into, at its foot (a channel round the panel's thickness), broken at doors */
function uTrack(L: Lines, o: { axis: 'x' | 'z'; w: number; dir: 1 | -1; u0: number; u1: number; y0: number }, holes: Hole[] = []) {
  const t = T.sip
  const [w0, w1] = [Math.min(o.w, o.w + o.dir * t) - 0.006, Math.max(o.w, o.w + o.dir * t) + 0.006]
  let runs: [number, number][] = [[o.u0, o.u1]]
  for (const h of holes.filter((x) => x.y0 <= o.y0 + 1e-6))
    runs = runs.flatMap(([a, b]) => (h.u1 <= a || h.u0 >= b ? [[a, b]] : ([[a, h.u0], [h.u1, b]] as [number, number][]).filter(([p, q]) => q - p > 0.05)))
  for (const [a, b] of runs) L.box(o.axis === 'x' ? [a, o.y0, w0] : [w0, o.y0, a], o.axis === 'x' ? [b, o.y0 + 0.06, w1] : [w1, o.y0 + 0.06, b])
}

/** light-gauge studs, every 1.2 m along a wall from y0 up to y1 (or its gable's top), just inside its panels' inner face */
function studs(L: Lines, o: { axis: 'x' | 'z'; w: number; dir: 1 | -1; u0: number; u1: number; y0: number; y1: number; top?: (u: number) => number; skip?: number[] }) {
  for (const u of along(o.u0, o.u1, 1.2).slice(1, -1)) {
    if (o.skip?.some((s) => Math.abs(s - u) < 0.3)) continue
    const y1 = o.top ? o.top(u) : o.y1
    const [w0, w1] = o.dir > 0 ? [o.w - 0.1, o.w] : [o.w, o.w + 0.1]
    L.box(o.axis === 'x' ? [u - 0.025, o.y0, w0] : [w0, o.y0, u - 0.025], o.axis === 'x' ? [u + 0.025, y1, w1] : [w1, y1, u + 0.025])
  }
}

/** the inverted beam topping a wall's SIP zone, column to column, just inside its panels' inner face */
function invertedBeam(L: Lines, o: { axis: 'x' | 'z'; w: number; dir: 1 | -1; u0: number; u1: number; y: number }) {
  const [w0, w1] = o.dir > 0 ? [o.w - 0.25, o.w] : [o.w, o.w + 0.25]
  L.box(o.axis === 'x' ? [o.u0, o.y - 0.3, w0] : [w0, o.y - 0.3, o.u0], o.axis === 'x' ? [o.u1, o.y, w1] : [w1, o.y, o.u1])
}

/** a steel I-column, its web along z (or x), drawn as its two flanges and web line */
function iColumn(L: Lines, x: number, z: number, y0: number, y1: number, b: number, d: number, along: 'x' | 'z' = 'z') {
  const [hx, hz] = along === 'z' ? [b / 2, d / 2] : [d / 2, b / 2]
  if (along === 'z') {
    L.box([x - hx, y0, z - hz], [x + hx, y1, z - hz + 0.015])
    L.box([x - hx, y0, z + hz - 0.015], [x + hx, y1, z + hz])
    L.seg([x, y0, z - hz], [x, y0, z + hz])
    L.seg([x, y1, z - hz], [x, y1, z + hz])
  } else {
    L.box([x - hx, y0, z - hz], [x - hx + 0.015, y1, z + hz])
    L.box([x + hx - 0.015, y0, z - hz], [x + hx, y1, z + hz])
    L.seg([x - hx, y0, z], [x + hx, y0, z])
    L.seg([x - hx, y1, z], [x + hx, y1, z])
  }
}

/** a door or window's frame in a wall on the plane w (x along, or z along), a cross for a door's leaf */
function opening(L: Lines, axis: 'x' | 'z', w: number, h: Hole, door = false) {
  const p = (u: number, y: number): V => (axis === 'x' ? [u, y, w] : [w, y, u])
  L.seg(p(h.u0, h.y0), p(h.u1, h.y0))
  L.seg(p(h.u1, h.y0), p(h.u1, h.y1))
  L.seg(p(h.u1, h.y1), p(h.u0, h.y1))
  L.seg(p(h.u0, h.y1), p(h.u0, h.y0))
  if (door) {
    const m = (h.u0 + h.u1) / 2
    L.seg(p(m, h.y0), p(m, h.y1))
  } else {
    L.seg(p((h.u0 + h.u1) / 2, h.y0), p((h.u0 + h.u1) / 2, h.y1))
    L.seg(p(h.u0, (h.y0 + h.y1) / 2), p(h.u1, (h.y0 + h.y1) / 2))
  }
}

/** a run of positions from a to b, every `step` (the last one at b) */
function along(a: number, b: number, step: number) {
  const n = Math.max(1, Math.round((b - a) / step))
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
}

/**
 * A single-storey affordable home: 7.2 × 6.2 m on a 150 mm slab. Its walls: vertical 100 mm SIP panels, 3.0 m, in their
 * U-track; the door and windows framed by horizontal lintel and sill panels; its gables' panels cut to the roof's slope;
 * SIP roof panels laid along its trusses. Inside, a partition: 30 mm panels both sides of a 40 mm light-gauge stud.
 */
export function housing(): Building {
  const W = 7.2
  const D = 6.2
  const H = 3.0
  const t = T.sip
  const panels: Slab[] = []
  const frame = new Lines()
  const finish = new Lines()
  frame.box([-0.15, -0.15, -0.15], [W + 0.15, 0, D + 0.15])
  // the roof: its eaves on the ring beam, its ridge along x
  const ye = H + 0.12
  const yr = ye + 1.5
  const zr = D / 2
  const theta = Math.atan((yr - ye) / zr)
  const gable = (u: number) => ye + (yr - ye) * Math.max(0, 1 - Math.abs(u - zr) / zr) - 0.04
  // the walls: the front (door and two windows), the back (two windows), the gables cut to the roof
  const door: Hole = { u0: 3.0, u1: 4.2, y0: 0, y1: 2.2 }
  const front: Hole[] = [{ u0: 0.6, u1: 1.8, y0: 0.9, y1: 2.2 }, door, { u0: 5.4, u1: 6.6, y0: 0.9, y1: 2.2 }]
  const back: Hole[] = [
    { u0: 1.2, u1: 2.4, y0: 0.9, y1: 2.2 },
    { u0: 4.8, u1: 6.0, y0: 0.9, y1: 2.2 },
  ]
  const runs: Run[] = [
    { axis: 'x', w: D, dir: -1, u0: 0, u1: W, y0: 0, y1: H, kind: 'sip', step: () => 1, holes: front },
    { axis: 'x', w: 0, dir: 1, u0: 0, u1: W, y0: 0, y1: H, kind: 'sip', step: () => 2, holes: back },
    { axis: 'z', w: 0, dir: 1, u0: t, u1: D - t, y0: 0, y1: H, kind: 'sip', step: () => 2, top: gable },
    { axis: 'z', w: W, dir: -1, u0: t, u1: D - t, y0: 0, y1: H, kind: 'sip', step: () => 2, top: gable },
  ]
  for (const r of runs) {
    verticals(panels, r)
    uTrack(frame, r, r.holes)
  }
  // the partition: 30 mm panels on both sides of a 40 mm stud, across the house, a door in it
  const px = 3.6
  const pdoor: Hole = { u0: 1.3, u1: 2.5, y0: 0, y1: 2.2 }
  for (const [w, dir] of [
    [px - 0.02, -1],
    [px + 0.02, 1],
  ] as [number, 1 | -1][])
    verticals(panels, { axis: 'z', w, dir, u0: t, u1: D - t, y0: 0, y1: H, kind: 'solid', step: () => 3, holes: [pdoor] })
  for (const z of along(t, D - t, 0.6)) if (z < pdoor.u0 - 0.05 || z > pdoor.u1 + 0.05) frame.box([px - 0.02, 0, z - 0.02], [px + 0.02, H, z + 0.02])
  frame.box([px - 0.02, 0, t], [px + 0.02, 0.04, D - t])
  frame.box([px - 0.02, H - 0.04, t], [px + 0.02, H, D - t])
  // the ring beam on the walls
  frame.box([0, H, 0], [W, H + 0.12, D])
  frame.box([t, H, t], [W - t, H + 0.12, D - t])
  // the trusses: a rafter pair, a tie, a king post and two struts, every 1.2 m
  for (const x of along(0, W, 1.2)) {
    frame.seg([x, ye, -0.3], [x, yr, zr])
    frame.seg([x, yr, zr], [x, ye, D + 0.3])
    frame.seg([x, ye, 0], [x, ye, D])
    frame.seg([x, ye, zr], [x, yr, zr])
    frame.seg([x, ye, D * 0.25], [x, ye + (yr - ye) * 0.5, zr * 0.5])
    frame.seg([x, ye, D * 0.75], [x, ye + (yr - ye) * 0.5, D - zr * 0.5])
  }
  frame.seg([0, yr, zr], [W, yr, zr])
  // the roof: SIP panels 600 wide, laid along the trusses from the eaves (300 mm over) to the ridge, both slopes
  const len = (zr + 0.3) / Math.cos(theta)
  const off = 0.06
  for (let x = -0.3; x < W + 0.3 - 0.05; x += C) {
    const xc = x + C / 2
    for (const s of [1, -1]) {
      const zc = s > 0 ? (zr - 0.3) / 2 : D - (zr - 0.3) / 2
      const yc = ye + (s > 0 ? zc : D - zc) * Math.tan(theta) + off / Math.cos(theta)
      panels.push({ a: [xc - C / 2 + J, yc - t / 2, zc - len / 2], b: [xc + C / 2 - J, yc + t / 2, zc + len / 2], kind: 'sip', step: 3, tilt: s > 0 ? -theta : theta })
    }
  }
  // the finish: the door and windows
  for (const h of front) opening(finish, 'x', D + 0.004, h, h === door)
  for (const h of back) opening(finish, 'x', -0.004, h)
  return {
    id: 'housing',
    frame,
    finish,
    panels,
    first: [
      [-0.3, 0, D - 0.4],
      [W + 0.3, H + 0.4, D + 0.3],
    ],
    box: [
      [-0.5, -0.15, -0.5],
      [W + 0.5, yr + 0.3, D + 0.5],
    ],
    origin: [W / 2, 0, D],
    steps: ['Its slab and frame', 'The front wall', 'The walls round it', 'Roof and partition'],
    marks: [
      { id: 'sip', text: '100 mm SIP, vertical, in its U-track', at: [6.9, 1.5, D], dx: 50, dy: 60, step: 1 },
      { id: 'open', text: 'Horizontal panels: the lintel and the sill', at: [door.u1 + 0.3, 2.6, D], dx: 50, dy: -80, step: 1 },
      { id: 'gable', text: 'Gable panels cut to the roof slope', at: [0, gable(zr * 0.7), zr * 0.7], dx: -50, dy: -50, step: 2 },
      { id: 'roof', text: 'SIP roof along the trusses', at: [W * 0.7, ye + (yr - ye) * 0.6, zr * 0.6], dx: 50, dy: -50, step: 3 },
      { id: 'part', text: 'Partition: 30 mm panels on a 40 mm stud, services in the void', at: [px, 2.0, D * 0.8], dx: 50, dy: 40, step: 3 },
    ],
    views: { first: [16, 8], whole: [34, 24] },
  }
}

/** a wall of an industrial build: its plane, its run, its openings, when it goes up, and its gable's top */
interface Face {
  axis: 'x' | 'z'
  w: number
  dir: 1 | -1
  u0: number
  u1: number
  holes: Hole[]
  step: (u: number) => number
  top?: (u: number) => number
}

/** an industrial wall, the client's way: SIP to the zone's top in its U-track, the inverted beam, solid above on studs */
function industrialWall(panels: Slab[], frame: Lines, f: Face, zone: number, eaves: number, posts: number[]) {
  const base = { axis: f.axis, w: f.w, dir: f.dir, u0: f.u0, u1: f.u1 }
  verticals(panels, { ...base, y0: 0, y1: zone, kind: 'sip', step: f.step, holes: f.holes })
  verticals(panels, { ...base, y0: zone, y1: eaves, kind: 'solid', step: f.step, top: f.top })
  uTrack(frame, { ...base, y0: 0 }, f.holes)
  invertedBeam(frame, { ...base, y: zone })
  studs(frame, { ...base, y0: zone, y1: eaves, top: f.top, skip: posts })
}

/**
 * A logistics hub: six 5.8 m bays (34.8 m) by 24 m, 8.0 m to the eaves on a steel frame. Every wall: vertical 100 mm SIP
 * to 3.7 m in its U-track, the inverted beam on it, vertical 30 mm solid panels above on light-gauge studs to the eaves
 * (4.3 m); the gables' cut to the roof. Two loading bays (2.4 m) and an access door (2.1 m) on the front, a shutter
 * (3.1 m) in the near gable, each with its horizontal lintel panels.
 */
export function hub(): Building {
  const N = 6
  const B = 5.8
  const W = N * B
  const D = 24
  const E = 8.0
  const ZONE = 3.7
  const R = E + 1.2
  const panels: Slab[] = []
  const frame = new Lines()
  const finish = new Lines()
  const xs = along(0, W, B)
  const zs = along(0, D, 4.8)
  for (const x of xs) {
    for (const z of [0, D]) iColumn(frame, x, z, 0, E, 0.25, 0.45)
    frame.seg([x, E, 0], [x, R, D / 2])
    frame.seg([x, R, D / 2], [x, E, D])
    frame.seg([x, E - 0.6, 0], [x, R - 0.6, D / 2])
    frame.seg([x, R - 0.6, D / 2], [x, E - 0.6, D])
  }
  const roofAt = (z: number) => E + ((R - E) * (D / 2 - Math.abs(Math.min(D, Math.max(0, z)) - D / 2))) / (D / 2)
  for (const x of [0, W]) for (const z of zs.slice(1, -1)) iColumn(frame, x, z, 0, roofAt(z), 0.2, 0.3, 'x')
  for (const z of [0, D]) frame.seg([0, E, z], [W, E, z])
  frame.seg([0, R, D / 2], [W, R, D / 2])
  for (const f of [0.25, 0.5, 0.75]) {
    frame.seg([0, E + (R - E) * f, (D / 2) * f], [W, E + (R - E) * f, (D / 2) * f])
    frame.seg([0, E + (R - E) * f, D - (D / 2) * f], [W, E + (R - E) * f, D - (D / 2) * f])
  }
  frame.box([-0.3, -0.3, -0.3], [W + 0.3, 0, D + 0.3])
  // the panels' inner face, clear of the columns' outer flanges
  const PZ = 0.23
  const PX = 0.16
  const bays: Hole[] = [
    { u0: 6.6, u1: 9.6, y0: 0, y1: 2.4 },
    { u0: 12.6, u1: 15.6, y0: 0, y1: 2.4 },
  ]
  const access: Hole = { u0: 19.8, u1: 21.0, y0: 0, y1: 2.1 }
  const shutter: Hole = { u0: 10.2, u1: 13.8, y0: 0, y1: 3.1 }
  const faces: Face[] = [
    { axis: 'x', w: D + PZ, dir: 1, u0: 0, u1: W, holes: [...bays, access], step: (u) => (u < B ? 1 : 2) },
    { axis: 'x', w: -PZ, dir: -1, u0: 0, u1: W, holes: [], step: () => 3 },
    { axis: 'z', w: -PX, dir: -1, u0: 0, u1: D, holes: [shutter], step: () => 3, top: roofAt },
    { axis: 'z', w: W + PX, dir: 1, u0: 0, u1: D, holes: [], step: () => 3, top: roofAt },
  ]
  for (const f of faces) industrialWall(panels, frame, f, ZONE, E, f.axis === 'x' ? xs : zs)
  // the finish: the roof sheeted, the openings, the loading bays' canopies and buffers, the shutter's slats
  const zf = D + PZ + T.sip + 0.004
  for (const d of bays) {
    opening(finish, 'x', zf, d, true)
    finish.box([d.u0 - 0.2, 2.7, zf], [d.u1 + 0.2, 2.8, zf + 1.4])
    for (const u of [d.u0 + 0.2, d.u1 - 0.2]) finish.box([u - 0.12, 0.9, zf], [u + 0.12, 1.3, zf + 0.12])
  }
  opening(finish, 'x', zf, access, true)
  const xf = -PX - T.sip - 0.004
  opening(finish, 'z', xf, shutter, true)
  for (const y of along(0.3, shutter.y1, 0.3)) finish.seg([xf, y, shutter.u0], [xf, y, shutter.u1])
  for (const x of along(0, W, 1.45)) {
    finish.seg([x, R + 0.05, D / 2], [x, E + 0.05, -0.15])
    finish.seg([x, R + 0.05, D / 2], [x, E + 0.05, D + 0.15])
  }
  return {
    id: 'hub',
    frame,
    finish,
    panels,
    first: [
      [-0.4, 0, D - 0.5],
      [B + 0.4, E + 0.3, D + 0.4],
    ],
    box: [
      [-0.5, -0.3, -0.5],
      [W + 0.5, R + 0.2, D + 2.0],
    ],
    origin: [B / 2, 0, D],
    steps: ['The steel frame', 'One bay', 'The loading face', 'Closed in'],
    marks: [
      { id: 'frame', text: 'Columns at 5.8 m centres', at: [2 * B, 6.5, D], dx: 50, dy: -60, step: 0 },
      { id: 'sip', text: '100 mm SIP to 3.7 m, vertical, in a 100 mm U-track', at: [B * 0.7, 1.8, D + PZ + T.sip], dx: 60, dy: 40, step: 1 },
      { id: 'beam', text: 'Inverted beam over the SIP zone', at: [B * 0.5, ZONE, D + PZ], dx: -40, dy: -50, step: 1 },
      { id: 'solid', text: '30 mm solid to the eaves, on light-gauge studs', at: [B * 0.3, 6.4, D + PZ + T.solid], dx: -40, dy: -60, step: 1 },
      { id: 'lintel', text: 'Horizontal panels over the openings: the lintels', at: [bays[1].u1, 3.0, zf], dx: 60, dy: -60, step: 2 },
    ],
    views: { first: [20, 8], whole: [32, 20] },
  }
}

/**
 * A G+3 reinforced-concrete frame on the shared footprint: four 5.8 m bays by two, 3.45 m storeys (450 mm beams),
 * 400 mm columns, a stair core. The SIP infill sits within the frame, its outer face on the columns' outer face: vertical
 * panels in their U-track from slab to beam soffit (3.0 m), column face to column face, a window in every bay (1.2 to
 * 2.4 m) with its horizontal lintel and sill panels.
 */
export function rc(): Building {
  const NX = 4
  const NZ = 2
  const B = 5.8
  const S = 3.45
  const F = 4
  const c = 0.2
  const W = NX * B
  const D = NZ * B
  const panels: Slab[] = []
  const frame = new Lines()
  const finish = new Lines()
  const xs = along(0, W, B)
  const zs = along(0, D, B)
  for (const x of xs) for (const z of zs) frame.box([x - c, 0, z - c], [x + c, F * S, z + c])
  for (let f = 1; f <= F; f++) {
    const y = f * S
    frame.box([-c, y - 0.15, -c], [W + c, y, D + c])
    for (const z of zs) frame.box([-c, y - 0.45, z - c], [W + c, y - 0.15, z + c])
    for (const x of xs) frame.box([x - c, y - 0.45, -c], [x + c, y - 0.15, D + c])
  }
  frame.box([-c - 0.3, -0.4, -c - 0.3], [W + c + 0.3, 0, D + c + 0.3])
  frame.box([B + 0.6, 0, B + 0.6], [B + 3.6, F * S + 1.2, D - 0.6])
  frame.box([-c, F * S, -c], [W + c, F * S + 1.0, D + c])
  const bays = (u: number[]) => u.slice(0, -1).map((a, i) => [a + c, u[i + 1] - c] as [number, number])
  for (let f = 0; f < F; f++) {
    const y0 = f * S
    const yt = y0 + 3.0
    const win = (a: number): Hole => ({ u0: a + 1.2, u1: a + 4.2, y0: y0 + 1.2, y1: y0 + 2.4 })
    const front = (u: number) => (f === 0 && u > B && u < 2 * B ? 1 : 2)
    for (const [a, b] of bays(xs))
      for (const [w, dir, step] of [
        [D + c, -1, front],
        [-c, 1, () => 3],
      ] as [number, 1 | -1, (u: number) => number][]) {
        const r: Run = { axis: 'x', w, dir, u0: a, u1: b, y0, y1: yt, kind: 'sip', step, holes: [win(a)] }
        verticals(panels, r)
        uTrack(frame, r)
        opening(finish, 'x', w + (dir < 0 ? 0.004 : -0.004), win(a))
      }
    for (const [a, b] of bays(zs))
      for (const x of [-c, W + c]) {
        const r: Run = { axis: 'z', w: x, dir: x < 0 ? 1 : -1, u0: a, u1: b, y0, y1: yt, kind: 'sip', step: () => 3, holes: [win(a)] }
        verticals(panels, r)
        uTrack(frame, r)
        opening(finish, 'z', x + (x < 0 ? -0.004 : 0.004), win(a))
      }
  }
  return {
    id: 'rc',
    frame,
    finish,
    panels,
    first: [
      [B - 0.5, 0, D - 0.5],
      [2 * B + 0.5, S + 0.3, D + 0.5],
    ],
    box: [
      [-0.8, -0.4, -0.8],
      [W + 0.8, F * S + 1.3, D + 0.8],
    ],
    origin: [1.5 * B, 0, D],
    steps: ['The RC frame', 'One infill', 'Floor by floor', 'Closed in'],
    marks: [
      { id: 'within', text: 'The RC frame: 5.8 m bays, 3.45 m storeys', at: [2 * B, 2 * S - 0.3, D + c], dx: 60, dy: -50, step: 0 },
      { id: 'infill', text: 'Vertical SIP within the frame, slab to beam', at: [1.5 * B - 1.6, 2.0, D + c], dx: 50, dy: -60, step: 1 },
      { id: 'band', text: 'Lintel and sill panels round every window', at: [0.5 * B + 1.5, S + 2.4, D + c], dx: -40, dy: -60, step: 2 },
    ],
    views: { first: [14, 8], whole: [36, 18] },
  }
}

/**
 * A pre-engineered steel portal on the shared footprint: four 5.8 m bays (23.2 m) by an 11.6 m span, 7.2 m to the
 * eaves. Tapered columns and rafters, Z purlins on the roof, X-bracing in the end bays, a wind post at the middle of each
 * gable. The panels outside the frame: vertical SIP to 3.7 m in its U-track, the inverted beam, 30 mm solid above on
 * light-gauge studs to the eaves, the gables' cut to the roof; a shutter in the side wall with its lintel panels.
 */
export function peb(): Building {
  const N = 4
  const B = 5.8
  const W = N * B
  const D = 2 * B
  const E = 7.2
  const R = E + 0.6
  const ZONE = 3.7
  const panels: Slab[] = []
  const frame = new Lines()
  const finish = new Lines()
  const xs = along(0, W, B)
  const out = 0.3
  const portal = (x: number) => {
    for (const [z, s] of [
      [0, 1],
      [D, -1],
    ] as [number, number][]) {
      for (const dx of [-0.09, 0.09]) {
        const X = x + dx
        frame.seg([X, 0, z], [X, E, z])
        frame.seg([X, 0, z + s * 0.3], [X, E - 0.6, z + s * 0.6])
        frame.seg([X, E, z], [X, R, D / 2])
        frame.seg([X, E - 0.6, z + s * 0.6], [X, R - 0.35, D / 2])
      }
      for (const zz of [z, z + s * 0.3]) frame.seg([x - 0.09, 0, zz], [x + 0.09, 0, zz])
    }
  }
  for (const x of xs) portal(x)
  for (const f of along(0, 1, 0.2)) {
    frame.seg([0, E + 0.3 + (R - E - 0.25) * f, -out + (D / 2 + out) * f], [W, E + 0.3 + (R - E - 0.25) * f, -out + (D / 2 + out) * f])
    frame.seg([0, E + 0.3 + (R - E - 0.25) * f, D + out - (D / 2 + out) * f], [W, E + 0.3 + (R - E - 0.25) * f, D + out - (D / 2 + out) * f])
  }
  for (const [a, b] of [
    [0, B],
    [W - B, W],
  ])
    for (const z of [-0.18, D + 0.18]) {
      frame.seg([a, 0.3, z], [b, E - 0.3, z])
      frame.seg([b, 0.3, z], [a, E - 0.3, z])
      frame.seg([a, E + 0.35, z < 0 ? 0.3 : D - 0.3], [b, R, D / 2])
      frame.seg([b, E + 0.35, z < 0 ? 0.3 : D - 0.3], [a, R, D / 2])
    }
  const zs = along(0, D, B)
  const roofAt = (z: number) => E + ((R - E) * (D / 2 - Math.abs(Math.min(D, Math.max(0, z)) - D / 2))) / (D / 2)
  for (const x of [0, W]) for (const z of zs.slice(1, -1)) iColumn(frame, x, z, 0, roofAt(z), 0.15, 0.2, 'x')
  frame.box([-0.4, -0.3, -0.4], [W + 0.4, 0, D + 0.4])
  const door: Hole = { u0: 13.8, u1: 17.4, y0: 0, y1: 3.1 }
  const faces: Face[] = [
    { axis: 'x', w: D + out, dir: 1, u0: 0, u1: W, holes: [door], step: (u) => (u < B ? 1 : 2) },
    { axis: 'x', w: -out, dir: -1, u0: 0, u1: W, holes: [], step: () => 3 },
    { axis: 'z', w: -0.25, dir: -1, u0: -out, u1: D + out, holes: [], step: () => 3, top: roofAt },
    { axis: 'z', w: W + 0.25, dir: 1, u0: -out, u1: D + out, holes: [], step: () => 3, top: roofAt },
  ]
  for (const f of faces) industrialWall(panels, frame, f, ZONE, E, f.axis === 'x' ? xs : zs)
  for (const x of along(0, W, 1.16)) {
    finish.seg([x, R + 0.12, D / 2], [x, E + 0.3, -out - 0.1])
    finish.seg([x, R + 0.12, D / 2], [x, E + 0.3, D + out + 0.1])
  }
  const zf = D + out + T.sip + 0.004
  opening(finish, 'x', zf, door, true)
  for (const y of along(0.3, door.y1, 0.3)) finish.seg([door.u0, y, zf], [door.u1, y, zf])
  return {
    id: 'peb',
    frame,
    finish,
    panels,
    first: [
      [-0.5, 0, D - 0.5],
      [B + 0.5, E + 0.4, D + out + 0.4],
    ],
    box: [
      [-0.6, -0.3, -0.6],
      [W + 0.6, R + 0.2, D + 0.8],
    ],
    origin: [B / 2, 0, D],
    steps: ['The steel portal', 'One bay', 'The side wall', 'Closed in'],
    marks: [
      { id: 'taper', text: 'Tapered steel portal, braced: 5.8 m bays', at: [B, E, D - 0.3], dx: 60, dy: -50, step: 0 },
      { id: 'outside', text: 'Outside the frame: SIP to 3.7 m, solid on studs above', at: [B * 0.5, 5.2, D + out + 0.03], dx: 60, dy: -60, step: 1 },
      { id: 'zone', text: 'Horizontal lintel panels over the shutter', at: [door.u1, 3.4, zf], dx: 50, dy: -50, step: 2 },
    ],
    views: { first: [22, 8], whole: [34, 20] },
  }
}

export function buildingOf(id: BuildId): Building {
  return id === 'housing' ? housing() : id === 'hub' ? hub() : id === 'rc' ? rc() : peb()
}

/** the panels' figures, from the building: how many, their area and weight by kind, the ferrules and tie holes */
export function quantities(b: Building) {
  const out = { sip: { n: 0, area: 0 }, solid: { n: 0, area: 0 }, ferrules: 0, ties: 0 }
  for (const p of b.panels) {
    const dx = Math.abs(p.b[0] - p.a[0])
    const dy = Math.abs(p.b[1] - p.a[1])
    const dz = Math.abs(p.b[2] - p.a[2])
    // its length and its width: the two largest of its sides
    const [len, wid] = [dx, dy, dz].sort((a, c) => c - a)
    out[p.kind].n++
    out[p.kind].area += len * wid
    // two ferrules on each line (1000 mm from each end, every 1600 to 2000 between; one line on a short piece), four tie holes
    const lines = len < 2.6 ? 1 : 1 + Math.max(1, Math.ceil((len - 2.0) / 2.0 - 1e-6))
    out.ferrules += 2 * lines
    out.ties += 4
  }
  return out
}
