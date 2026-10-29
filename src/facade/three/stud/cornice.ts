import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * One stud frame element, the Stud Frame page's single object: a stepped classical cornice of thin
 * concrete (the architectural skin) on a galvanized steel stud frame, the two joined by flex anchors
 * (flexible L-shaped plates) bolted to ferrule inserts cast into the skin. The profile steps out in
 * right angles only, because RTARIUM is rigid: it is cut into flat strips, one for each face, and the
 * strips are stitched together at every 90° fold, never bent. Sizes illustrate the system; this is not a
 * product drawing.
 *
 * Axes (the element as installed): x along the wall, centred; y up; z out of the wall, the wall's face
 * at z = 0. The skin's profile starts BACK out from the wall; the frame stands in that room.
 */

export type P2 = [number, number]
export type V3 = [number, number, number]

/** the element's length along the wall */
export const LEN = 2.4
/** the skin (the client's target imprint, 16 to 20 mm), its face coat, and RTARIUM's two faces inside it, from the outer face */
export const SKIN = 0.018
export const COAT = 0.005
export const MESH: [number, number] = [0.0062, 0.0118]
/** the room between the wall and the skin's innermost line, where the frame stands */
export const BACK = 0.14
/** the open joint between two elements, sealed on site */
export const JOINT = 0.012

/**
 * The cornice in section, its outer face (u out from the skin's back line, v up), from the soffit at
 * the wall to the top back at the wall: a soffit, two fasciae each corbelled out over the last, a band,
 * the corona with its soffit, a fillet stepped back, the crown stepped out again, the top. Travelled
 * this way the concrete lies on the left. Every bend is a right angle.
 */
export const PROFILE: P2[] = [
  [0, 0],
  [0.14, 0],
  [0.14, 0.12],
  [0.18, 0.12],
  [0.18, 0.22],
  [0.24, 0.22],
  [0.24, 0.27],
  [0.37, 0.27],
  [0.37, 0.42],
  [0.34, 0.42],
  [0.34, 0.465],
  [0.4, 0.465],
  [0.4, 0.53],
  [0, 0.53],
]
/** the element's height */
export const HEIGHT = 0.53

/** the profile offset `d` into the concrete (to the left of travel), mitred at every bend */
export function offsetPath(path: P2[], d: number): P2[] {
  const n = path.length
  const normal = (a: P2, b: P2): P2 => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dx, dy) || 1
    return [-dy / l, dx / l]
  }
  return path.map((p, i) => {
    const n0 = i > 0 ? normal(path[i - 1], p) : null
    const n1 = i < n - 1 ? normal(p, path[i + 1]) : null
    if (!n0) return [p[0] + n1![0] * d, p[1] + n1![1] * d]
    if (!n1) return [p[0] + n0[0] * d, p[1] + n0[1] * d]
    const mx = n0[0] + n1[0]
    const my = n0[1] + n1[1]
    const ml = Math.hypot(mx, my) || 1
    const ux = mx / ml
    const uy = my / ml
    const k = d / Math.max(0.3, ux * n0[0] + uy * n0[1])
    return [p[0] + ux * k, p[1] + uy * k]
  })
}

/** a section point (u, v) of the skin as a point of the element */
export const toLocal = ([u, v]: P2, x = 0): V3 => [x, v, BACK + u]

/** the band of concrete between two depths of the skin, extruded along the element's length (x) */
export function bandGeometry(d0: number, d1: number, length = LEN) {
  const outer = offsetPath(PROFILE, d0)
  const inner = offsetPath(PROFILE, d1)
  const shape = new THREE.Shape()
  shape.moveTo(outer[0][0], outer[0][1])
  for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1])
  for (let i = inner.length - 1; i >= 0; i--) shape.lineTo(inner[i][0], inner[i][1])
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 1 })
  // shape (u, v) → (z, y); extruded along x, centred
  g.rotateY(-Math.PI / 2)
  g.translate(length / 2, 0, BACK)
  g.computeVertexNormals()
  g.computeBoundingBox()
  return g
}

/* ---- RTARIUM: flat strips, cut to each face, stitched at the folds -------------------------------- */

/**
 * RTARIUM in the skin as rovings: one flat strip for each face of the profile (it is cut, never bent),
 * each strip stopping just short of the fold so the cut reads; on each of the textile's two faces,
 * rovings along the element and across the strip, the second face offset half a pitch; the fibres that
 * hold the faces apart. The instances run strip by strip, so a scene can lay the strips in one after
 * another (`count`). The pitch is drawn larger than the real one so it reads at this size. `ends` adds
 * a column just outside each end, so the textile shows in a cut end's section.
 */
export interface Lattice {
  rovings: THREE.Matrix4[]
  fibres: THREE.Matrix4[]
  /** the first roving and fibre of each strip */
  starts: { rovings: number[]; fibres: number[] }
}
const CUT = 0.007
export function latticeMatrices(pitch = 0.03, ends = false): Lattice {
  const rovings: THREE.Matrix4[] = []
  const fibres: THREE.Matrix4[] = []
  const starts = { rovings: [] as number[], fibres: [] as number[] }
  const set = (out: THREE.Matrix4[], a: V3, b: V3, w: number, h: number, n: THREE.Vector3) => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const d = vb.clone().sub(va)
    const len = d.length()
    if (len < 1e-5) return
    const x = d.normalize()
    // the roving lies flat in its face: its thin side along the face's normal
    const z = n.clone().sub(x.clone().multiplyScalar(n.dot(x))).normalize()
    const y = z.clone().cross(x).normalize()
    const m = new THREE.Matrix4().makeBasis(x.multiplyScalar(len), y.multiplyScalar(w), z.multiplyScalar(h))
    m.setPosition(va.add(vb).multiplyScalar(0.5))
    out.push(m)
  }
  const half = LEN / 2
  const x0 = -half + 0.025
  const x1 = half - 0.025
  const faces = MESH.map((d) => offsetPath(PROFILE, d))
  for (let s = 1; s < PROFILE.length; s++) {
    starts.rovings.push(rovings.length)
    starts.fibres.push(fibres.length)
    faces.forEach((path, face) => {
      const a = path[s - 1]
      const b = path[s]
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      const t: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
      const at = (k: number): P2 => [a[0] + t[0] * k, a[1] + t[1] * k]
      // the face's normal: (u, v) → (z, y), turned a right angle
      const n = new THREE.Vector3(0, -t[0], t[1])
      const off = face * pitch * 0.5
      // rovings along the element, one row every pitch across the strip
      for (let k = CUT + 0.005 + (off % pitch); k < L - CUT - 0.004; k += pitch) {
        const p = at(k)
        set(rovings, toLocal(p, ends ? -half - 0.0006 : x0), toLocal(p, ends ? half + 0.0006 : x1), 0.0034, 0.0016, n)
      }
      // rovings across the strip, from cut edge to cut edge
      const cols: number[] = []
      for (let x = x0 + off; x <= x1 + 1e-6; x += pitch) cols.push(x)
      if (ends) cols.push(-half - 0.0006, half + 0.0006)
      for (const x of cols) set(rovings, toLocal(at(CUT), x), toLocal(at(L - CUT), x), 0.0034, 0.0016, n)
    })
    // the fibres between the faces, every other cell
    const [o0, o1] = [faces[0][s - 1], faces[0][s]]
    const [i0, i1] = [faces[1][s - 1], faces[1][s]]
    const L = Math.hypot(o1[0] - o0[0], o1[1] - o0[1])
    for (let k = CUT + 0.01; k < L - CUT - pitch * 0.5; k += pitch * 2) {
      const f = k / L
      const g = Math.min(1, (k + pitch * 0.5) / L)
      const p: P2 = [o0[0] + (o1[0] - o0[0]) * f, o0[1] + (o1[1] - o0[1]) * f]
      const q: P2 = [i0[0] + (i1[0] - i0[0]) * g, i0[1] + (i1[1] - i0[1]) * g]
      for (let x = x0; x < x1 - pitch; x += pitch * 2) set(fibres, toLocal(p, x), toLocal(q, x + pitch * 0.5), 0.0012, 0.0012, new THREE.Vector3(0, 0, 1))
    }
  }
  return { rovings, fibres, starts }
}

/**
 * The stitches: along every fold, a dark thread zigzagging across the cut between the two strips that
 * meet there (the Unitized page's stitch), from one end of the element to the other, so a scene can run
 * them along with `setDrawRange`.
 */
export const STITCH_SEGS = 8
export function stitchGeometries() {
  const mid = offsetPath(PROFILE, (MESH[0] + MESH[1]) / 2)
  const out: THREE.TubeGeometry[] = []
  const x0 = -LEN / 2 + 0.03
  const x1 = LEN / 2 - 0.03
  const n = Math.round((x1 - x0) / 0.022)
  for (let i = 1; i < mid.length - 1; i++) {
    const p = mid[i]
    const a: P2 = [mid[i - 1][0] - p[0], mid[i - 1][1] - p[1]]
    const b: P2 = [mid[i + 1][0] - p[0], mid[i + 1][1] - p[1]]
    const la = Math.hypot(...a)
    const lb = Math.hypot(...b)
    const r = 0.013
    const sa: P2 = [p[0] + (a[0] / la) * r, p[1] + (a[1] / la) * r]
    const sb: P2 = [p[0] + (b[0] / lb) * r, p[1] + (b[1] / lb) * r]
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= n; k++) pts.push(new THREE.Vector3(...toLocal(k % 2 ? sb : sa, x0 + ((x1 - x0) * k) / n)))
    out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), n * STITCH_SEGS, 0.0016, 5, false))
  }
  return out
}

/* ---- the stud frame, the flex anchors, the ferrule inserts ---------------------------------------- */

/** the frame's members: square hollow sections, in the room behind the skin */
export const FRAME = { z0: 0.035, z1: 0.075, y0: 0.04, y1: 0.48, studs: [-1.1, -0.55, 0, 0.55, 1.1], tube: 0.04 } as const

/** an axis-aligned block between two corners */
export function block(a: V3, b: V3) {
  const s = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])]
  return new THREE.BoxGeometry(s[0], s[1], s[2]).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
}

export function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
  parts.forEach((p) => p.dispose())
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/**
 * The frame member by member, in the order it is made: the two chords, the studs, the stiffeners.
 * Each is its own geometry, built along +y from its start, so the making can grow it from one end.
 */
export interface Member {
  /** the member along +y from its start; the mesh stands it at `from`, turned by `turn` */
  geo: THREE.BufferGeometry
  from: V3
  turn: THREE.Quaternion
}
export function frameMembers(): Member[] {
  const { z0, z1, y0, y1, studs, tube: w } = FRAME
  const zc = (z0 + z1) / 2
  const out: Member[] = []
  const add = (from: V3, to: V3, ww: number = w) => {
    const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2])
    const g = new THREE.BoxGeometry(ww, d.length(), ww).translate(0, d.length() / 2, 0)
    out.push({ geo: g, from, turn: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()) })
  }
  add([-1.17, y0, zc], [1.17, y0, zc])
  add([-1.17, y1, zc], [1.17, y1, zc])
  for (const x of studs) add([x, y0 + w / 2, zc], [x, y1 - w / 2, zc])
  // stiffeners: diagonals in the bays
  add([-1.1, y0 + 0.03, zc], [-0.55, y1 - 0.03, zc], 0.03)
  add([0.55, y1 - 0.03, zc], [1.1, y0 + 0.03, zc], 0.03)
  add([-0.55, y0 + 0.03, zc], [0, y1 - 0.03, zc], 0.03)
  add([0.55, y0 + 0.03, zc], [0, y1 - 0.03, zc], 0.03)
  return out
}

/**
 * Where the skin is anchored: on each anchored stud, one anchor to the back of the lower fascia and one
 * to the back of the corona. Each has its ferrule insert (set on RTARIUM before the backing, its open end
 * on the back face), and its flexible L plate from the stud to that insert.
 */
export interface AnchorPoint {
  x: number
  y: number
  /** the back face of the skin there (z) */
  z: number
}
export const ANCHOR_XS = [-1.1, -0.55, 0.55, 1.1]
export const ANCHORS: AnchorPoint[] = ANCHOR_XS.flatMap((x) => [
  { x, y: 0.068, z: BACK + 0.14 - SKIN },
  { x, y: 0.34, z: BACK + 0.37 - SKIN },
])
/** where a plate meets its stud, over its ferrule */
export const PLATE_RISE = 0.0325

/** the ferrule inserts: through RTARIUM down to the face coat, their open ends just proud of the skin's back */
export function ferruleGeometry() {
  const body: THREE.BufferGeometry[] = []
  const bore: THREE.BufferGeometry[] = []
  for (const a of ANCHORS) {
    const proud = a.z - 0.003
    const inner = a.z + SKIN - COAT
    body.push(new THREE.CylinderGeometry(0.009, 0.009, inner - proud, 14).rotateX(Math.PI / 2).translate(a.x, a.y, (inner + proud) / 2))
    bore.push(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0016, 12).rotateX(Math.PI / 2).translate(a.x, a.y, proud - 0.0006))
  }
  return { body: merge(body), bore: merge(bore) }
}

/** the holes drilled through the studs at the anchors' heights (the ferrules' intervals) */
export function holeGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (const a of ANCHORS) parts.push(new THREE.CylinderGeometry(0.0065, 0.0065, 0.0012, 12).rotateX(Math.PI / 2).translate(a.x, a.y + PLATE_RISE, FRAME.z1 + 0.0006))
  return merge(parts)
}

/**
 * The flex anchors: an L of thin plate from the stud's face to the ferrule, its long leg across the
 * room, its short leg turned down against the skin's back, bolted there. Each vertex carries how far
 * along the long leg it is (`aBend`, an S from 0 at the stud to 1 at the skin) and its plate's place
 * along the element (`aX`): the skin's growth in the day's heat bends the long leg sideways by that
 * much (see `flexMaterial`), which is what the anchor is for.
 */
export function plateGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const W = 0.05
  const T = 0.005
  for (const a of ANCHORS) {
    const z0 = FRAME.z1
    const z1 = a.z - 0.004
    const leg = new THREE.BoxGeometry(W, T, z1 - z0, 1, 1, 16).translate(a.x, a.y + PLATE_RISE, (z0 + z1) / 2)
    const foot = new THREE.BoxGeometry(W, 0.07, T).translate(a.x, a.y, z1 - T / 2)
    const bolt = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 6).rotateX(Math.PI / 2).translate(a.x, a.y, z1 - T - 0.003)
    const into = new THREE.CylinderGeometry(0.007, 0.007, 0.01, 6).rotateX(Math.PI / 2).translate(a.x, a.y + PLATE_RISE, z0 + 0.004)
    for (const g of [leg, foot, bolt, into]) {
      const p = g.getAttribute('position')
      const bend = new Float32Array(p.count)
      const px = new Float32Array(p.count).fill(a.x)
      for (let i = 0; i < p.count; i++) {
        const t = Math.min(1, Math.max(0, (p.getZ(i) - z0) / (z1 - z0)))
        bend[i] = g === leg ? t * t * (3 - 2 * t) : g === into ? 0 : 1
      }
      g.setAttribute('aBend', new THREE.BufferAttribute(bend, 1))
      g.setAttribute('aX', new THREE.BufferAttribute(px, 1))
      parts.push(g)
    }
  }
  return merge(parts)
}

/**
 * A material whose vertices are moved along x by the skin's thermal movement: `uFlex` is the skin's
 * strain (its growth, as a fraction of its length, about its middle); a vertex moves by
 * uFlex × aX × aBend. The skin itself is scaled by the same strain, so the plates and the skin agree.
 */
export function flexMaterial(base: THREE.MeshStandardMaterial) {
  const m = base.clone()
  m.userData = { ...base.userData }
  const uFlex = { value: 0 }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlex = uFlex
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBend;\nattribute float aX;\nuniform float uFlex;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += uFlex * aX * aBend;')
  }
  m.customProgramCacheKey = () => 'stud-flex'
  return { material: m, uFlex }
}

/**
 * A window cut back into the corona's face, through the face coat and into the backing, to where
 * RTARIUM lies (the opening's anatomy): x along the element, v up the corona. `CUTAWAY.depth` is how
 * deep it goes from the outer face.
 */
export const CUTAWAY = { x0: 0.32, x1: 0.98, v0: 0.29, v1: 0.4, u: 0.37, depth: 0.0124 } as const
