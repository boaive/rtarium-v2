import { Lines } from '../../data/three/dc'
import { circle, FLOOR, MOD, WAF } from './fab'

/**
 * The fab round the floor, as drawings, for Frame to floor (after the Micron cleanroom footage). Our
 * floor is the cleanroom's, on the waffle slab (its ribs' foot at y = 0, the piece of the build at
 * its front, its own tool on it); the building is laid out round it on a 7.2 m column grid:
 *
 *   bay      the cleanroom on our floor: process tools in rows either side of their aisles, the AMHS
 *            rails over the aisles on their hangers, the fan-filter ceiling over all of it
 *   under    the waffle slab's ribs on its underside, the concrete columns down through the subfab to
 *            its slab, the vacuum pumps and abatement in rows under the tools, the pipe racks
 *   fab      the column-free cleanroom's long-span trusses over the ceiling on their perimeter
 *            columns, the walls' joints, the roof and its air handlers, fans and exhaust stacks; the
 *            central utility building beside it with its chillers and cooling towers, the pipe bridge
 *
 * The front is left open, as an X-ray. Sizes are of the kind, not of a project.
 */

export const GRID = { x0: -20.6, nx: 6, bx: 7.2, z0: 3.0, nz: 3, bz: 7.2 }
export const X0 = GRID.x0
export const X1 = GRID.x0 + GRID.nx * GRID.bx
export const Z1 = GRID.z0
export const Z0 = GRID.z0 - GRID.nz * GRID.bz
/** the subfab's slab, the cleanroom's ceiling, the trusses' chords, the roof, the stacks' tops */
export const SUB = -6
export const CEIL = 5.6
export const CHORD = [7.2, 10.4] as const
export const ROOF = 10.6
export const STACK = 15.5
/** the central utility building, to the right */
export const CUB = { x0: X1 + 7, x1: X1 + 21, z0: Z0 + 3, z1: Z1 - 2, h: 9 }
const COLS_X = Array.from({ length: GRID.nx + 1 }, (_, i) => X0 + i * GRID.bx)
const COLS_Z = Array.from({ length: GRID.nz + 1 }, (_, j) => Z1 - j * GRID.bz)
/** the aisles, along x: the first in front of our piece's tool */
const AISLES = [1.45, -3.35, -8.15, -12.95]

/** a process tool from far: its process module, its front-end module and a FOUP on its port; front facing +z (`face` 1) or -z */
function tool(L: Lines, x: number, z: number, face: number) {
  const y = FLOOR
  const Z = (v: number) => z + v * face
  L.box([x - 0.65, y, Z(-0.5)], [x + 0.65, y + 1.95, Z(0.12)])
  L.box([x - 0.65, y, Z(0.12)], [x + 0.65, y + 1.62, Z(0.5)])
  L.box([x - 0.2, y + 0.83, Z(0.5)], [x + 0.2, y + 1.16, Z(0.82)])
  L.seg([x - 0.55, y + 1.24, Z(0.5)], [x + 0.55, y + 1.24, Z(0.5)])
}

export function bayLines() {
  const L = new Lines()
  // the tools in rows either side of each aisle, facing it (the piece's own tool drawn in full by the scene)
  for (const a of AISLES)
    for (const face of [1, -1]) {
      const z = a - face * 1.3
      for (let x = X0 + 1.4; x <= X1 - 1.4; x += 1.75) {
        if (a === AISLES[0] && face === 1 && x > -0.9 && x < 1.5) continue
        tool(L, x, z, face)
      }
    }
  // the AMHS rails over the aisles, their hangers up to the ceiling; the loops at their ends
  const ry = FLOOR + 3.4
  for (const a of AISLES) {
    for (const dz of [-0.11, 0.11]) L.seg([X0 + 1, ry, a + dz], [X1 - 1, ry, a + dz])
    for (let x = X0 + 1; x <= X1 - 1 + 1e-6; x += 2.4) L.seg([x, ry, a], [x, CEIL, a])
  }
  for (const x of [X0 + 1, X1 - 1]) L.seg([x, ry, AISLES[0]], [x, ry, AISLES[AISLES.length - 1]])
  // the fan-filter ceiling: its grid, a fan-filter unit's frame in every other cell
  for (let x = X0; x <= X1 + 1e-6; x += 1.2) L.seg([x, CEIL, Z0], [x, CEIL, Z1])
  for (let z = Z0; z <= Z1 + 1e-6; z += 1.2) L.seg([X0, CEIL, z], [X1, CEIL, z])
  return L
}

export function underLines() {
  const L = new Lines()
  const yb = WAF.depth - WAF.deck
  // the waffle's ribs on its underside, both ways, and its edge on the open front
  for (let x = Math.ceil(X0 / MOD) * MOD; x <= X1; x += MOD) L.seg([x, 0, Z0], [x, 0, Z1])
  for (let z = Math.ceil(Z0 / MOD - 0.5) * MOD + MOD / 2; z <= Z1; z += MOD) L.seg([X0, 0, z], [X1, 0, z])
  for (const y of [0, yb, WAF.depth]) L.seg([X0, y, Z1], [X1, y, Z1])
  for (let x = Math.ceil(X0 / MOD) * MOD; x <= X1; x += MOD) {
    L.seg([x - WAF.foot / 2, 0, Z1], [x - WAF.head / 2, yb, Z1])
    L.seg([x + WAF.foot / 2, 0, Z1], [x + WAF.head / 2, yb, Z1])
  }
  // the concrete columns down through the subfab, on their footings, under every grid point
  for (const x of COLS_X)
    for (const z of COLS_Z) {
      L.box([x - 0.4, SUB, z - 0.4], [x + 0.4, 0, z + 0.4])
      L.box([x - 0.8, SUB, z - 0.8], [x + 0.8, SUB + 0.06, z + 0.8])
    }
  // the subfab's slab
  L.rectZ(X0, SUB, X1, SUB, Z1)
  L.seg([X0, SUB, Z0], [X1, SUB, Z0])
  L.seg([X0, SUB, Z1], [X0, SUB, Z0])
  L.seg([X1, SUB, Z1], [X1, SUB, Z0])
  // the vacuum pumps and abatement in rows under the tools, and the pipe racks over them
  for (const a of AISLES)
    for (const face of [1, -1]) {
      const z = a - face * 1.3
      for (let x = X0 + 1.4; x <= X1 - 1.4; x += 1.75) {
        L.box([x - 0.42, SUB, z - 0.24], [x + 0.18, SUB + 0.55, z + 0.24])
        circleY(L, x + 0.3, SUB, z, 0.13, 0.42)
      }
    }
  for (const a of AISLES) {
    for (const y of [SUB + 3.2, SUB + 3.6]) for (const dz of [-0.35, 0.35]) L.seg([X0, y, a + dz], [X1, y, a + dz])
    for (let x = X0 + 1.8; x < X1; x += 3.6) {
      L.seg([x, SUB + 3.2, a - 0.4], [x, SUB + 3.2, a + 0.4])
      L.seg([x, SUB + 3.2, a], [x, 0, a])
    }
  }
  return L
}

/** an upright cylinder from y, its two rims and two lines down its sides */
function circleY(L: Lines, x: number, y: number, z: number, r: number, h: number) {
  circle(L, [x, y, z], r, 'y', 12)
  circle(L, [x, y + h, z], r, 'y', 12)
  L.seg([x - r, y, z], [x - r, y + h, z])
  L.seg([x + r, y, z], [x + r, y + h, z])
}

/** a Pratt truss across the building at x: its chords, verticals and diagonals */
function truss(L: Lines, x: number) {
  const [b, t] = CHORD
  L.seg([x, b, Z1], [x, b, Z0])
  L.seg([x, t, Z1], [x, t, Z0])
  const n = 12
  const dz = (Z1 - Z0) / n
  for (let k = 0; k <= n; k++) {
    const z = Z1 - k * dz
    L.seg([x, b, z], [x, t, z])
    if (k < n) {
      const z2 = z - dz
      if (k < n / 2) L.seg([x, t, z], [x, b, z2])
      else L.seg([x, b, z], [x, t, z2])
    }
  }
}

/** a steel column: an I-section outline at its foot and head, its flanges' edges */
function column(L: Lines, x: number, z: number, y0: number, y1: number) {
  const b = 0.32
  const h = 0.5
  for (const y of [y0, y1]) L.rectZ(x - b / 2, y, x + b / 2, y, z)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.seg([x + (sx * b) / 2, y0, z + (sz * h) / 2], [x + (sx * b) / 2, y1, z + (sz * h) / 2])
}

export function fabLines() {
  const L = new Lines()
  // the perimeter columns up from the waffle to the trusses' top chord; a truss on every grid line
  for (const x of COLS_X) {
    for (const z of [Z1, Z0]) column(L, x, z, FLOOR, CHORD[1])
    truss(L, x)
  }
  for (const x of [X0, X1]) for (const z of COLS_Z.slice(1, -1)) column(L, x, z, FLOOR, CHORD[1])
  // the purlins along the top chords; the bottom chords' ties
  for (let k = 0; k <= 12; k++) {
    const z = Z1 - (k * (Z1 - Z0)) / 12
    L.seg([X0, CHORD[1], z], [X1, CHORD[1], z])
  }
  for (const z of COLS_Z) L.seg([X0, CHORD[0], z], [X1, CHORD[0], z])
  // the walls: their panels' joints on the back and both ends, the corners, from the subfab up
  for (let y = SUB + 1.5; y < ROOF; y += 1.5) {
    L.seg([X0, y, Z0], [X1, y, Z0])
    L.seg([X0, y, Z1], [X0, y, Z0])
    L.seg([X1, y, Z1], [X1, y, Z0])
  }
  for (const x of [X0, X1]) for (const z of [Z1, Z0]) L.seg([x, SUB, z], [x, ROOF, z])
  // the roof's edge
  L.rectZ(X0, ROOF, X1, ROOF, Z1)
  L.seg([X0, ROOF, Z0], [X1, ROOF, Z0])
  L.seg([X0, ROOF, Z1], [X0, ROOF, Z0])
  L.seg([X1, ROOF, Z1], [X1, ROOF, Z0])
  // on the roof: the make-up air handlers along the back, the exhaust fans, the stacks
  for (let k = 0; k < 4; k++) {
    const x = X0 + 3 + k * 10
    L.box([x, ROOF, Z0 + 1.2], [x + 6.5, ROOF + 2.6, Z0 + 3.8])
    for (let s = 1; s < 4; s++) L.seg([x + s * 1.6, ROOF, Z0 + 3.8], [x + s * 1.6, ROOF + 2.6, Z0 + 3.8])
  }
  for (let k = 0; k < 5; k++) {
    const x = X0 + 5 + k * 8.2
    circleY(L, x, ROOF, Z0 + 8, 0.9, 1.2)
    circleY(L, x, ROOF, Z0 + 11.5, 0.45, STACK - ROOF)
  }
  // the central utility building: its box, its floors' lines, the chillers inside, the cooling towers on it
  const c = CUB
  L.box([c.x0, SUB, c.z0], [c.x1, c.h, c.z1])
  for (const y of [0, 4.5]) L.rectZ(c.x0, y, c.x1, y, c.z1)
  for (let k = 0; k < 4; k++) {
    const z = c.z1 - 2 - k * 3.6
    for (const y of [SUB + 0.9, SUB + 1.9]) L.seg([c.x0 + 1.5, y, z], [c.x1 - 1.5, y, z])
    for (const x of [c.x0 + 1.5, c.x1 - 1.5]) circle(L, [x, SUB + 1.4, z], 0.5, 'x', 14)
  }
  for (let k = 0; k < 3; k++) {
    const x = c.x0 + 1.5 + k * 4.2
    L.box([x, c.h, c.z0 + 1.5], [x + 3.6, c.h + 3.2, c.z0 + 5.1])
    circle(L, [x + 1.8, c.h + 3.2, c.z0 + 3.3], 1.4, 'y', 22)
    L.box([x, c.h, c.z1 - 5.1], [x + 3.6, c.h + 3.2, c.z1 - 1.5])
    circle(L, [x + 1.8, c.h + 3.2, c.z1 - 3.3], 1.4, 'y', 22)
  }
  // the pipe bridge from the utility building to the fab, on its bents
  for (const z of [-6.6, -7.8]) for (const y of [7.4, 8.2]) L.seg([X1, y, z], [c.x0, y, z])
  for (let x = X1 + 2.3; x < c.x0; x += 2.3) {
    L.seg([x, SUB, -6.6], [x, 8.2, -6.6])
    L.seg([x, SUB, -7.8], [x, 8.2, -7.8])
    L.seg([x, 7.4, -6.6], [x, 7.4, -7.8])
  }
  return L
}
