import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { grainTexture } from '../kit'

/**
 * One unitized façade unit, layer by layer, for the Unitized Thin Concrete Façade page. Every layer
 * is one merged geometry, built at the depth it has in the finished unit, so a scene can move a
 * layer as a whole (the burst) or show it as lines (the X-ray) without knowing how it is made.
 *
 * Sizes are illustrative (a storey-high unit, 2.4 × 3.3 m), not a product drawing. Axes: x along
 * the façade, y up, z out of the building; the frame's back is z = 0.
 *
 *   frame       steel members round the unit and the window, the anchor plates on its face
 *   window      aluminium frame, two lights, the glass apart (its own material)
 *   gasket      one rubber loop round the window, where it meets the panel's returns
 *   vapour      the membrane on the warm side of the insulation
 *   insulation  boards in front of the membrane
 *   panel       the thin concrete skin (20 mm), its returns into the opening, ferrules and anchor rods
 */

export const U = { w: 2.4, h: 3.3, x0: 0.62, x1: 1.78, y0: 0.98, y1: 2.6 } as const
/** where each layer sits in depth (m) */
export const Z = {
  frame: [0, 0.12],
  vapour: 0.124,
  insulation: [0.128, 0.205],
  panel: [0.212, 0.232],
  window: [0.13, 0.192],
  gasket: 0.2,
} as const
/** the frame's members */
const T = 0.07
/** the reveal round the window: how far the opening widens from the window out to the face, at the jambs, head and sill */
export const REVEAL = { jamb: 0.14, head: 0.09, sill: 0.025 }
/** the opening at the face of the skin, where the reveal begins */
export const FACE_OPEN = { x0: U.x0 - REVEAL.jamb, x1: U.x1 + REVEAL.jamb, y0: U.y0 - REVEAL.sill, y1: U.y1 + REVEAL.head }
/** the joint between neighbouring units: each skin stops short of the unit's edge by half of it */
const JOINT = 0.008

export type Layer = 'frame' | 'window' | 'gasket' | 'vapour' | 'insulation' | 'panel'
/** in the client's order, from the face of the building inwards */
export const LAYERS: Layer[] = ['panel', 'insulation', 'vapour', 'gasket', 'window', 'frame']
/** the order they are put together in: from the back */
export const BUILD: Layer[] = ['frame', 'window', 'gasket', 'vapour', 'insulation', 'panel']

type V3 = [number, number, number]

/** an axis-aligned block between two corners */
export function block(a: V3, b: V3) {
  const s = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])]
  return new THREE.BoxGeometry(s[0], s[1], s[2]).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
}

/** texture coordinates projected from the position, so a grain runs on across the blocks a surface is made of */
export function planarUV(g: THREE.BufferGeometry, k = 1.6) {
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const [u, v] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]
    uv[i * 2] = u * k
    uv[i * 2 + 1] = v * k
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

export function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
  parts.forEach((p) => p.dispose())
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/** the rectangles of the unit outside an opening (by default the window's; inset from the edges by `e`) */
function bays(e = 0, o: { x0: number; x1: number; y0: number; y1: number } = U): [number, number, number, number][] {
  const { w, h } = U
  const { x0, x1, y0, y1 } = o
  return [
    [e, e, x0, h - e],
    [x1, e, w - e, h - e],
    [x0, e, x1, y0],
    [x0, y1, x1, h - e],
  ]
}

/* ---- the layers ----------------------------------------------------------------------------- */

/** where the frame carries the panel: the anchor points, on its stiles */
export const ANCHORS: [number, number][] = [
  [T / 2, 0.42],
  [T / 2, U.h / 2],
  [T / 2, U.h - 0.42],
  [U.w - T / 2, 0.42],
  [U.w - T / 2, U.h / 2],
  [U.w - T / 2, U.h - 0.42],
]

export function frameGeometry() {
  const { w, h, x0, x1, y0, y1 } = U
  const [z0, z1] = Z.frame
  const parts = [
    block([0, 0, z0], [T, h, z1]),
    block([w - T, 0, z0], [w, h, z1]),
    block([T, 0, z0], [w - T, T, z1]),
    block([T, h - T, z0], [w - T, h, z1]),
    // jambs the full height, sill and head between them
    block([x0 - T, T, z0], [x0, h - T, z1]),
    block([x1, T, z0], [x1 + T, h - T, z1]),
    block([x0, y0 - T, z0], [x1, y0, z1]),
    block([x0, y1, z0], [x1, y1 + T, z1]),
    // a rail across each side bay
    block([T, 1.55, z0], [x0 - T, 1.55 + T * 0.8, z1]),
    block([x1 + T, 1.55, z0], [w - T, 1.55 + T * 0.8, z1]),
  ]
  for (const [x, y] of ANCHORS) parts.push(block([x - 0.05, y - 0.06, z1], [x + 0.05, y + 0.06, z1 + 0.008]))
  return merge(parts)
}

const WF = 0.046
/** the window's outer edge, just inside the reveal */
const WIN = { x0: U.x0 + 0.012, x1: U.x1 - 0.012, y0: U.y0 + 0.012, y1: U.y1 - 0.012 }

export function windowGeometry() {
  const [z0, z1] = Z.window
  const { x0, x1, y0, y1 } = WIN
  const mid = (x0 + x1) / 2
  return merge([
    block([x0, y0, z0], [x0 + WF, y1, z1]),
    block([x1 - WF, y0, z0], [x1, y1, z1]),
    block([x0 + WF, y0, z0], [x1 - WF, y0 + WF, z1]),
    block([x0 + WF, y1 - WF, z0], [x1 - WF, y1, z1]),
    block([mid - WF * 0.45, y0 + WF, z0], [mid + WF * 0.45, y1 - WF, z1]),
    // a transom over the lower lights
    block([x0 + WF, 1.52, z0 + 0.008], [x1 - WF, 1.52 + WF * 0.7, z1 - 0.008]),
    // the sill flashing: out over the reveal and past the face, a drip under its edge
    block([U.x0 - 0.01, U.y0 - 0.012, z0], [U.x1 + 0.01, U.y0 + 0.004, Z.panel[1] + 0.028]),
  ])
}

/** the two lights, double glazed: one slab of glass each, read as a pane */
export function glassGeometry() {
  const zc = (Z.window[0] + Z.window[1]) / 2
  const { x0, x1, y0, y1 } = WIN
  const mid = (x0 + x1) / 2
  return merge([block([x0 + WF, y0 + WF, zc - 0.012], [mid - WF * 0.45, y1 - WF, zc + 0.012]), block([mid + WF * 0.45, y0 + WF, zc - 0.012], [x1 - WF, y1 - WF, zc + 0.012])])
}

/** the glass as one rectangle, for the light that crosses it */
export const GLASS_RECT = { x0: WIN.x0 + WF, x1: WIN.x1 - WF, y0: WIN.y0 + WF, y1: WIN.y1 - WF, z: Z.window[1] - 0.026 }

/** one loop of rubber round the window, with rounded corners, as a path along which it can be drawn */
export function gasketGeometry(radius = 0.011) {
  const { x0, x1, y0, y1 } = WIN
  const r = 0.035
  const z = Z.gasket
  const path = new THREE.CurvePath<THREE.Vector3>()
  const pts: THREE.Vector3[] = []
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2)
      pts.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), z))
    }
  }
  // from the middle of the sill, anticlockwise seen from outside
  pts.push(new THREE.Vector3((x0 + x1) / 2, y0, z))
  arc(x1 - r, y0 + r, -Math.PI / 2)
  arc(x1 - r, y1 - r, 0)
  arc(x0 + r, y1 - r, Math.PI / 2)
  arc(x0 + r, y0 + r, Math.PI)
  pts.push(new THREE.Vector3((x0 + x1) / 2, y0, z))
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]))
  const g = new THREE.TubeGeometry(path, 320, radius, 10, false)
  g.computeBoundingSphere()
  return g
}

/** the membrane: four strips round the opening, finely divided so it can ripple */
export function vapourGeometry() {
  const parts = bays(0.03).map(([a, b, c, d]) => {
    const w = c - a
    const h = d - b
    return new THREE.PlaneGeometry(w, h, Math.max(2, Math.round(w * 14)), Math.max(2, Math.round(h * 14))).translate((a + c) / 2, (b + d) / 2, Z.vapour)
  })
  return merge(parts)
}

/** insulation boards, 0.6 m wide, with fine joints between them */
export function insulationGeometry() {
  const [z0, z1] = Z.insulation
  const parts: THREE.BufferGeometry[] = []
  const gap = 0.008
  const o = FACE_OPEN
  for (const [a, b, c, d] of bays(0.035, { x0: o.x0 - 0.01, x1: o.x1 + 0.01, y0: o.y0 - 0.01, y1: o.y1 + 0.01 })) {
    const nx = Math.max(1, Math.round((c - a) / 0.6))
    const ny = Math.max(1, Math.round((d - b) / 1.2))
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const xa = a + ((c - a) * i) / nx + gap / 2
        const xb = a + ((c - a) * (i + 1)) / nx - gap / 2
        const ya = b + ((d - b) * j) / ny + gap / 2
        const yb = b + ((d - b) * (j + 1)) / ny - gap / 2
        parts.push(block([xa, ya, z0], [xb, yb, z1]))
      }
  }
  return planarUV(merge(parts), 2.2)
}

/**
 * The reveal: four faces splaying out from the window to the opening in the face of the skin, deep
 * and widening to the jambs, shallower over the head, nearly flat at the sill, as precast
 * windows are framed. It starts just inside the window's own frame, so no slot is left between the
 * two to see the ground through, from any side.
 */
function revealGeometry() {
  const IN = 0.003
  const [x0, x1, y0, y1] = [WIN.x0 + IN, WIN.x1 - IN, WIN.y0 + IN, WIN.y1 - IN]
  const o = FACE_OPEN
  const zr = Z.window[0] + IN
  const zf = Z.panel[1]
  const pos: number[] = []
  // each face as two triangles, wound so it faces into the opening and out of the building
  const quad = (a: number[], b: number[], c: number[], d: number[], want: [number, number, number]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const ok = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] > 0
    const tri = ok ? [a, b, c, a, c, d] : [a, c, b, a, d, c]
    for (const p of tri) pos.push(...p)
  }
  quad([x0, y0, zr], [x0, y1, zr], [o.x0, o.y1, zf], [o.x0, o.y0, zf], [1, 0, 1])
  quad([x1, y0, zr], [x1, y1, zr], [o.x1, o.y1, zf], [o.x1, o.y0, zf], [-1, 0, 1])
  quad([x0, y1, zr], [x1, y1, zr], [o.x1, o.y1, zf], [o.x0, o.y1, zf], [0, -1, 1])
  quad([x0, y0, zr], [x1, y0, zr], [o.x1, o.y0, zf], [o.x0, o.y0, zf], [0, 1, 1])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  return g
}

/**
 * The thin concrete skin: round the opening at its face, a joint's width short of the unit's edges,
 * with its splayed reveal back to the window. `cut` (x0, y0, x1, y1) takes the outer half of the
 * skin away over a rectangle, so the RTARIUM textile shows at mid-thickness there.
 */
export function panelGeometry(cut?: [number, number, number, number]) {
  const { w, h } = U
  const { x0, x1, y0, y1 } = FACE_OPEN
  const [zb, zf] = Z.panel
  const zm = (zb + zf) / 2 - 0.004
  const parts: THREE.BufferGeometry[] = []
  const skin = (a: number, b: number, c: number, d: number) => {
    if (c - a < 1e-4 || d - b < 1e-4) return
    if (!cut || cut[2] <= a || cut[0] >= c || cut[3] <= b || cut[1] >= d) {
      parts.push(block([a, b, zb], [c, d, zf]))
      return
    }
    // the cut: the back half stays, the front half goes round it
    const [ca, cb, cc, cd] = [Math.max(a, cut[0]), Math.max(b, cut[1]), Math.min(c, cut[2]), Math.min(d, cut[3])]
    parts.push(block([ca, cb, zb], [cc, cd, zm]))
    for (const [p, q, r, s] of [
      [a, b, c, cb],
      [a, cd, c, d],
      [a, cb, ca, cd],
      [cc, cb, c, cd],
    ])
      if (r - p > 1e-4 && s - q > 1e-4) parts.push(block([p, q, zb], [r, s, zf]))
  }
  skin(JOINT, JOINT, x0, h - JOINT)
  skin(x1, JOINT, w - JOINT, h - JOINT)
  skin(x0, JOINT, x1, y0)
  skin(x0, y1, x1, h - JOINT)
  parts.push(revealGeometry())
  return planarUV(merge(parts), 0.7)
}

/**
 * RTARIUM in the panel's shape, drawn as an X-ray: its two faces as a grid of lines either side of
 * mid-thickness, the second face offset by half a pitch as the real faces are. The pitch is drawn
 * larger than the real 12 mm so it reads at this size; the opening is left clear.
 */
export function latticeGeometry(pitch = 0.075) {
  const { w, h } = U
  const { x0, x1, y0, y1 } = FACE_OPEN
  const zm = (Z.panel[0] + Z.panel[1]) / 2
  const pts: number[] = []
  const inOpening = (x: number, y: number) => x > x0 && x < x1 && y > y0 && y < y1
  const seg = (a: [number, number, number], b: [number, number, number]) => pts.push(...a, ...b)
  for (const [dz, off] of [
    [-0.004, 0],
    [0.004, pitch / 2],
  ] as const) {
    const z = zm + dz
    // lines along x, broken where they cross the opening
    for (let y = 0.03 + off; y < h - 0.02; y += pitch) {
      if (y > y0 && y < y1) {
        seg([0.02, y, z], [x0 - 0.01, y, z])
        seg([x1 + 0.01, y, z], [w - 0.02, y, z])
      } else seg([0.02, y, z], [w - 0.02, y, z])
    }
    // and along y
    for (let x = 0.03 + off; x < w - 0.02; x += pitch) {
      if (x > x0 && x < x1) {
        seg([x, 0.02, z], [x, y0 - 0.01, z])
        seg([x, y1 + 0.01, z], [x, h - 0.02, z])
      } else seg([x, 0.02, z], [x, h - 0.02, z])
    }
  }
  // a few of the fibres that join the faces, so the two read as one textile
  for (let x = 0.03; x < w - 0.02; x += pitch * 2)
    for (let y = 0.03; y < h - 0.02; y += pitch * 2) if (!inOpening(x, y)) seg([x, y, zm - 0.004], [x + pitch / 2, y + pitch / 2, zm + 0.004])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

/** what the panel carries on its back: a ferrule cast in at each anchor point, and its rod to the frame */
export function anchorGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const [zb] = Z.panel
  const zf = Z.frame[1] + 0.008
  for (const [x, y] of ANCHORS) {
    const ferrule = new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12).rotateX(Math.PI / 2).translate(x, y, zb - 0.002)
    const rod = new THREE.CylinderGeometry(0.0075, 0.0075, zb - zf, 8).rotateX(Math.PI / 2).translate(x, y, (zb + zf) / 2)
    parts.push(ferrule, rod)
  }
  return merge(parts)
}

/* ---- materials ------------------------------------------------------------------------------- */

export interface UnitMaterials {
  concrete: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  darkSteel: THREE.MeshStandardMaterial
  alu: THREE.MeshStandardMaterial
  glass: THREE.MeshPhysicalMaterial
  gasket: THREE.MeshStandardMaterial
  vapour: THREE.MeshStandardMaterial
  insulation: THREE.MeshStandardMaterial
  firestop: THREE.MeshStandardMaterial
  slab: THREE.MeshStandardMaterial
}

let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

/**
 * Cast concrete, drawn once per scene: a light warm grey with the soft clouding a sprayed face has,
 * fine sand grain and the odd pinhole; and its relief, for a bump map, from the grain alone.
 */
function concreteMaps() {
  const { colour, relief } = (drawn.concrete ??= drawConcrete())
  const tex = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
    return t
  }
  return { map: tex(colour, true), bump: tex(relief, false) }
}

/**
 * What each scene's textures are drawn from, drawn once for the page: a page with a dozen canvases
 * would otherwise paint the same grain a dozen times while the visitor watches the opening.
 */
const drawn: { concrete?: { colour: HTMLCanvasElement; relief: HTMLCanvasElement }; glass?: HTMLCanvasElement; sky?: HTMLCanvasElement } = {}

function drawConcrete() {
  const size = 512
  const colour = document.createElement('canvas')
  const relief = document.createElement('canvas')
  colour.width = colour.height = relief.width = relief.height = size
  const c = colour.getContext('2d')!
  const r = relief.getContext('2d')!
  c.fillStyle = '#d6d1c6'
  c.fillRect(0, 0, size, size)
  r.fillStyle = '#808080'
  r.fillRect(0, 0, size, size)
  // clouding: broad and very faint, drawn again across the edges so the tile repeats without a seam
  for (let i = 0; i < 120; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const rad = 40 + rnd() * 120
    const light = rnd() > 0.5
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        const cx = x + ox
        const cy = y + oy
        if (cx + rad < 0 || cx - rad > size || cy + rad < 0 || cy - rad > size) continue
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, rad)
        g.addColorStop(0, light ? 'rgba(236,232,224,0.04)' : 'rgba(150,143,130,0.035)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        c.fillStyle = g
        c.fillRect(cx - rad, cy - rad, rad * 2, rad * 2)
      }
  }
  // sand grain, in colour and in relief
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const v = 150 + rnd() * 90
    const rad = 0.35 + rnd() * 0.8
    c.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.12 + rnd() * 0.25})`
    c.beginPath()
    c.arc(x, y, rad, 0, Math.PI * 2)
    c.fill()
    const h = 90 + rnd() * 90
    r.fillStyle = `rgba(${h},${h},${h},0.5)`
    r.beginPath()
    r.arc(x, y, rad, 0, Math.PI * 2)
    r.fill()
  }
  // pinholes
  for (let i = 0; i < 260; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const rad = 0.6 + rnd() * 1.1
    c.fillStyle = 'rgba(96,90,80,0.55)'
    c.beginPath()
    c.arc(x, y, rad, 0, Math.PI * 2)
    c.fill()
    r.fillStyle = 'rgba(20,20,20,0.9)'
    r.beginPath()
    r.arc(x, y, rad, 0, Math.PI * 2)
    r.fill()
  }
  return { colour, relief }
}

/**
 * The room behind a pane, as the glass's own colour: dark, a little lighter under the ceiling where
 * the daylight falls in, and darkest low down. What the pane reflects is the sky (below), on top.
 */
function glassMap() {
  const t = new THREE.CanvasTexture((drawn.glass ??= drawGlass()))
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function drawGlass() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#3a474d')
  grad.addColorStop(0.18, '#26323a')
  grad.addColorStop(0.6, '#161d22')
  grad.addColorStop(1, '#0d1215')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 256)
  return c
}

/**
 * What the glazing reflects, all round (an equirectangular sky): a blue sky paling to the horizon
 * with soft cloud, a far line of buildings and trees along the horizon, and the street going dark
 * below. Reflected, it moves across the panes as the unit turns, as a real window's does. The
 * horizon is drawn a little below the middle: the unit is always seen from a little above, which
 * would otherwise put only the street in its panes.
 */
function skyMap() {
  const t = new THREE.CanvasTexture((drawn.sky ??= drawSky()))
  t.colorSpace = THREE.SRGBColorSpace
  t.mapping = THREE.EquirectangularReflectionMapping
  return t
}
function drawSky() {
  const w = 1024
  const h = 512
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const hz = h * 0.57
  const sky = g.createLinearGradient(0, 0, 0, hz)
  sky.addColorStop(0, '#3f6b97')
  sky.addColorStop(0.6, '#7397bb')
  sky.addColorStop(0.9, '#a9c0d3')
  sky.addColorStop(1, '#d4dee5')
  g.fillStyle = sky
  g.fillRect(0, 0, w, hz)
  // cloud: soft, flattened banks, most of them in the band the panes reflect, just over the horizon
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w
    const y = hz * (0.45 + rnd() * 0.5)
    const rx = 24 + rnd() * 90
    const ry = rx * (0.16 + rnd() * 0.14)
    const cg = g.createRadialGradient(x, y, 0, x, y, rx)
    cg.addColorStop(0, `rgba(250,252,255,${0.3 + rnd() * 0.35})`)
    cg.addColorStop(0.55, `rgba(240,245,250,${0.12 + rnd() * 0.12})`)
    cg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = cg
    g.save()
    g.translate(x, y)
    g.scale(1, ry / rx)
    g.translate(-x, -y)
    g.fillRect(x - rx, y - rx, rx * 2, rx * 2)
    g.restore()
  }
  // the street below: lit near the horizon, dark under the window
  const ground = g.createLinearGradient(0, hz, 0, h)
  ground.addColorStop(0, '#8d918f')
  ground.addColorStop(0.2, '#5d6261')
  ground.addColorStop(1, '#262a2c')
  g.fillStyle = ground
  g.fillRect(0, hz, w, h - hz)
  // the far side of the street: blocks of building in the haze, and the odd tree in front
  let x = 0
  while (x < w) {
    const bw = 18 + rnd() * 60
    const bh = 10 + rnd() * 46
    const tone = 120 + Math.floor(rnd() * 50)
    g.fillStyle = `rgb(${tone - 6},${tone + 2},${tone + 10})`
    g.fillRect(x, hz - bh, bw, bh + 2)
    // its windows catch the sky: a few pale bands
    g.fillStyle = 'rgba(225,233,238,0.22)'
    for (let yy = hz - bh + 4; yy < hz - 3; yy += 6) g.fillRect(x + 3, yy, bw - 6, 2)
    x += bw + rnd() * 6
  }
  // (a grey green: reflected on yellow, anything greener reads olive)
  for (let i = 0; i < 14; i++) {
    const tx = rnd() * w
    const tr = 6 + rnd() * 12
    g.fillStyle = `rgba(${84 + rnd() * 14},${92 + rnd() * 12},${90 + rnd() * 12},0.85)`
    g.beginPath()
    g.ellipse(tx, hz - tr * 0.6, tr, tr * 0.8, 0, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

/**
 * The materials' own colours, so the basalt bronze of the textile stays the warmest thing in the
 * picture: cast concrete with its clouding, grain and relief, matt; glazing as coated glass, the
 * dark of the room behind it and a daylight sky reflected on it; satin anthracite frames. Every one
 * is transparent from the start, so fading a layer never recompiles a shader.
 */
export function unitMaterials(): UnitMaterials {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ transparent: true, ...p })
  const cm = concreteMaps()
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: glassMap(),
    envMap: skyMap(),
    envMapIntensity: 1.8,
    metalness: 0,
    roughness: 0.03,
    // coated glazing: a little more of the sky in it than plain glass gives
    reflectivity: 0.86,
    clearcoat: 0.6,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
  glass.userData.base = 0.9
  glass.userData.glass = true
  const vapour = std({ color: '#4e6a78', roughness: 0.42, metalness: 0.1, opacity: 0.9, side: THREE.DoubleSide, envMapIntensity: 1.2 })
  vapour.userData.base = 0.9
  return {
    concrete: std({ color: '#f4f5f6', map: cm.map, bumpMap: cm.bump, bumpScale: 0.42, roughness: 0.9 }),
    steel: std({ color: '#9da3a9', metalness: 0.7, roughness: 0.36 }),
    darkSteel: std({ color: '#5d6268', metalness: 0.62, roughness: 0.42 }),
    alu: std({ color: '#3d4247', metalness: 0.55, roughness: 0.38, envMapIntensity: 1.2 }),
    glass,
    gasket: std({ color: '#121212', roughness: 0.62 }),
    vapour,
    insulation: std({ color: '#c9b98b', map: grainTexture('#c9b98b', 9000, [120, 205], 3), roughness: 1 }),
    firestop: std({ color: '#a2472f', map: grainTexture('#a2472f', 6000, [90, 160], 3), roughness: 0.95 }),
    slab: std({ color: '#9b968d', map: grainTexture('#9b968d', 6000, [120, 190], 2), roughness: 0.95 }),
  }
}

export function disposeUnitMaterials(m: UnitMaterials) {
  for (const v of Object.values(m) as THREE.MeshStandardMaterial[]) {
    v.map?.dispose()
    v.bumpMap?.dispose()
    v.envMap?.dispose()
    v.dispose()
  }
}
