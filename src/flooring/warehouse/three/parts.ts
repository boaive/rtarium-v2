import * as THREE from 'three'
import { Lines } from '../../data/three/dc'
import type { Shot } from '../../../facade/three/kit'

/**
 * What stands on the warehouse floor, as drawings: the racks, the low AGV pod, the robotic picking
 * crane, the mast-lift LGV of the opening (after the yellow laser-guided trucks in the client's
 * photographs), and the machines that make the floor (the shot-blaster, the ride-on power trowel
 * after the client's film). The floor is the one thing shown in its own materials. Sizes are of the
 * kind, not of a project.
 */

export type V3 = [number, number, number]
export type Map3 = (u: number, y: number, v: number) => number[]

let seed = 41
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

export function circle(L: Lines, c: V3, r: number, axis: 'x' | 'y' | 'z', n = 24, from = 0, to = Math.PI * 2) {
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * i) / n
    const b = from + ((to - from) * (i + 1)) / n
    const p = (t: number): number[] =>
      axis === 'z' ? [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), c[2]] : axis === 'x' ? [c[0], c[1] + r * Math.sin(t), c[2] + r * Math.cos(t)] : [c[0] + r * Math.cos(t), c[1], c[2] + r * Math.sin(t)]
    L.seg(p(a), p(b))
  }
}

/** a box through a mapping (a rack run along either axis of the floor) */
function mapBox(L: Lines, m: Map3, a: V3, b: V3) {
  const [u0, y0, v0] = a
  const [u1, y1, v1] = b
  for (const y of [y0, y1]) {
    L.seg(m(u0, y, v0), m(u1, y, v0))
    L.seg(m(u1, y, v0), m(u1, y, v1))
    L.seg(m(u1, y, v1), m(u0, y, v1))
    L.seg(m(u0, y, v1), m(u0, y, v0))
  }
  for (const [u, v] of [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ])
    L.seg(m(u, y0, v), m(u, y1, v))
}

export const RACK = { bay: 2.7, depth: 1.1, level: 1.75 }

/**
 * A run of pallet racking: upright frames with their bracing, the beams of every level, and on them
 * pallets with their loads (some bays left empty). `m` maps along the run (u), up (y) and across it (v).
 */
export function rackRun(L: Lines, m: Map3, bays: number, levels: number, { load = 0.72, full = true, from = 0 }: { load?: number; full?: boolean; from?: number } = {}) {
  const { bay, depth, level } = RACK
  const h = levels * level
  for (let i = from; i <= bays; i++) {
    const u = i * bay
    for (const v of [0, depth]) L.seg(m(u, 0, v), m(u, h, v))
    if (!full) continue
    for (let k = 0; k < levels * 2; k++) {
      const y = (k * level) / 2
      L.seg(m(u, y, k % 2 ? depth : 0), m(u, y + level / 2, k % 2 ? 0 : depth))
    }
  }
  // the far-off runs of a whole hall are their uprights and beams alone
  for (let i = from; i < bays; i++) {
    const u = i * bay
    for (let l = 1; l <= levels; l++) {
      const y = l * level
      L.seg(m(u, y, 0), m(u + bay, y, 0))
      L.seg(m(u, y, depth), m(u + bay, y, depth))
    }
    if (!full) continue
    for (let l = 0; l < levels; l++) {
      const y = l * level + (l ? 0.02 : 0.12)
      for (const p of [0.1, 0.55]) {
        if (rnd() > load) continue
        const w = 1.0
        const a = u + p * bay
        // the pallet, then its load: a box of a height of its own
        mapBox(L, m, [a, y, 0.06], [a + w, y + 0.14, depth - 0.06])
        const t = 0.55 + rnd() * 0.75
        mapBox(L, m, [a + 0.04, y + 0.14, 0.1], [a + w - 0.04, y + 0.14 + t, depth - 0.1])
      }
    }
  }
}

/** the wheel on an axle along x, as a drawing: tyre, rim, hub and spokes (turned by the scene) */
export function wheelLines(L: Lines, r: number, w: number) {
  for (const x of [-w / 2, w / 2]) {
    circle(L, [x, 0, 0], r, 'x', 36)
    circle(L, [x, 0, 0], r * 0.62, 'x', 24)
    circle(L, [x, 0, 0], r * 0.2, 'x', 12)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      L.seg([x, r * 0.2 * Math.sin(a), r * 0.2 * Math.cos(a)], [x, r * 0.62 * Math.sin(a), r * 0.62 * Math.cos(a)])
    }
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    L.seg([-w / 2, r * Math.sin(a), r * Math.cos(a)], [w / 2, r * Math.sin(a), r * Math.cos(a)])
  }
}

/** the low AGV: origin on the floor under its middle, running towards +z; wheels at ±x, ±z, its laser scanner at the front */
export const POD = { w: 0.86, l: 1.3, h: 0.3, wheelX: 0.36, wheelZ: 0.42, wheelR: 0.085, wheelW: 0.06, lidar: [0, 0.3, 0.56] as V3 }

export function podLines(L: Lines, { wheels = true }: { wheels?: boolean } = {}) {
  const { w, l, h, wheelX, wheelZ, wheelR } = POD
  const c = 0.07
  // the body, its corners cut back, over its skirt
  const ring = (y: number, i = 0): number[][] => {
    const W = w / 2 - i
    const Z = l / 2 - i
    return [
      [-W + c, y, -Z],
      [W - c, y, -Z],
      [W, y, -Z + c],
      [W, y, Z - c],
      [W - c, y, Z],
      [-W + c, y, Z],
      [-W, y, Z - c],
      [-W, y, -Z + c],
    ]
  }
  for (const [y, i] of [
    [0.05, 0.015],
    [h - 0.06, 0],
    [h, 0.04],
  ]) {
    const r = ring(y, i)
    r.forEach((p, k) => L.seg(p, r[(k + 1) % r.length]))
  }
  const a = ring(0.05, 0.015)
  const b = ring(h - 0.06, 0)
  const d = ring(h, 0.04)
  a.forEach((p, k) => {
    L.seg(p, b[k])
    L.seg(b[k], d[k])
  })
  // the lift plate on its back, the status strip round its waist, the bumper, the scanner
  circle(L, [0, h + 0.001, -0.08], 0.28, 'y', 28)
  circle(L, [0, h + 0.001, -0.08], 0.2, 'y', 22)
  L.rectZ(-0.26, 0.12, 0.26, 0.2, l / 2 + 0.002)
  L.seg([-w / 2 + 0.05, 0.16, l / 2 - 0.02], [-w / 2 + 0.05, 0.16, -l / 2 + 0.02])
  L.seg([w / 2 - 0.05, 0.16, l / 2 - 0.02], [w / 2 - 0.05, 0.16, -l / 2 + 0.02])
  circle(L, [0, h + 0.05, POD.lidar[2]], 0.05, 'y', 14)
  circle(L, [0, h, POD.lidar[2]], 0.05, 'y', 14)
  for (const a2 of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) L.seg([0.05 * Math.cos(a2), h, POD.lidar[2] + 0.05 * Math.sin(a2)], [0.05 * Math.cos(a2), h + 0.05, POD.lidar[2] + 0.05 * Math.sin(a2)])
  // its beacon on a short pole at the back
  L.seg([0.3, h, -0.5], [0.3, h + 0.34, -0.5])
  circle(L, [0.3, h + 0.34, -0.5], 0.03, 'y', 10)
  circle(L, [0.3, h + 0.4, -0.5], 0.03, 'y', 10)
  if (!wheels) return
  for (const x of [-wheelX, wheelX]) {
    for (const z of [-wheelZ, wheelZ]) {
      circle(L, [x + Math.sign(x) * POD.wheelW, wheelR, z], wheelR, 'x', 18)
      circle(L, [x + Math.sign(x) * POD.wheelW, wheelR, z], wheelR * 0.45, 'x', 10)
    }
  }
}

/** a robotic picking crane, running along z on its floor rail: bottom carriage, twin mast, top guide, cab */
export function craneLines(L: Lines, h: number) {
  L.box([-0.26, 0.08, -0.95], [0.26, 0.42, 0.95])
  for (const z of [-0.7, 0.7]) circle(L, [0.27, 0.16, z], 0.16, 'x', 16)
  for (const z of [-0.36, 0.36]) {
    L.box([-0.11, 0.42, z - 0.07], [0.11, h, z + 0.07])
    for (let y = 1.1; y < h - 0.2; y += 1.05) L.seg([-0.11, y, z], [0.11, y + 0.5, z])
  }
  for (let y = 1.4; y < h; y += 1.4) L.seg([0, y, -0.29], [0, y, 0.29])
  L.box([-0.24, h, -0.7], [0.24, h + 0.2, 0.7])
  // the control cabinet at its foot
  L.box([-0.24, 0.42, 0.5], [0.24, 1.75, 0.92])
  L.rectX(0.54, 0.6, 0.88, 1.6, 0.242)
}

/** the crane's lifting cradle with its load: raised by the scene */
export function cradleLines(L: Lines) {
  L.box([-0.68, 0, -0.32], [0.68, 0.14, 0.32])
  for (const z of [-0.2, 0.2]) L.box([-0.6, 0.14, z - 0.05], [0.6, 0.18, z + 0.05])
  L.box([-0.54, 0.18, -0.46], [0.54, 0.32, 0.46])
  L.box([-0.5, 0.32, -0.42], [0.5, 1.1, 0.42])
}

/**
 * The LGV of the opening, after the client's photographs of laser-guided trucks in a narrow aisle:
 * the tall square body at the back, its panel, doors, vents and bumper; a mast of two rails with its
 * cross ties and lift chains; the carriage on the mast with a pallet and a timber crate on its forks;
 * the outrigger legs along the floor and their load wheels; the laser scanner at the foot and the
 * beacon on its pole. Origin on the floor under the mast, its body towards +x, its load towards -x.
 */
export function lgvLines(L: Lines, H = 2.55, lift = 1.08) {
  const b = { x0: 0.04, x1: 0.82, z: 0.42, y0: 0.12, y1: 1.2 }
  // the body and its chamfered top
  L.box([b.x0, b.y0, -b.z], [b.x1, b.y1 - 0.06, b.z])
  L.box([b.x0 + 0.03, b.y1 - 0.06, -b.z + 0.03], [b.x1 - 0.03, b.y1, b.z - 0.03])
  // the rear face: two doors, the line where the grey skirt meets the body, the display, buttons and keys
  const xf = b.x1 + 0.001
  L.seg([xf, 0.56, -b.z], [xf, 0.56, b.z])
  L.seg([xf, 0.56, 0], [xf, b.y1 - 0.06, 0])
  L.rectX(0.06, 0.82, 0.32, 1.06, xf)
  L.rectX(0.09, 0.85, 0.29, 1.03, xf)
  L.rectX(-0.32, 0.8, -0.06, 1.08, xf)
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) circle(L, [xf, 0.86 + r * 0.08, -0.26 + k * 0.07], 0.016, 'x', 8)
  // the handle slots, the lamps either side, the vents in the skirt, the bumper
  for (const z of [-0.2, 0.2]) L.rectX(z - 0.06, 0.66, z + 0.06, 0.7, xf)
  for (const z of [-0.37, 0.37]) L.rectX(z - 0.02, 0.72, z + 0.02, 0.92, xf)
  for (const z of [-0.2, 0.2]) {
    L.rectX(z - 0.07, 0.24, z + 0.07, 0.42, xf)
    for (let y = 0.27; y < 0.42; y += 0.03) L.seg([xf, y, z - 0.07], [xf, y, z + 0.07])
  }
  L.box([b.x1 - 0.02, 0.07, -b.z - 0.015], [b.x1 + 0.04, 0.17, b.z + 0.015])
  // the side panel's joints and vents
  L.seg([b.x0, 0.56, b.z + 0.001], [b.x1, 0.56, b.z + 0.001])
  L.rectZ(0.22, 0.26, 0.6, 0.44, b.z + 0.001)
  for (let x = 0.26; x < 0.6; x += 0.04) L.seg([x, 0.27, b.z + 0.001], [x, 0.43, b.z + 0.001])
  // the drive wheels
  for (const z of [-b.z + 0.04, b.z - 0.04]) {
    circle(L, [0.52, 0.11, z], 0.11, 'z', 18)
    circle(L, [0.52, 0.11, z], 0.05, 'z', 10)
  }
  // the mast: two rails, cross ties, the head, chains and the cable chain
  for (const z of [-0.31, 0.31]) {
    L.box([-0.05, 0.08, z - 0.035], [0.05, H, z + 0.035])
    L.seg([-0.05, 0.08, z], [-0.05, H, z])
  }
  for (const y of [0.42, 0.98, 1.62, 2.2]) L.box([-0.04, y, -0.28], [0.04, y + 0.05, 0.28])
  L.box([-0.07, H, -0.36], [0.07, H + 0.05, 0.36])
  for (const z of [-0.1, 0.1]) L.seg([-0.06, lift + 0.3, z], [-0.06, H, z])
  // the carriage, its forks, the pallet and a timber crate with its collars
  L.box([-0.1, lift, -0.33], [-0.05, lift + 0.36, 0.33])
  for (const z of [-0.2, 0.2]) L.box([-0.95, lift, z - 0.045], [-0.1, lift + 0.03, z + 0.045])
  const y0 = lift + 0.03
  L.box([-0.96, y0, -0.4], [-0.14, y0 + 0.13, 0.4])
  for (const x of [-0.85, -0.55, -0.25]) L.seg([x, y0 + 0.13, -0.4], [x, y0 + 0.13, 0.4])
  const y1 = y0 + 0.13
  for (let k = 0; k < 4; k++) L.box([-0.94, y1 + k * 0.17, -0.38], [-0.16, y1 + (k + 1) * 0.17, 0.38])
  for (const x of [-0.92, -0.18]) for (const z of [-0.36, 0.36]) L.seg([x, y1, z], [x, y1 + 0.68, z])
  // the outrigger legs along the floor, their load wheels
  for (const z of [-0.4, 0.4]) {
    L.box([-0.92, 0.03, z - 0.05], [0.04, 0.11, z + 0.05])
    circle(L, [-0.84, 0.05, z], 0.05, 'z', 12)
  }
  // the laser scanner at the foot of the mast, the sensor pole and its beacon
  L.box([0.0, 0.11, -0.1], [0.08, 0.2, 0.1])
  L.seg([0.1, b.y1, 0.34], [0.1, H + 0.2, 0.34])
  circle(L, [0.1, H + 0.2, 0.34], 0.03, 'y', 10)
  circle(L, [0.1, H + 0.28, 0.34], 0.03, 'y', 10)
  L.box([0.08, 1.75, 0.3], [0.13, 1.85, 0.38])
}

/** a tube along points, its hoops every so often: a hose, drawn */
function tube(L: Lines, pts: V3[], r: number) {
  const rings: number[][][] = []
  const n = 8
  pts.forEach((c, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()
    const u = new THREE.Vector3(1, 0, 0).cross(t).normalize()
    const v = t.clone().cross(u)
    const ring: number[][] = []
    for (let k = 0; k < n; k++) {
      const q = (k / n) * Math.PI * 2
      ring.push([c[0] + r * (u.x * Math.cos(q) + v.x * Math.sin(q)), c[1] + r * (u.y * Math.cos(q) + v.y * Math.sin(q)), c[2] + r * (u.z * Math.cos(q) + v.z * Math.sin(q))])
    }
    ring.forEach((q, k) => L.seg(q, ring[(k + 1) % n]))
    rings.push(ring)
  })
  for (let i = 0; i < rings.length - 1; i++) for (const k of [0, 2, 4, 6]) L.seg(rings[i][k], rings[i + 1][k])
}

/**
 * A walk-behind shot-blaster: on the floor its blast housing with the brush seal round its foot, the
 * blast wheel's round cover and the motor across its head; over that the separator with its tapered
 * hopper, sight glass, lid and latches; the rear wheels and front castors; the dust hose out of the
 * separator's back; the handlebar with its grips, control box and drive lever. Origin on the floor,
 * working towards +z.
 */
export function blasterLines(L: Lines) {
  // the housing's foot, and the brush seal
  L.box([-0.27, 0.05, -0.2], [0.27, 0.14, 0.3])
  for (let x = -0.25; x <= 0.25; x += 0.05) {
    L.seg([x, 0.05, 0.3], [x, 0.008, 0.31])
    L.seg([x, 0.05, -0.2], [x, 0.008, -0.21])
  }
  for (let z = -0.18; z <= 0.29; z += 0.05) for (const s of [-1, 1]) L.seg([s * 0.27, 0.05, z], [s * 0.28, 0.008, z])
  // the blast housing, stepped in over its foot; the wheel's cover, its bolts and ribs
  L.box([-0.21, 0.14, -0.1], [0.21, 0.4, 0.26])
  for (const r of [0.105, 0.085, 0.03]) circle(L, [0.211, 0.27, 0.08], r, 'x', 22)
  for (let k = 0; k < 8; k++) {
    const q = (k / 8) * Math.PI * 2
    L.seg([0.211, 0.27 + 0.03 * Math.sin(q), 0.08 + 0.03 * Math.cos(q)], [0.211, 0.27 + 0.085 * Math.sin(q), 0.08 + 0.085 * Math.cos(q)])
  }
  // the motor across the head, its fins and terminal box
  for (const x of [-0.21, -0.14, -0.07, 0, 0.07, 0.14, 0.21]) circle(L, [x, 0.48, 0.16], 0.075, 'x', 16)
  for (const q of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) L.seg([-0.21, 0.48 + 0.075 * Math.sin(q), 0.16 + 0.075 * Math.cos(q)], [0.21, 0.48 + 0.075 * Math.sin(q), 0.16 + 0.075 * Math.cos(q)])
  L.box([-0.05, 0.55, 0.12], [0.05, 0.6, 0.2])
  // the feed chute from the hopper down to the wheel
  L.seg([-0.05, 0.4, 0.04], [-0.05, 0.5, 0.05])
  L.seg([0.05, 0.4, 0.04], [0.05, 0.5, 0.05])
  // the separator: its cabinet, tapering down into the hopper; lid, latches, sight glass
  const cab = { x: 0.19, z0: -0.27, z1: 0.06, y0: 0.56, y1: 0.86 }
  L.box([-cab.x, cab.y0, cab.z0], [cab.x, cab.y1, cab.z1])
  const low = { x: 0.1, z0: -0.16, z1: 0.0, y: 0.4 }
  for (const [sx, a2, b2] of [
    [-1, cab.z0, low.z0],
    [-1, cab.z1, low.z1],
    [1, cab.z0, low.z0],
    [1, cab.z1, low.z1],
  ] as [number, number, number][])
    L.seg([sx * cab.x, cab.y0, a2], [sx * low.x, low.y, b2])
  L.box([-cab.x - 0.012, cab.y1, cab.z0 - 0.012], [cab.x + 0.012, cab.y1 + 0.025, cab.z1 + 0.012])
  for (const x of [-0.11, 0.11]) L.rectZ(x - 0.018, cab.y1 - 0.05, x + 0.018, cab.y1 + 0.012, cab.z1 + 0.002)
  L.rectZ(-0.07, 0.62, 0.07, 0.76, cab.z1 + 0.002)
  // the wheels at the back, on their axle, and the castors in front
  for (const s of [-1, 1]) {
    for (const dx of [-0.02, 0.02]) circle(L, [s * 0.3 + dx, 0.1, -0.15], 0.1, 'x', 20)
    circle(L, [s * 0.32, 0.1, -0.15], 0.045, 'x', 12)
    for (let k = 0; k < 8; k++) {
      const q = (k / 8) * Math.PI * 2
      L.seg([s * 0.28, 0.1 + 0.1 * Math.sin(q), -0.15 + 0.1 * Math.cos(q)], [s * 0.32, 0.1 + 0.1 * Math.sin(q), -0.15 + 0.1 * Math.cos(q)])
    }
    circle(L, [s * 0.2, 0.03, 0.34], 0.03, 'x', 10)
    L.seg([s * 0.2, 0.03, 0.34], [s * 0.2, 0.08, 0.29])
  }
  L.seg([-0.32, 0.1, -0.15], [0.32, 0.1, -0.15])
  // the dust hose, out of the separator's back and down to the floor beside the machine
  tube(
    L,
    [
      [0.08, 0.74, -0.27],
      [0.1, 0.72, -0.34],
      [0.16, 0.58, -0.4],
      [0.24, 0.36, -0.44],
      [0.3, 0.16, -0.46],
      [0.32, 0.05, -0.52],
      [0.32, 0.04, -0.62],
    ],
    0.03,
  )
  // the handlebar: two tubes up from the frame, a brace, the grips; the control box and the drive lever
  for (const s of [-1, 1]) {
    L.seg([s * 0.16, 0.34, -0.2], [s * 0.16, 0.86, -0.52])
    L.seg([s * 0.145, 0.34, -0.2], [s * 0.145, 0.86, -0.52])
    L.seg([s * 0.16, 0.86, -0.52], [s * 0.16, 0.98, -0.62])
    L.box([s * 0.16 - 0.018, 0.96, -0.64], [s * 0.16 + 0.018, 1.0, -0.56])
  }
  L.seg([-0.16, 0.86, -0.52], [0.16, 0.86, -0.52])
  L.seg([-0.16, 0.6, -0.36], [0.16, 0.6, -0.36])
  L.box([-0.09, 0.8, -0.56], [0.09, 0.93, -0.49])
  for (const x of [-0.05, 0, 0.05]) circle(L, [x, 0.87, -0.561], 0.012, 'z', 8)
  L.seg([0.13, 0.94, -0.6], [0.04, 0.99, -0.65])
  L.seg([-0.13, 0.94, -0.6], [-0.04, 0.99, -0.65])
  L.seg([-0.04, 0.99, -0.65], [0.04, 0.99, -0.65])
}

/**
 * A ride-on power trowel, after the client's film: two guard rings side by side on the floor, the
 * deck over them, the seat and its back, the two control sticks and foot plate, the engine behind and
 * its fuel tank, the lamps and the beacon. A 2.4 m machine; origin on the floor at its middle, its
 * rotors at ±x, working towards +z.
 */
export const TROWEL = { x: 0.62, r: 0.56 }

export function rideOnLines(L: Lines) {
  const { x: X, r: R } = TROWEL
  for (const s of [-1, 1]) {
    for (const [y, r] of [
      [0.02, R],
      [0.13, R],
      [0.13, R - 0.05],
    ])
      circle(L, [s * X, y, 0], r, 'y', 44)
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2
      L.seg([s * X + R * Math.cos(a), 0.02, R * Math.sin(a)], [s * X + R * Math.cos(a), 0.13, R * Math.sin(a)])
    }
    // the rotor's gearbox and the arms to the guard
    L.box([s * X - 0.09, 0.08, -0.09], [s * X + 0.09, 0.32, 0.09])
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2
      L.seg([s * X + (R - 0.05) * Math.cos(a), 0.13, (R - 0.05) * Math.sin(a)], [s * X + 0.08 * Math.cos(a), 0.3, 0.08 * Math.sin(a)])
    }
  }
  // the deck over the two rotors, its skirt
  L.box([-0.92, 0.32, -0.42], [0.92, 0.42, 0.42])
  L.box([-0.46, 0.42, -0.4], [0.46, 0.5, 0.4])
  // the engine and its shroud behind the seat, the fuel tank, the grille
  L.box([-0.4, 0.5, -0.4], [0.4, 0.86, -0.02])
  for (let x = -0.34; x < 0.36; x += 0.07) L.seg([x, 0.54, -0.401], [x, 0.82, -0.401])
  L.box([-0.34, 0.86, -0.36], [0.34, 0.96, -0.08])
  // the seat, its back and arms
  L.box([-0.2, 0.86, -0.02], [0.2, 0.96, 0.32])
  L.box([-0.2, 0.96, -0.06], [0.2, 1.36, 0.0])
  for (const s of [-1, 1]) L.seg([s * 0.22, 1.1, 0.0], [s * 0.22, 1.1, 0.26])
  // the foot well, the two control sticks, the dash and the lamps
  L.box([-0.32, 0.5, 0.34], [0.32, 0.56, 0.42])
  for (const s of [-1, 1]) {
    L.seg([s * 0.26, 0.5, 0.26], [s * 0.26, 1.08, 0.38])
    circle(L, [s * 0.26, 1.1, 0.38], 0.03, 'y', 10)
    L.seg([s * 0.82, 0.42, 0.4], [s * 0.82, 0.7, 0.4])
    L.box([s * 0.82 - 0.05, 0.7, 0.36], [s * 0.82 + 0.05, 0.78, 0.42])
  }
  L.box([-0.14, 0.56, 0.3], [0.14, 0.84, 0.4])
  // the beacon on its pole
  L.seg([0.34, 0.96, -0.3], [0.34, 1.6, -0.3])
  circle(L, [0.34, 1.6, -0.3], 0.03, 'y', 10)
  circle(L, [0.34, 1.68, -0.3], 0.03, 'y', 10)
}

/** one rotor's four blades, turned by the scene */
export function rideOnBlades(L: Lines) {
  const R = TROWEL.r - 0.03
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const n = [-s, c]
    const p = (r: number, w: number) => [c * r + n[0] * w, 0.006, s * r + n[1] * w]
    L.seg(p(0.08, 0.07), p(R, 0.07))
    L.seg(p(0.08, -0.07), p(R, -0.07))
    L.seg(p(R, 0.07), p(R, -0.07))
    L.seg(p(0.08, 0.07), p(0.08, -0.07))
    L.seg([0, 0.08, 0], [c * 0.08, 0.02, s * 0.08])
  }
}

/** a drawing's segments from the floor up, so it is drawn as it would be built */
export function upwards(L: Lines) {
  const n = L.pts.length / 6
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.min(L.pts[a * 6 + 1], L.pts[a * 6 + 4]) - Math.min(L.pts[b * 6 + 1], L.pts[b * 6 + 4]))
  const out = new Lines()
  for (const i of idx) out.pts.push(...L.pts.slice(i * 6, i * 6 + 6))
  return out
}

/* ---- the camera the failure and the solution share ------------------------------------------------- */

/**
 * What a shot frames: a box, from a view, filling `fill` of the room. A move between two is the two
 * boxes interpolated and fitted again on every frame (never two cameras mixed), so whatever is inside
 * the box stays inside the room all the way, in the between-frames as well as the held ones.
 */
export interface View {
  box: [V3, V3]
  azim: number
  elev: number
  fill: number
}

export function mixView(a: View, b: View, t: number): View {
  const l = (x: number, y: number) => x + (y - x) * t
  const p = (u: V3, w: V3): V3 => [l(u[0], w[0]), l(u[1], w[1]), l(u[2], w[2])]
  return { box: [p(a.box[0], b.box[0]), p(a.box[1], b.box[1])], azim: l(a.azim, b.azim), elev: l(a.elev, b.elev), fill: l(a.fill, b.fill) }
}

export interface Cam {
  p: V3
  l: V3
  fov: number
  frame: [number, number]
}

const DEG = Math.PI / 180

/** an orbit shot (`fit`'s) as a free camera */
export function camOf(s: Shot): Cam {
  const A = s.azim * DEG
  const E = s.elev * DEG
  const [x, y, z] = s.target
  return { p: [x + s.dist * Math.cos(E) * Math.sin(A), y + s.dist * Math.sin(E), z + s.dist * Math.cos(E) * Math.cos(A)], l: [x, y, z], fov: s.fov ?? 26, frame: s.frame ?? [0.5, 0.5] }
}

/** a camera between two: its target moved straight, its distance by ratio, so a long zoom reads even all the way */
export function mixCam(a: Cam, b: Cam, t: number): Cam {
  const l = (x: number, y: number) => x + (y - x) * t
  const L0 = new THREE.Vector3(...a.l)
  const L1 = new THREE.Vector3(...b.l)
  const d0 = new THREE.Vector3(...a.p).sub(L0)
  const d1 = new THREE.Vector3(...b.p).sub(L1)
  const ln = L0.lerp(L1, t)
  const d = Math.exp(l(Math.log(d0.length()), Math.log(d1.length())))
  const dir = d0.normalize().lerp(d1.normalize(), t).normalize().multiplyScalar(d)
  return { p: [ln.x + dir.x, ln.y + dir.y, ln.z + dir.z], l: [ln.x, ln.y, ln.z], fov: l(a.fov, b.fov), frame: [l(a.frame[0], b.frame[0]), l(a.frame[1], b.frame[1])] }
}

export function applyCam(camera: THREE.PerspectiveCamera, size: { width: number; height: number }, c: Cam) {
  const d = Math.hypot(c.p[0] - c.l[0], c.p[1] - c.l[1], c.p[2] - c.l[2])
  camera.fov = c.fov
  camera.near = Math.max(0.03, d * 0.015)
  camera.far = d * 8 + 160
  camera.position.set(c.p[0], c.p[1], c.p[2])
  camera.lookAt(c.l[0], c.l[1], c.l[2])
  camera.setViewOffset(size.width, size.height, -(c.frame[0] - 0.5) * size.width, -(c.frame[1] - 0.5) * size.height, size.width, size.height)
  camera.updateProjectionMatrix()
}
