import { Lines } from '../../data/three/dc'
import { circle, RACK, rackRun, type Map3 } from './parts'

/**
 * The automated fulfilment centre round the floor, as drawings, for Frame to floor: one high-bay hall
 * on a 12 × 9.6 m grid, after the client's photographs of such buildings. Each drawing is made in the
 * order the section shows it:
 *
 *   aisles  the racking on our floor: double rows either side of narrow aisles, broken at the columns;
 *           the picking cranes' top rails down every aisle, AGV lanes across the cross-aisle at the front
 *   frame   the portal frame: built-up I-section columns on their base plates, the eaves beams and the
 *           X-bracing in the ends and the back
 *   shell   the wall panels' joints, the roof (rafters, purlins, ridge) and its ventilators
 *   plant   the dock doors and levellers along one long side with the trailers backed up to them, the
 *           office block at the corner, the sprinkler tanks at the other end
 *
 * The front is left open, as an X-ray. Sizes are of the kind, not of a project.
 */

export const GRID = { x0: -30.2, nx: 6, bx: 12, z0: 3.2, nz: 4, bz: 9.6 }
export const X0 = GRID.x0
export const X1 = GRID.x0 + GRID.nx * GRID.bx
export const Z1 = GRID.z0
export const Z0 = GRID.z0 - GRID.nz * GRID.bz
export const EAVES = 14.4
export const RIDGE = 16
const LEVELS = 7
const COLS_X = Array.from({ length: GRID.nx + 1 }, (_, i) => X0 + i * GRID.bx)
const COLS_Z = Array.from({ length: GRID.nz + 1 }, (_, j) => Z1 - j * GRID.bz)

/** the rack rows on the floor: pairs back to back, an aisle between pairs, running along x */
const AISLE = 3.2
const ROW_PITCH = 2 * RACK.depth + 0.25 + AISLE

export function aisleLines(y = 0) {
  const L = new Lines()
  const first = Z1 - 3.4
  const bays = Math.floor((X1 - X0 - 3) / RACK.bay)
  const startX = X0 + 1.5
  for (let r = 0; first - r * ROW_PITCH > Z0 + 3; r++) {
    const zf = first - r * ROW_PITCH
    const front: Map3 = (u, yy, v) => [startX + u, y + yy, zf - v]
    const back: Map3 = (u, yy, v) => [startX + u, y + yy, zf - RACK.depth - 0.25 - v]
    rackRun(L, front, bays, LEVELS, { full: false })
    rackRun(L, back, bays, LEVELS, { full: false })
    // the picking crane's top rail, and its floor rail, down the aisle in front of the pair
    const za = zf + AISLE / 2
    L.seg([startX, y + LEVELS * RACK.level + 0.5, za], [X1 - 1.5, y + LEVELS * RACK.level + 0.5, za])
    L.seg([startX, y + 0.02, za], [X1 - 1.5, y + 0.02, za])
    // a crane standing somewhere along it
    const cx = startX + ((r * 17.3 + 7) % (X1 - X0 - 8))
    for (const dx of [-0.3, 0.3]) L.seg([cx + dx, y, za], [cx + dx, y + LEVELS * RACK.level + 0.5, za])
    L.box([cx - 0.55, y + 2 + (r % 3) * 3, za - 0.4], [cx + 0.55, y + 3 + (r % 3) * 3, za + 0.4])
  }
  return L
}

function column(L: Lines, x: number, z: number) {
  const b = 0.36
  const h = 0.62
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
  for (const y of [0.04, EAVES / 2, EAVES]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i]
      const c = P[(i + 1) % P.length]
      L.seg([x + a[0], y, z + a[1]], [x + c[0], y, z + c[1]])
    }
  }
  for (const k of [0, 1, 6, 7, 3, 4, 9, 10]) L.seg([x + P[k][0], 0.04, z + P[k][1]], [x + P[k][0], EAVES, z + P[k][1]])
  L.box([x - 0.34, 0, z - 0.44], [x + 0.34, 0.04, z + 0.44])
}

function beam(L: Lines, a: [number, number], b: [number, number], y: number, depth = 0.7, width = 0.26) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  const nx = (-dz / len) * (width / 2)
  const nz = (dx / len) * (width / 2)
  for (const s of [-1, 1]) for (const yy of [y, y - depth]) L.seg([a[0] + s * nx, yy, a[1] + s * nz], [b[0] + s * nx, yy, b[1] + s * nz])
  for (const yy of [y - 0.03, y - depth + 0.03]) L.seg([a[0], yy, a[1]], [b[0], yy, b[1]])
}

export function frameLines() {
  const L = new Lines()
  for (const x of COLS_X) for (const z of COLS_Z) column(L, x, z)
  for (const y of [EAVES / 2, EAVES]) {
    for (const z of COLS_Z) beam(L, [X0, z], [X1, z], y, y === EAVES ? 0.8 : 0.3, 0.2)
    for (const x of COLS_X) beam(L, [x, Z1], [x, Z0], y, y === EAVES ? 0.8 : 0.3, 0.2)
  }
  for (const [y0, y1] of [
    [0, EAVES / 2],
    [EAVES / 2, EAVES],
  ]) {
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

export function shellLines() {
  const L = new Lines()
  for (let y = 1.8; y < EAVES; y += 1.8) {
    L.seg([X0, y, Z0], [X1, y, Z0])
    L.seg([X0, y, Z1], [X0, y, Z0])
    L.seg([X1, y, Z1], [X1, y, Z0])
  }
  for (const x of [X0, X1]) for (const z of [Z1, Z0]) L.seg([x, 0, z], [x, EAVES, z])
  const zr = (Z1 + Z0) / 2
  for (const x of COLS_X) {
    L.seg([x, EAVES, Z1], [x, RIDGE, zr])
    L.seg([x, EAVES, Z0], [x, RIDGE, zr])
  }
  for (let k = 0; k <= 8; k++) {
    const t = k / 8
    for (const z0 of [Z1, Z0]) {
      const z = z0 + (zr - z0) * t
      L.seg([X0, EAVES + (RIDGE - EAVES) * t, z], [X1, EAVES + (RIDGE - EAVES) * t, z])
    }
  }
  // the ridge's smoke vents, in a row
  for (let x = X0 + 4; x < X1 - 4; x += 8) L.box([x - 1.2, RIDGE, zr - 0.5], [x + 1.2, RIDGE + 0.5, zr + 0.5])
  return L
}

/** the docks and their trailers along the far long side, the offices at the corner, the sprinkler tanks */
export function plantLines() {
  const L = new Lines()
  const dockZ = Z0
  for (let k = 0; k < 11; k++) {
    const x = X0 + 5 + k * 5.6
    L.rectZ(x - 1.5, 0.3, x + 1.5, 3.8, dockZ)
    for (let y = 0.8; y < 3.8; y += 0.5) L.seg([x - 1.5, y, dockZ], [x + 1.5, y, dockZ])
    // the leveller's canopy
    L.box([x - 1.7, 3.8, dockZ - 0.5], [x + 1.7, 4.0, dockZ])
    if (k % 3 === 2) continue
    // a trailer backed up to the door, on its wheels
    const z0 = dockZ - 0.6
    const z1 = dockZ - 14
    L.box([x - 1.25, 1.2, z1], [x + 1.25, 4, z0])
    for (const s of [-1, 1]) {
      for (const z of [z0 - 2.2, z0 - 3.6, z0 - 5]) circle(L, [x + s * 1.26, 0.48, z], 0.48, 'x', 14)
    }
    L.seg([x, 1.2, z1], [x, 0.2, z1 + 2])
  }
  // the offices at the front corner, three floors of windows
  const o = { x0: X1 + 0.2, x1: X1 + 9, z0: Z1 - 16, z1: Z1 - 1 }
  L.box([o.x0, 0, o.z0], [o.x1, 10.2, o.z1])
  for (const y of [3.4, 6.8]) {
    L.seg([o.x1, y, o.z0], [o.x1, y, o.z1])
    L.seg([o.x0, y, o.z1], [o.x1, y, o.z1])
  }
  for (const y of [1, 4.4, 7.8]) {
    for (let z = o.z0 + 1; z < o.z1 - 1; z += 2.4) L.rectX(z, y, z + 1.8, y + 1.5, o.x1)
    for (let x = o.x0 + 1; x < o.x1 - 1; x += 2.4) L.rectZ(x, y, x + 1.8, y + 1.5, o.z1)
  }
  // the sprinkler tanks at the far end, and their pump house
  for (const [cx, cz] of [
    [X0 - 7, Z0 + 8],
    [X0 - 7, Z0 + 16],
  ] as [number, number][]) {
    for (const y of [0, 2.4, 4.8, 7.2]) circle(L, [cx, y, cz], 3.1, 'y', 28)
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2
      L.seg([cx + 3.1 * Math.cos(t), 0, cz + 3.1 * Math.sin(t)], [cx + 3.1 * Math.cos(t), 7.2, cz + 3.1 * Math.sin(t)])
    }
  }
  L.box([X0 - 6.5, 0, Z0 + 21], [X0 - 2.5, 3, Z0 + 25])
  return L
}
