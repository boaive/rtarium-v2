import * as THREE from 'three'
import { grainTexture } from '../../../facade/three/kit'
import { block, merge } from '../../../facade/three/unit/parts'
import { Lines } from '../../../facade/three/rain/building'

/**
 * The data-centre floor, as the Data & AI Centres page draws it: prestressed hollow-core planks with
 * their cores and keyed butt joints, a bonding primer, anchor buttons, RTARIUM at 5 mm off the slab,
 * a 20 mm free-flow screed over it, and the ESD coating (a conductive primer under a self-levelling
 * epoxy). Everything around the floor (the racks, the hall, the building, the machines) is a drawing:
 * the floor is the one thing shown in its own materials.
 *
 * Sizes follow the client's brief: a 120 mm plank 1.2 m wide (the hyperscale test sample), a 10 mm
 * mesh with 5 mm of cover either side, 20 mm in all. The coating and the joint's step are drawn a
 * little thicker than they are where they must read.
 */

export const PLANK = { w: 1.2, t: 0.12 } as const
/** the cores: their centres across a plank (from its middle) and their radius */
const CORES = [-0.45, -0.27, -0.09, 0.09, 0.27, 0.45]
const CORE_R = 0.039
const CORE_Y = 0.06
export const LAYER = { cover: 0.005, mesh: 0.01, screed: 0.02, esd: 0.003, primer: 0.0012 } as const
/** RTARIUM is drawn at this many times its pitch in plan where a whole floor shows (the Bridge's rule), never in its depth */
export const SHOW = 2.5
export const PITCH = 0.012

/**
 * How far a plank's keyed edge stands back from its nominal line, up its height: closed at the
 * foot, a keyway at mid-depth, open at the top, so two planks side by side leave a joint for grout.
 */
const KEY: [number, number][] = [
  [0.004, 0],
  [0, 0.006],
  [0, 0.03],
  [0.014, 0.046],
  [0.014, 0.07],
  [0.008, 0.086],
  [0.008, PLANK.t],
]

/**
 * A plank's cross-section between x0 and x1 (in the floor's x), the plank centred at `cx`: an edge
 * that is the plank's own keyed edge where it falls on it, a straight cut otherwise; the cores the
 * section takes in, a cut one left out (sections are chosen to fall between cores).
 */
function section(cx: number, x0: number, x1: number) {
  const left = Math.abs(x0 - (cx - PLANK.w / 2)) < 1e-6
  const right = Math.abs(x1 - (cx + PLANK.w / 2)) < 1e-6
  const s = new THREE.Shape()
  const pts: [number, number][] = []
  // the foot, left to right; the right edge up; the top, right to left; the left edge down
  if (right) for (const [d, y] of KEY) pts.push([x1 - d, y])
  else pts.push([x1, 0], [x1, PLANK.t])
  if (left) for (const [d, y] of [...KEY].reverse()) pts.push([x0 + d, y])
  else pts.push([x0, PLANK.t], [x0, 0])
  s.moveTo(pts[0][0], pts[0][1])
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1])
  s.closePath()
  for (const c of CORES) {
    const x = cx + c
    if (x - CORE_R < x0 + 0.004 || x + CORE_R > x1 - 0.004) continue
    const h = new THREE.Path()
    h.absarc(x, CORE_Y, CORE_R, 0, Math.PI * 2, true)
    s.holes.push(h)
  }
  return s
}

/** a shape along z, from z0 to z1 (an extrusion runs from 0 to its depth) */
function along(shape: THREE.Shape, z0: number, z1: number, steps = 1) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, steps, curveSegments: 20 })
  g.translate(0, 0, z0)
  return g
}

/** the shape lift of each plank's top (mild camber, and the step at a joint); exaggerated by `ex` */
export interface Lie {
  /** each plank's lift (m) at its middle, in order across the floor */
  lift: number[]
  /** the slow wave along the planks (m) */
  wave: number
}
export const FLAT: Lie = { lift: [0, 0, 0, 0], wave: 0 }

/**
 * A piece of hollow-core floor: the planks whose middles are `centres`, cut to x0..x1 and z0..z1, and
 * the grout in the joints between them. Each plank is lifted by its `lie` (its camber), with a slow wave
 * along it, so a joint between two can show as a step. Returns the planks and the grout apart.
 */
export function hollowCore(centres: number[], [x0, x1]: [number, number], [z0, z1]: [number, number], lie: Lie = FLAT) {
  const planks: THREE.BufferGeometry[] = []
  const grout: THREE.BufferGeometry[] = []
  centres.forEach((cx, i) => {
    const a = Math.max(x0, cx - PLANK.w / 2)
    const b = Math.min(x1, cx + PLANK.w / 2)
    if (b - a < 0.02) return
    const g = along(section(cx, a, b), z0, z1, 18)
    bend(g, lie.lift[i] ?? 0, lie.wave, i, z0, z1)
    planks.push(g)
    // the grout in the joint to the next plank: from the closed foot to just under the top
    const next = centres[i + 1]
    if (next !== undefined && cx + PLANK.w / 2 > x0 && cx + PLANK.w / 2 < x1) {
      const j = cx + PLANK.w / 2
      const s = new THREE.Shape()
      const up = KEY.filter(([, y]) => y >= 0.03)
      s.moveTo(j - up[0][0], up[0][1])
      for (const [d, y] of up.slice(1)) s.lineTo(j - d, Math.min(y, PLANK.t - 0.003))
      for (const [d, y] of [...up].reverse()) s.lineTo(j + d, Math.min(y, PLANK.t - 0.003))
      s.closePath()
      const gg = along(s, z0, z1, 18)
      // the grout follows the lower of the two planks it joins
      bend(gg, Math.min(lie.lift[i] ?? 0, lie.lift[i + 1] ?? 0), lie.wave, i + 0.5, z0, z1)
      grout.push(gg)
    }
  })
  const out = { planks: merge(planks), grout: grout.length ? merge(grout) : new THREE.BufferGeometry() }
  uvBox(out.planks, 2.2)
  if (grout.length) uvBox(out.grout, 2.2)
  return out
}

/**
 * The planks' top faces alone (each between its joints' open tops), lying as the planks do: what a
 * coat put on the slab covers, so it can be drawn over them without touching their cut faces.
 */
export function plankTops(centres: number[], [x0, x1]: [number, number], [z0, z1]: [number, number], lie: Lie = FLAT) {
  const out: THREE.BufferGeometry[] = []
  centres.forEach((cx, i) => {
    const a = Math.max(x0, cx - PLANK.w / 2 + 0.008)
    const b = Math.min(x1, cx + PLANK.w / 2 - 0.008)
    if (b - a < 0.02) return
    const g = new THREE.PlaneGeometry(b - a, z1 - z0, 1, 18).rotateX(-Math.PI / 2).translate((a + b) / 2, PLANK.t, (z0 + z1) / 2)
    bend(g, lie.lift[i] ?? 0, lie.wave, i, z0, z1)
    out.push(g)
  })
  return uvBox(merge(out), 2)
}

/** lifts a plank's every point by its camber and a slow wave along it (a cut face keeps its cores round) */
export function bend(g: THREE.BufferGeometry, lift: number, wave: number, seed: number, z0: number, z1: number) {
  if (!lift && !wave) return
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i)
    const u = (z - z0) / Math.max(1e-6, z1 - z0)
    p.setY(i, p.getY(i) + lift * (0.6 + 0.4 * Math.sin(Math.PI * u)) + wave * Math.sin(u * Math.PI * 2 + seed * 1.7))
  }
  g.computeVertexNormals()
}

/** box-projected UVs, so the concrete's grain runs on across every face at one size */
export function uvBox(g: THREE.BufferGeometry, k = 2) {
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)]
    uv[i * 2] = u * k
    uv[i * 2 + 1] = v * k
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** a layer of even thickness over the planks, x0..x1, z0..z1, from y0 up by `t` */
export function layer([x0, x1]: [number, number], [z0, z1]: [number, number], y0: number, t: number, k = 2) {
  return uvBox(block([x0, y0, z0], [x1, y0 + t, z1]), k)
}

/**
 * A pour: a layer `len` long behind its free front at z = 0 (uneven, a few centimetres either way),
 * across x0..x1, `t` thick from y = 0. The scene slides it forward and cuts it at the piece's edges,
 * so the front keeps its shape as it runs.
 */
export function pourGeometry([x0, x1]: [number, number], len: number, t: number, seed = 0, rag = 0.035) {
  const g = new THREE.BoxGeometry(x1 - x0, t, len, 72, 1, 1).translate((x0 + x1) / 2, t / 2, -len / 2)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < -0.001) continue
    const s = p.getX(i)
    p.setZ(i, rag * (0.5 * Math.sin(s * 9 + 0.6 + seed) + 0.3 * Math.sin(s * 23 + 2.1 + seed * 2) + 0.2 * Math.sin(s * 47 + 4.2 + seed * 3)))
  }
  g.computeVertexNormals()
  return uvBox(g, 2)
}

/* ---- materials ---------------------------------------------------------------------------------- */

export interface FloorKit {
  /** the precast planks: a smooth, pale factory concrete */
  plank: THREE.MeshStandardMaterial
  grout: THREE.MeshStandardMaterial
  /** the bonding primer, wet on the slab */
  primer: THREE.MeshStandardMaterial
  /** the anchor buttons: a pale plastic */
  button: THREE.MeshStandardMaterial
  /** the free-flow screed: wet as it is poured, set and trowelled after */
  wet: THREE.MeshStandardMaterial
  screed: THREE.MeshStandardMaterial
  /** the ESD coating: the black conductive primer, and the self-levelling epoxy over it */
  conductive: THREE.MeshStandardMaterial
  esd: THREE.MeshStandardMaterial
  /** steel: the levelling rails, the grounding strip */
  steel: THREE.MeshStandardMaterial
  /** the hose */
  rubber: THREE.MeshStandardMaterial
  catcher: THREE.ShadowMaterial
  ink: THREE.MeshBasicMaterial
}

export function floorKit(): FloorKit {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ transparent: true, ...p })
  return {
    plank: std({ color: '#b9b5ac', map: grainTexture('#b9b5ac', 6200, [150, 215], 1), roughness: 0.9 }),
    grout: std({ color: '#9d9890', map: grainTexture('#9d9890', 7000, [120, 190], 1), roughness: 0.95 }),
    primer: std({ color: '#8e8a82', roughness: 0.32, opacity: 0.55, depthWrite: false }),
    button: std({ color: '#eceae3', roughness: 0.45 }),
    wet: std({ color: '#87867f', roughness: 0.12, metalness: 0.05 }),
    screed: std({ color: '#c9c5bc', map: grainTexture('#c9c5bc', 5200, [165, 225], 1), roughness: 0.78 }),
    conductive: std({ color: '#1e2020', roughness: 0.5 }),
    esd: std({ color: '#a3a9a8', roughness: 0.36, envMapIntensity: 0.55 }),
    steel: std({ color: '#9aa0a5', metalness: 0.6, roughness: 0.38 }),
    rubber: std({ color: '#161616', roughness: 0.62 }),
    catcher: new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.22, depthWrite: false }),
    ink: new THREE.MeshBasicMaterial({ color: '#080808', transparent: true, toneMapped: false }),
  }
}

export function disposeFloorKit(m: FloorKit) {
  for (const x of Object.values(m) as THREE.Material[]) {
    ;(x as THREE.MeshStandardMaterial).map?.dispose()
    x.dispose()
  }
}

/* ---- anchor buttons ----------------------------------------------------------------------------- */

/**
 * An anchor button: a 10 mm disc stuck to the slab, a T-stem 10 mm high whose head goes through the
 * mesh's lower face and holds it 5 mm off the slab. Drawn at its size; its origin on the slab.
 */
export function buttonGeometry() {
  const disc = new THREE.CylinderGeometry(0.005, 0.0055, 0.0012, 20).translate(0, 0.0006, 0)
  const stem = new THREE.CylinderGeometry(0.0011, 0.0013, 0.0098, 10).translate(0, 0.0012 + 0.0049, 0)
  const head = block([-0.0042, 0.0098, -0.0009], [0.0042, 0.0112, 0.0009])
  return merge([disc.toNonIndexed(), stem.toNonIndexed(), head])
}

/* ---- drawings ------------------------------------------------------------------------------------ */

const RACK = { w: 0.6, d: 1.2, h: 2.0 }
export { RACK }

/**
 * A server rack as a drawing: its frame and plinth, levelling feet, the front and rear doors with
 * their hinges and handle, the servers behind the front door (2U each, their drive bays and status
 * lights), the PDUs at the back, the cable entry on its roof. Standing on y = 0, its front at +z,
 * centred on x, z; `full` false draws only what reads from far away.
 */
export function rack(L: Lines, x: number, z: number, y = 0, face = 1, full = true) {
  const { w, d, h } = RACK
  const X = (v: number) => x + v
  const Z = (v: number) => z + v * face
  const Y = (v: number) => y + v
  const box = (a: number[], b: number[]) => L.box([X(a[0]), Y(a[1]), Z(a[2])], [X(b[0]), Y(b[1]), Z(b[2])])
  const seg = (a: number[], b: number[]) => L.seg([X(a[0]), Y(a[1]), Z(a[2])], [X(b[0]), Y(b[1]), Z(b[2])])
  // the cabinet, on its plinth
  box([-w / 2, 0.08, -d / 2], [w / 2, h, d / 2])
  if (!full) {
    for (const yy of [0.75, 1.45]) seg([-w / 2 + 0.04, yy, d / 2], [w / 2 - 0.04, yy, d / 2])
    return
  }
  box([-w / 2 + 0.02, 0, -d / 2 + 0.02], [w / 2 - 0.02, 0.08, d / 2 - 0.02])
  // the four corner posts, standing just inside the skin
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) seg([sx * (w / 2 - 0.03), 0.08, sz * (d / 2 - 0.05)], [sx * (w / 2 - 0.03), h, sz * (d / 2 - 0.05)])
  // levelling feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) seg([sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.08)], [sx * (w / 2 - 0.06), 0.03, sz * (d / 2 - 0.08)])
  // the front door: its frame, two hinges, the handle
  const f = d / 2
  L.rectZ(X(-w / 2 + 0.015), Y(0.1), X(w / 2 - 0.015), Y(h - 0.02), Z(f))
  for (const yy of [0.32, h - 0.3]) seg([-w / 2 + 0.015, yy, f], [-w / 2 + 0.015, yy + 0.08, f + 0.012])
  seg([w / 2 - 0.05, 0.92, f + 0.01], [w / 2 - 0.05, 1.12, f + 0.01])
  // the servers behind it, 2U each, every one with its drive bays and a status light
  const u2 = 0.089
  for (let k = 0; k < 19; k++) {
    const y0 = 0.16 + k * u2
    const y1 = y0 + u2 - 0.012
    const zf = f - 0.02
    L.rectZ(X(-w / 2 + 0.05), Y(y0), X(w / 2 - 0.05), Y(y1), Z(zf))
    const bays = 3 + (k % 3)
    for (let b = 1; b <= bays; b++) {
      const xx = -w / 2 + 0.05 + ((w - 0.1) * 0.62 * b) / (bays + 1)
      seg([xx, y0 + 0.012, zf], [xx, y1 - 0.012, zf])
    }
    seg([w / 2 - 0.1, y0 + 0.03, zf], [w / 2 - 0.085, y0 + 0.03, zf])
  }
  // the rear door, the two PDUs behind it, the cable entry on the roof
  L.rectZ(X(-w / 2 + 0.015), Y(0.1), X(w / 2 - 0.015), Y(h - 0.02), Z(-d / 2))
  for (const sx of [-1, 1]) L.rectZ(X(sx * (w / 2 - 0.08) - 0.02), Y(0.3), X(sx * (w / 2 - 0.08) + 0.02), Y(h - 0.2), Z(-d / 2 + 0.06))
  L.box([X(-0.14), Y(h), Z(-d / 2 + 0.12)], [X(0.14), Y(h + 0.001), Z(-d / 2 + 0.34)])
  // the side panels' lines
  for (const sx of [-1, 1]) L.rectX(Z(-d / 2 + 0.06), Y(0.16), Z(d / 2 - 0.06), Y(h - 0.06), X(sx * (w / 2)))
}

/** a circle of segments about an axis, through a centre */
function circle(L: Lines, c: [number, number, number], r: number, axis: 'x' | 'y' | 'z', n = 28, from = 0, to = Math.PI * 2) {
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * i) / n
    const b = from + ((to - from) * (i + 1)) / n
    const p = (t: number): number[] =>
      axis === 'z' ? [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), c[2]] : axis === 'x' ? [c[0], c[1] + r * Math.sin(t), c[2] + r * Math.cos(t)] : [c[0] + r * Math.cos(t), c[1], c[2] + r * Math.sin(t)]
    L.seg(p(a), p(b))
  }
}

/**
 * The H1-561 mixer-pump, as a drawing, after the site's own machine: a towed steel chassis on two
 * wheels with a jockey wheel and drawbar at its head; the tall control cabinet there, its panel facing
 * forward (two meters, two rotary switches, the display, three rows of push buttons, the electrical
 * cabinet under it behind its hazard band); the trough mixer along the top with its grille, shaft and
 * bearings; the operator's platform and handrail along one side; the screw pump under the trough, its
 * motor and its outlet coupling at the tail; the beacon on its pole. Origin on the ground under its
 * middle, its length along x (outlet at +x), its panel and platform on the +z side.
 */
export function pump(L: Lines) {
  // the chassis: two side members, cross members, the deck
  for (const z of [-0.4, 0.4]) L.box([-0.92, 0.26, z - 0.03], [0.92, 0.34, z + 0.03])
  for (const x of [-0.88, -0.45, 0, 0.45, 0.88]) L.seg([x, 0.34, -0.4], [x, 0.34, 0.4])
  // the wheels: tyre, rim and hub either side, the axle; the jockey wheel and drawbar at the head
  for (const z of [-0.5, 0.5]) {
    for (const dz of [-0.05, 0.05]) circle(L, [0.3, 0.24, z + dz], 0.24, 'z', 32)
    circle(L, [0.3, 0.24, z + 0.05 * Math.sign(z)], 0.15, 'z', 24)
    circle(L, [0.3, 0.24, z + 0.05 * Math.sign(z)], 0.05, 'z', 12)
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      L.seg([0.3 + 0.05 * Math.cos(a), 0.24 + 0.05 * Math.sin(a), z + 0.05 * Math.sign(z)], [0.3 + 0.15 * Math.cos(a), 0.24 + 0.15 * Math.sin(a), z + 0.05 * Math.sign(z)])
    }
  }
  L.seg([0.3, 0.24, -0.45], [0.3, 0.24, 0.45])
  L.seg([-0.92, 0.3, -0.25], [-1.32, 0.26, 0])
  L.seg([-0.92, 0.3, 0.25], [-1.32, 0.26, 0])
  circle(L, [-1.38, 0.26, 0], 0.05, 'y', 14)
  L.seg([-1.18, 0.27, 0], [-1.18, 0.08, 0])
  circle(L, [-1.18, 0.06, 0], 0.06, 'z', 14)

  // the control cabinet at the head, its panel facing +z
  const c = { x0: -0.92, x1: -0.5, z0: -0.38, z1: 0.4, y0: 0.34, y1: 1.62 }
  L.box([c.x0, c.y0, c.z0], [c.x1, c.y1, c.z1])
  L.box([c.x0 - 0.02, c.y1, c.z0 - 0.02], [c.x1 + 0.02, c.y1 + 0.03, c.z1 + 0.02])
  const zf = c.z1 + 0.002
  // the panel: two meters, two rotary switches, the display, three rows of three buttons, a label
  L.rectZ(c.x0 + 0.05, 0.98, c.x1 - 0.05, 1.56, zf)
  for (const x of [-0.81, -0.63]) L.rectZ(x - 0.04, 1.47, x + 0.04, 1.52, zf)
  for (const x of [-0.81, -0.63]) {
    circle(L, [x, 1.4, zf], 0.028, 'z', 16)
    L.seg([x - 0.02, 1.4, zf], [x + 0.02, 1.4, zf])
  }
  L.rectZ(-0.8, 1.31, -0.64, 1.35, zf)
  L.rectZ(-0.8, 1.26, -0.64, 1.28, zf)
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) circle(L, [-0.81 + k * 0.09, 1.2 - r * 0.07, zf], 0.016, 'z', 12)
  // the electrical cabinet below, behind its door, and the hazard band of chevrons along the foot
  L.rectZ(c.x0 + 0.05, 0.52, c.x1 - 0.05, 0.92, zf)
  L.seg([c.x1 - 0.09, 0.66, zf], [c.x1 - 0.09, 0.78, zf])
  L.rectZ(c.x0, 0.36, c.x1, 0.47, zf)
  for (let x = c.x0 + 0.03; x < c.x1 - 0.02; x += 0.06) {
    L.seg([x, 0.38, zf], [x + 0.03, 0.415, zf])
    L.seg([x + 0.03, 0.415, zf], [x, 0.45, zf])
  }
  // the cabinet's side door, its hinges and the cable gland
  L.rectX(c.z0 + 0.06, 0.5, c.z1 - 0.06, 1.55, c.x1 + 0.002)
  for (const y of [0.62, 1.42]) L.seg([c.x1 + 0.002, y, c.z1 - 0.06], [c.x1 + 0.02, y, c.z1 - 0.06])
  circle(L, [c.x1 + 0.002, 0.42, 0], 0.025, 'x', 12)

  // the trough mixer: its U section at the ends and two ribs, the long edges, the rim, the grille
  const T = { x0: -0.46, x1: 0.62, top: 1.36, mid: 1.04, r: 0.38 }
  for (const x of [T.x0, (2 * T.x0 + T.x1) / 3, (T.x0 + 2 * T.x1) / 3, T.x1]) {
    L.seg([x, T.top, -T.r], [x, T.mid, -T.r])
    L.seg([x, T.top, T.r], [x, T.mid, T.r])
    circle(L, [x, T.mid, 0], T.r, 'x', 20, Math.PI, Math.PI * 2)
  }
  // the long edges: the sides' foot, and three lines round the trough's rounded bottom
  for (const z of [-T.r, T.r]) L.seg([T.x0, T.mid, z], [T.x1, T.mid, z])
  for (const t of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) L.seg([T.x0, T.mid - T.r * Math.sin(t), T.r * Math.cos(t)], [T.x1, T.mid - T.r * Math.sin(t), T.r * Math.cos(t)])
  L.seg([T.x0, T.top, -T.r], [T.x1, T.top, -T.r])
  L.seg([T.x0, T.top, T.r], [T.x1, T.top, T.r])
  L.box([T.x0 - 0.03, T.top, -T.r - 0.04], [T.x1 + 0.03, T.top + 0.03, T.r + 0.04])
  for (let x = T.x0 + 0.12; x < T.x1 - 0.05; x += 0.12) L.seg([x, T.top + 0.03, -T.r], [x, T.top + 0.03, T.r])
  for (const z of [-0.13, 0.13]) L.seg([T.x0, T.top + 0.03, z], [T.x1, T.top + 0.03, z])
  // the mixer's shaft through the trough, its bearings at either end, and its drive housing
  L.seg([T.x0 - 0.06, T.mid, 0], [T.x1 + 0.06, T.mid, 0])
  for (const x of [T.x0 - 0.04, T.x1 + 0.04]) circle(L, [x, T.mid, 0], 0.05, 'x', 14)
  L.box([T.x1 + 0.06, T.mid - 0.12, -0.14], [T.x1 + 0.26, T.mid + 0.12, 0.14])
  // the trough on its legs
  for (const x of [T.x0 + 0.04, T.x1 - 0.04]) for (const z of [-0.34, 0.34]) L.seg([x, 0.34, z], [x, T.mid - 0.2, z])
  // the maker's plate on the trough's side
  L.rectZ(0.1, 1.12, 0.5, 1.28, T.r + 0.002)

  // the screw pump under the trough: its stator tube, the hopper throat, the motor, the outlet coupling
  const P = { x0: 0.36, x1: 0.96, y: 0.52, r: 0.07 }
  for (const x of [P.x0, (P.x0 + P.x1) / 2, P.x1]) circle(L, [x, P.y, 0], P.r, 'x', 18)
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) L.seg([P.x0, P.y + P.r * Math.sin(a), P.r * Math.cos(a)], [P.x1, P.y + P.r * Math.sin(a), P.r * Math.cos(a)])
  L.seg([0.42, P.y + P.r, -0.06], [0.3, T.mid - T.r + 0.02, -0.1])
  L.seg([0.42, P.y + P.r, 0.06], [0.3, T.mid - T.r + 0.02, 0.1])
  L.box([-0.12, 0.36, -0.18], [0.3, 0.66, 0.18])
  for (let x = -0.08; x < 0.28; x += 0.06) L.seg([x, 0.4, 0.181], [x, 0.62, 0.181])
  circle(L, [P.x1 + 0.03, P.y, 0], 0.055, 'x', 16)
  circle(L, [P.x1 + 0.06, P.y, 0], 0.045, 'x', 16)

  // the operator's platform along the +z side, its step and its handrail
  L.box([-0.46, 0.4, 0.44], [0.6, 0.44, 0.7])
  L.box([-0.2, 0.18, 0.62], [0.2, 0.21, 0.78])
  for (const x of [-0.2, 0.2]) L.seg([x, 0.21, 0.74], [x, 0.4, 0.66])
  for (const x of [-0.42, 0.08, 0.56]) L.seg([x, 0.44, 0.69], [x, 1.42, 0.69])
  for (const y of [0.92, 1.42]) L.seg([-0.42, y, 0.69], [0.56, y, 0.69])
  for (const x of [-0.42, 0.56]) {
    L.seg([x, 1.42, 0.69], [x, 1.42, 0.5])
    L.seg([x, 1.42, 0.5], [x, T.top + 0.03, 0.44])
  }

  // the beacon on its pole at the tail
  L.seg([0.86, 0.34, -0.36], [0.86, 1.95, -0.36])
  circle(L, [0.86, 1.95, -0.36], 0.035, 'y', 12)
  circle(L, [0.86, 2.05, -0.36], 0.035, 'y', 12)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2
    L.seg([0.86 + 0.035 * Math.cos(a), 1.95, -0.36 + 0.035 * Math.sin(a)], [0.86 + 0.035 * Math.cos(a), 2.05, -0.36 + 0.035 * Math.sin(a)])
  }
}

/**
 * A walk-behind power trowel, as a drawing: the guard ring and its ribs, the spider and its arms, the
 * gearbox, the engine on it with its fuel tank, recoil starter, air filter and muffler, the lifting
 * loop; the handle, two tubes up to the grip, with the throttle, the pitch-control crank and the
 * safety switch. A 600 mm machine. Origin on the floor under its middle; the handle runs back along -x.
 */
export function trowel(L: Lines) {
  const R = 0.3
  circle(L, [0, 0.012, 0], R, 'y', 40)
  circle(L, [0, 0.07, 0], R, 'y', 40)
  circle(L, [0, 0.07, 0], R - 0.025, 'y', 40)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    L.seg([R * Math.cos(a), 0.012, R * Math.sin(a)], [R * Math.cos(a), 0.07, R * Math.sin(a)])
  }
  // the guard's four arms to the gearbox
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2
    L.seg([(R - 0.025) * Math.cos(a), 0.07, (R - 0.025) * Math.sin(a)], [0.06 * Math.cos(a), 0.11, 0.06 * Math.sin(a)])
  }
  // the gearbox; the engine on it, its fuel tank and cap, the recoil starter, the air filter, the muffler
  L.box([-0.065, 0.06, -0.065], [0.065, 0.15, 0.065])
  L.box([-0.12, 0.15, -0.1], [0.1, 0.32, 0.1])
  L.box([-0.1, 0.32, -0.075], [0.05, 0.37, 0.075])
  circle(L, [-0.03, 0.375, 0], 0.015, 'y', 10)
  circle(L, [0, 0.235, 0.102], 0.055, 'z', 20)
  circle(L, [0, 0.235, 0.102], 0.018, 'z', 10)
  L.box([0.1, 0.2, -0.07], [0.15, 0.3, 0.04])
  for (let y = 0.215; y < 0.3; y += 0.02) L.seg([0.151, y, -0.06], [0.151, y, 0.03])
  L.box([-0.12, 0.17, -0.14], [-0.04, 0.27, -0.1])
  // the lifting loop over the engine
  circle(L, [0, 0.37, 0], 0.07, 'z', 12, 0, Math.PI)
  // the handle: two tubes up to the grip; the grip bar and its sleeves; throttle, pitch crank, safety switch
  const base: [number, number] = [-0.1, 0.2]
  const top: [number, number] = [-0.8, 0.88]
  for (const z of [-0.022, 0.022]) L.seg([base[0], base[1], z], [top[0], top[1], z])
  for (const t of [0.35, 0.7]) {
    const x = base[0] + (top[0] - base[0]) * t
    const y = base[1] + (top[1] - base[1]) * t
    L.seg([x, y, -0.022], [x, y, 0.022])
  }
  L.seg([top[0], top[1], -0.22], [top[0], top[1], 0.22])
  for (const s of [-1, 1]) L.box([top[0] - 0.015, top[1] - 0.015, s * 0.12], [top[0] + 0.015, top[1] + 0.015, s * 0.22])
  L.seg([top[0] + 0.02, top[1] - 0.02, 0.14], [top[0] + 0.1, top[1] - 0.09, 0.15])
  L.seg([top[0], top[1], 0], [top[0], top[1] + 0.12, 0])
  circle(L, [top[0], top[1] + 0.12, 0], 0.035, 'y', 14)
  L.box([top[0] + 0.03, top[1] - 0.06, -0.06], [top[0] + 0.08, top[1] - 0.01, -0.02])
}

/** the trowel's four blades under the ring, on their arms from the spider: turned by the scene */
export function blades(L: Lines) {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const n = [-s, c]
    const r0 = 0.05
    const r1 = 0.28
    const hw = 0.045
    const y = 0.006
    const p = (r: number, w: number) => [c * r + n[0] * w, y, s * r + n[1] * w]
    L.seg(p(r0, hw), p(r1, hw))
    L.seg(p(r0, -hw), p(r1, -hw))
    L.seg(p(r1, hw), p(r1, -hw))
    L.seg(p(r0, hw), p(r0, -hw))
    // the blade's arm, and the pitch of its leading edge
    L.seg([0, 0.06, 0], [c * r0, y + 0.01, s * r0])
    L.seg(p(r0 + 0.02, hw * 0.6), p(r1 - 0.02, hw * 0.6))
  }
}

/** a drawing with its long segments cut into pieces no longer than `max`, so it can be drawn on a little at a time */
export function split(L: Lines, max: number) {
  const out = new Lines()
  const p = L.pts
  for (let i = 0; i < p.length; i += 6) {
    const len = Math.hypot(p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2])
    const n = Math.max(1, Math.ceil(len / max))
    for (let k = 0; k < n; k++) {
      const a = k / n
      const b = (k + 1) / n
      out.seg([p[i] + (p[i + 3] - p[i]) * a, p[i + 1] + (p[i + 4] - p[i + 1]) * a, p[i + 2] + (p[i + 5] - p[i + 2]) * a], [p[i] + (p[i + 3] - p[i]) * b, p[i + 1] + (p[i + 4] - p[i + 1]) * b, p[i + 2] + (p[i + 5] - p[i + 2]) * b])
    }
  }
  return out
}

/** the segments of a drawing, sorted so the nearest to a point come first (a drawing that grows from there, or shrinks into it) */
export function sortFrom(L: Lines, o: [number, number, number]) {
  const n = L.pts.length / 6
  const idx = Array.from({ length: n }, (_, i) => i)
  const d = (i: number) => {
    const p = L.pts
    const mx = (p[i * 6] + p[i * 6 + 3]) / 2 - o[0]
    const my = (p[i * 6 + 1] + p[i * 6 + 4]) / 2 - o[1]
    const mz = (p[i * 6 + 2] + p[i * 6 + 5]) / 2 - o[2]
    return mx * mx + my * my * 0.3 + mz * mz
  }
  const dist = idx.map(d)
  idx.sort((a, b) => dist[a] - dist[b])
  const out = new Lines()
  for (const i of idx) out.pts.push(...L.pts.slice(i * 6, i * 6 + 6))
  return out
}

export { Lines }
