import { Lines } from '../../flooring/data/three/dc'
import type { Box } from './fit'

/**
 * The streams' buildings, as the Unitized page's slab to slab and the Data & AI Centres page's frame to floor draw
 * theirs: everything round the panels is a drawing (black lines), the panels are in their own concrete. Each build
 * goes up as it would on site: the frame first (nothing is hung before what it is fixed to); then ONE wall's panels,
 * close; then the panels where the building needs them; then the rest, and the finish. The RC frame and the steel
 * portal stand on one footprint and one bay grid (4 x 2 bays of 5.8 m), so the switch shows only what changes: the
 * panels within the concrete frame, or outside the steel one.
 *
 *   housing  a single-storey affordable home: storey-high 100 mm SIP panels standing on a slab, light steel posts
 *            and a ring beam, a door and windows left in the panels, a pitched roof on light trusses; no rooms
 *   hub      a logistics hub on a steel frame, six 5.8 m bays, 9 m to the eaves: 100 mm SIP up to the dock doors'
 *            head (4.8 m, the conditioned zone), 30 mm solid above; four dock doors on its front
 *   rc       a G+3 reinforced-concrete frame on a 5.8 m grid: 100 mm SIP infill within the frame, slab to beam,
 *            column to column, a window band in every bay
 *   peb      a pre-engineered steel portal: tapered columns and rafters, purlins, girts, bracing; the panels outside
 *            the frame on its girts, 100 mm SIP to 3 m, 30 mm solid to the eaves
 *
 * Panels are 600 mm courses spanning column to column (the home's stand storey-high, 600 mm wide).
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

interface Hole {
  /** along the wall */
  u0: number
  u1: number
  /** up the wall */
  y0: number
  y1: number
}

/**
 * A wall of horizontal courses, 600 mm high, from u0 to u1 along x (or z), from y0 up to y1, its outer face on the
 * plane `w` and its thickness on the side `dir` points to; runs broken at `spans` (the columns) and at the openings.
 */
function courses(out: Slab[], o: { u: number[]; y0: number; y1: number; w: number; dir: 1 | -1; kind: (y: number) => Kind; step: (u: number, y: number) => number; axis: 'x' | 'z'; holes?: Hole[] }) {
  for (let y = o.y0; y < o.y1 - 1e-6; y += C) {
    const kind = o.kind(y)
    const t = T[kind]
    const [w0, w1] = [Math.min(o.w, o.w + o.dir * t), Math.max(o.w, o.w + o.dir * t)]
    for (let i = 0; i < o.u.length - 1; i++) {
      let runs: [number, number][] = [[o.u[i], o.u[i + 1]]]
      for (const h of o.holes ?? []) {
        if (y + C <= h.y0 + 1e-6 || y >= h.y1 - 1e-6) continue
        runs = runs.flatMap(([a, b]) => (h.u1 <= a || h.u0 >= b ? [[a, b]] : ([[a, h.u0], [h.u1, b]] as [number, number][]).filter(([p, q]) => q - p > 0.05)))
      }
      for (const [a, b] of runs) {
        const yt = Math.min(y + C, o.y1)
        const step = o.step((a + b) / 2, y)
        out.push(o.axis === 'x' ? { a: [a, y, w0], b: [b, yt, w1], kind, step } : { a: [w0, y, a], b: [w1, yt, b], kind, step })
      }
    }
  }
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

/** a gable roof's outline over [x0, x1] × [z0, z1], its ridge along x at zr, eaves at ye, ridge at yr, overhang o */
function gableRoof(L: Lines, x0: number, x1: number, z0: number, z1: number, ye: number, yr: number, o: number, sheet = 0) {
  const zr = (z0 + z1) / 2
  const s = (yr - ye) / (zr - z0)
  const [za, zb] = [z0 - o, z1 + o]
  const [ya, yb] = [ye - o * s, ye - o * s]
  for (const x of [x0 - o, x1 + o]) {
    L.seg([x, ya, za], [x, yr, zr])
    L.seg([x, yr, zr], [x, yb, zb])
  }
  L.seg([x0 - o, yr, zr], [x1 + o, yr, zr])
  L.seg([x0 - o, ya, za], [x1 + o, ya, za])
  L.seg([x0 - o, yb, zb], [x1 + o, yb, zb])
  // the sheeting's ribs, down both slopes
  if (sheet)
    for (let x = x0 - o + sheet; x < x1 + o - 1e-6; x += sheet) {
      L.seg([x, yr, zr], [x, ya, za])
      L.seg([x, yr, zr], [x, yb, zb])
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
 * A single-storey affordable home: 7.2 × 6.2 m on a 150 mm slab, storey-high SIP panels 600 mm wide standing on
 * it, light steel posts at the corners and the door, a light steel ring beam on top, a pitched roof on trusses.
 */
export function housing(): Building {
  const W = 7.2
  const D = 6.2
  const H = 3.0
  const t = T.sip
  const panels: Slab[] = []
  const frame = new Lines()
  const finish = new Lines()
  // the slab
  frame.box([-0.15, -0.15, -0.15], [W + 0.15, 0, D + 0.15])
  // storey-high panels on a wall, broken at its openings into pieces under and over them
  const wall = (axis: 'x' | 'z', w: number, dir: 1 | -1, u0: number, u1: number, holes: Hole[], step: number) => {
    for (const a of along(u0, u1, C).slice(0, -1)) {
      const b = Math.min(u1, a + C)
      const m = (a + b) / 2
      const h = holes.find((x) => m > x.u0 && m < x.u1)
      const spans: [number, number][] = h ? ([[0, h.y0], [h.y1, H]] as [number, number][]).filter(([p, q]) => q - p > 0.05) : [[0, H]]
      const [w0, w1] = [Math.min(w, w + dir * t), Math.max(w, w + dir * t)]
      for (const [y0, y1] of spans) panels.push(axis === 'x' ? { a: [a, y0, w0], b: [b, y1, w1], kind: 'sip', step } : { a: [w0, y0, a], b: [w1, y1, b], kind: 'sip', step })
    }
  }
  const door: Hole = { u0: 3.0, u1: 4.2, y0: 0, y1: 2.1 }
  const front = [{ u0: 1.2, u1: 2.4, y0: 0.9, y1: 2.1 }, door, { u0: 4.8, u1: 6.0, y0: 0.9, y1: 2.1 }]
  const back = [
    { u0: 1.8, u1: 3.0, y0: 0.9, y1: 2.1 },
    { u0: 4.2, u1: 5.4, y0: 0.9, y1: 2.1 },
  ]
  const side = [{ u0: 2.5, u1: 3.7, y0: 0.9, y1: 2.1 }]
  wall('x', D, -1, 0, W, front, 1)
  wall('x', 0, 1, 0, W, back, 2)
  wall('z', 0, 1, t, D - t, side, 2)
  wall('z', W, -1, t, D - t, side, 3)
  // light steel: posts at the corners and the door, the ring beam
  for (const [x, z] of [
    [t, t],
    [W - t, t],
    [t, D - t],
    [W - t, D - t],
    [door.u0, D - t],
    [door.u1, D - t],
  ])
    frame.box([x - 0.04, 0, z - 0.04], [x + 0.04, H, z + 0.04])
  frame.box([0, H, 0], [W, H + 0.12, D])
  frame.box([t, H, t], [W - t, H + 0.12, D - t])
  // the trusses (with the roof, once the walls are up): a rafter pair, a tie, a king post and two struts each, every 1.2 m
  const yr = H + 0.12 + 1.5
  const zr = D / 2
  for (const x of along(0, W, 1.2)) {
    const b = H + 0.12
    finish.seg([x, b, -0.3], [x, yr, zr])
    finish.seg([x, yr, zr], [x, b, D + 0.3])
    finish.seg([x, b, 0], [x, b, D])
    finish.seg([x, b, zr], [x, yr, zr])
    finish.seg([x, b, D * 0.25], [x, b + (yr - b) * 0.5, zr * 0.5 + 0.0])
    finish.seg([x, b, D * 0.75], [x, b + (yr - b) * 0.5, D - zr * 0.5])
  }
  finish.seg([0, yr, zr], [W, yr, zr])
  // the finish: the roof sheeted, the door and windows
  gableRoof(finish, 0, W, 0, D, H + 0.12, yr, 0.3, 0.45)
  for (const h of front) opening(finish, 'x', D + 0.004, h, h === door)
  for (const h of back) opening(finish, 'x', -0.004, h)
  for (const h of side) {
    opening(finish, 'z', -0.004, h)
    opening(finish, 'z', W + 0.004, h)
  }
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
      [W + 0.5, yr + 0.1, D + 0.5],
    ],
    origin: [W / 2, 0, D],
    steps: ['Its light frame', 'The front wall', 'The walls round it', 'The roof on'],
    marks: [
      { id: 'steel', text: 'Light steel posts and ring beam', at: [W - t, H, D - t], dx: 50, dy: -60, step: 0 },
      { id: 'sip', text: '100 mm SIP, storey-high', at: [0.9, 2.4, D], dx: -40, dy: -70, step: 1 },
      { id: 'open', text: 'Door and windows left in the panels', at: [door.u1 - 0.3, 2.1, D], dx: 50, dy: -80, step: 1 },
      { id: 'roof', text: 'Pitched roof on light trusses', at: [W * 0.7, yr - 0.4, zr * 0.6], dx: 50, dy: -50, step: 3 },
    ],
    views: { first: [16, 8], whole: [34, 22] },
  }
}

/**
 * A logistics hub: six 5.8 m bays (34.8 m) by 24 m, 9 m to the eaves, a low-pitched roof on a steel frame. The
 * long walls are courses from column to column: 100 mm SIP up to 4.8 m (the docks' head: the conditioned zone),
 * 30 mm solid above; the gables the same between their posts, 4.8 m apart. Four dock doors on the front.
 */
export function hub(): Building {
  const N = 6
  const B = 5.8
  const W = N * B
  const D = 24
  const E = 9.0
  const ZONE = 4.8
  const R = E + 1.2
  const panels: Slab[] = []
  const frame = new Lines()
  const finish = new Lines()
  const xs = along(0, W, B)
  const zs = along(0, D, 4.8)
  // the frame: columns on both long walls, gable posts, portal rafters, eaves beams, the ridge, purlins
  for (const x of xs) {
    for (const z of [0, D]) iColumn(frame, x, z, 0, E, 0.25, 0.45)
    frame.seg([x, E, 0], [x, R, D / 2])
    frame.seg([x, R, D / 2], [x, E, D])
    frame.seg([x, E - 0.6, 0], [x, R - 0.6, D / 2])
    frame.seg([x, R - 0.6, D / 2], [x, E - 0.6, D])
  }
  for (const x of [0, W]) for (const z of zs.slice(1, -1)) iColumn(frame, x, z, 0, E + ((R - E) * (D / 2 - Math.abs(z - D / 2))) / (D / 2), 0.2, 0.3, 'x')
  for (const z of [0, D]) frame.seg([0, E, z], [W, E, z])
  frame.seg([0, R, D / 2], [W, R, D / 2])
  for (const f of [0.25, 0.5, 0.75]) {
    frame.seg([0, E + (R - E) * f, (D / 2) * f], [W, E + (R - E) * f, (D / 2) * f])
    frame.seg([0, E + (R - E) * f, D - (D / 2) * f], [W, E + (R - E) * f, D - (D / 2) * f])
  }
  frame.rectX(0, -0.02, D, 0, -0.3)
  frame.box([-0.3, -0.3, -0.3], [W + 0.3, 0, D + 0.3])
  // the walls: the front's first bay, then its other bays (doors left open), then the back and the gables
  const kind = (y: number): Kind => (y < ZONE - 1e-6 ? 'sip' : 'solid')
  // the panels' inner face, clear of the columns' outer flanges
  const PZ = 0.23
  const docks: Hole[] = [1, 2, 3, 4].map((i) => ({ u0: i * B + B / 2 - 1.5, u1: i * B + B / 2 + 1.5, y0: 0, y1: 3.6 }))
  courses(panels, { u: xs, y0: 0, y1: E, w: D + PZ, dir: 1, kind, step: (u) => (u < B ? 1 : 2), axis: 'x', holes: docks })
  courses(panels, { u: xs, y0: 0, y1: E, w: -PZ, dir: -1, kind, step: () => 3, axis: 'x' })
  for (const x of [0, W]) courses(panels, { u: zs, y0: 0, y1: E, w: x === 0 ? -0.16 : W + 0.16, dir: x === 0 ? -1 : 1, kind, step: () => 3, axis: 'z' })
  // the finish: the roof sheeted, the dock doors with their canopies and buffers, the gables' triangles
  const zf = D + PZ + T.sip + 0.004
  for (const d of docks) {
    opening(finish, 'x', zf, d, true)
    finish.box([d.u0 - 0.2, 3.9, zf], [d.u1 + 0.2, 4.0, zf + 1.6])
    for (const u of [d.u0 + 0.2, d.u1 - 0.2]) finish.box([u - 0.12, 0.9, zf], [u + 0.12, 1.3, zf + 0.12])
  }
  for (const x of [-0.27, W + 0.27]) {
    finish.seg([x, E, -PZ], [x, R, D / 2])
    finish.seg([x, R, D / 2], [x, E, D + PZ])
    for (const z of along(1.2, D - 1.2, 1.2)) finish.seg([x, E, z], [x, E + ((R - E) * (D / 2 - Math.abs(z - D / 2))) / (D / 2), z])
  }
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
    steps: ['The steel frame', 'One bay', 'The dock face', 'Closed in'],
    marks: [
      { id: 'frame', text: 'Columns at 5.8 m centres', at: [2 * B, 6.5, D], dx: 50, dy: -60, step: 0 },
      { id: 'sip', text: '100 mm SIP to the docks’ head: the conditioned zone', at: [B * 0.7, 2.4, D + PZ + T.sip], dx: 60, dy: 40, step: 1 },
      { id: 'solid', text: '30 mm solid to the eaves, 5.8 m bays', at: [B * 0.3, 7.0, D + PZ + T.solid], dx: -40, dy: -60, step: 1 },
      { id: 'docks', text: 'Dock doors left in the panels', at: [docks[1].u1, 3.6, zf], dx: 60, dy: -60, step: 2 },
    ],
    views: { first: [20, 8], whole: [32, 20] },
  }
}

/**
 * A G+3 reinforced-concrete frame on the shared footprint: four 5.8 m bays by two, 3.45 m storeys (450 mm beams),
 * 400 mm columns, a stair core. The SIP infill sits within the frame, its outer face on the columns' outer face: courses
 * from slab to beam soffit (five, 3.0 m) and column face to column face, a window band (1.2 to 2.4 m) in every bay.
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
    // the slab's edge and its beams round the grid
    frame.box([-c, y - 0.15, -c], [W + c, y, D + c])
    for (const z of zs) frame.box([-c, y - 0.45, z - c], [W + c, y - 0.15, z + c])
    for (const x of xs) frame.box([x - c, y - 0.45, -c], [x + c, y - 0.15, D + c])
  }
  frame.box([-c - 0.3, -0.4, -c - 0.3], [W + c + 0.3, 0, D + c + 0.3])
  // the stair core, and the parapet
  frame.box([B + 0.6, 0, B + 0.6], [B + 3.6, F * S + 1.2, D - 0.6])
  frame.box([-c, F * S, -c], [W + c, F * S + 1.0, D + c])
  const win = (u: number[]) => u.slice(0, -1).map((a) => ({ u0: a + B / 2 - 1.5, u1: a + B / 2 + 1.5, y0: 1.2, y1: 2.4 }))
  for (let f = 0; f < F; f++) {
    const y0 = f * S
    const yt = y0 + 3.0
    // between column faces: the runs are the bays, the gaps the columns
    const bays = (u: number[]) => u.slice(0, -1).map((a, i) => [a + c, u[i + 1] - c] as [number, number])
    // the first infill is the ground floor's middle bay on the front; the front goes up floor by floor
    const front = (u: number) => (f === 0 && u > B && u < 2 * B ? 1 : 2)
    for (const [a, b] of bays(xs)) {
      const holes = win(xs).filter((h) => h.u0 > a && h.u1 < b).map((h) => ({ ...h, y0: y0 + 1.2, y1: y0 + 2.4 }))
      courses(panels, { u: [a, b], y0, y1: yt, w: D + c, dir: -1, kind: () => 'sip', step: front, axis: 'x', holes })
      courses(panels, { u: [a, b], y0, y1: yt, w: -c, dir: 1, kind: () => 'sip', step: () => 3, axis: 'x', holes })
    }
    for (const [a, b] of bays(zs))
      for (const x of [-c, W + c]) {
        const holes = win(zs).filter((h) => h.u0 > a && h.u1 < b).map((h) => ({ ...h, y0: y0 + 1.2, y1: y0 + 2.4 }))
        courses(panels, { u: [a, b], y0, y1: yt, w: x, dir: x < 0 ? 1 : -1, kind: () => 'sip', step: () => 3, axis: 'z', holes })
      }
    // the windows' frames
    for (const h of win(xs)) {
      opening(finish, 'x', D + c + 0.004, { ...h, y0: y0 + 1.2, y1: y0 + 2.4 })
      opening(finish, 'x', -c - 0.004, { ...h, y0: y0 + 1.2, y1: y0 + 2.4 })
    }
    for (const h of win(zs)) {
      opening(finish, 'z', -c - 0.004, { ...h, y0: y0 + 1.2, y1: y0 + 2.4 })
      opening(finish, 'z', W + c + 0.004, { ...h, y0: y0 + 1.2, y1: y0 + 2.4 })
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
      { id: 'infill', text: 'Within the frame: slab to beam, column to column', at: [1.5 * B, 2.7, D + c], dx: 50, dy: -60, step: 1 },
      { id: 'band', text: 'A window band in every bay', at: [0.5 * B + 1.5, S + 2.4, D + c], dx: -40, dy: -60, step: 2 },
    ],
    views: { first: [14, 8], whole: [36, 18] },
  }
}

/**
 * A pre-engineered steel portal on the shared footprint: four 5.8 m bays (23.2 m) by an 11.6 m span, 7.2 m to the
 * eaves. Tapered columns and rafters (deep at the haunch), Z purlins on the roof and Z girts on the walls, X-bracing
 * in the end bays, a wind post at the middle of each gable (the RC frame's grid). The panels are outside the frame,
 * on its girts: 100 mm SIP to 3 m, 30 mm solid to the eaves.
 */
export function peb(): Building {
  const N = 4
  const B = 5.8
  const W = N * B
  const D = 2 * B
  const E = 7.2
  const R = E + 0.6
  const ZONE = 3.0
  const panels: Slab[] = []
  const frame = new Lines()
  const finish = new Lines()
  const xs = along(0, W, B)
  const out = 0.3
  // a tapered column (300 at the base to 600 at the haunch) and its rafter (660 at the haunch to 350 at the ridge),
  // each flange drawn at both its edges
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
  // purlins every 1.6 m down each slope; girts every 1.5 m up each long wall; eaves struts
  for (const f of along(0, 1, 0.2)) {
    frame.seg([0, E + 0.3 + (R - E - 0.25) * f, -out + (D / 2 + out) * f], [W, E + 0.3 + (R - E - 0.25) * f, -out + (D / 2 + out) * f])
    frame.seg([0, E + 0.3 + (R - E - 0.25) * f, D + out - (D / 2 + out) * f], [W, E + 0.3 + (R - E - 0.25) * f, D + out - (D / 2 + out) * f])
  }
  for (const y of along(0.9, E - 0.3, 1.5))
    for (const z of [-0.2, D + 0.2]) {
      frame.seg([0, y, z], [W, y, z])
      frame.seg([0, y + 0.08, z], [W, y + 0.08, z])
    }
  // X-bracing in the end bays: the long walls and the roof
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
  // the gables' wind posts, on the 5.8 m grid
  const zs = along(0, D, B)
  for (const x of [0, W]) for (const z of zs.slice(1, -1)) iColumn(frame, x, z, 0, E + ((R - E) * (D / 2 - Math.abs(z - D / 2))) / (D / 2), 0.15, 0.2, 'x')
  frame.box([-0.4, -0.3, -0.4], [W + 0.4, 0, D + 0.4])
  // the panels, outside the girts: the front's first bay, its other bays, then the back and the gables
  const kind = (y: number): Kind => (y < ZONE - 1e-6 ? 'sip' : 'solid')
  const door: Hole = { u0: 2 * B + B / 2 - 2.0, u1: 2 * B + B / 2 + 2.0, y0: 0, y1: 4.2 }
  courses(panels, { u: xs, y0: 0, y1: E, w: D + out, dir: 1, kind, step: (u) => (u < B ? 1 : 2), axis: 'x', holes: [door] })
  courses(panels, { u: xs, y0: 0, y1: E, w: -out, dir: -1, kind, step: () => 3, axis: 'x' })
  for (const x of [0, W]) courses(panels, { u: [-out, ...zs.slice(1, -1), D + out], y0: 0, y1: E, w: x === 0 ? -0.25 : W + 0.25, dir: x === 0 ? -1 : 1, kind, step: () => 3, axis: 'z' })
  // the finish: the roof sheeted, the roller door, the gables' triangles
  for (const x of along(0, W, 1.16)) {
    finish.seg([x, R + 0.12, D / 2], [x, E + 0.3, -out - 0.1])
    finish.seg([x, R + 0.12, D / 2], [x, E + 0.3, D + out + 0.1])
  }
  for (const x of [-0.36, W + 0.36]) {
    finish.seg([x, E, -out], [x, R, D / 2])
    finish.seg([x, R, D / 2], [x, E, D + out])
  }
  opening(finish, 'x', D + out + 0.104, door, true)
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
      { id: 'outside', text: 'Outside the frame, on its girts', at: [B * 0.5, 5.2, D + out + 0.03], dx: 60, dy: -60, step: 1 },
      { id: 'zone', text: '100 mm SIP to 3 m, 30 mm solid above', at: [3 * B + 1, 1.5, D + out + 0.1], dx: 50, dy: 50, step: 2 },
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
