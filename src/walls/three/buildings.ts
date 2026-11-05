import { Lines } from '../../flooring/data/three/dc'
import type { Box } from './fit'

/**
 * The streams' buildings, as the Unitized page's slab to slab and the Data & AI Centres page's frame to floor draw
 * theirs: the structure round the panels is a drawing (black lines); the panels, their steel and the windows and doors
 * are solid, in standard modern colours (RAL). Each build goes up as it would on site: the frame first (nothing is hung
 * before what it is fixed to); then one wall; then the walls the building needs next; then the rest, and the finish.
 *
 * The client's rule (3 Nov 2026), everywhere: the panels stand VERTICAL, 600 mm wide. Over an opening a steel lintel
 * spans it and bears on the panel either side (its jamb, which stops at the opening's head), and panels laid HORIZONTAL
 * stand on the lintel up to the wall's top, over the opening and its two jambs: they act as its lintel. Nothing else is
 * horizontal: under a window, short vertical panels. A wall with no opening is all full-height vertical panels. The
 * 100 mm SIP panels slide into a 100 mm U-track at their foot. Heights the client set: a loading bay 2.4 m, a door
 * 2.1 m, a shutter 3.1 m; in the industrial builds the SIP zone ends at 3.6 m on a steel beam with a U-track on it
 * (3.7 m), and the 30 mm solid panels above stand on it, outer faces flush.
 *
 *   housing  a single-storey affordable home, the owner's sketch: 7.2 × 6.2 m, 3.0 m SIP walls, a FLAT roof left as its
 *            frame (owner, 3 Nov 2026: no pitched roof); a window, the main door and a window in its front; a bedroom
 *            closed by an L of partition (30 mm panels both sides of a 40 mm light-gauge stud, the void for plumbing
 *            and wiring), its door in the partition, its window in the back wall
 *   hub      a logistics hub on a steel frame, six 5.8 m bays, 8.0 m walls with a flat top (the roof inside them is a
 *            drawing): three loading bays and an access door in the front, a shutter in the side wall in view
 *   rc       a G+3 reinforced-concrete frame: vertical SIP infill slab to beam, column face to column face; a window in
 *            every bay, its steel lintel and the horizontal panels over it; the windows set once the frame is closed in
 *   peb      a pre-engineered steel portal: tapered columns and rafters, purlins, bracing; the panels outside the frame,
 *            the gables' cut to the roof's pitch; a shutter and an access door in the side wall
 */

export type Kind = 'sip' | 'solid'
/** what a part is made of (each building gives each its colour) */
export type Mat = 'sip' | 'solid' | 'part' | 'steel' | 'frame' | 'glass' | 'door' | 'metal' | 'seal' | 'safety' | 'pipe' | 'wire'
export type BuildId = 'housing' | 'hub' | 'rc' | 'peb'
type V = [number, number, number]

export interface Part {
  a: V
  b: V
  mat: Mat
  /** a panel's kind (what it is counted as); none for the steel, the windows and doors */
  panel?: Kind
  /** the step it goes in: 1 the first wall, 2 as the building needs, 3 the rest and the finish */
  step: number
  /** when it goes in within its step (fractions of the step's run); without it the panels go up course by course */
  phase?: [number, number]
  /** a gable's panel, its top cut to the roof: its top's height at its low end and at its high end along the wall */
  cut?: { axis: 'x' | 'z'; y0: number; y1: number }
  /** set in from outside along this (a window, a door); otherwise lowered from above, as a crane sets it down */
  from?: V
}
export interface Mark {
  id: string
  text: string
  at: V
  dx: number
  dy: number
  /** when it is shown (the build's clock, 0..4) */
  show: [number, number]
}
export interface Building {
  id: BuildId
  /** the structure, drawn out from the first panel at the start */
  frame: Lines
  /** fine lines drawn with the finish: a sectional door's joints, a shutter's slats */
  finish: Lines
  parts: Part[]
  /** the panel standing in its place from the start, the frame round it (never an empty stage) */
  seed: number
  box: Box
  /** where the frame is drawn out from */
  origin: V
  steps: [string, string, string, string]
  marks: Mark[]
  /** the start's and the whole view's angles (azimuth, elevation) */
  views: { first: [number, number]; whole: [number, number] }
  colors: Partial<Record<Mat, string>>
  /** a large building's first wall: the camera goes part of the way in on it while it goes up */
  first?: Box
  /** a closer look while something small goes in (the home's partition): its box, angle and when (in, held, out) */
  close?: { box: Box; view: [number, number]; at: [number, number, number, number] }
}

/** standard colours (RAL), as the walls would be ordered */
const RAL = {
  /** 7016 anthracite grey */
  anthracite: '#3b4045',
  /** 7035 light grey */
  light: '#cdd0cb',
  /** 7044 silk grey */
  silk: '#c4beb1',
  /** 9002 grey white */
  greyWhite: '#e2e0d7',
  /** 9010 pure white */
  white: '#f0ede4',
  /** 9006 white aluminium */
  alu: '#a6a9a7',
  /** galvanised steel */
  galv: '#8f969b',
  /** 1003 signal yellow */
  signal: '#f3c200',
  black: '#1e1f20',
  glass: '#93aab6',
}

export const T = { sip: 0.1, solid: 0.03 }
const C = 0.6
/** half a joint between two panels (m) */
const J = 0.004
/** the steel lintel: its depth, centred on the opening's head, and how far it bears on either side */
const LINTEL = 0.1
const BEAR = 0.15

type Use = 'window' | 'door' | 'bay' | 'access' | 'shutter'
interface Hole {
  /** along the wall */
  u0: number
  u1: number
  /** up the wall: its sill (0 for a door) and its head */
  y0: number
  y1: number
  use: Use
}

/** a wall's plane: along x (or z), its outer face on the plane `out`, its outside towards `dir` */
interface Plane {
  axis: 'x' | 'z'
  out: number
  dir: 1 | -1
}

/** a wall's run of panels: from u0 to u1, from y0 up to y1 (or a gable's top), its openings, when it goes up */
interface Run extends Plane {
  u0: number
  u1: number
  y0: number
  y1: number
  kind: Kind
  mat?: Mat
  step: (u: number) => number
  holes?: Hole[]
  top?: (u: number) => number
  phase?: [number, number]
}

/** a box on a wall: along it u0..u1, up it y0..y1, n0..n1 in from its outer face */
function on(o: Plane, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number): [V, V] {
  const w0 = o.out - o.dir * n0
  const w1 = o.out - o.dir * n1
  const [p, q] = [Math.min(w0, w1), Math.max(w0, w1)]
  return o.axis === 'x'
    ? [
        [u0, y0, p],
        [u1, y1, q],
      ]
    : [
        [p, y0, u0],
        [q, y1, u1],
      ]
}
/** a point on a wall, n in from its outer face */
const at = (o: Plane, u: number, y: number, n = 0): V => (o.axis === 'x' ? [u, y, o.out - o.dir * n] : [o.out - o.dir * n, y, u])
/** the wall's outward direction, as a vector */
const outward = (o: Plane, k: number): V => (o.axis === 'x' ? [0, 0, o.dir * k] : [o.dir * k, 0, 0])

/** openings set on a run's 600 mm grid from its start, so the panels either side of them are whole */
const snap = (u0: number, holes: Hole[]) =>
  holes.map((h) => {
    const a = u0 + Math.round((h.u0 - u0) / C) * C
    return { ...h, u0: a, u1: a + (h.u1 - h.u0) }
  })

/** a run from a to b in 600 mm panels from its start, the last one cut to fit (never a sliver: the last two share it) */
function fill(a: number, b: number) {
  const out: [number, number][] = []
  let s = a
  while (b - s > 0.03) {
    let e = Math.min(b, s + C)
    if (b - e > 0 && b - e < 0.15) e = s + (b - s) / 2
    out.push([s, e])
    s = e
  }
  return out
}

/**
 * The client's rule (see above): vertical panels between the openings; the panel either side of an opening (its jamb)
 * stops at the opening's head; a steel lintel over the opening bears on the jambs; horizontal panels on it up to the
 * wall's top, over the opening and its jambs; short vertical panels under a window.
 */
function wall(out: Part[], o: Run) {
  const t = T[o.kind]
  const mat = o.mat ?? o.kind
  const holes = [...(o.holes ?? [])].sort((p, q) => p.u0 - q.u0)
  const put = (u0: number, u1: number, y0: number, y1: number, step: number, cut?: [number, number]) => {
    const [a, b] = on(o, u0 + J, u1 - J, y0 + J, y1 - J, 0, t)
    const p: Part = { a, b, mat, panel: o.kind, step, phase: o.phase }
    if (cut) p.cut = { axis: o.axis, y0: cut[0] - J, y1: cut[1] - J }
    out.push(p)
  }
  // the lintel's span over each opening: from its left jamb's start to its right jamb's end
  const span = new Map<Hole, [number, number]>(holes.map((h) => [h, [h.u0, h.u1]]))
  const edges = [o.u0, ...holes.flatMap((h) => [h.u0, h.u1]), o.u1]
  for (let i = 0; i < edges.length; i += 2) {
    const left = i > 0 ? holes[i / 2 - 1] : null
    const right = i / 2 < holes.length ? holes[i / 2] : null
    const run = fill(edges[i], edges[i + 1])
    run.forEach(([a, b], k) => {
      const jl = k === 0 && left ? left : null
      const jr = k === run.length - 1 && right ? right : null
      if (jl) span.get(jl)![1] = b
      if (jr) span.get(jr)![0] = a
      const head = Math.min(jl ? jl.y1 : Infinity, jr ? jr.y1 : Infinity)
      const step = o.step((a + b) / 2)
      if (head < Infinity) put(a, b, o.y0, head, step)
      else if (o.top) {
        const [ya, yb] = [o.top(a), o.top(b)]
        put(a, b, o.y0, Math.max(ya, yb), step, [ya, yb])
      } else put(a, b, o.y0, o.y1, step)
    })
  }
  for (const h of holes) {
    const step = o.step((h.u0 + h.u1) / 2)
    const [s0, s1] = span.get(h)!
    // the steel lintel: a galvanised channel over the opening, bearing on its jambs, a little proud of both faces
    const [a, b] = on(o, h.u0 - BEAR, h.u1 + BEAR, h.y1 - LINTEL / 2, h.y1 + LINTEL / 2, -0.008, t + 0.008)
    out.push({ a, b, mat: 'steel', step, phase: o.phase })
    // on it, horizontal panels up to the wall's top, 600 mm each, the top one cut to fit
    for (const [y0, y1] of fill(h.y1, o.y1)) put(s0, s1, y0, y1, step)
    // under a window, short vertical panels
    if (h.y0 > o.y0 + 0.05) for (const [u0, u1] of fill(h.u0, h.u1)) put(u0, u1, o.y0, h.y0, step)
  }
}

/** a run's openings, set in once the walls are closed: windows (anthracite frame, glazing bars, glass), doors, the loading bays, the shutter */
function fittings(out: Part[], fin: Lines, o: Plane & { t: number }, holes: Hole[], phase: [number, number], inside = false) {
  const add = (mat: Mat, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, from = 0.45) => {
    const [a, b] = on(o, u0, u1, y0, y1, n0, n1)
    out.push({ a, b, mat, step: 3, phase, from: outward(o, inside ? 0 : from) })
  }
  const f = 0.06
  for (const h of holes) {
    const { u0, u1, y0, y1 } = h
    const n0 = o.t * 0.2
    const n1 = o.t * 0.85
    if (h.use === 'window') {
      add('frame', u0, u0 + f, y0, y1, n0, n1)
      add('frame', u1 - f, u1, y0, y1, n0, n1)
      add('frame', u0 + f, u1 - f, y1 - f, y1, n0, n1)
      add('frame', u0 + f, u1 - f, y0, y0 + f, n0, n1)
      // glazing bars: a mullion (two on a wide window) and a transom, as the owner drew them
      const lights = u1 - u0 > 1.5 ? 3 : 2
      for (let k = 1; k < lights; k++) {
        const u = u0 + ((u1 - u0) * k) / lights
        add('frame', u - 0.022, u + 0.022, y0 + f, y1 - f, n0 + 0.01, n1 - 0.01)
      }
      const ym = y0 + (y1 - y0) * 0.62
      add('frame', u0 + f, u1 - f, ym - 0.022, ym + 0.022, n0 + 0.01, n1 - 0.01)
      add('glass', u0 + f, u1 - f, y0 + f, y1 - f, (n0 + n1) / 2 - 0.004, (n0 + n1) / 2 + 0.004)
    } else if (h.use === 'door') {
      add('frame', u0, u0 + f, 0, y1, n0, n1)
      add('frame', u1 - f, u1, 0, y1, n0, n1)
      add('frame', u0 + f, u1 - f, y1 - f, y1, n0, n1)
      add('door', u0 + f, u1 - f, 0, y1 - f, n0 + 0.01, n1 - 0.01)
    } else if (h.use === 'access') {
      // a 2.1 m door, a louvre over it to the opening's head
      add('frame', u0, u0 + f, 0, y1, n0, n1)
      add('frame', u1 - f, u1, 0, y1, n0, n1)
      add('frame', u0 + f, u1 - f, 2.1, 2.1 + f, n0, n1)
      add('door', u0 + f, u1 - f, 0, 2.1, n0 + 0.01, n1 - 0.01)
      add('metal', u0 + f, u1 - f, 2.1 + f, y1, n0 + 0.01, n1 - 0.01)
      for (let y = 2.2; y < y1 - 0.04; y += 0.06) fin.seg(at(o, u0 + f, y, n0 - 0.002), at(o, u1 - f, y, n0 - 0.002))
    } else if (h.use === 'bay' || h.use === 'shutter') {
      // a sectional door (or a rolling shutter's curtain) in the opening, its joints drawn
      add('metal', u0, u1, 0, y1, o.t * 0.55, o.t * 0.8)
      const pitch = h.use === 'bay' ? 0.48 : 0.24
      for (let y = pitch; y < y1 - 0.05; y += pitch) fin.seg(at(o, u0, y, o.t * 0.55 - 0.003), at(o, u1, y, o.t * 0.55 - 0.003))
      if (h.use === 'bay') {
        // the dock shelter round it, its two buffers, and a safety-yellow bollard either side
        const s = 0.16
        add('seal', u0 - s, u0, 0, y1 + s, -0.5, 0, 0.6)
        add('seal', u1, u1 + s, 0, y1 + s, -0.5, 0, 0.6)
        add('seal', u0, u1, y1, y1 + s, -0.5, 0, 0.6)
        for (const u of [u0 + 0.35, u1 - 0.55]) add('seal', u, u + 0.2, 0.9, 1.25, -0.16, 0, 0.6)
        for (const u of [u0 - 0.65, u1 + 0.45]) add('safety', u, u + 0.2, 0, 1.1, -1.0, -0.8, 0.6)
      }
    }
  }
}

/** the 100 mm U-track a run of SIP panels slides into, at its foot (a channel round the panel's thickness), broken at doors */
function uTrack(L: Lines, o: Plane & { u0: number; u1: number; y0: number; t: number }, holes: Hole[] = []) {
  let runs: [number, number][] = [[o.u0, o.u1]]
  for (const h of holes.filter((x) => x.y0 <= o.y0 + 1e-6))
    runs = runs.flatMap(([a, b]) => (h.u1 <= a || h.u0 >= b ? [[a, b]] : ([[a, h.u0], [h.u1, b]] as [number, number][]).filter(([p, q]) => q - p > 0.05)))
  for (const [a, b] of runs) L.box(...on(o, a, b, o.y0, o.y0 + 0.06, -0.006, o.t + 0.006))
}

/** light-gauge studs every 2.9 m along a wall from y0 up to y1 (or its gable's top), behind its panels */
function studs(L: Lines, o: Plane & { u0: number; u1: number; y0: number; y1: number; n0: number; n1: number; top?: (u: number) => number; skip?: number[] }) {
  for (const u of along(o.u0, o.u1, 2.9).slice(1, -1)) {
    if (o.skip?.some((s) => Math.abs(s - u) < 0.3)) continue
    L.box(...on(o, u - 0.025, u + 0.025, o.y0, o.top ? o.top(u) : o.y1, o.n0, o.n1))
  }
}

/** a steel I-column, its web along z (or x), drawn as its two flanges and web line */
function iColumn(L: Lines, x: number, z: number, y0: number, y1: number, b: number, d: number, alongAxis: 'x' | 'z' = 'z') {
  const [hx, hz] = alongAxis === 'z' ? [b / 2, d / 2] : [d / 2, b / 2]
  if (alongAxis === 'z') {
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

/** a run of positions from a to b, every `step` (the last one at b) */
function along(a: number, b: number, step: number) {
  const n = Math.max(1, Math.round((b - a) / step))
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
}

/** the panel that stands in its place from the start: on the ground, full height, in the first wall, nearest the origin */
function seedOf(parts: Part[], o: V) {
  let best = 0
  let d = Infinity
  parts.forEach((p, i) => {
    if (!p.panel || p.step !== 1 || p.a[1] > 0.05 || p.b[1] - p.a[1] < 2.0) return
    const c = [(p.a[0] + p.b[0]) / 2, 0, (p.a[2] + p.b[2]) / 2]
    const k = Math.hypot(c[0] - o[0], c[2] - o[2])
    if (k < d) {
      d = k
      best = i
    }
  })
  return best
}

/**
 * A single-storey affordable home, the owner's sketch (3 Nov 2026): 7.2 × 6.2 m on a 150 mm slab, 3.0 m walls of
 * vertical 100 mm SIP panels in their U-track, a top track round their heads, and a FLAT roof left as its frame. Its
 * front: a window, the main door, a window, every head at 2.4 m, so the horizontal panels over them run the front's
 * whole width. Its sides have no opening: full-height panels. Inside, the sketch's L of partition closes a bedroom in
 * the back corner: 30 mm panels both sides of a 40 mm light-gauge stud, plumbing and wiring in the void; its door in
 * the partition, its window in the back wall.
 */
export function housing(): Building {
  const W = 7.2
  const D = 6.2
  const H = 3.0
  const t = T.sip
  const parts: Part[] = []
  const frame = new Lines()
  const finish = new Lines()
  frame.box([-0.15, -0.15, -0.15], [W + 0.15, 0, D + 0.15])
  const win = (u0: number, u1: number): Hole => ({ u0, u1, y0: 0.9, y1: 2.4, use: 'window' })
  const door: Hole = { u0: 3.0, u1: 4.2, y0: 0, y1: 2.4, use: 'door' }
  const front: Hole[] = [win(0.6, 1.8), door, win(5.4, 6.6)]
  const back: Hole[] = [win(1.2, 2.4), win(4.8, 6.0)]
  const walls: (Run & { holes: Hole[] })[] = [
    { axis: 'x', out: D, dir: 1, u0: 0, u1: W, y0: 0, y1: H, kind: 'sip', step: () => 1, holes: front },
    { axis: 'x', out: 0, dir: -1, u0: 0, u1: W, y0: 0, y1: H, kind: 'sip', step: () => 2, holes: back },
    { axis: 'z', out: 0, dir: -1, u0: t, u1: D - t, y0: 0, y1: H, kind: 'sip', step: () => 2, holes: [] },
    { axis: 'z', out: W, dir: 1, u0: t, u1: D - t, y0: 0, y1: H, kind: 'sip', step: () => 2, holes: [] },
  ]
  for (const r of walls) {
    wall(parts, r)
    uTrack(frame, { ...r, t }, r.holes)
    // the top track over the panels' heads
    frame.box(...on(r, r.u0, r.u1, H - 0.06, H, -0.006, t + 0.006))
    fittings(parts, finish, { ...r, t }, r.holes, [0.66, 0.98])
  }
  // the flat roof, left as its frame: an edge beam round the walls' heads and joists across, every 1.2 m
  frame.box([0, H, 0], [W, H + 0.2, D])
  frame.box([t, H, t], [W - t, H + 0.2, D - t])
  for (const x of along(0, W, 1.2).slice(1, -1)) frame.box([x - 0.025, H, 0], [x + 0.025, H + 0.2, D])

  // the partition: an L closing the bedroom in the back left corner. Each leg is two 30 mm panels, one either side of a
  // 40 mm light-gauge stud (100 mm in all); the bedroom's side goes up first, then the services in the void, then the
  // other side closes it. Its door in the leg along z.
  const XP = 3.1
  const ZP = 3.9
  const pdoor: Hole = { u0: 2.5, u1: 3.4, y0: 0, y1: 2.4, use: 'door' }
  const A: [number, number] = [0.02, 0.2]
  const B: [number, number] = [0.34, 0.52]
  const legs: (Run & { holes: Hole[] })[] = [
    { axis: 'z', out: XP, dir: -1, u0: t, u1: ZP, y0: 0, y1: H, kind: 'solid', mat: 'part', step: () => 3, holes: [pdoor], phase: A },
    { axis: 'x', out: ZP, dir: -1, u0: t, u1: XP, y0: 0, y1: H, kind: 'solid', mat: 'part', step: () => 3, holes: [], phase: A },
    { axis: 'z', out: XP + 0.1, dir: 1, u0: t, u1: ZP + 0.1, y0: 0, y1: H, kind: 'solid', mat: 'part', step: () => 3, holes: [pdoor], phase: B },
    { axis: 'x', out: ZP + 0.1, dir: 1, u0: t, u1: XP + 0.1, y0: 0, y1: H, kind: 'solid', mat: 'part', step: () => 3, holes: [], phase: B },
  ]
  for (const r of legs) wall(parts, r)
  fittings(parts, finish, { axis: 'z', out: XP + 0.1, dir: 1, t: 0.1 }, [pdoor], [0.66, 0.98], true)
  // its studs (C-sections, 40 mm, every 600 mm) with their tracks at the floor and the head; and over the door
  for (const z of along(t, ZP + 0.05, 0.6)) if (z < pdoor.u0 - 0.03 || z > pdoor.u1 + 0.03) frame.box([XP + 0.03, 0, z - 0.02], [XP + 0.07, H, z + 0.02])
  for (const x of along(t, XP, 0.6)) frame.box([x - 0.02, 0, ZP + 0.03], [x + 0.02, H, ZP + 0.07])
  for (const y of [0, H - 0.04]) {
    frame.box([XP + 0.03, y, t], [XP + 0.07, y + 0.04, ZP + 0.07])
    frame.box([t, y, ZP + 0.03], [XP + 0.07, y + 0.04, ZP + 0.07])
  }
  // the services in the void, between the two sides: a water supply and a waste pipe, and the wiring's conduit to a switch
  // and a socket (drawn a little heavier than they are, so they read)
  const svc: [Mat, V, V][] = [
    ['pipe', [XP + 0.035, 0, 0.75], [XP + 0.065, 1.15, 0.78]],
    ['pipe', [XP + 0.035, 1.12, 0.75], [XP + 0.065, 1.15, 1.35]],
    ['pipe', [XP + 0.032, 0, 1.0], [XP + 0.068, 0.6, 1.05]],
    ['wire', [XP + 0.04, 0.3, 2.2], [XP + 0.06, H, 2.22]],
    ['wire', [XP + 0.035, 1.1, 2.17], [XP + 0.065, 1.22, 2.27]],
    ['wire', [XP + 0.035, 0.26, 2.17], [XP + 0.065, 0.36, 2.27]],
    ['wire', [1.6, 0.3, ZP + 0.04], [1.62, H, ZP + 0.06]],
  ]
  for (const [mat, a, b] of svc) parts.push({ a, b, mat, step: 3, phase: [0.2, 0.33] })

  const seed = seedOf(parts, [2.7, 0, D])
  return {
    id: 'housing',
    frame,
    finish,
    parts,
    seed,
    box: [
      [-0.4, -0.15, -0.4],
      [W + 0.4, H + 0.3, D + 0.4],
    ],
    origin: [2.7, 0, D],
    steps: ['Slab and frame', 'Front wall', 'Side and rear walls', 'Roof and partitions'],
    marks: [
      { id: 'sip', text: '100 mm SIP, vertical, in a U-track', at: [0.3, 1.0, D], dx: -40, dy: 70, show: [1.55, 2.02] },
      { id: 'lintel', text: 'Over each opening: a steel lintel, then panels laid horizontal', at: [door.u1 + 0.06, 2.4, D + 0.01], dx: 40, dy: -78, show: [1.6, 2.02] },
      { id: 'side', text: 'No opening: full-height vertical panels', at: [W, 1.9, D * 0.55], dx: 56, dy: 40, show: [2.62, 3.0] },
      { id: 'part', text: 'Partition: 30 mm panel, 40 mm stud, 30 mm panel', at: [XP + 0.05, H, 0.9], dx: -36, dy: -64, show: [3.12, 3.54] },
      { id: 'void', text: 'The void: plumbing and electrical lines', at: [XP + 0.05, 0.9, 0.765], dx: 50, dy: 56, show: [3.24, 3.4] },
      { id: 'roof', text: 'Flat roof, left as its frame', at: [W * 0.62, H + 0.2, D * 0.35], dx: 46, dy: -56, show: [3.72, 4.1] },
    ],
    views: { first: [18, 10], whole: [32, 30] },
    colors: { sip: RAL.silk, part: RAL.white, steel: RAL.galv, frame: RAL.anthracite, door: RAL.anthracite, glass: RAL.glass, pipe: '#2f6f9f', wire: '#e07a26' },
    close: {
      box: [
        [1.4, 0, 0],
        [XP + 1.1, H, ZP + 0.7],
      ],
      view: [26, 50],
      at: [2.96, 3.08, 3.54, 3.66],
    },
  }
}

/** a wall of an industrial build: its plane, its run, its openings, when it goes up, and its gable's top */
interface Face extends Plane {
  u0: number
  u1: number
  holes: Hole[]
  step: (u: number) => number
  top?: (u: number) => number
  /** where the frame's columns stand along it (the beam is set bay by bay between them; the studs keep clear of them) */
  posts: number[]
}

/** the SIP zone's top, the steel beam on it (with its U-track), and the solid panels' foot */
const ZONE = 3.6
const BEAM = 0.1

/**
 * An industrial wall, the client's way: vertical 100 mm SIP to 3.6 m in its U-track, the openings framed in it; a steel
 * beam on it, bay by bay, with a U-track on top (3.7 m); vertical 30 mm solid panels on that to the top, their outer
 * faces flush with the SIP's, fixed back to light-gauge studs.
 */
function industrialWall(parts: Part[], frame: Lines, f: Face, top: number, fin: Lines) {
  const base = { axis: f.axis, out: f.out, dir: f.dir, u0: f.u0, u1: f.u1, step: f.step }
  wall(parts, { ...base, y0: 0, y1: ZONE, kind: 'sip', holes: f.holes })
  const cuts = [f.u0, ...f.posts.filter((u) => u > f.u0 + 0.3 && u < f.u1 - 0.3), f.u1]
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = on(f, cuts[i] + 0.002, cuts[i + 1] - 0.002, ZONE, ZONE + BEAM, -0.008, T.sip + 0.15)
    parts.push({ a, b, mat: 'steel', step: f.step((cuts[i] + cuts[i + 1]) / 2) })
  }
  wall(parts, { ...base, y0: ZONE + BEAM, y1: top, kind: 'solid', top: f.top })
  uTrack(frame, { ...f, y0: 0, t: T.sip }, f.holes)
  studs(frame, { ...f, y0: ZONE + BEAM, y1: top, n0: T.solid, n1: T.sip, top: f.top, skip: f.posts })
  fittings(parts, fin, { ...f, t: T.sip }, f.holes, [0.6, 0.95])
}

/**
 * A logistics hub: six 5.8 m bays (34.8 m) by 24 m on a steel frame; its walls 8.0 m with a flat top, the low-pitched
 * roof inside them a drawing. Every wall: SIP to 3.6 m, the steel beam, 30 mm solid above to the top. Three loading
 * bays (2.4 m) and an access door (2.1 m, a louvre over it) in the front; a shutter (3.1 m) in the side wall in view.
 */
export function hub(): Building {
  const N = 6
  const B = 5.8
  const W = N * B
  const D = 24
  const E = 8.0
  const EAVES = 7.2
  const RIDGE = 7.8
  const parts: Part[] = []
  const frame = new Lines()
  const finish = new Lines()
  const xs = along(0, W, B)
  const zs = along(0, D, 4.8)
  const roofAt = (z: number) => EAVES + ((RIDGE - EAVES) * (D / 2 - Math.abs(Math.min(D, Math.max(0, z)) - D / 2))) / (D / 2)
  for (const x of xs) {
    for (const z of [0, D]) iColumn(frame, x, z, 0, EAVES, 0.25, 0.45)
    frame.seg([x, EAVES, 0], [x, RIDGE, D / 2])
    frame.seg([x, RIDGE, D / 2], [x, EAVES, D])
    frame.seg([x, EAVES - 0.5, 0.25], [x, RIDGE - 0.5, D / 2])
    frame.seg([x, RIDGE - 0.5, D / 2], [x, EAVES - 0.5, D - 0.25])
  }
  for (const x of [0, W]) for (const z of zs.slice(1, -1)) iColumn(frame, x, z, 0, roofAt(z), 0.2, 0.3, 'x')
  for (const z of [0, D]) frame.seg([0, EAVES, z], [W, EAVES, z])
  for (const f of [0.25, 0.5, 0.75, 1]) {
    frame.seg([0, roofAt((D / 2) * f), (D / 2) * f], [W, roofAt((D / 2) * f), (D / 2) * f])
    frame.seg([0, roofAt(D - (D / 2) * f), D - (D / 2) * f], [W, roofAt(D - (D / 2) * f), D - (D / 2) * f])
  }
  frame.box([-0.5, -0.3, -0.5], [W + 0.5, 0, D + 0.5])
  // the panels' inner faces just clear of the columns' outer flanges; the long walls run over the side walls' ends
  const P = 0.25
  const t = T.sip
  const bay = (c: number): Hole => ({ u0: c - 1.5, u1: c + 1.5, y0: 0, y1: 2.4, use: 'bay' })
  const front = snap(-P - t, [bay(1.5 * B), bay(2.5 * B), bay(3.5 * B), { u0: 4.5 * B - 0.6, u1: 4.5 * B + 0.6, y0: 0, y1: 2.4, use: 'access' }])
  const [shutter] = snap(-P, [{ u0: D / 2 - 1.8, u1: D / 2 + 1.8, y0: 0, y1: 3.1, use: 'shutter' }])
  const faces: Face[] = [
    { axis: 'x', out: D + P + t, dir: 1, u0: -P - t, u1: W + P + t, holes: front, step: (u) => (u < B ? 1 : 2), posts: xs },
    { axis: 'z', out: W + P + t, dir: 1, u0: -P, u1: D + P, holes: [shutter], step: () => 2, posts: zs },
    { axis: 'x', out: -P - t, dir: -1, u0: -P - t, u1: W + P + t, holes: [], step: () => 3, posts: xs },
    { axis: 'z', out: -P - t, dir: -1, u0: -P, u1: D + P, holes: [], step: () => 3, posts: zs },
  ]
  for (const f of faces) industrialWall(parts, frame, f, E, finish)
  const zf = D + P + t
  return {
    id: 'hub',
    frame,
    finish,
    parts,
    seed: seedOf(parts, [B / 2, 0, zf]),
    box: [
      [-0.8, -0.3, -0.8],
      [W + 0.8, E + 0.2, D + 1.4],
    ],
    first: [
      [-1.0, 0, D - 1.5],
      [B + 1.0, E + 0.3, D + 1.0],
    ],
    origin: [B / 2, 0, zf],
    steps: ['Steel frame', 'Single bay', 'Loading face', 'Full enclosure'],
    marks: [
      { id: 'frame', text: 'Steel columns at 5.8 m centres', at: [2 * B, 5.6, D + 0.22], dx: 50, dy: -60, show: [0.62, 1.0] },
      { id: 'sip', text: '100 mm SIP to 3.6 m, in a U-track', at: [B * 0.72, 1.6, zf], dx: 60, dy: 46, show: [1.55, 2.02] },
      { id: 'beam', text: 'Steel beam, U-track on top: 3.7 m', at: [B * 0.42, ZONE + BEAM / 2, zf], dx: -40, dy: 58, show: [1.6, 2.02] },
      { id: 'solid', text: '30 mm solid above, to 8 m', at: [B * 0.3, 6.0, zf], dx: -40, dy: -56, show: [1.65, 2.02] },
      { id: 'lintel', text: 'Loading bay 2.4 m: a steel lintel, panels laid horizontal', at: [front[1].u1, 2.4, zf], dx: 56, dy: -70, show: [2.58, 3.0] },
      { id: 'shutter', text: 'Shutter 3.1 m, in the side wall', at: [W + P + t, 2.0, shutter.u1], dx: 50, dy: 40, show: [2.66, 3.0] },
    ],
    views: { first: [16, 9], whole: [30, 22] },
    colors: { sip: RAL.anthracite, solid: RAL.light, steel: RAL.galv, metal: RAL.alu, seal: RAL.black, safety: RAL.signal, door: RAL.anthracite, frame: RAL.anthracite },
  }
}

/**
 * A G+3 reinforced-concrete frame: four 5.8 m bays by two, 3.45 m storeys (450 mm beams), 400 mm columns, a stair core.
 * The SIP infill sits within the frame, its outer face on the columns' face: vertical panels in their U-track from the
 * slab to the beam's soffit (3.0 m), column face to column face (5.4 m), a window in every bay (1.8 × 1.5 m, its head at
 * 2.4 m): a steel lintel over it carries the horizontal panel above, short panels under it. The windows go in once the
 * frame is closed in.
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
  const parts: Part[] = []
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
    const win = (a: number, b: number): Hole => ({ u0: (a + b) / 2 - 0.9, u1: (a + b) / 2 + 0.9, y0: y0 + 0.9, y1: y0 + 2.4, use: 'window' })
    const front = (u: number) => (f === 0 && u > B && u < 2 * B ? 1 : 2)
    const faces: [Plane, [number, number][], (u: number) => number][] = [
      [{ axis: 'x', out: D + c, dir: 1 }, bays(xs), front],
      [{ axis: 'x', out: -c, dir: -1 }, bays(xs), () => 3],
      [{ axis: 'z', out: -c, dir: -1 }, bays(zs), () => 3],
      [{ axis: 'z', out: W + c, dir: 1 }, bays(zs), () => 3],
    ]
    for (const [pl, spans, step] of faces)
      for (const [a, b] of spans) {
        const r: Run = { ...pl, u0: a, u1: b, y0, y1: y0 + 3.0, kind: 'sip', step, holes: [win(a, b)] }
        wall(parts, r)
        uTrack(frame, { ...r, t: T.sip })
        fittings(parts, finish, { ...pl, t: T.sip }, [win(a, b)], [0.55, 0.95])
      }
  }
  const zf = D + c
  return {
    id: 'rc',
    frame,
    finish,
    parts,
    seed: seedOf(parts, [1.5 * B - 1.8, 0, zf]),
    box: [
      [-0.8, -0.4, -0.8],
      [W + 0.8, F * S + 1.3, D + 0.8],
    ],
    first: [
      [B - 0.8, 0, D - 1.2],
      [2 * B + 0.8, S + 0.4, D + 0.8],
    ],
    origin: [1.5 * B, 0, zf],
    steps: ['RC frame', 'Single infill', 'Floor by floor', 'Full enclosure'],
    marks: [
      { id: 'within', text: 'The RC frame: 5.8 m bays, 3.45 m storeys', at: [2 * B, 2 * S - 0.3, zf], dx: 60, dy: -50, show: [0.62, 1.0] },
      { id: 'infill', text: 'Vertical SIP within the frame, slab to beam', at: [B + c + 0.6, 1.6, zf], dx: -40, dy: 60, show: [1.55, 2.02] },
      { id: 'lintel', text: 'A steel lintel over the window carries the panel above', at: [1.5 * B + 0.9, 2.4, zf + 0.01], dx: 50, dy: -66, show: [1.6, 2.02] },
      { id: 'win', text: 'The windows go in last, the frame closed in', at: [0.5 * B + 0.9, S + 1.6, zf], dx: 50, dy: -60, show: [3.72, 4.1] },
    ],
    views: { first: [16, 9], whole: [34, 18] },
    colors: { sip: RAL.light, steel: RAL.galv, frame: RAL.anthracite, glass: RAL.glass },
  }
}

/**
 * A pre-engineered steel portal on the RC frame's footprint: four 5.8 m bays (23.2 m) by an 11.6 m span, 7.2 m to the
 * eaves. Tapered columns and rafters, purlins, X-bracing in the end bays, wind posts in the gables. The panels outside
 * the frame: SIP to 3.6 m, the steel beam, 30 mm solid above to the eaves, the gables' solid panels each cut to the
 * roof's pitch at its top. A shutter (3.1 m) and an access door (2.1 m) in the side wall.
 */
export function peb(): Building {
  const N = 4
  const B = 5.8
  const W = N * B
  const D = 2 * B
  const E = 7.2
  const R = E + 0.6
  const parts: Part[] = []
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
    }
  const zs = along(0, D, B)
  const roofAt = (z: number) => E + ((R - E) * (D / 2 - Math.abs(Math.min(D, Math.max(0, z)) - D / 2))) / (D / 2)
  for (const x of [0, W]) for (const z of zs.slice(1, -1)) iColumn(frame, x, z, 0, roofAt(z), 0.15, 0.2, 'x')
  frame.box([-0.5, -0.3, -0.5], [W + 0.5, 0, D + 0.5])
  const t = T.sip
  // the gables' tops follow the roof; the panel's outer face stands `gw` out from the frame
  const gw = 0.25
  const [shutter, access] = snap(-gw - t, [
    { u0: 2.5 * B - 1.8, u1: 2.5 * B + 1.8, y0: 0, y1: 3.1, use: 'shutter' },
    { u0: 3.5 * B - 0.6, u1: 3.5 * B + 0.6, y0: 0, y1: 2.4, use: 'access' },
  ])
  const faces: Face[] = [
    { axis: 'x', out: D + out + t, dir: 1, u0: -gw - t, u1: W + gw + t, holes: [shutter, access], step: (u) => (u < B ? 1 : 2), posts: xs },
    { axis: 'x', out: -out - t, dir: -1, u0: -gw - t, u1: W + gw + t, holes: [], step: () => 3, posts: xs },
    { axis: 'z', out: W + gw + t, dir: 1, u0: -out, u1: D + out, holes: [], step: () => 3, top: roofAt, posts: zs },
    { axis: 'z', out: -gw - t, dir: -1, u0: -out, u1: D + out, holes: [], step: () => 3, top: roofAt, posts: zs },
  ]
  for (const f of faces) industrialWall(parts, frame, f, E, finish)
  for (const x of along(0, W, 1.16)) {
    finish.seg([x, R + 0.12, D / 2], [x, E + 0.3, -out - 0.1])
    finish.seg([x, R + 0.12, D / 2], [x, E + 0.3, D + out + 0.1])
  }
  const zf = D + out + t
  return {
    id: 'peb',
    frame,
    finish,
    parts,
    seed: seedOf(parts, [B / 2, 0, zf]),
    box: [
      [-0.8, -0.3, -0.8],
      [W + 0.8, R + 0.3, D + 0.9],
    ],
    first: [
      [-1.0, 0, D - 1.2],
      [B + 1.0, E + 0.4, D + out + 1.0],
    ],
    origin: [B / 2, 0, zf],
    steps: ['Steel portal', 'Single bay', 'Side wall', 'Full enclosure'],
    marks: [
      { id: 'taper', text: 'Tapered steel portal, braced: 5.8 m bays', at: [B, E, D - 0.3], dx: 60, dy: -50, show: [0.62, 1.0] },
      { id: 'outside', text: 'Outside the frame: SIP to 3.6 m, solid above', at: [B * 0.5, 5.2, zf], dx: 60, dy: -60, show: [1.55, 2.02] },
      { id: 'zone', text: 'Shutter 3.1 m: a steel lintel, a panel laid horizontal', at: [shutter.u1, 3.1, zf], dx: 50, dy: -60, show: [2.58, 3.0] },
      { id: 'gable', text: 'Gable panels cut to the roof’s pitch', at: [W + gw + t, roofAt(D * 0.3) - 0.4, D * 0.3], dx: 50, dy: -50, show: [3.5, 4.1] },
    ],
    views: { first: [16, 9], whole: [36, 20] },
    colors: { sip: RAL.anthracite, solid: RAL.light, steel: RAL.galv, metal: RAL.alu, door: RAL.anthracite, frame: RAL.anthracite },
  }
}

export function buildingOf(id: BuildId): Building {
  return id === 'housing' ? housing() : id === 'hub' ? hub() : id === 'rc' ? rc() : peb()
}

/** the panels' figures, from the building: how many, their area and weight by kind, the ferrules and tie holes */
export function quantities(b: Building) {
  const out = { sip: { n: 0, area: 0 }, solid: { n: 0, area: 0 }, ferrules: 0, ties: 0 }
  for (const p of b.parts) {
    if (!p.panel) continue
    const dx = Math.abs(p.b[0] - p.a[0])
    const dy = Math.abs(p.b[1] - p.a[1])
    const dz = Math.abs(p.b[2] - p.a[2])
    // its length and its width: the two largest of its sides
    const [len, wid] = [dx, dy, dz].sort((a, c) => c - a)
    out[p.panel].n++
    out[p.panel].area += len * wid
    // two ferrules on each line (1000 mm from each end, every 1600 to 2000 between; one line on a short piece), four tie holes
    const lines = len < 2.6 ? 1 : 1 + Math.max(1, Math.ceil((len - 2.0) / 2.0 - 1e-6))
    out.ferrules += 2 * lines
    out.ties += 4
  }
  return out
}
