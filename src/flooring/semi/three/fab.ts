import * as THREE from 'three'
import { grainTexture } from '../../../facade/three/kit'
import { block, merge } from '../../../facade/three/unit/parts'
import { floorKit, Lines, uvBox } from '../../data/three/dc'

/**
 * The fab floor, as the Semiconductor Plant page draws it: a deep post-tensioned waffle slab, coffered
 * underneath on a 900 mm grid with an 80 mm deck (the briefing's "80 mm RC"); on it, once the old
 * topping is gone and the deck ground, an epoxy vapour barrier, height buttons set to a laser, RTARIUM
 * 5 mm off the slab, 20 mm of graphene self-levelling concrete, and the ESD system (a conductive
 * primer, a copper grounding grid, a high-gloss static-dissipative top coat). Everything round the
 * floor (the tools, the AMHS, the cleanroom, the fab, the plant) is a drawing; the floor is the one
 * thing shown in its own materials.
 *
 * Sizes follow the client's brief (10 mm mesh, 5 mm either side, 20 mm in all) and are of the kind
 * for the slab (a rib module of 900 mm, 500 mm deep). The thin coats are drawn a little thicker than
 * they are where they must read.
 */

/** the waffle: its rib module, overall depth, deck, and a rib's width at its foot and under the deck */
export const MOD = 0.9
export const WAF = { depth: 0.5, deck: 0.08, foot: 0.13, head: 0.2 } as const
/** the deck's top: the slab surface everything is laid on */
export const SLAB = WAF.depth
export const LAY = { old: 0.05, barrier: 0.0015, cover: 0.005, mesh: 0.01, slc: 0.02, cond: 0.0012, tape: 0.0006, coat: 0.0025 } as const
/** the old brittle topping's top; RTARIUM's top; the finished floor */
export const OLD_TOP = SLAB + LAY.old
export const TOP = SLAB + LAY.slc
export const FLOOR = TOP + LAY.cond + LAY.coat
/** RTARIUM's middle, 5 mm off the slab */
export const MESH_Y = SLAB + LAY.cover + LAY.mesh / 2
/** the piece the stages build: across the coffers both ways, its cuts falling in coffers (so the ribs read on them) */
export const PX: [number, number] = [-1.2, 1.2]
export const PZ: [number, number] = [-0.75, 0.75]
/** the old topping's saw-cut joint, across the piece */
export const SEAM = 0.3

/** a rib, `WAF.foot` wide at its foot and `WAF.head` under the deck, from len0 to len1 along z, centred on x = 0 */
function rib(len0: number, len1: number) {
  const yb = WAF.depth - WAF.deck
  const s = new THREE.Shape()
  s.moveTo(-WAF.foot / 2, 0)
  s.lineTo(WAF.foot / 2, 0)
  s.lineTo(WAF.head / 2, yb)
  s.lineTo(-WAF.head / 2, yb)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: len1 - len0, bevelEnabled: false })
  g.translate(0, 0, len0)
  return g
}

/** where the ribs fall in a range: those running along z at x = k · MOD, those running along x at z = (k + ½) · MOD */
export function ribLines([a, b]: [number, number], half: boolean) {
  const out: number[] = []
  const o = half ? 0.5 : 0
  for (let k = Math.ceil((a + WAF.head) / MOD - o); (k + o) * MOD <= b - WAF.head; k++) out.push((k + o) * MOD)
  return out
}

/** a piece of waffle slab, x0..x1 by z0..z1: its deck and its ribs apart, so each can take its own material */
export function waffle([x0, x1]: [number, number], [z0, z1]: [number, number]) {
  const ribs: THREE.BufferGeometry[] = []
  for (const x of ribLines([x0, x1], false)) ribs.push(rib(z0, z1).translate(x, 0, 0))
  for (const z of ribLines([z0, z1], true)) ribs.push(rib(x0, x1).rotateY(Math.PI / 2).translate(0, 0, z))
  return {
    deck: uvBox(block([x0, WAF.depth - WAF.deck, z0], [x1, WAF.depth, z1]), 2),
    ribs: uvBox(merge(ribs), 2),
  }
}

/**
 * The waffle's section in the plane x = c, between z0 and z1 (the deck, and the ribs running along x
 * cut square), lying in that plane facing +x: the cap a section box shows where it cuts the slab.
 */
export function sectionAtX(c: number, [z0, z1]: [number, number]) {
  const yb = WAF.depth - WAF.deck
  const parts: THREE.BufferGeometry[] = []
  const face = (a: [number, number][]) => {
    const s = new THREE.Shape()
    s.moveTo(a[0][0], a[0][1])
    for (const p of a.slice(1)) s.lineTo(p[0], p[1])
    s.closePath()
    // drawn in x-y, then turned so x becomes -z (facing +x)
    parts.push(new THREE.ShapeGeometry(s).rotateY(Math.PI / 2).translate(c, 0, 0))
  }
  face([
    [-z1, yb],
    [-z0, yb],
    [-z0, WAF.depth],
    [-z1, WAF.depth],
  ])
  for (const z of ribLines([z0, z1], true))
    face([
      [-z - WAF.foot / 2, 0],
      [-z + WAF.foot / 2, 0],
      [-z + WAF.head / 2, yb],
      [-z - WAF.head / 2, yb],
    ])
  return uvBox(merge(parts), 2)
}

/** the old topping: two slabs either side of its saw-cut joint, the joint a few millimetres open */
export function oldTopping([x0, x1]: [number, number], [z0, z1]: [number, number], seam = SEAM) {
  return uvBox(merge([block([x0, SLAB, z0], [seam - 0.003, OLD_TOP, z1]), block([seam + 0.003, SLAB, z0], [x1, OLD_TOP, z1])]), 2)
}

/* ---- materials ---------------------------------------------------------------------------------- */

export type FabKit = ReturnType<typeof fabKit>

export function fabKit() {
  const k = floorKit()
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ transparent: true, ...p })
  return {
    ...k,
    /** the cast post-tensioned slab: a warmer, coarser concrete than precast */
    waffle: std({ color: '#b3aea4', map: grainTexture('#b3aea4', 7200, [138, 206], 1), roughness: 0.93 }),
    /** the old brittle topping, worn */
    old: std({ color: '#a39e95', map: grainTexture('#a39e95', 9000, [118, 200], 1), roughness: 0.96 }),
    /** the deck once diamond-ground to CSP-4: its aggregate opened, paler */
    ground: std({ color: '#c2bdb2', map: grainTexture('#c2bdb2', 11000, [112, 228], 1), roughness: 0.98 }),
    /** the epoxy vapour barrier, wet-looking */
    barrier: std({ color: '#596159', roughness: 0.2, opacity: 0.88 }),
    /** graphene self-levelling concrete: a cooler, darker grey than a plain screed; wet as it runs */
    slc: std({ color: '#a7a8a4', map: grainTexture('#a7a8a4', 4600, [150, 205], 1), roughness: 0.66 }),
    slcWet: std({ color: '#6f716e', roughness: 0.1, metalness: 0.05 }),
    copper: std({ color: '#b8743f', metalness: 0.85, roughness: 0.3 }),
    /** the ESD top coat: high-gloss, chemical-resistant, a pale cleanroom grey */
    coat: std({ color: '#c6c9c6', roughness: 0.1, envMapIntensity: 0.75 }),
  }
}

export function disposeKit(m: Record<string, THREE.Material>) {
  for (const x of Object.values(m)) {
    ;(x as THREE.MeshStandardMaterial).map?.dispose()
    x.dispose()
  }
}

/* ---- drawings ------------------------------------------------------------------------------------ */

type V = [number, number, number]

/** a circle of segments about an axis, through a centre */
export function circle(L: Lines, c: V, r: number, axis: 'x' | 'y' | 'z', n = 24, from = 0, to = Math.PI * 2) {
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * i) / n
    const b = from + ((to - from) * (i + 1)) / n
    const p = (t: number): number[] =>
      axis === 'z' ? [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), c[2]] : axis === 'x' ? [c[0], c[1] + r * Math.sin(t), c[2] + r * Math.cos(t)] : [c[0] + r * Math.cos(t), c[1], c[2] + r * Math.sin(t)]
    L.seg(p(a), p(b))
  }
}

/** an upright cylinder: its two rims and four lines down its sides */
function cylinderY(L: Lines, c: V, r: number, h: number, n = 20) {
  circle(L, c, r, 'y', n)
  circle(L, [c[0], c[1] + h, c[2]], r, 'y', n)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    L.seg([c[0] + r * Math.cos(a), c[1], c[2] + r * Math.sin(a)], [c[0] + r * Math.cos(a), c[1] + h, c[2] + r * Math.sin(a)])
  }
}

/** a FOUP (the wafer carrier): its shell, door, flange on top and the handle, standing on y, its door facing +z */
function foup(L: Lines, x: number, y: number, z: number) {
  const w = 0.39
  const d = 0.33
  const h = 0.33
  L.box([x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2])
  L.rectZ(x - w / 2 + 0.03, y + 0.03, x + w / 2 - 0.03, y + h - 0.03, z + d / 2 + 0.002)
  L.box([x - 0.12, y + h, z - 0.1], [x + 0.12, y + h + 0.02, z + 0.1])
  L.seg([x - 0.06, y + h + 0.02, z], [x + 0.06, y + h + 0.02, z])
}

/**
 * A wafer process tool as a drawing, after the fab photographs: the equipment front-end module at
 * its front with its load ports and a FOUP on each, the window over them and the doors under; the
 * process module behind it, taller, its service panels, louvres and exhaust duct; the touch screen
 * on its arm, the signal tower, the emergency stop; levelling feet. Standing on y, centred on x, z,
 * its front facing +z; `w` wide, `d` deep, `h` high.
 */
export function processTool(L: Lines, x: number, z: number, y: number, o: { w?: number; d?: number; h?: number; ports?: number } = {}) {
  const w = o.w ?? 1.3
  const d = o.d ?? 1.0
  const h = o.h ?? 1.95
  const ports = o.ports ?? 2
  const X = (v: number) => x + v
  const Y = (v: number) => y + v
  const Z = (v: number) => z + v
  const box = (a: number[], b: number[]) => L.box([X(a[0]), Y(a[1]), Z(a[2])], [X(b[0]), Y(b[1]), Z(b[2])])
  const seg = (a: number[], b: number[]) => L.seg([X(a[0]), Y(a[1]), Z(a[2])], [X(b[0]), Y(b[1]), Z(b[2])])
  const ef = 0.38
  const front = d / 2
  // the feet and the plinth
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) seg([sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)], [sx * (w / 2 - 0.06), 0.06, sz * (d / 2 - 0.06)])
  box([-w / 2 + 0.03, 0.06, -d / 2 + 0.03], [w / 2 - 0.03, 0.11, d / 2 - 0.03])
  // the front-end module, and the taller process module behind it
  box([-w / 2, 0.11, front - ef], [w / 2, 1.62, front])
  box([-w / 2 + 0.02, 0.11, -d / 2], [w / 2 - 0.02, h, front - ef])
  // the load ports: a shelf each and a FOUP on it, the port's door in the module's face
  const pw = w / ports
  for (let k = 0; k < ports; k++) {
    const cx = -w / 2 + pw * (k + 0.5)
    box([cx - 0.22, 0.8, front], [cx + 0.22, 0.83, front + 0.2])
    foup(L, X(cx), Y(0.83), Z(front + 0.1))
    L.rectZ(X(cx - 0.17), Y(0.86), X(cx + 0.17), Y(1.18), Z(front + 0.001))
    // the shelf's stand under it
    seg([cx, 0.8, front + 0.12], [cx, 0.11, front + 0.06])
  }
  // the window over the ports; two doors under them, their handles
  L.rectZ(X(-w / 2 + 0.05), Y(1.24), X(w / 2 - 0.05), Y(1.56), Z(front + 0.001))
  for (const sx of [-1, 1]) {
    L.rectZ(X(sx > 0 ? 0.02 : -w / 2 + 0.05), Y(0.16), X(sx > 0 ? w / 2 - 0.05 : -0.02), Y(0.74), Z(front + 0.001))
    seg([sx * 0.07, 0.38, front + 0.006], [sx * 0.07, 0.52, front + 0.006])
  }
  // the emergency stop, and the touch screen on its arm at the right
  circle(L, [X(-w / 2 + 0.12), Y(1.4), Z(front + 0.002)], 0.025, 'z', 10)
  seg([w / 2, 1.3, front - 0.1], [w / 2 + 0.14, 1.3, front + 0.04])
  seg([w / 2 + 0.14, 1.3, front + 0.04], [w / 2 + 0.14, 1.2, front + 0.08])
  L.rectZ(X(w / 2 + 0.01), Y(1.1), X(w / 2 + 0.29), Y(1.3), Z(front + 0.09))
  // the signal tower: a short pole and its three lamps
  seg([-w / 2 + 0.1, 1.62, front - 0.12], [-w / 2 + 0.1, 1.7, front - 0.12])
  for (let k = 0; k < 3; k++) cylinderY(L, [X(-w / 2 + 0.1), Y(1.7 + k * 0.055), Z(front - 0.12)], 0.028, 0.05, 12)
  // the process module: three service panels down its side, louvres at their foot, the exhaust duct on top
  for (let k = 0; k < 3; k++) {
    const za = -d / 2 + 0.04 + ((d - ef - 0.08) * k) / 3
    const zb = za + (d - ef - 0.08) / 3 - 0.02
    L.rectX(Z(za), Y(0.18), Z(zb), Y(h - 0.08), X(w / 2 - 0.02 + 0.001))
    for (let yy = 0.24; yy < 0.5; yy += 0.05) seg([w / 2 - 0.02 + 0.002, yy, za + 0.04], [w / 2 - 0.02 + 0.002, yy, zb - 0.04])
  }
  box([-0.16, h, -d / 2 + 0.12], [0.16, h + 0.14, -d / 2 + 0.36])
  cylinderY(L, [X(0), Y(h + 0.14), Z(-d / 2 + 0.24)], 0.08, 0.16, 14)
}

/**
 * An EUV lithography scanner as a drawing, its front left open (an X-ray) so its inside reads: the
 * light source's vessel at the left end, its collector; the illuminator carrying the light over to the
 * reticle stage on top; the projection optics, a column of lens housings, down to the wafer stage, a
 * granite block on its chuck; the wafer handler at the right end, its load port and a FOUP; the frame
 * on its isolation mounts; the signal tower. Standing on y, its length along x (centred), front at +z.
 * The wafer itself is a solid, placed by the scene at `WAFER`.
 */
export const SCAN = { x0: -1.15, x1: 1.15, z0: -0.55, z1: 0.42, h: 2.05 } as const
/** where the wafer lies, from the scanner's origin on the floor: under the optics, on its chuck */
export const WAFER: V = [0.35, 0.66, -0.06]
export const WAFER_R = 0.15
/** the foot of the projection optics, where the light leaves for the wafer */
export const OPTICS_FOOT: V = [WAFER[0], 0.86, WAFER[2]]

export function scanner(L: Lines, y: number) {
  const { x0, x1, z0, z1, h } = SCAN
  const Y = (v: number) => y + v
  // the isolation mounts and the base frame
  for (const x of [x0 + 0.15, 0, x1 - 0.15]) for (const z of [z0 + 0.12, z1 - 0.12]) cylinderY(L, [x, Y(0), z], 0.05, 0.06, 12)
  L.box([x0, Y(0.06), z0], [x1, Y(0.3), z1])
  // the enclosure: its edges, the roof's panels, the back's; the front left open
  for (const [a, b] of [
    [
      [x0, 0.3, z0],
      [x1, 0.3, z0],
    ],
    [
      [x0, h, z0],
      [x1, h, z0],
    ],
    [
      [x0, h, z1],
      [x1, h, z1],
    ],
    [
      [x0, 0.3, z1],
      [x1, 0.3, z1],
    ],
  ] as [number[], number[]][])
    L.seg([a[0], Y(a[1]), a[2]], [b[0], Y(b[1]), b[2]])
  for (const x of [x0, -0.55, 0.95, x1]) {
    L.seg([x, Y(0.3), z1], [x, Y(h), z1])
    L.seg([x, Y(0.3), z0], [x, Y(h), z0])
    L.seg([x, Y(h), z0], [x, Y(h), z1])
  }
  for (const x of [x0, x1]) L.seg([x, Y(0.3), z0], [x, Y(0.3), z1])
  for (let x = x0 + 0.38; x < x1; x += 0.38) L.seg([x, Y(h), z0], [x, Y(h), z1])
  // the source vessel and its collector (a mirror seen as three great circles)
  L.box([x0 + 0.06, Y(0.36), z0 + 0.08], [-0.6, Y(1.92), z1 - 0.1])
  const sc: V = [(x0 - 0.6) / 2 + 0.03, Y(1.12), (z0 + z1) / 2 - 0.02]
  circle(L, sc, 0.22, 'z', 28)
  circle(L, sc, 0.22, 'x', 28)
  circle(L, sc, 0.22, 'y', 28)
  circle(L, sc, 0.05, 'z', 12)
  // the illuminator, over to the reticle stage; the reticle stage on top
  L.box([-0.6, Y(1.42), -0.3], [0.08, Y(1.86), 0.12])
  L.box([0.06, Y(1.78), -0.32], [0.64, Y(1.98), 0.2])
  L.rectX(-0.24, Y(1.98), 0.12, Y(2.0), 0.35)
  // the projection optics: lens housings stacked down to its foot over the wafer
  const ox = OPTICS_FOOT[0]
  const oz = OPTICS_FOOT[2]
  const rings: [number, number][] = [
    [1.78, 0.2],
    [1.62, 0.22],
    [1.46, 0.22],
    [1.3, 0.21],
    [1.14, 0.19],
    [1.0, 0.15],
    [OPTICS_FOOT[1], 0.08],
  ]
  rings.forEach(([yy, r]) => circle(L, [ox, Y(yy), oz], r, 'y', 28))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3
    for (let i = 0; i + 1 < rings.length; i++) L.seg([ox + rings[i][1] * Math.cos(a), Y(rings[i][0]), oz + rings[i][1] * Math.sin(a)], [ox + rings[i + 1][1] * Math.cos(a), Y(rings[i + 1][0]), oz + rings[i + 1][1] * Math.sin(a)])
  }
  // its metrology frame, holding the column
  L.box([ox - 0.34, Y(1.2), oz - 0.3], [ox + 0.34, Y(1.26), oz + 0.3])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.seg([ox + sx * 0.32, Y(0.3), oz + sz * 0.28], [ox + sx * 0.32, Y(1.2), oz + sz * 0.28])
  // the wafer stage: the granite block, the stage on it, the chuck's rim
  L.box([ox - 0.3, Y(0.3), oz - 0.26], [ox + 0.3, Y(0.52), oz + 0.26])
  L.box([ox - 0.2, Y(0.52), oz - 0.19], [ox + 0.2, Y(0.62), oz + 0.19])
  circle(L, [WAFER[0], Y(0.64), WAFER[2]], WAFER_R + 0.012, 'y', 40)
  circle(L, [WAFER[0], Y(0.62), WAFER[2]], WAFER_R + 0.012, 'y', 40)
  // the wafer handler at the right end: its robot's arm, the load port, a FOUP on it
  L.box([0.95, Y(0.3), z0 + 0.06], [x1 - 0.02, Y(1.32), z1 - 0.02])
  L.box([x1 - 0.02, Y(0.82), z1 - 0.38], [x1 + 0.2, Y(0.85), z1 - 0.02])
  foup(L, x1 + 0.03, Y(0.85), z1 - 0.2)
  L.seg([1.05, Y(0.66), -0.05], [0.84, Y(0.66), 0.0])
  L.seg([0.84, Y(0.66), 0.0], [0.62, Y(0.65), -0.06])
  // the signal tower, at the handler's corner
  L.seg([x1 - 0.1, Y(h), z1 - 0.1], [x1 - 0.1, Y(h + 0.08), z1 - 0.1])
  for (let k = 0; k < 3; k++) cylinderY(L, [x1 - 0.1, Y(h + 0.08 + k * 0.055), z1 - 0.1], 0.028, 0.05, 12)
  // the cable trays along the back
  for (const yy of [h - 0.2, h - 0.32]) L.seg([x0, Y(yy), z0 - 0.08], [x1, Y(yy), z0 - 0.08])
}

/** the AMHS: an overhead rail along x at height `y` over z, its hangers up to `top`; the vehicle is drawn apart (`oht`) */
export function rail(L: Lines, x0: number, x1: number, y: number, z: number, top: number) {
  for (const dz of [-0.11, 0.11]) {
    L.seg([x0, y, z + dz], [x1, y, z + dz])
    L.seg([x0, y + 0.07, z + dz], [x1, y + 0.07, z + dz])
  }
  for (let x = x0; x <= x1 + 1e-6; x += 0.6) {
    L.seg([x, y + 0.07, z - 0.11], [x, y + 0.07, z + 0.11])
    L.seg([x, y + 0.07, z], [x, top, z])
  }
}

/** an overhead hoist vehicle, hanging under the rail from its origin (the rail's foot), a FOUP in its gripper */
export function oht(L: Lines) {
  L.box([-0.32, -0.04, -0.17], [0.32, 0.0, 0.17])
  L.box([-0.3, -0.42, -0.19], [0.3, -0.04, 0.19])
  for (const sx of [-1, 1]) L.rectZ(sx * 0.27, -0.38, sx * 0.04, -0.08, 0.191)
  // the gripper's straps down to the FOUP
  for (const sx of [-1, 1]) L.seg([sx * 0.1, -0.42, 0], [sx * 0.1, -0.5, 0])
  foup(L, 0, -0.84, 0)
}

/** a fan-filter unit ceiling grid over x0..x1, z0..z1 at height y, every `pitch` */
export function ffuGrid(L: Lines, x0: number, x1: number, z0: number, z1: number, y: number, pitch = 1.2) {
  for (let x = x0; x <= x1 + 1e-6; x += pitch) L.seg([x, y, z0], [x, y, z1])
  for (let z = z0; z <= z1 + 1e-6; z += pitch) L.seg([x0, y, z], [x1, y, z])
}

/**
 * A planetary diamond grinder, as a drawing: its round hood with the skirt, the motor and gearbox on
 * it, the vacuum port, two wheels at the back, the handle tubes up to the grip with its controls.
 * Origin on the floor under the hood's middle; the handle runs back along -x. Its three heads turn
 * under the hood, drawn apart (`grinderHeads`).
 */
export function grinder(L: Lines) {
  const R = 0.3
  circle(L, [0, 0.01, 0], R, 'y', 40)
  circle(L, [0, 0.1, 0], R, 'y', 40)
  circle(L, [0, 0.16, 0], R - 0.06, 'y', 36)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    L.seg([R * Math.cos(a), 0.01, R * Math.sin(a)], [R * Math.cos(a), 0.1, R * Math.sin(a)])
    L.seg([R * Math.cos(a), 0.1, R * Math.sin(a)], [(R - 0.06) * Math.cos(a), 0.16, (R - 0.06) * Math.sin(a)])
  }
  // the motor: an upright drum, its fan cover, its junction box
  cylinderY(L, [0, 0.16, 0], 0.13, 0.3, 24)
  circle(L, [0, 0.5, 0], 0.09, 'y', 18)
  L.box([0.13, 0.26, -0.06], [0.2, 0.38, 0.06])
  // the vacuum port, out to the side
  circle(L, [0.05, 0.18, R - 0.02], 0.04, 'z', 12)
  L.seg([0.05, 0.18, R - 0.02], [0.05, 0.22, R + 0.12])
  // the wheels at the back, on an axle
  for (const z of [-0.2, 0.2]) circle(L, [-0.36, 0.08, z], 0.08, 'z', 16)
  L.seg([-0.36, 0.08, -0.2], [-0.36, 0.08, 0.2])
  L.seg([-0.36, 0.08, 0], [-0.24, 0.12, 0])
  // the handle: two tubes up and back to the grip, a cross-bar, the control box
  for (const z of [-0.12, 0.12]) L.seg([-0.18, 0.3, z], [-0.85, 0.95, z])
  L.seg([-0.5, 0.62, -0.12], [-0.5, 0.62, 0.12])
  L.seg([-0.85, 0.95, -0.24], [-0.85, 0.95, 0.24])
  L.box([-0.8, 0.86, -0.08], [-0.7, 0.94, 0.08])
}

/** the grinder's three heads under the hood, each with its segments: turned by the scene */
export function grinderHeads(L: Lines) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const c: V = [0.16 * Math.cos(a), 0.012, 0.16 * Math.sin(a)]
    circle(L, c, 0.1, 'y', 20)
    for (let k = 0; k < 6; k++) {
      const b = (k / 6) * Math.PI * 2
      L.seg([c[0] + 0.05 * Math.cos(b), 0.012, c[2] + 0.05 * Math.sin(b)], [c[0] + 0.09 * Math.cos(b), 0.012, c[2] + 0.09 * Math.sin(b)])
    }
  }
}

/** a rotary laser level on its tripod: the legs, the head, its rotating prism's window; the beam's plane at `beam` above the origin */
export function rotaryLaser(L: Lines, beam: number) {
  const top = beam - 0.06
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4
    L.seg([0.34 * Math.cos(a), 0, 0.34 * Math.sin(a)], [0, top - 0.06, 0])
  }
  L.box([-0.07, top - 0.06, -0.07], [0.07, top, 0.07])
  cylinderY(L, [0, top, 0], 0.05, 0.12, 16)
  circle(L, [0, beam, 0], 0.052, 'y', 16)
  L.box([-0.04, top + 0.12, -0.04], [0.04, top + 0.15, 0.04])
}

/** a line laser on three short feet: its body, the lens's window, the level vial on top; its beams leave at `beam` over its origin */
export function laserUnit(L: Lines, beam: number) {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5
    L.seg([0.05 * Math.cos(a), 0, 0.05 * Math.sin(a)], [0.02 * Math.cos(a), beam - 0.012, 0.02 * Math.sin(a)])
  }
  L.box([-0.03, beam - 0.012, -0.025], [0.03, beam + 0.03, 0.025])
  circle(L, [0.031, beam, 0], 0.008, 'x', 12)
  L.box([-0.012, beam + 0.03, -0.006], [0.012, beam + 0.036, 0.006])
}

/**
 * The enclosed continuous mixer-pump, as a drawing: a closed cabinet on a skid with its doors and
 * vents, the binder silo over it on its legs with its cone and filter, the dosing auger up to it, the
 * control panel at its head, the pump's outlet at its tail. Origin on the ground under its middle, its
 * length along x (outlet at +x), its panel facing +z.
 */
export function mixerPump(L: Lines) {
  // the skid, the cabinet on it
  L.box([-1.0, 0, -0.42], [1.0, 0.1, 0.42])
  L.box([-0.95, 0.1, -0.4], [0.95, 1.05, 0.4])
  for (const x of [-0.5, 0, 0.5]) L.rectZ(x - 0.22, 0.18, x + 0.22, 0.95, 0.401)
  for (const x of [-0.5, 0, 0.5]) L.seg([x + 0.16, 0.5, 0.405], [x + 0.16, 0.62, 0.405])
  for (let y = 0.24; y < 0.5; y += 0.05) L.seg([0.62, y, 0.402], [0.9, y, 0.402])
  // the control panel at its head: a box with a display and buttons
  L.box([-1.0, 0.45, 0.1], [-0.95, 0.95, 0.38])
  L.rectX(0.14, 0.78, 0.34, 0.9, -1.001)
  for (let k = 0; k < 3; k++) circle(L, [-1.001, 0.62, 0.17 + k * 0.08], 0.018, 'x', 10)
  // the silo over the cabinet: legs, the drum, the cone, the filter and hatch on top
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.seg([-0.3 + sx * 0.32, 1.05, sz * 0.32], [-0.3 + sx * 0.32, 1.45, sz * 0.32])
  cylinderY(L, [-0.3, 1.6, 0], 0.4, 0.8, 28)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    L.seg([-0.3 + 0.4 * Math.cos(a), 1.6, 0.4 * Math.sin(a)], [-0.3 + 0.08 * Math.cos(a), 1.3, 0.08 * Math.sin(a)])
  }
  circle(L, [-0.3, 1.3, 0], 0.08, 'y', 12)
  L.seg([-0.3, 1.3, 0], [-0.3, 1.05, 0])
  cylinderY(L, [-0.3, 2.4, 0], 0.12, 0.14, 14)
  // the outlet at its tail
  circle(L, [1.0, 0.36, 0], 0.06, 'x', 14)
  circle(L, [1.06, 0.36, 0], 0.05, 'x', 14)
}

/* ---- the plant under a fab ---------------------------------------------------------------------- */

/** a dry vacuum pump on its frame: the body, the motor, the exhaust stub; origin on the floor under it, length along x */
export function vacuumPump(L: Lines) {
  L.box([-0.45, 0, -0.25], [0.45, 0.08, 0.25])
  L.box([-0.4, 0.08, -0.22], [0.2, 0.55, 0.22])
  cylinderY(L, [0.32, 0.08, 0], 0.13, 0.36, 16)
  for (let x = -0.34; x < 0.18; x += 0.07) L.seg([x, 0.16, 0.221], [x, 0.47, 0.221])
  L.seg([-0.2, 0.55, 0], [-0.2, 0.8, 0])
  circle(L, [-0.2, 0.8, 0], 0.04, 'y', 10)
}

/** an air-cooled chiller: its casing, the condenser coils' lines, the fans on top; origin under it, length along x */
export function chiller(L: Lines) {
  L.box([-1.1, 0, -0.5], [1.1, 1.1, 0.5])
  for (let x = -1.0; x <= 1.0; x += 0.1) L.seg([x, 0.15, 0.501], [x, 1.0, 0.501])
  for (const x of [-0.55, 0.55]) {
    circle(L, [x, 1.1, 0], 0.36, 'y', 22)
    circle(L, [x, 1.1, 0], 0.06, 'y', 10)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2
      L.seg([x + 0.06 * Math.cos(a), 1.1, 0.06 * Math.sin(a)], [x + 0.36 * Math.cos(a + 0.3), 1.1, 0.36 * Math.sin(a + 0.3)])
    }
  }
}

/** an air-handling unit: its casing in sections, the fan's drum inside the middle, access doors; origin under it, length along x */
export function airHandler(L: Lines) {
  L.box([-1.3, 0, -0.55], [1.3, 1.2, 0.55])
  for (const x of [-0.65, 0, 0.65]) L.seg([x, 0, 0.551], [x, 1.2, 0.551])
  for (const x of [-0.65, 0, 0.65]) for (const y of [0, 1.2]) L.seg([x, y, -0.55], [x, y, 0.55])
  circle(L, [0.33, 0.6, 0.552], 0.34, 'z', 24)
  circle(L, [0.33, 0.6, 0.552], 0.08, 'z', 10)
  L.rectZ(-0.58, 0.14, -0.08, 1.06, 0.552)
  L.seg([-0.14, 0.55, 0.556], [-0.14, 0.65, 0.556])
  L.box([-1.45, 0.3, -0.35], [-1.3, 0.9, 0.35])
}
