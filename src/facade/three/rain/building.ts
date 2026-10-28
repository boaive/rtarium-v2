import * as THREE from 'three'
import { G, wallWidth } from './parts'

/** line segments, kept as a flat list of points */
export class Lines {
  pts: number[] = []
  seg(a: number[], b: number[]) {
    this.pts.push(a[0], a[1], a[2], b[0], b[1], b[2])
  }
  /** a rectangle in a plane of constant z */
  rectZ(x0: number, y0: number, x1: number, y1: number, z: number) {
    this.seg([x0, y0, z], [x1, y0, z])
    this.seg([x1, y0, z], [x1, y1, z])
    this.seg([x1, y1, z], [x0, y1, z])
    this.seg([x0, y1, z], [x0, y0, z])
  }
  /** a rectangle in a plane of constant x */
  rectX(z0: number, y0: number, z1: number, y1: number, x: number) {
    this.seg([x, y0, z0], [x, y0, z1])
    this.seg([x, y0, z1], [x, y1, z1])
    this.seg([x, y1, z1], [x, y1, z0])
    this.seg([x, y1, z0], [x, y0, z0])
  }
  box(a: number[], b: number[]) {
    const [x0, y0, z0] = a
    const [x1, y1, z1] = b
    this.rectZ(x0, y0, x1, y1, z0)
    this.rectZ(x0, y0, x1, y1, z1)
    for (const [x, y] of [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ])
      this.seg([x, y, z0], [x, y, z1])
  }
  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pts, 3))
    g.computeBoundingSphere()
    return g
  }
}

export interface Block {
  cols: number
  storeys: number
  depth: number
  /** the floors (from the bottom) whose edges still carry protection: the open floors above the clad ones */
  openFrom?: number
}

/**
 * The building behind the rainscreen, as fine lines (an X-ray), drawn as the Unitized page's
 * apartment block is: on each floor the slab with its edges, columns on a grid, the corridor's two
 * walls with a door into each flat, the party walls between the flats and a room wall in each, the
 * back wall's windows with their mullions and sills, the end walls' windows along their depth and the
 * floor's band; the stair core and its two flights; the parapet, the core's head and the plant on the
 * roof; on the floors still open, posts and two rails along the front. Its front is the plane of the
 * wall the rainscreen is fixed to (z = 0), the façade's own grid (a flat to every two bays).
 */
export function buildingLines({ cols, storeys, depth, openFrom }: Block) {
  const L = new Lines()
  const W = wallWidth(cols)
  const bay = G.pw + G.ww
  // the slabs and end walls stop just past the cladding, so nothing pokes out beyond its ends
  const x0 = -0.05
  const x1 = W + 0.05
  const zb = -depth
  const zf = -0.24
  const ST = 0.26
  const lvl = (s: number) => s * G.fh
  const cz = -depth / 2
  const core = { x0: W / 2 - 1.5, x1: W / 2 + 1.5, z0: cz - 0.9 - 3.2, z1: cz - 0.9 }
  for (let s = 0; s <= storeys; s++) L.box([x0, lvl(s) - ST, zb], [x1, lvl(s), zf])
  // the building's four corners, the height of the block, so its ends read as walls
  for (const x of [x0, x1]) for (const z of [zf, zb]) L.seg([x, 0, z], [x, lvl(storeys), z])
  // columns on a grid, front, middle and back
  for (let x = bay / 2; x <= W; x += 2 * bay) for (const z of [zf - 0.5, cz, zb + 0.5]) L.box([x - 0.2, 0, z - 0.2], [x + 0.2, lvl(storeys) - ST, z + 0.2])
  for (let s = 0; s < storeys; s++) {
    const y0 = lvl(s)
    const y1 = lvl(s + 1) - ST
    // the corridor's two walls, a door into each flat
    for (const z of [cz + 0.9, cz - 0.9]) {
      L.rectZ(x0 + 0.3, y0, x1 - 0.3, y1, z)
      for (let x = bay; x < W; x += 2 * bay) L.rectZ(x - 0.45, y0, x + 0.45, y0 + 2.1, z)
    }
    // party walls between the flats, front and back of the corridor; a room wall in each flat, with its door
    for (let x = 2 * bay; x < W - 0.1; x += 2 * bay) {
      L.rectX(zf - 0.3, y0, cz + 0.9, y1, x)
      if (x < core.x0 || x > core.x1) L.rectX(cz - 0.9, y0, zb + 0.3, y1, x)
    }
    for (let x = bay; x < W - 0.1; x += 2 * bay) {
      L.rectX(zf - 0.3, y0, zf - Math.min(3.2, depth * 0.3), y1, x)
      L.rectX(zf - 1.2, y0, zf - 2.1, y0 + 2.1, x)
      if (x < core.x0 || x > core.x1) L.rectX(zb + 0.3, y0, zb + Math.min(3.2, depth * 0.3), y1, x)
    }
    // the back wall's windows, each with its mullion and sill
    for (let k = 0; k < cols; k++) {
      const a = k * bay + 0.25
      const b = a + bay - 0.5
      L.rectZ(a, y0 + 0.9, b, y1 - 0.35, zb)
      L.seg([(a + b) / 2, y0 + 0.9, zb], [(a + b) / 2, y1 - 0.35, zb])
      L.seg([a - 0.08, y0 + 0.86, zb + 0.06], [b + 0.08, y0 + 0.86, zb + 0.06])
    }
    // the end walls: windows along their depth, with mullions; the floor's band
    for (const x of [x0, x1]) {
      const n = Math.max(2, Math.round(depth / 3.2))
      for (let i = 0; i < n; i++) {
        const a = zf - 1.1 - (i * (depth - 2.2)) / n
        const b = a - 1.4
        L.rectX(a, y0 + 0.9, b, y1 - 0.35, x)
        L.seg([x, y0 + 0.9, (a + b) / 2], [x, y1 - 0.35, (a + b) / 2])
      }
      L.seg([x, y1, zf], [x, y1, zb])
    }
    // the stair core and its two flights
    L.rectX(core.z0, y0, core.z1, y1, core.x0)
    L.rectX(core.z0, y0, core.z1, y1, core.x1)
    L.rectZ(core.x0, y0, core.x1, y1, core.z0)
    const mid = (y0 + y1 + ST) / 2
    L.seg([core.x0 + 0.2, y0, core.z1 - 0.3], [core.x0 + 0.2, mid, core.z0 + 0.4])
    L.seg([core.x0 + 1.2, y0, core.z1 - 0.3], [core.x0 + 1.2, mid, core.z0 + 0.4])
    L.seg([core.x1 - 1.2, mid, core.z0 + 0.4], [core.x1 - 1.2, y1 + ST, core.z1 - 0.3])
    L.seg([core.x1 - 0.2, mid, core.z0 + 0.4], [core.x1 - 0.2, y1 + ST, core.z1 - 0.3])
    L.seg([core.x0 + 0.2, mid, core.z0 + 0.4], [core.x1 - 0.2, mid, core.z0 + 0.4])
  }
  // edge protection on the floors still open: posts and two rails along every open edge
  if (openFrom !== undefined)
    for (let s = openFrom; s <= storeys; s++) {
      const y = lvl(s)
      for (const h of [0.5, 1.05]) {
        L.seg([x0, y + h, 0.3], [x1, y + h, 0.3])
        L.seg([x0, y + h, 0.3], [x0, y + h, zb])
        L.seg([x1, y + h, 0.3], [x1, y + h, zb])
      }
      for (let x = x0; x <= x1 + 0.01; x += 1.2) L.seg([x, y, 0.3], [x, y + 1.1, 0.3])
    }
  // the roof: its parapet, the core's head, plant
  const roof = lvl(storeys)
  L.box([x0, roof, zb], [x1, roof + 0.9, zf])
  L.box([core.x0, roof, core.z0], [core.x1, roof + 2.6, core.z1])
  L.box([0.8, roof, zb + 1.2], [Math.min(W * 0.3, 4), roof + 1.4, zb + Math.min(3.5, depth * 0.4)])
  if (W > 10) L.box([W - 5, roof, zb + 1.2], [W - 1.5, roof + 1.4, zb + 3.5])
  return L.geometry()
}

/**
 * A tower crane, as fine lines: its footing, a lattice mast `mastH` high, the slewing deck and cab,
 * the tower head with its pendants, a lattice jib along +x and the counter-jib with its weights.
 * The jib is drawn along +x from the mast; a scene turns it to face the hook.
 */
export function craneLines(mastH: number, head = 5.5, jib = 28, counter = 9) {
  const mast = new Lines()
  const arm = new Lines()
  const s = 1
  const corners = [
    [-s, -s],
    [s, -s],
    [s, s],
    [-s, s],
  ]
  mast.box([-1.4, 0, -1.4], [1.4, 0.8, 1.4])
  for (const [x, z] of corners) mast.seg([x, 0.8, z], [x, mastH, z])
  for (let y = 0.8, k = 0; y < mastH - 0.1; y += 2, k++)
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c]
      const [bx, bz] = corners[(c + 1) % 4]
      const yn = Math.min(mastH, y + 2)
      mast.seg([ax, y, az], [bx, y, bz])
      if (k % 2) mast.seg([ax, y, az], [bx, yn, bz])
      else mast.seg([bx, y, bz], [ax, yn, az])
    }
  const yb = mastH + 0.4
  const yt = mastH + 1.9
  arm.box([-1.4, mastH, -1.4], [1.4, yb, 1.4])
  arm.box([1.2, mastH - 2.2, 1.1], [3.2, mastH, 3.0])
  const w = 0.75
  arm.seg([0, yb, -w], [jib, yb, -w])
  arm.seg([0, yb, w], [jib, yb, w])
  arm.seg([0, yt, 0], [jib - 1.5, yt, 0])
  arm.seg([jib, yb, -w], [jib, yb, w])
  arm.seg([jib, yb, -w], [jib - 1.5, yt, 0])
  arm.seg([jib, yb, w], [jib - 1.5, yt, 0])
  for (let x = 0; x < jib - 1.5; x += 2) {
    arm.seg([x, yb, -w], [x, yb, w])
    arm.seg([x, yb, -w], [x + 1, yt, 0])
    arm.seg([x, yb, w], [x + 1, yt, 0])
    arm.seg([x + 2, yb, -w], [x + 1, yt, 0])
    arm.seg([x + 2, yb, w], [x + 1, yt, 0])
  }
  arm.seg([0, yb, -w], [-counter, yb, -w])
  arm.seg([0, yb, w], [-counter, yb, w])
  for (let x = -2; x >= -counter; x -= 2) arm.seg([x, yb, -w], [x, yb, w])
  for (let k = 0; k < 3; k++) arm.box([-counter + k * 1.05, yb - 1.8, -w], [-counter + k * 1.05 + 1, yb, w])
  const top = mastH + head
  for (const z of [-0.6, 0.6]) {
    arm.seg([-0.6, yb, z], [0, top, 0])
    arm.seg([0.6, yb, z], [0, top, 0])
  }
  arm.seg([0, top, 0], [jib * 0.55, yt, 0])
  arm.seg([0, top, 0], [jib * 0.95, yt, 0])
  arm.seg([0, top, 0], [-counter + 0.5, yb, 0])
  return { mast: mast.geometry(), jib: arm.geometry() }
}

/**
 * RTARIUM in a panel's shape as an X-ray: its two faces as grids of lines either side of
 * mid-thickness, the second offset by half a pitch, a few of the fibres between them. The pitch is
 * drawn larger than the real 12 mm so it reads at this size.
 */
export function latticeLines([x0, y0, x1, y1]: [number, number, number, number], zm: number, pitch = 0.07) {
  const L = new Lines()
  for (const [dz, off] of [
    [-0.004, 0],
    [0.004, pitch / 2],
  ] as const) {
    const z = zm + dz
    for (let y = y0 + 0.02 + off; y < y1 - 0.01; y += pitch) L.seg([x0 + 0.015, y, z], [x1 - 0.015, y, z])
    for (let x = x0 + 0.02 + off; x < x1 - 0.01; x += pitch) L.seg([x, y0 + 0.015, z], [x, y1 - 0.015, z])
  }
  for (let x = x0 + 0.02; x < x1 - 0.02; x += pitch * 2) for (let y = y0 + 0.02; y < y1 - 0.02; y += pitch * 2) L.seg([x, y, zm - 0.004], [x + pitch / 2, y + pitch / 2, zm + 0.004])
  return L.geometry()
}
