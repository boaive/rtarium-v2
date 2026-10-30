import { Lines, PLANK, rack } from './dc'

/**
 * The AI centre round the floor, as drawings, for Frame to floor. Our floor is the middle storey's (its
 * slab's foot at y = 0, the piece of the build at its front, its own row of racks on it); the building
 * is laid out round it on a 7.2 × 8.4 m grid. Each drawing is made in the order the section shows it:
 *
 *   hall    the data hall on our floor: rack rows in facing pairs about their cold aisles, broken at the
 *           columns; the containment over the hot aisles; a ladder tray and a busway over every row; the
 *           light lines over the cold aisles
 *   frame   the PEB frame: built-up I-section columns through the three storeys on their base plates,
 *           the beams under each floor and at the eaves; the X-bracing
 *   floors  the hollow-core floor above (every plank, the cores open on its front edge) and its hall;
 *           the ground floor's electrical rooms; the stair core
 *   shell   the insulated walls' joints, the portal roof (rafters, purlins, ridge) and the solar arrays
 *   plant   the chiller yard at one end, the generators and a transformer at the other
 *
 * The front is left open, as an X-ray. Sizes are of the kind, not of a project.
 */

export const GRID = { x0: -20.6, nx: 6, bx: 7.2, z0: 3.0, nz: 3, bz: 8.4 }
export const X0 = GRID.x0
export const X1 = GRID.x0 + GRID.nx * GRID.bx
export const Z1 = GRID.z0
export const Z0 = GRID.z0 - GRID.nz * GRID.bz
/** the foot of each storey's slab: the one below ours, ours, the one above; the eaves and the ridge */
export const LEVELS = [-6, 0, 6]
export const EAVES = 12
export const RIDGE = 13.2
const COLS_X = Array.from({ length: GRID.nx + 1 }, (_, i) => X0 + i * GRID.bx)
const COLS_Z = Array.from({ length: GRID.nz + 1 }, (_, j) => Z1 - j * GRID.bz)
const SLAB = 0.14

function circle(L: Lines, c: [number, number, number], r: number, axis: 'y' | 'z', n = 16) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const b = ((i + 1) / n) * Math.PI * 2
    if (axis === 'y') L.seg([c[0] + r * Math.cos(a), c[1], c[2] + r * Math.sin(a)], [c[0] + r * Math.cos(b), c[1], c[2] + r * Math.sin(b)])
    else L.seg([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2]], [c[0] + r * Math.cos(b), c[1] + r * Math.sin(b), c[2]])
  }
}

/** the rack rows on a floor (z of each row's middle and the way its fronts face), broken at the columns */
const ROWS: [number, number][] = Array.from({ length: 9 }, (_, k) => [-k * 2.4, k % 2 ? -1 : 1])
const clearOfColumns = (x: number) => COLS_X.every((c) => Math.abs(x - c) > 0.55)

/** the data hall on our floor */
export function hallLines(y = SLAB) {
  const L = new Lines()
  for (const [z, face] of ROWS) {
    for (let x = X0 + 2.0; x <= X1 - 2.0; x += 0.6) {
      // the piece's own three racks are drawn in full by the scene; the rest as rows
      if (z === 0 && x > -0.4 && x < 1.5) continue
      if (clearOfColumns(x)) rack(L, x, z, y, face, false)
    }
    // the ladder tray over the row, its rungs, and the busway beside it
    for (const dz of [-0.22, 0.22]) L.seg([X0 + 2, y + 2.75, z + dz], [X1 - 2, y + 2.75, z + dz])
    for (let x = X0 + 2; x <= X1 - 2; x += 0.6) L.seg([x, y + 2.75, z - 0.22], [x, y + 2.75, z + 0.22])
    L.box([X0 + 2, y + 2.4, z - 0.08], [X1 - 2, y + 2.5, z + 0.08])
  }
  // containment over the hot aisles (between the backs of a pair), and lights over the cold aisles
  for (let k = 0; k + 1 < ROWS.length; k++) {
    const [za, fa] = ROWS[k]
    const zb = ROWS[k + 1][0]
    const mid = (za + zb) / 2
    if (fa === 1) {
      for (const zz of [za - 0.6, zb + 0.6]) L.rectZ(X0 + 2, y + 2.05, X1 - 2, y + 2.35, zz)
      for (let x = X0 + 2; x <= X1 - 2; x += 2.4) L.seg([x, y + 2.35, za - 0.6], [x, y + 2.35, zb + 0.6])
    } else for (const dz of [-0.1, 0.1]) L.seg([X0 + 2, y + 4.2, mid + dz], [X1 - 2, y + 4.2, mid + dz])
  }
  return L
}

/** a built-up I-section column through the storeys: its outline at the foot, under each floor and at the eaves; its edges */
function column(L: Lines, x: number, z: number) {
  const b = 0.32
  const h = 0.5
  const tf = 0.03
  const tw = 0.016
  const P: [number, number][] = [
    [-b / 2, -h / 2],
    [b / 2, -h / 2],
    [b / 2, -h / 2 + tf],
    [tw / 2, -h / 2 + tf],
    [tw / 2, h / 2 - tf],
    [b / 2, h / 2 - tf],
    [b / 2, h / 2],
    [-b / 2, h / 2],
    [-b / 2, h / 2 - tf],
    [-tw / 2, h / 2 - tf],
    [-tw / 2, -h / 2 + tf],
    [-b / 2, -h / 2 + tf],
  ]
  const foot = LEVELS[0] - 0.6
  for (const y of [foot, ...LEVELS.slice(1).map((l) => l - 0.62), EAVES]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i]
      const c = P[(i + 1) % P.length]
      L.seg([x + a[0], y, z + a[1]], [x + c[0], y, z + c[1]])
    }
  }
  for (const k of [0, 1, 6, 7, 3, 4, 9, 10]) L.seg([x + P[k][0], foot, z + P[k][1]], [x + P[k][0], EAVES, z + P[k][1]])
  L.box([x - 0.3, foot, z - 0.38], [x + 0.3, foot + 0.04, z + 0.38])
}

/** a beam under a floor between two points: the edges of its two flanges and its web */
function beam(L: Lines, a: [number, number], b: [number, number], y: number, depth = 0.6, width = 0.24) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  const nx = (-dz / len) * (width / 2)
  const nz = (dx / len) * (width / 2)
  for (const s of [-1, 1]) for (const yy of [y, y - depth]) L.seg([a[0] + s * nx, yy, a[1] + s * nz], [b[0] + s * nx, yy, b[1] + s * nz])
  for (const yy of [y - 0.03, y - depth + 0.03]) L.seg([a[0], yy, a[1]], [b[0], yy, b[1]])
}

/** a floor of hollow-core planks at a level: every plank's joints, the slab's edges, the cores on its front */
function planks(L: Lines, y: number) {
  const n = Math.round((X1 - X0) / PLANK.w)
  for (let j = 0; j < GRID.nz; j++) {
    const za = Z1 - j * GRID.bz
    const zb = za - GRID.bz
    for (let k = 0; k <= n; k++) L.seg([X0 + k * PLANK.w, y + SLAB, za], [X0 + k * PLANK.w, y + SLAB, zb])
    L.seg([X0, y + SLAB, zb], [X1, y + SLAB, zb])
  }
  for (const yy of [0, PLANK.t, SLAB]) L.seg([X0, y + yy, Z1], [X1, y + yy, Z1])
  for (let k = 0; k < n; k++)
    for (const c of [-0.45, -0.27, -0.09, 0.09, 0.27, 0.45]) circle(L, [X0 + k * PLANK.w + PLANK.w / 2 + c, y + 0.06, Z1 + 0.001], 0.039, 'z', 8)
}

export function frameLines() {
  const L = new Lines()
  for (const x of COLS_X) for (const z of COLS_Z) column(L, x, z)
  // the beams under each upper floor and at the eaves, both ways
  for (const y of [...LEVELS.slice(1), EAVES]) {
    for (const z of COLS_Z) beam(L, [X0, z], [X1, z], y, 0.6, 0.24)
    for (const x of COLS_X) beam(L, [x, Z1], [x, Z0], y, 0.5, 0.2)
  }
  // X-bracing in the middle bay of each end and in two bays of the back, every storey
  const tiers = [LEVELS[0] - 0.6, ...LEVELS.slice(1), EAVES]
  for (let s = 0; s < tiers.length - 1; s++) {
    const y0 = tiers[s]
    const y1 = tiers[s + 1] - 0.62
    for (const x of [X0, X1]) {
      L.seg([x, y0, COLS_Z[1]], [x, y1, COLS_Z[2]])
      L.seg([x, y0, COLS_Z[2]], [x, y1, COLS_Z[1]])
    }
    for (const i of [1, GRID.nx - 2]) {
      L.seg([COLS_X[i], y0, Z0], [COLS_X[i + 1], y1, Z0])
      L.seg([COLS_X[i + 1], y0, Z0], [COLS_X[i], y1, Z0])
    }
  }
  return L
}

/** the floors above and below ours, their halls and rooms, the stair core */
export function floorsLines() {
  const L = new Lines()
  // the ground slab and the electrical rooms on it: switchgear and UPS lines in rows
  const g = LEVELS[0]
  L.rectZ(X0, g + SLAB, X1, g + SLAB, Z1)
  L.seg([X0, g + SLAB, Z0], [X1, g + SLAB, Z0])
  L.seg([X0, g + SLAB, Z1], [X0, g + SLAB, Z0])
  L.seg([X1, g + SLAB, Z1], [X1, g + SLAB, Z0])
  for (const z of [-4.6, -8.2, -13.4, -17]) {
    L.box([X0 + 3, g + SLAB, z - 0.45], [X1 - 3, g + SLAB + 2.2, z + 0.45])
    for (let x = X0 + 3.8; x < X1 - 3; x += 0.8) L.seg([x, g + SLAB, z + 0.45], [x, g + SLAB + 2.2, z + 0.45])
  }
  // the floor above ours, of hollow-core planks, and its hall: the rack rows as blocks between the columns
  planks(L, LEVELS[2])
  const u = LEVELS[2] + SLAB
  for (const [z] of ROWS) for (let i = 0; i < COLS_X.length - 1; i++) L.box([COLS_X[i] + 0.6, u, z - 0.6], [COLS_X[i + 1] - 0.6, u + 2, z + 0.6])
  // the stair core at the back left, its flights
  const c = { x0: X0 + 0.6, x1: X0 + 4.2, z0: Z0 + 0.6, z1: Z0 + 6.6 }
  for (const y of [LEVELS[0], ...LEVELS.slice(1), EAVES]) L.rectZ(c.x0, y, c.x1, y + 0.01, c.z0)
  for (const xx of [c.x0, c.x1]) for (const zz of [c.z0, c.z1]) L.seg([xx, LEVELS[0], zz], [xx, EAVES + 1.2, zz])
  for (let s = 0; s < 3; s++) {
    const y = LEVELS[s]
    L.seg([c.x0 + 0.3, y, c.z0 + 0.4], [c.x0 + 0.3, y + 3, c.z1 - 0.4])
    L.seg([c.x1 - 0.3, y + 3, c.z1 - 0.4], [c.x1 - 0.3, y + 6, c.z0 + 0.4])
  }
  return L
}

export function shellLines() {
  const L = new Lines()
  const foot = LEVELS[0]
  // the insulated wall panels' joints on the back and both ends; the corners
  for (let y = foot + 1.5; y < EAVES; y += 1.5) {
    L.seg([X0, y, Z0], [X1, y, Z0])
    L.seg([X0, y, Z1], [X0, y, Z0])
    L.seg([X1, y, Z1], [X1, y, Z0])
  }
  for (const x of [X0, X1]) for (const z of [Z1, Z0]) L.seg([x, foot, z], [x, EAVES, z])
  // the portal roof: a rafter on every grid line up to the ridge, purlins down both slopes, the ridge
  for (const x of COLS_X) {
    L.seg([x, EAVES, Z1], [x, RIDGE, (Z1 + Z0) / 2])
    L.seg([x, EAVES, Z0], [x, RIDGE, (Z1 + Z0) / 2])
  }
  for (let k = 0; k <= 8; k++) {
    const t = k / 8
    for (const z0 of [Z1, Z0]) {
      const z = z0 + ((Z1 + Z0) / 2 - z0) * t
      L.seg([X0, EAVES + (RIDGE - EAVES) * t, z], [X1, EAVES + (RIDGE - EAVES) * t, z])
    }
  }
  // the solar arrays on both slopes: panels in rows, clear of the edges and the ridge
  for (const z0 of [Z1, Z0]) {
    const zr = (Z1 + Z0) / 2
    for (let r = 0; r < 4; r++) {
      const t0 = 0.08 + r * 0.22
      const t1 = t0 + 0.18
      const za = z0 + (zr - z0) * t0
      const zb = z0 + (zr - z0) * t1
      const ya = EAVES + (RIDGE - EAVES) * t0 + 0.08
      const yb = EAVES + (RIDGE - EAVES) * t1 + 0.08
      for (let x = X0 + 1.2; x < X1 - 1.2; x += 2.1) {
        L.seg([x, ya, za], [x + 1.9, ya, za])
        L.seg([x, yb, zb], [x + 1.9, yb, zb])
        L.seg([x, ya, za], [x, yb, zb])
        L.seg([x + 1.9, ya, za], [x + 1.9, yb, zb])
      }
    }
  }
  return L
}

/** the plant: the chiller yard at the right end, the generators and a transformer at the left */
export function plantLines() {
  const L = new Lines()
  const g = LEVELS[0]
  for (let k = 0; k < 4; k++) {
    const z = Z1 - 2.5 - k * 5.6
    L.box([X1 + 3, g, z - 2.2], [X1 + 5.4, g + 2.4, z])
    for (let f = 0; f < 3; f++) {
      const cz = z - 0.37 - f * 0.73
      circle(L, [X1 + 4.2, g + 2.4, cz], 0.32, 'y', 16)
      L.seg([X1 + 3.9, g + 2.4, cz], [X1 + 4.5, g + 2.4, cz])
    }
    for (let y = g + 0.4; y < g + 2.2; y += 0.3) L.seg([X1 + 3, y, z - 2.1], [X1 + 3, y, z - 0.1])
  }
  for (let k = 0; k < 3; k++) {
    const z = Z1 - 3 - k * 6.5
    L.box([X0 - 5.6, g, z - 5], [X0 - 3, g + 2.9, z])
    L.rectX(z - 4.4, g + 0.6, z - 2.8, g + 2.3, X0 - 3)
    for (let y = g + 0.7; y < g + 2.3; y += 0.2) L.seg([X0 - 3, y, z - 2.4], [X0 - 3, y, z - 0.6])
    L.box([X0 - 4.6, g + 2.9, z - 1.2], [X0 - 4.3, g + 4.4, z - 0.9])
  }
  L.box([X0 - 5, g, Z0 + 1], [X0 - 3, g + 2.2, Z0 + 3])
  for (let x = X0 - 4.8; x < X0 - 3.1; x += 0.3) L.seg([x, g + 0.2, Z0 + 3], [x, g + 2, Z0 + 3])
  return L
}
