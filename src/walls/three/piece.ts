import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MM, slab, slabs } from './kit'

/**
 * A piece of panel as the client's drawings give it (30mm PANEL / 100mm PANEL, SECTION and PLAN, 28 Oct 2026),
 * stood upright: x across its 600 mm face, y up its length, z through it; +z is its inner face, where the
 * ferrules open. Lengths in metres.
 *
 *   30 mm   7.5 cover | 15 RTARIUM | 7.5 cover. The RTARIUM zone carries the joint: a 15 mm tongue, tapered from
 *           15 mm at its root to 6 mm at its tip, along the right edge; a 15 mm recess of the same shape along the
 *           left edge and the foot. A 3 mm GRP grid at the mesh's mid-plane: four rods along the length, 120 mm
 *           apart, and one across every 600 mm. Ferrule inserts on the mesh, 100 mm in from each long edge, on
 *           lines 1000 mm from each end and every 1600 to 2000 mm between; tie holes through the panel, 200 mm
 *           from each end and 150 mm in.
 *   100 mm  two 15 mm leaves (7 cover + 6 RTARIUM + 2 cover) on a 70 mm EPS/SPS core that stands 20 mm proud along
 *           the right edge and 20 mm short along the left edge and the foot. 3 mm GRP rods along the length in each
 *           mesh, 100 mm in from each long edge (none across, but one at each tie-clip line, locking the clips:
 *           owner); 2 mm GI tie-clips through the core on those lines (100 / 800 along the length), their lugs
 *           round the rods. Ferrules and tie holes as in the 30 mm panel (owner).
 */

export const PW = 0.6
export const J = 15 * MM
export const TIP = 6 * MM
export const T30 = { cover: 7.5 * MM, zone: 15 * MM }
export const T100 = { outer: 7 * MM, mesh: 6 * MM, inner: 2 * MM, leaf: 15 * MM, core: 70 * MM, recess: 20 * MM }
export const GRP_R = 1.5 * MM

/**
 * The ferrule inserts' lines along a panel (owner, 2 Nov 2026, and the 30 mm plan): 1000 mm in from each end, then
 * one every 1600 to 2000 mm between (3.6 m: 1000 / 1600 / 1000; 5.8 m: 1000 / 1900 / 1900 / 1000); a piece too short
 * for two has one, 1000 mm from its foot
 */
export function FERRULE_LINES(len: number) {
  if (len < 2.6) return [Math.min(1.0, len - 0.2)]
  const inner = len - 2.0
  const n = Math.max(1, Math.ceil(inner / 2.0 - 1e-6))
  return Array.from({ length: n + 1 }, (_, i) => 1.0 + (inner * i) / n)
}
/** where the features stand, from the foot (y) and the left edge (x): two ferrules on each line, 100 mm in from each long edge */
export const FERRULES = (len: number) => [0.1, 0.5].flatMap((x) => FERRULE_LINES(len).map((y) => [x, y] as [number, number]))
export const TIE_HOLES = (len: number) => [0.15, 0.45].flatMap((x) => [0.2, len - 0.2].filter((y, i) => y > 0.05 && y < len - 0.05 && (i === 0 || len > 2.2)).map((y) => [x, y] as [number, number]))
/** the 30 mm panel's GRP grid: along the length, and across */
export const GRP_ALONG = [0.12, 0.24, 0.36, 0.48]
export const GRP_ACROSS = (len: number) => Array.from({ length: Math.floor((len - 0.05) / 0.6) }, (_, i) => (i + 1) * 0.6).filter((y) => y < len - 0.05)
/** the 100 mm panel's rods and tie-clips: on the lines 100 mm in, the clips in the plan's 100 / 800 rhythm */
export const ROD_LINES = [0.1, 0.5]
export const CLIPS = (len: number) => {
  const out: number[] = []
  for (let k = 0; k < len; k++) for (const y of [k + 0.1, k + 0.9]) if (y < len - 0.05) out.push(y)
  return out
}

/**
 * The RTARIUM zone's cross-section (x across, z through), extruded up its length from `y0` to `y1`: its tongue
 * along the right edge, its recess along the left. `half` keeps the front half (z ≥ 0) or the back (z ≤ 0) only:
 * a panel split down its middle.
 */
export function zoneGeometry(w: number, y0: number, y1: number, half?: 'front' | 'back') {
  const h = T30.zone / 2
  const t = TIP / 2
  // (x, z), round the section: the top face, the tongue, the bottom face, the recess
  let pts: [number, number][] = [
    [0, h],
    [w, h],
    [w + J, t],
    [w + J, -t],
    [w, -h],
    [0, -h],
    [J, -t],
    [J, t],
  ]
  // a half, while the panel divides: its own side of the recess, its right edge flat (its half of the tongue apart)
  if (half === 'front')
    pts = [
      [0, h],
      [w, h],
      [w, 0],
      [J, 0],
      [J, t],
    ]
  if (half === 'back')
    pts = [
      [J, 0],
      [w, 0],
      [w, -h],
      [0, -h],
      [J, -t],
    ]
  return extrudeSection(pts, y0, y1)
}

/** the front half of the tongue, root (15 mm) to tip (6 mm), along the right edge */
export function tongueHalfGeometry(w: number, y0: number, y1: number) {
  const h = T30.zone / 2
  const t = TIP / 2
  return extrudeSection(
    [
      [w, h],
      [w + J, t],
      [w + J, 0],
      [w, 0],
    ],
    y0,
    y1,
  )
}

/** a cross-section (x, z) extruded up the panel's length, a tile to the metre */
function extrudeSection(pts: [number, number][], y0: number, y1: number) {
  // the shape is drawn in (x, −z) and extruded along its own +z, then stood up: its depth becomes y
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  // a tile to the metre, as the slabs
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const [u, v] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** a plain layer of the panel, across its face and up its length, between z0 and z1, faces and edges grouped */
export function layer(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  return slabs([slab(x0, x1, y0, y1, z0, z1)])
}

/** a rod along y (or along x) between two points, `r` thick */
export function rodGeometry(r = GRP_R) {
  const g = new THREE.CylinderGeometry(r, r, 1, 10, 1)
  g.translate(0, 0.5, 0)
  return g
}

/**
 * The GI tie-clip as it stands in the panel: a 2 mm plate, flat across the panel's length (thin in y), 20 mm wide
 * (x) and 86 mm through (z) over its two lugs, the lugs' holes taking the GRP rods (client's 2mm THK PLATE).
 */
export function clipGeometry() {
  const hb = 38 * MM
  const hw = 10 * MM
  const lug = 5 * MM
  const s = new THREE.Shape()
  s.moveTo(-hb, -hw)
  s.lineTo(hb, -hw)
  s.lineTo(hb, -lug)
  s.absarc(hb, 0, lug, -Math.PI / 2, Math.PI / 2, false)
  s.lineTo(hb, hw)
  s.lineTo(-hb, hw)
  s.lineTo(-hb, lug)
  s.absarc(-hb, 0, lug, Math.PI / 2, (3 * Math.PI) / 2, false)
  s.lineTo(-hb, -hw)
  for (const cx of [-(hb + 0.5 * MM), hb + 0.5 * MM]) {
    const h = new THREE.Path()
    h.absellipse(cx, 0, 2.7 * MM, 3.75 * MM, 0, Math.PI * 2, true, 0)
    s.holes.push(h)
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 2 * MM, bevelEnabled: false, curveSegments: 14 })
  // drawn with its length in x and its width in y: length to z, width to x, thickness to y
  g.translate(0, 0, -1 * MM)
  g.rotateX(Math.PI / 2)
  g.rotateY(Math.PI / 2)
  return g
}

/** the ferrule (and the eye bolt) are modelled standing up y, as the promo film's hardware; this turns one to stand along +z */
function standOnZ(g: THREE.BufferGeometry, top: number) {
  // y (its height) to z, its foot at z = 0; then set back so its top is at z = 0 and it reaches back into the panel
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, -top)
  return g
}

/**
 * A ferrule insert as the client's shoot shows it (and the promo film models it): a short bright-steel sleeve, 16 mm
 * across with its threaded bore, standing on a flat stamped washer plate 34 mm across, its rim a little dished. Its
 * mouth is at z = 0 (the panel's face); it reaches `len` back into the panel, the plate at its foot, on the mesh.
 */
export function ferruleGeometry(len: number) {
  const R = 0.008
  const r = 0.0052
  const h = len
  const ch = 0.0012
  // the sleeve, turned: its outer wall with a small chamfer at the top and a ring near its foot, then its bore
  const prof = [
    [r, h - 0.0006],
    [r + 0.0006, h],
    [R - ch, h],
    [R, h - ch],
    [R, 0.0016],
    [R + 0.0004, 0.0012],
    [R + 0.0004, 0.0008],
    [R, 0.0006],
    [R, 0],
    [r, 0],
    [r, h - 0.0006],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const sleeve = new THREE.LatheGeometry(prof, 32)
  // the washer plate, stamped: a slightly irregular rim, lifted a little towards its edge
  const shape = new THREE.Shape()
  const N = 36
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    const rr = 0.017 * (1 + 0.035 * Math.sin(a * 5 + 0.7) + 0.02 * Math.sin(a * 11))
    if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  const hole = new THREE.Path()
  hole.absarc(0, 0, r, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const plate = new THREE.ExtrudeGeometry(shape, { depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 1, curveSegments: 36 })
  plate.rotateX(-Math.PI / 2)
  plate.translate(0, -0.0002, 0)
  const pp = plate.getAttribute('position')
  for (let i = 0; i < pp.count; i++) {
    const d = Math.hypot(pp.getX(i), pp.getZ(i))
    pp.setY(i, pp.getY(i) + Math.max(0, d - 0.009) * 0.18)
  }
  const g = mergeGeometries([sleeve.toNonIndexed(), plate.index ? plate.toNonIndexed() : plate])!
  sleeve.dispose()
  plate.dispose()
  g.computeVertexNormals()
  return standOnZ(g, h)
}

/** the basalt yarn tying a ferrule's foot to the mesh: three crossed loops round the sleeve, two tails along the mesh (as the shoot) */
export function ferruleTieGeometry(len: number) {
  const parts: THREE.BufferGeometry[] = []
  for (let k = 0; k < 3; k++) {
    const t = new THREE.TorusGeometry(0.0089 + k * 0.0004, 0.0007, 6, 32)
    t.rotateX(Math.PI / 2 + (k - 1) * 0.18)
    t.rotateZ((k - 1) * 0.22)
    t.translate(0, 0.0028 + k * 0.0013, 0)
    parts.push(t.toNonIndexed())
    t.dispose()
  }
  for (const sgn of [1, -1]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(sgn * 0.0089, 0.0028, 0), new THREE.Vector3(sgn * 0.016, 0.0016, sgn * 0.004), new THREE.Vector3(sgn * 0.026, 0.0008, sgn * 0.003)])
    const tube = new THREE.TubeGeometry(c, 12, 0.0006, 5)
    parts.push(tube.toNonIndexed())
    tube.dispose()
  }
  const g = mergeGeometries(parts)!
  parts.forEach((x) => x.dispose())
  return standOnZ(g, len)
}

/** the threaded mouth of a ferrule, or a tie hole, seen in the face: a dark disc */
export function mouthGeometry(r: number) {
  return new THREE.CircleGeometry(r, 24)
}

/** a lifting hole's sleeve (20 mm across) through a layer, `t` thick, centred */
export function sleeveGeometry(t: number) {
  const g = new THREE.CylinderGeometry(10 * MM, 10 * MM, t, 20, 1, true)
  g.rotateX(Math.PI / 2)
  return g
}

/**
 * A forged eye bolt for lifting, as the shoot and the promo film have it: a ring on a neck and collar, a threaded shank
 * below. Its collar's underside is at the origin (it sits on the panel's face), the ring standing along +z, the shank
 * reaching 20 mm back into the ferrule.
 */
export function eyeBoltGeometry() {
  const ring = new THREE.TorusGeometry(0.016, 0.0046, 12, 36)
  ring.translate(0, 0.016 + 0.0046 + 0.006, 0)
  const neck = new THREE.CylinderGeometry(0.0062, 0.0075, 0.009, 20)
  neck.translate(0, 0.0045 + 0.0012, 0)
  const collar = new THREE.CylinderGeometry(0.011, 0.011, 0.0024, 28)
  collar.translate(0, 0.0012, 0)
  const shank = new THREE.CylinderGeometry(0.0047, 0.0047, 0.02, 14)
  shank.translate(0, -0.01, 0)
  const parts = [ring, neck, collar, shank]
  const g = mergeGeometries(parts.map((x) => x.toNonIndexed()))!
  parts.forEach((x) => x.dispose())
  // standing along +z, the collar's underside at z = 0
  g.rotateX(Math.PI / 2)
  return g
}
