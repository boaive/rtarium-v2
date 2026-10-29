import { Lines } from '../rain/building'
import { JOINT, LEN } from './cornice'

/**
 * The apartment tower the stud frame cornice goes onto, after the client's Tower 2 photograph: a
 * stadium in plan (a straight front, rounded ends), every floor's slab edge carrying a band that wraps
 * round the ends. On the straight front the bands are the stud frame elements themselves (solid, put up
 * by the scene); everything else is a drawing, the Rainscreen page's mid-fidelity X-ray: the slabs, the
 * bands round the ends and along the back, the glazing's mullions, the parapet and the core's head.
 * Its front at z = 0 from x = 0 to `TOWER.w`; the bands at `bandY(k)`.
 */

const PITCH = LEN + JOINT
export const TOWER = { storeys: 9, fh: 3.2, perFloor: 8, r: 5.2, margin: 0.16 } as const
export const TOWER_W = TOWER.margin * 2 + TOWER.perFloor * LEN + (TOWER.perFloor - 1) * JOINT
export const TOWER_H = TOWER.storeys * TOWER.fh
/** the middle of the i-th element along the front */
export const elementX = (i: number) => TOWER.margin + LEN / 2 + i * PITCH
/** the bottom of the cornice band of floor k: just under the slab above it */
export const bandY = (k: number) => (k + 1) * TOWER.fh - 0.8

/** a stadium's outline in plan at height y, grown by `g` all round */
function stadium(L: Lines, y: number, g = 0, n = 18) {
  const { r } = TOWER
  const W = TOWER_W
  const R = r + g
  L.seg([0, y, g], [W, y, g])
  L.seg([W, y, -2 * r - g], [0, y, -2 * r - g])
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI
    const a1 = ((i + 1) / n) * Math.PI
    // the right end, from the front round to the back; the left end, from the back round to the front
    L.seg([W + R * Math.sin(a0), y, -r + R * Math.cos(a0)], [W + R * Math.sin(a1), y, -r + R * Math.cos(a1)])
    L.seg([-R * Math.sin(a0), y, -r - R * Math.cos(a0)], [-R * Math.sin(a1), y, -r - R * Math.cos(a1)])
  }
}

export function towerLines() {
  const L = new Lines()
  const { storeys, fh, r } = TOWER
  const W = TOWER_W
  for (let k = 0; k <= storeys; k++) {
    const y = k * fh
    // the slab: its top and its underside
    stadium(L, y)
    if (k) stadium(L, y - 0.25)
    if (k === storeys) continue
    // the band round the ends and along the back (the front's is the elements themselves)
    const b0 = bandY(k)
    const b1 = b0 + 0.53
    for (const yy of [b0, b1]) {
      const R = r + 0.5
      for (let i = 0; i < 18; i++) {
        const a0 = (i / 18) * Math.PI
        const a1 = ((i + 1) / 18) * Math.PI
        L.seg([W + R * Math.sin(a0), yy, -r + R * Math.cos(a0)], [W + R * Math.sin(a1), yy, -r + R * Math.cos(a1)])
        L.seg([-R * Math.sin(a0), yy, -r - R * Math.cos(a0)], [-R * Math.sin(a1), yy, -r - R * Math.cos(a1)])
      }
      L.seg([W, yy, -2 * r - 0.5], [0, yy, -2 * r - 0.5])
    }
    // the glazing's mullions, between the slab and the band: along the front and the back, round the ends
    const g0 = y + 0.05
    const g1 = b0 - 0.05
    for (let x = 0.8; x < W - 0.4; x += 1.6) {
      L.seg([x, g0, -0.3], [x, g1, -0.3])
      L.seg([x, g0, -2 * r + 0.3], [x, g1, -2 * r + 0.3])
    }
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * Math.PI
      const R = r - 0.3
      L.seg([W + R * Math.sin(a), g0, -r + R * Math.cos(a)], [W + R * Math.sin(a), g1, -r + R * Math.cos(a)])
      L.seg([-R * Math.sin(a), g0, -r - R * Math.cos(a)], [-R * Math.sin(a), g1, -r - R * Math.cos(a)])
    }
  }
  // the parapet, the core's head on the roof
  const H = storeys * fh
  stadium(L, H + 1.0)
  for (const [x, z] of [
    [0, 0],
    [W, 0],
    [0, -2 * r],
    [W, -2 * r],
  ])
    L.seg([x, H, z], [x, H + 1.0, z])
  L.box([W / 2 - 2, H, -r - 2], [W / 2 + 2, H + 3.2, -r + 1.2])
  return L.geometry()
}

/** the bay's surroundings, as a drawing: the slabs above and below, and the glazing's mullions under the band */
export function bayLines(x0: number, x1: number, k: number) {
  const L = new Lines()
  for (const y of [k * TOWER.fh + TOWER.fh, k * TOWER.fh]) L.box([x0 - 0.9, y - 0.25, -1.4], [x1 + 0.9, y, -0.25])
  const g0 = k * TOWER.fh + 0.05
  const g1 = bandY(k) - 0.35
  L.seg([x0 - 0.9, g0, -0.3], [x1 + 0.9, g0, -0.3])
  L.seg([x0 - 0.9, g1, -0.3], [x1 + 0.9, g1, -0.3])
  for (let x = 0.8 + Math.ceil((x0 - 1.7) / 1.6) * 1.6; x < x1 + 0.9; x += 1.6) L.seg([x, g0, -0.3], [x, g1, -0.3])
  return L.geometry()
}
