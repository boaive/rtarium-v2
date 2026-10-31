import * as THREE from 'three'
import { Lines } from '../rain/building'
import { JOINT, LEN, merge } from './cornice'

/**
 * The apartment tower the stud frame cornice goes onto, after the client's Tower 2 and Tower 3
 * photographs: a stadium in plan (a straight front, rounded ends), every floor's slab edge carrying a
 * band that wraps right round it, swelling out round the ends, no two floors alike. On the straight
 * front the bands are the stud frame elements themselves (put up by the scene); round the ends and
 * along the back they are rings of the same concrete. The rest is a drawing (the Rainscreen page's
 * X-ray), and then the building finished: slabs, a curtain wall of glass all round, its frames.
 * Its front at z = 0 from x = 0 to `TOWER_W`; the bands at `bandY(k)`.
 */

type XZ = [number, number]

const PITCH = LEN + JOINT
export const TOWER = { storeys: 9, fh: 3.2, perFloor: 8, r: 5.2, margin: 0.16 } as const
export const TOWER_W = TOWER.margin * 2 + TOWER.perFloor * LEN + (TOWER.perFloor - 1) * JOINT
export const TOWER_H = TOWER.storeys * TOWER.fh
/** the middle of the i-th element along the front */
export const elementX = (i: number) => TOWER.margin + LEN / 2 + i * PITCH
/** the bottom of the cornice band of floor k: just under the slab above it */
export const bandY = (k: number) => (k + 1) * TOWER.fh - 0.8

/** the bands: how high, how far out from the slab edge (the cornice's own reach) */
export const BAND_H = 0.53
export const BAND_OUT = 0.54
/** how far floor k's band swells out round the ends beyond that */
export const swell = (k: number) => 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(k * 1.25 + 0.4))

/**
 * The plan's curve from the front right corner round the right end, along the back and round the left
 * end to the front left corner, grown by `g` all round and by `bulge` more at the ends (most at their
 * middles, nothing at the front or the back). Closed by the front, it is the whole stadium.
 */
export function arc(g: number, bulge = 0, n = 24): XZ[] {
  const { r } = TOWER
  const W = TOWER_W
  const pts: XZ[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI
    const R = r + g + bulge * Math.sin(a) ** 2
    pts.push([W + R * Math.sin(a), -r + R * Math.cos(a)])
  }
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI
    const R = r + g + bulge * Math.sin(a) ** 2
    pts.push([-R * Math.sin(a), -r - R * Math.cos(a)])
  }
  return pts
}

function poly(L: Lines, pts: XZ[], y: number, closed = true) {
  for (let i = 1; i < pts.length; i++) L.seg([pts[i - 1][0], y, pts[i - 1][1]], [pts[i][0], y, pts[i][1]])
  if (closed) L.seg([pts[pts.length - 1][0], y, pts[pts.length - 1][1]], [pts[0][0], y, pts[0][1]])
}

/** points every `step` metres along a closed outline */
function along(pts: XZ[], step: number): XZ[] {
  const out: XZ[] = []
  let carry = step / 2
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    let t = carry
    while (t < d) {
      out.push([a[0] + ((b[0] - a[0]) * t) / d, a[1] + ((b[1] - a[1]) * t) / d])
      t += step
    }
    carry = t - d
  }
  return out
}

/** the curtain wall's line: set back from the slab edge; a mullion every 1.5 m */
const GLASS_G = -0.35
const MULLION = 1.5
/** the core, in the middle of the plan */
const CORE = { x0: TOWER_W / 2 - 2.2, x1: TOWER_W / 2 + 2.2, z0: -TOWER.r - 2.4, z1: -TOWER.r + 1.4 }

/**
 * The tower as a drawing, kept light so it reads at a glance: every floor's slab edge; its band's top
 * edge round the ends and along the back (the front's are the elements themselves); the curtain wall's
 * sill and head all round, a mullion every 3 m; the core; the parapet and the
 * plant on the roof.
 */
export function towerLines() {
  const L = new Lines()
  const { storeys, fh } = TOWER
  const W = TOWER_W
  const slab = arc(0)
  const glass = arc(GLASS_G)
  const posts = along(glass, MULLION * 2)
  for (let k = 0; k <= storeys; k++) {
    const y = k * fh
    poly(L, slab, y)
    if (k === storeys) continue
    const b0 = bandY(k)
    poly(L, arc(BAND_OUT, swell(k)), b0 + BAND_H, false)
    // the curtain wall: its sill and its head under the band, its mullions
    const g0 = y + 0.05
    const g1 = b0 - 0.05
    for (const yy of [g0, g1]) poly(L, glass, yy)
    for (const [x, z] of posts) L.seg([x, g0, z], [x, g1, z])
  }
  const H = storeys * fh
  // the core, up to the roof
  L.box([CORE.x0, 0, CORE.z0], [CORE.x1, H, CORE.z1])
  // the roof: the parapet, its posts just inside it (evenly along the front and the back, at the same
  // angles round each end, so they mirror about the middle), plant
  poly(L, slab, H + 1.0)
  const R = TOWER.r - 0.15
  const posts2: XZ[] = []
  for (let i = 0; i <= 4; i++) posts2.push([(W * i) / 4, -0.15], [(W * i) / 4, -2 * TOWER.r + 0.15])
  for (const a of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) posts2.push([W + R * Math.sin(a), -TOWER.r + R * Math.cos(a)], [-R * Math.sin(a), -TOWER.r + R * Math.cos(a)])
  for (const [x, z] of posts2) L.seg([x, H, z], [x, H + 1.0, z])
  L.box([2.2, H, -TOWER.r - 2], [5.6, H + 1.6, -TOWER.r + 1])
  L.box([W - 5.6, H, -TOWER.r - 2], [W - 2.2, H + 1.6, -TOWER.r + 1])
  return L.geometry()
}

/** a flat outline extruded down from `top` by `depth`, rounded at its edges (`bevel`) */
function extrudeDown(outline: XZ[], hole: XZ[] | null, top: number, depth: number, bevel = 0) {
  // shape (x, −z) so that, laid flat (x, y) → (x, −y), the plan comes out the right way round
  const s = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)))
  if (hole) s.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))))
  const g = new THREE.ExtrudeGeometry(s, { depth: depth - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 })
  // laid flat, extruded up from the bottom
  g.rotateX(-Math.PI / 2)
  g.translate(0, top - depth + bevel, 0)
  g.computeVertexNormals()
  return g
}

/** floor k's band round the ends and along the back: an open ring of the cornice's concrete, rounded at its edges */
export function ringGeometry(k: number) {
  const outer = arc(BAND_OUT - 0.05, swell(k))
  const inner = arc(0.07).reverse()
  return extrudeDown([...outer, ...inner], null, bandY(k) + BAND_H, BAND_H, 0.05)
}

/** a vertical ribbon round a closed outline, from y0 to y1 */
function ribbon(pts: XZ[], y0: number, y1: number) {
  const pos: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[(i + 1) % pts.length]
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/**
 * The tower finished: the slabs, solid; the curtain wall's glass all round, floor by floor; its frames
 * (the mullions, sills, transoms and heads); the parapet and the core's head on the roof. In the scene
 * the glass is see-through, so the bands of concrete read through and round it.
 */
export function finishGeometry() {
  const { storeys, fh } = TOWER
  const slabOutline = arc(0)
  const glassLine = arc(GLASS_G, 0, 36)
  const frameLine = arc(GLASS_G + 0.08, 0, 36)
  const posts = along(arc(GLASS_G), MULLION)
  const slabs: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []
  const frames: THREE.BufferGeometry[] = []
  for (let k = 0; k <= storeys; k++) {
    const y = k * fh
    slabs.push(extrudeDown(slabOutline, null, y, 0.25))
    if (k === storeys) continue
    const g0 = y + 0.02
    const g1 = bandY(k) - 0.02
    glass.push(ribbon(glassLine, g0, g1))
    for (const yy of [g0 + 0.04, y + 1.1, g1 - 0.04]) frames.push(ribbon(frameLine, yy - 0.035, yy + 0.035))
    // (the ribbons carry no uv, so neither do the mullions they are merged with)
    for (const [x, z] of posts) frames.push(new THREE.BoxGeometry(0.09, g1 - g0, 0.09).translate(x, (g0 + g1) / 2, z).deleteAttribute('uv'))
  }
  const H = storeys * fh
  slabs.push(extrudeDown(slabOutline, arc(-0.25), H + 1.0, 1.0))
  slabs.push(new THREE.BoxGeometry(CORE.x1 - CORE.x0, 3.2, CORE.z1 - CORE.z0).translate((CORE.x0 + CORE.x1) / 2, H + 1.6, (CORE.z0 + CORE.z1) / 2))
  return { slabs: merge(slabs), glass: merge(glass), frames: merge(frames) }
}

/** the outline a scan line follows up the tower: just outside the bands all round */
export function scanLines() {
  const L = new Lines()
  poly(L, arc(BAND_OUT + 0.5, 1.1), 0)
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
