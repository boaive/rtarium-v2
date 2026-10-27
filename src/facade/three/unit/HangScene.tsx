import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { smooth, type Progress } from '../../progress'
import { Anchor } from '../Stage3D'
import { setOpacity, type LabelBus, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { prefersReducedMotion } from '../../../lib/motion'
import { block, frameGeometry, glassGeometry, insulationGeometry, merge, panelGeometry, U, unitMaterials, disposeUnitMaterials, windowGeometry, Z } from './parts'

/**
 * Slab to slab, and onto the building (Unitized page). On the page's own warm white: no ground, no
 * sky, only the drawing and what has been made solid.
 *
 *   1  the connection, seen three-quarter from the end of the slab so it reads like a section.
 *      Everything starts as a fine line drawing (X-ray); a scan passes down each part in turn and
 *      leaves it solid: the mounting bracket, then the fire and smoke barrier, then the unit with
 *      its hangers, which is lowered onto the brackets and hooks on.
 *   2  standing back: the unit's neighbours connect to it, one beside it (the side joint) and one
 *      lowered onto it (the stack joint). The block comes in behind as an X-ray, faint and then
 *      clear: an apartment block under construction, its lower floors already clad (solid), the
 *      floors above still open structure, slabs, columns, walls, stairs and openings.
 *   3  the tower crane, also an X-ray, climbing in the stair core and standing out of the roof as
 *      high-rise cranes do, lifts the next unit off the ground on its lifting beam, brings it in
 *      and lowers it into its place beside the others.
 *   4  one more scroll and the rest of the façade goes up by itself, unit after unit, floor by floor
 *      from the bottom; when every unit is in place the crane fades and the view settles on the
 *      building: the façade solid, the structure behind it a faint drawing.
 *
 * Steps 1 to 3 follow the scroll; step 4 is started by the scroll and runs in time. The block is
 * seven clad storeys on a low plinth, ten bays wide; the unit followed is the fifth bay of the fourth
 * floor. Sizes and details are drawn to show the principle, not a product drawing.
 */

/** the slab's top above the unit's foot, its depth, and the gap between its edge and the back of the frame */
const YS = U.h - 0.1
const SLAB_T = 0.26
const GAP = 0.09
const BRACKETS = [0.42, U.w - 0.42]
const LIFT = 0.36

/** the block: bays across, clad floors above a low plinth, its depth back from the slab edge */
const BAYS = 10
const FLOORS = 7
const PLINTH = 0.9
const DEPTH = 13
const W = BAYS * U.w
/** the unit followed through the section, by bay and floor; the floors below it are already clad */
const I0 = 4
const J0 = 3
const SIDE: [number, number] = [I0 - 1, J0]
const STACK: [number, number] = [I0, J0 + 1]
const CRANED: [number, number] = [I0 + 1, J0]
const at = (s: [number, number], i: number, j: number) => s[0] === i && s[1] === j
const DONE: [number, number][] = []
const REST: [number, number][] = []
for (let j = 0; j < FLOORS; j++)
  for (let i = 0; i < BAYS; i++) {
    if (j < J0) DONE.push([i, j])
    else if (!(i === I0 && j === J0) && !at(SIDE, i, j) && !at(STACK, i, j) && !at(CRANED, i, j)) REST.push([i, j])
  }
/** the units that move: the two neighbours, the one the crane brings, then the rest in the order they go up */
const LIVE: [number, number][] = [SIDE, STACK, CRANED, ...REST]
const slotX = (i: number) => i * U.w
const slotY = (j: number) => PLINTH + j * U.h
const levelY = (l: number) => PLINTH + l * U.h - 0.1
/** the stair core, where the crane climbs: its plan */
const CZ = -DEPTH / 2
const CORE = { x0: W / 2 - 1.6, x1: W / 2 + 1.6, z0: CZ - 0.9 - 3.6, z1: CZ - 0.9 }
/** the crane: its mast in the core, standing a little out of the roof (in proportion to the block); its jib and counter-jib */
const MAST: [number, number] = [(CORE.x0 + CORE.x1) / 2, (CORE.z0 + CORE.z1) / 2]
const MAST_H = levelY(FLOORS) + 6.5
const HEAD = 5.5
const JIB = 27
const COUNTER = 9
/** the craned unit starts on the ground in front of the block */
const START_Z = 10
const SPREAD = U.w * 0.45

/** when each step happens (fractions of the section's run) */
export const HANG = {
  bracket: [0.02, 0.09],
  barrier: [0.14, 0.21],
  unit: [0.25, 0.29],
  drop: [0.29, 0.35],
  pull: [0.39, 0.5],
  side: [0.41, 0.47],
  stack: [0.45, 0.51],
  block: [0.47, 0.6],
  crane: [0.57, 0.63],
  lift: [0.64, 0.84],
  /** from here the rest of the façade goes up in time */
  fill: 0.88,
} as const

/** the timings of the façade going up, in seconds */
const EACH = 0.05
const RISE = 0.45
const FILLED = REST.length * EACH + RISE
const CRANE_OUT = 0.9

function bracketGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (const x of BRACKETS) {
    // a base plate bolted to the slab, an upstand standing just clear of the slab's edge, a gusset
    parts.push(block([x - 0.13, YS, -0.36], [x + 0.13, YS + 0.016, -GAP + 0.05]))
    parts.push(block([x - 0.13, YS, -GAP + 0.034], [x + 0.13, YS + 0.2, -GAP + 0.05]))
    parts.push(block([x - 0.006, YS + 0.016, -0.3], [x + 0.006, YS + 0.12, -GAP + 0.034]))
    for (const dx of [-0.08, 0.08])
      for (const z of [-0.3, -0.18]) parts.push(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 10).translate(x + dx, YS + 0.03, z))
  }
  return merge(parts)
}

/** the hangers fixed to the frame's head: a hook over each bracket's upstand, a levelling bolt through its cap */
function hangerGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const top = YS + 0.23
  for (const x of BRACKETS) {
    parts.push(block([x - 0.11, U.h - 0.3, -0.014], [x + 0.11, top, 0]))
    parts.push(block([x - 0.11, top - 0.016, -GAP + 0.02], [x + 0.11, top, 0]))
    parts.push(block([x - 0.11, top - 0.09, -GAP + 0.02], [x + 0.11, top, -GAP + 0.032]))
    parts.push(new THREE.CylinderGeometry(0.011, 0.011, 0.09, 10).translate(x, top + 0.01, -GAP / 2 + 0.01))
  }
  return merge(parts)
}

function barrierGeometry() {
  // mineral wool packed into the gap along the slab's edge, the smoke seal over it
  return {
    wool: block([0.004, YS - SLAB_T, -GAP], [U.w - 0.004, YS - 0.006, -0.002]),
    seal: block([0.004, YS - 0.006, -GAP - 0.06], [U.w - 0.004, YS, 0.03]),
  }
}

/* ---- the block, as a drawing ----------------------------------------------------------------- */

/** line segments, kept as a flat list of points */
class Lines {
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
    return g
  }
}

/**
 * An apartment block under construction, as fine lines: a low plinth; slabs with their edges;
 * columns on a grid; on each floor the corridor walls with their doors, the party walls between the
 * flats, the windows in the back and end walls; a stair core with its flights; the parapet and the
 * plant on the roof.
 */
function blockGeometry() {
  const L = new Lines()
  const x0 = -0.45
  const x1 = W + 0.45
  const zb = -DEPTH
  const zf = -GAP
  const cz = CZ
  // the plinth, short: the ground floor's base below the first clad floor
  L.box([x0, 0, zb], [x1, levelY(0) - SLAB_T, zf + 0.05])
  for (let l = 0; l <= FLOORS; l++) L.box([x0, levelY(l) - SLAB_T, zb], [x1, levelY(l), zf])
  // columns on a 4.8 m grid, front, middle and back
  for (let x = 0.2; x <= W; x += 2 * U.w)
    for (const z of [zf - 0.5, cz, zb + 0.5]) L.box([x - 0.2, levelY(0), z - 0.2], [x + 0.2, levelY(FLOORS) - SLAB_T, z + 0.2])
  const core = CORE
  for (let j = 0; j < FLOORS; j++) {
    const y0 = levelY(j)
    const y1 = levelY(j + 1) - SLAB_T
    // the corridor's two walls, a door into each flat
    for (const z of [cz + 0.9, cz - 0.9]) {
      L.rectZ(x0 + 0.3, y0, x1 - 0.3, y1, z)
      for (let x = U.w; x < W; x += 2 * U.w) L.rectZ(x - 0.45, y0, x + 0.45, y0 + 2.1, z)
    }
    // party walls between the flats, front and back of the corridor; a room wall in each flat
    for (let x = 2 * U.w; x < W; x += 2 * U.w) {
      L.rectX(zf - 0.3, y0, cz + 0.9, y1, x)
      if (x < core.x0 || x > core.x1) L.rectX(cz - 0.9, y0, zb + 0.3, y1, x)
    }
    for (let x = U.w; x < W; x += 2 * U.w) {
      L.rectX(zf - 0.3, y0, zf - 3.2, y1, x)
      L.rectX(zb + 0.3, y0, zb + 3.2, y1, x)
      L.rectX(zf - 1.2, y0, zf - 2.1, y0 + 2.1, x)
    }
    // windows in the back wall, each with its mullion and sill
    for (let i = 0; i < BAYS; i++) {
      const a = i * U.w + 0.55
      const b = i * U.w + 1.85
      L.rectZ(a, y0 + 0.9, b, y1 - 0.35, zb)
      L.seg([(a + b) / 2, y0 + 0.9, zb], [(a + b) / 2, y1 - 0.35, zb])
      L.seg([a - 0.08, y0 + 0.86, zb + 0.06], [b + 0.08, y0 + 0.86, zb + 0.06])
    }
    // the two end walls: windows along their depth, with mullions; the floor's band
    for (const x of [x0, x1]) {
      for (let k = 0; k < 4; k++) {
        const a = zf - 1.2 - k * ((DEPTH - 2.4) / 4)
        const b = a - 1.5
        L.rectX(a, y0 + 0.9, b, y1 - 0.35, x)
        L.seg([x, y0 + 0.9, (a + b) / 2], [x, y1 - 0.35, (a + b) / 2])
      }
      L.seg([x, y1, zf], [x, y1, zb])
    }
    // the stair core and its two flights
    L.rectX(core.z0, y0, core.z1, y1, core.x0)
    L.rectX(core.z0, y0, core.z1, y1, core.x1)
    L.rectZ(core.x0, y0, core.x1, y1, core.z0)
    const mid = (y0 + y1 + SLAB_T) / 2
    L.seg([core.x0 + 0.2, y0, core.z1 - 0.3], [core.x0 + 0.2, mid, core.z0 + 0.4])
    L.seg([core.x0 + 1.2, y0, core.z1 - 0.3], [core.x0 + 1.2, mid, core.z0 + 0.4])
    L.seg([core.x1 - 1.2, mid, core.z0 + 0.4], [core.x1 - 1.2, y1 + SLAB_T, core.z1 - 0.3])
    L.seg([core.x1 - 0.2, mid, core.z0 + 0.4], [core.x1 - 0.2, y1 + SLAB_T, core.z1 - 0.3])
    L.seg([core.x0 + 0.2, mid, core.z0 + 0.4], [core.x1 - 0.2, mid, core.z0 + 0.4])
  }
  // edge protection on the open floors and the roof: posts and two rails along every open edge
  for (let l = J0 + 1; l <= FLOORS; l++) {
    const y = levelY(l)
    for (const h of [0.5, 1.05]) {
      L.seg([x0, y + h, zf + 0.05], [x1, y + h, zf + 0.05])
      L.seg([x0, y + h, zf], [x0, y + h, zb])
      L.seg([x1, y + h, zf], [x1, y + h, zb])
    }
    for (let x = x0; x <= x1 + 0.01; x += 1.2) L.seg([x, y, zf + 0.05], [x, y + 1.1, zf + 0.05])
    for (let z = zf; z >= zb - 0.01; z -= 1.3) {
      L.seg([x0, y, z], [x0, y + 1.1, z])
      L.seg([x1, y, z], [x1, y + 1.1, z])
    }
  }
  // the roof: its parapet, the core's head and a few plant housings
  const roof = levelY(FLOORS)
  L.box([x0, roof, zb], [x1, roof + 1.0, zf])
  L.box([core.x0, roof, core.z0], [core.x1, roof + 2.8, core.z1])
  for (const [a, b] of [
    [3, 6],
    [W - 7, W - 3.5],
  ])
    L.box([a, roof, zb + 2], [b, roof + 1.6, zb + 4.5])
  return L.geometry()
}

/**
 * A tower crane, as fine lines: its footing, a lattice mast, the slewing deck and cab, the tower head
 * with its pendants, a lattice jib and the counter-jib with its counterweights. The jib is drawn along
 * +x from the mast; the scene turns it to face the hook.
 */
function craneGeometry() {
  const mast = new Lines()
  const jib = new Lines()
  const s = 1
  const corners = [
    [-s, -s],
    [s, -s],
    [s, s],
    [-s, s],
  ]
  // its base in the core, at the foot of the block
  mast.box([-1.4, 0, -1.4], [1.4, 0.8, 1.4])
  for (const [x, z] of corners) mast.seg([x, 0.8, z], [x, MAST_H, z])
  const step = 2
  for (let y = 0.8, k = 0; y < MAST_H - 0.1; y += step, k++)
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c]
      const [bx, bz] = corners[(c + 1) % 4]
      const yn = Math.min(MAST_H, y + step)
      mast.seg([ax, y, az], [bx, y, bz])
      if (k % 2) mast.seg([ax, y, az], [bx, yn, bz])
      else mast.seg([bx, y, bz], [ax, yn, az])
    }
  // the slewing deck and the cab beside it
  const yb = MAST_H + 0.4
  const yt = MAST_H + 1.9
  jib.box([-1.4, MAST_H, -1.4], [1.4, yb, 1.4])
  jib.box([1.2, MAST_H - 2.2, 1.1], [3.2, MAST_H, 3.0])
  // the jib, a triangular lattice along +x
  const w = 0.75
  jib.seg([0, yb, -w], [JIB, yb, -w])
  jib.seg([0, yb, w], [JIB, yb, w])
  jib.seg([0, yt, 0], [JIB - 1.5, yt, 0])
  jib.seg([JIB, yb, -w], [JIB, yb, w])
  jib.seg([JIB, yb, -w], [JIB - 1.5, yt, 0])
  jib.seg([JIB, yb, w], [JIB - 1.5, yt, 0])
  for (let x = 0; x < JIB - 1.5; x += 2) {
    jib.seg([x, yb, -w], [x, yb, w])
    jib.seg([x, yb, -w], [x + 1, yt, 0])
    jib.seg([x, yb, w], [x + 1, yt, 0])
    jib.seg([x + 2, yb, -w], [x + 1, yt, 0])
    jib.seg([x + 2, yb, w], [x + 1, yt, 0])
  }
  // the counter-jib along −x, its walkway, and the counterweights at its end
  jib.seg([0, yb, -w], [-COUNTER, yb, -w])
  jib.seg([0, yb, w], [-COUNTER, yb, w])
  for (let x = -2; x >= -COUNTER; x -= 2) jib.seg([x, yb, -w], [x, yb, w])
  for (let k = 0; k < 3; k++) jib.box([-COUNTER + k * 1.05, yb - 2.6, -w], [-COUNTER + k * 1.05 + 1, yb, w])
  // the tower head and its pendants to the jib and the counter-jib
  const head = MAST_H + HEAD
  for (const z of [-0.6, 0.6]) {
    jib.seg([-0.6, yb, z], [0, head, 0])
    jib.seg([0.6, yb, z], [0, head, 0])
  }
  jib.seg([0, head, 0], [JIB * 0.55, yt, 0])
  jib.seg([0, head, 0], [JIB * 0.95, yt, 0])
  jib.seg([0, head, 0], [-COUNTER + 0.5, yb, 0])
  return { mast: mast.geometry(), jib: jib.geometry() }
}

/** a part as two things: its solid self and its drawing, the scan between them */
interface Part {
  solids: { geo: THREE.BufferGeometry; mat: THREE.Material }[]
  lines: THREE.EdgesGeometry[]
  box: THREE.Box3
}

/** the camera, by the run; `settle` (0..1, in time) is the last move onto the finished block */
export function hangShot(p: number, compact: boolean, settle = 0): Shot {
  // framed for the full screen (16:10); a narrower canvas pulls back by its shape (ScrubRig `aspect`)
  const k = compact ? 0.62 : 1
  const kw = compact ? 0.6 : 1
  const ox = I0 * U.w
  const oy = slotY(J0)
  const a = smooth(0, 0.36, p)
  const near: Shot = {
    target: [ox + U.w / 2 - 0.15, oy + YS - 0.35 - smooth(0.55, 1, a) * 0.25, -0.3],
    dist: (11.6 - smooth(0, 0.5, a) * 0.9 + smooth(0.6, 1, a) * 2.6) * k,
    azim: -60 + a * 14,
    elev: 21 - a * 7,
    // held a little high, so the unit hanging under the slab stays clear of the bar
    frame: [0.5, 0.44],
  }
  const mid: Shot = { target: [ox, oy + U.h * 0.95, 0.2], dist: 30 * kw, azim: -34, elev: 11, frame: [0.5, 0.52] }
  // the block and its crane together, then the finished block, a little closer
  const wide: Shot = { target: [W * 0.5, (MAST_H + HEAD) * 0.5, -2], dist: 117 * kw, azim: -27, elev: 9, frame: [0.5, 0.525] }
  const done: Shot = { target: [W * 0.5, levelY(FLOORS) * 0.5, -3], dist: 97 * kw, azim: -30, elev: 10, frame: [0.5, 0.52] }
  let s = mixShot(near, mid, smooth(HANG.pull[0], HANG.pull[1], p))
  s = mixShot(s, wide, smooth(HANG.block[0] + 0.04, HANG.crane[1] + 0.02, p))
  return mixShot(s, done, settle)
}

export function HangScene({ progress, bus, live, settle }: { progress: Progress; bus: LabelBus; live: { current: boolean }; settle: { current: number } }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    gl.localClippingEnabled = true
    // standing back to the whole block and its crane takes the camera a long way off
    ;(camera as THREE.PerspectiveCamera).far = 1200
    camera.updateProjectionMatrix()
  }, [gl, camera])

  const m = useMemo(unitMaterials, [])
  const ink = useMemo(() => new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0.5 }), [])
  const draw = useMemo(
    () => ({
      block: new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0, depthWrite: false }),
      crane: new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0, depthWrite: false }),
      rig: new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0 }),
      joint: new THREE.MeshBasicMaterial({ color: '#fdd001', toneMapped: false, transparent: true, opacity: 0, depthWrite: false }),
    }),
    [],
  )

  const parts = useMemo(() => {
    const clipped = (mat: THREE.Material) => {
      const c = mat.clone()
      c.userData = { ...mat.userData }
      return c
    }
    const make = (list: [THREE.BufferGeometry, THREE.Material][]): Part => {
      const box = new THREE.Box3()
      for (const [g] of list) {
        g.computeBoundingBox()
        box.union(g.boundingBox!)
      }
      return { solids: list.map(([geo, mat]) => ({ geo, mat: clipped(mat) })), lines: list.map(([g]) => new THREE.EdgesGeometry(g, 20)), box }
    }
    const b = barrierGeometry()
    const slab = block([-0.55, YS - SLAB_T, -1.9], [U.w + 0.55, YS, -GAP])
    // the slab below, where the unit's foot is held
    const below = block([-0.55, YS - U.h - SLAB_T, -1.9], [U.w + 0.55, YS - U.h, -GAP])
    return {
      bracket: make([[bracketGeometry(), m.steel]]),
      barrier: make([
        [b.wool, m.firestop],
        [b.seal, m.gasket],
      ]),
      unit: make([
        [frameGeometry(), m.steel],
        [insulationGeometry(), m.insulation],
        [windowGeometry(), m.alu],
        [glassGeometry(), m.glass],
        [panelGeometry(), m.concrete],
        [hangerGeometry(), m.darkSteel],
      ]),
      slab: make([
        [slab, m.slab],
        [below, m.slab],
      ]),
    }
  }, [m])
  type Key = keyof typeof parts
  // each part's planes: solid behind the scan, drawing ahead of it, the scan's own band between
  const planes = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(parts).map((k) => [k, { solid: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), line: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), band: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0) }]),
      ) as Record<Key, { solid: THREE.Plane; line: THREE.Plane; band: THREE.Plane }>,
    [parts],
  )
  const lineMats = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(parts).map((k) => {
          const l = ink.clone()
          l.clippingPlanes = [planes[k as Key].line]
          return [k, l]
        }),
      ) as Record<Key, THREE.LineBasicMaterial>,
    [parts, planes, ink],
  )
  /** the scan: the part's own surface in yellow, in a thin band just above the scan line */
  const scanMats = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(parts).map((k) => {
          const pl = planes[k as Key]
          return [k, new THREE.MeshBasicMaterial({ color: '#fdd001', toneMapped: false, side: THREE.DoubleSide, clippingPlanes: [pl.solid, pl.band], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })]
        }),
      ) as Record<Key, THREE.MeshBasicMaterial>,
    [parts, planes],
  )
  useMemo(() => {
    for (const k of Object.keys(parts) as Key[]) for (const s of parts[k].solids) s.mat.clippingPlanes = [planes[k].solid]
  }, [parts, planes])

  // the rest of the façade, drawn as instances: the floors already clad, which come in with the block,
  // and the units that move, which are solid from the start
  const unitGeo = useMemo(() => ({ panel: panelGeometry(), window: windowGeometry(), glass: glassGeometry() }), [])
  const doneMats = useMemo(() => {
    const c = (x: THREE.Material) => {
      const y = x.clone()
      y.userData = { ...x.userData }
      return y
    }
    return [c(m.concrete), c(m.alu), c(m.glass)]
  }, [m])
  const blockLines = useMemo(blockGeometry, [])
  const crane = useMemo(craneGeometry, [])
  /** the hoist rope, the lifting beam and its slings, in world space */
  const rig = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 9), 3))
    return g
  }, [])

  useEffect(
    () => () => {
      for (const p of Object.values(parts)) {
        p.solids.forEach((s) => {
          s.geo.dispose()
          s.mat.dispose()
        })
        p.lines.forEach((l) => l.dispose())
      }
      Object.values(lineMats).forEach((l) => l.dispose())
      Object.values(scanMats).forEach((l) => l.dispose())
      Object.values(unitGeo).forEach((g) => g.dispose())
      doneMats.forEach((x) => x.dispose())
      Object.values(draw).forEach((x) => x.dispose())
      blockLines.dispose()
      crane.mast.dispose()
      crane.jib.dispose()
      rig.dispose()
      ink.dispose()
      disposeUnitMaterials(m)
    },
    [parts, lineMats, scanMats, unitGeo, doneMats, draw, blockLines, crane, rig, ink, m],
  )

  const unitGroup = useRef<THREE.Group>(null)
  const scans = useRef<Partial<Record<Key, THREE.Group | null>>>({})
  const done = useRef<(THREE.InstancedMesh | null)[]>([])
  const moving = useRef<(THREE.InstancedMesh | null)[]>([])
  const jib = useRef<THREE.Group>(null)
  const hookBlock = useRef<THREE.Mesh>(null)
  const joints = useRef<THREE.Group>(null)
  const time = useRef({ fill: 0 })
  const mx = useMemo(() => new THREE.Matrix4(), [])
  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])

  // the floors already clad never move: their places are set once
  useEffect(() => {
    for (const im of done.current) {
      if (!im) continue
      DONE.forEach(([i, j], n) => im.setMatrixAt(n, mx.makeTranslation(slotX(i), slotY(j), 0)))
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    }
  }, [mx])

  useEffect(() => {
    const f = () => invalidate()
    progress.listeners.add(f)
    return () => void progress.listeners.delete(f)
  }, [progress, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const p = progress.value
    let busy = false

    // 1. the connection: each part scanned from drawing to solid; the section's slab stays a drawing
    const reveal: Record<Key, number> = {
      bracket: smooth(HANG.bracket[0], HANG.bracket[1], p),
      barrier: smooth(HANG.barrier[0], HANG.barrier[1], p),
      unit: smooth(HANG.unit[0], HANG.unit[1], p),
      slab: 0,
    }
    const lift = (1 - smooth(HANG.drop[0], HANG.drop[1], p)) * LIFT
    if (unitGroup.current) unitGroup.current.position.y = lift
    const oy = slotY(J0)
    for (const k of Object.keys(parts) as Key[]) {
      const { box } = parts[k]
      const off = oy + (k === 'unit' ? lift : 0)
      const top = box.max.y + off + 0.002
      const bottom = box.min.y + off - 0.002
      const c = reveal[k] >= 1 ? -1e3 : reveal[k] <= 0 ? 1e3 : top - (top - bottom) * reveal[k]
      planes[k].solid.constant = -c
      planes[k].line.constant = c
      planes[k].band.constant = c + 0.014
      const scan = scans.current[k]
      if (scan) scan.visible = reveal[k] > 0.001 && reveal[k] < 0.999
    }

    // 2. the block comes in behind, faint and then clear, its clad floors with it; the section's own slab gives way to it
    const faint = smooth(HANG.block[0], HANG.block[0] + 0.05, p)
    const clear = smooth(HANG.block[0] + 0.05, HANG.block[1], p)
    draw.block.opacity = faint * 0.06 + clear * 0.14
    draw.block.visible = draw.block.opacity > 0.003
    setOpacity(doneMats, clear)
    lineMats.slab.opacity = 0.5 * (1 - smooth(HANG.block[0], HANG.block[0] + 0.07, p))
    lineMats.slab.visible = lineMats.slab.opacity > 0.003

    // 4. started by the scroll, run in time: the rest of the façade goes up, then the crane goes
    const t = time.current
    const before = t.fill
    t.fill = p >= HANG.fill ? Math.min(FILLED + CRANE_OUT + 0.6, t.fill + (reduced ? 1e3 : dt)) : Math.max(0, t.fill - (reduced ? 1e3 : dt * 3))
    if (t.fill !== before) busy = true
    const craneOut = smooth(FILLED + 0.2, FILLED + 0.2 + CRANE_OUT, t.fill)
    settle.current = craneOut

    // 3. the hook's path: hoisted off the ground, brought in over the slot, lowered into it
    const lc = smooth(HANG.lift[0], HANG.lift[1], p)
    const cy = slotY(CRANED[1])
    const up = smooth(0, 0.45, lc)
    const inward = smooth(0.4, 0.78, lc)
    const down = smooth(0.74, 1, lc)
    const uy = (cy + 1.6) * up - 1.6 * down
    const uz = START_Z * (1 - inward) + 0.35 * inward - 0.35 * down

    // the units that move: the two neighbours connect, the craned one rides the hook, the rest go up in turn
    const side = smooth(HANG.side[0], HANG.side[1], p)
    const stack = smooth(HANG.stack[0], HANG.stack[1], p)
    const craneIn = smooth(HANG.crane[0], HANG.crane[1], p)
    LIVE.forEach(([i, j], n) => {
      let x = slotX(i)
      let y = slotY(j)
      let z = 0
      let on = true
      if (n === 0) {
        on = side > 0.003
        x -= (1 - side) * 1.1
      } else if (n === 1) {
        on = stack > 0.003
        y += (1 - stack) * 1.4
      } else if (n === 2) {
        on = craneIn > 0.003
        y = uy
        z = uz
      } else {
        const e = smooth(0, RISE, t.fill - (n - 3) * EACH)
        on = e > 0.003
        y += (1 - e) * 0.6
      }
      for (const im of moving.current) im?.setMatrixAt(n, on ? mx.makeTranslation(x, y, z) : hidden)
    })
    for (const im of moving.current) {
      if (!im) continue
      im.instanceMatrix.needsUpdate = true
    }

    // the joints, picked out in yellow while they close, then gone
    const jo = Math.min(smooth(HANG.side[0] + 0.03, HANG.side[1], p), 1 - smooth(HANG.block[0] + 0.03, HANG.block[0] + 0.08, p))
    draw.joint.opacity = jo
    if (joints.current) joints.current.visible = jo > 0.003
    for (const id of ['j-side', 'j-stack']) {
      if (jo > 0.6) bus.shown.add(id)
      else bus.shown.delete(id)
    }

    // the crane: drawn in, slewing and trolleying to wherever the hook has to be, then gone
    const cr = craneIn * (1 - craneOut)
    draw.crane.opacity = 0.34 * cr
    draw.crane.visible = cr > 0.003
    draw.rig.opacity = 0.6 * cr
    draw.rig.visible = cr > 0.003
    const hx = slotX(CRANED[0]) + U.w / 2
    const hz = uz + 0.12
    const beamY = uy + U.h + 0.9
    const hookY = beamY + 1.4
    if (jib.current) jib.current.rotation.y = Math.atan2(-(hz - MAST[1]), hx - MAST[0])
    const yb = MAST_H + 0.4
    const pos = rig.getAttribute('position') as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const top = uy + U.h + 0.02
    arr.set([
      // the hoist rope, two falls from the trolley to the hook
      hx - 0.15, yb, hz, hx - 0.15, hookY, hz,
      hx + 0.15, yb, hz, hx + 0.15, hookY, hz,
      // the slings from the hook to the ends of the lifting beam
      hx, hookY, hz, hx - SPREAD, beamY, hz,
      hx, hookY, hz, hx + SPREAD, beamY, hz,
      // the lifting beam
      hx - SPREAD, beamY, hz, hx + SPREAD, beamY, hz,
      hx - SPREAD, beamY - 0.18, hz, hx + SPREAD, beamY - 0.18, hz,
      // the slings down to the unit's head
      hx - SPREAD, beamY - 0.18, hz, hx - SPREAD, top, hz - 0.05,
      hx + SPREAD, beamY - 0.18, hz, hx + SPREAD, top, hz - 0.05,
      // the trolley
      hx - 0.6, yb - 0.1, hz, hx + 0.6, yb - 0.1, hz,
    ])
    pos.needsUpdate = true
    if (hookBlock.current) hookBlock.current.position.set(hx, hookY + 0.25, hz)

    if (busy || (live.current && !reduced)) invalidate()
  }, -2)

  const drawPart = (k: Key) => {
    const part = parts[k]
    return (
      <>
        {part.solids.map((s, i) => (
          <mesh key={i} geometry={s.geo} material={s.mat} castShadow receiveShadow />
        ))}
        {part.lines.map((l, i) => (
          <lineSegments key={`l${i}`} geometry={l} material={lineMats[k]} />
        ))}
        <group ref={(el) => void (scans.current[k] = el)} visible={false}>
          {part.solids.map((s, i) => (
            <mesh key={i} geometry={s.geo} material={scanMats[k]} />
          ))}
        </group>
      </>
    )
  }

  const panelFace = Z.panel[1] + 0.004
  const unitParts: [THREE.BufferGeometry, number][] = [
    [unitGeo.panel, 0],
    [unitGeo.window, 1],
    [unitGeo.glass, 2],
  ]
  const liveMats = [m.concrete, m.alu, m.glass]
  return (
    <group>
      {/* the section: the unit followed, its bracket, barrier and slabs */}
      <group position={[I0 * U.w, slotY(J0), 0]}>
        {drawPart('slab')}
        {drawPart('barrier')}
        {drawPart('bracket')}
        <group ref={unitGroup}>{drawPart('unit')}</group>
      </group>
      {/* the floors already clad, and the units that move */}
      {unitParts.map(([g, k]) => (
        <instancedMesh key={`d${k}`} ref={(el) => void (done.current[k] = el)} args={[g, doneMats[k], DONE.length]} renderOrder={k === 2 ? 2 : 0} frustumCulled={false} castShadow={k !== 2} receiveShadow />
      ))}
      {unitParts.map(([g, k]) => (
        <instancedMesh key={`m${k}`} ref={(el) => void (moving.current[k] = el)} args={[g, liveMats[k], LIVE.length]} renderOrder={k === 2 ? 2 : 0} frustumCulled={false} castShadow={k !== 2} receiveShadow />
      ))}
      {/* the joints between the unit followed and its neighbours */}
      <group ref={joints} visible={false}>
        <mesh position={[I0 * U.w, slotY(J0) + U.h / 2, panelFace]} material={draw.joint}>
          <boxGeometry args={[0.05, U.h, 0.01]} />
        </mesh>
        <mesh position={[I0 * U.w + U.w / 2, slotY(J0) + U.h, panelFace]} material={draw.joint}>
          <boxGeometry args={[U.w, 0.05, 0.01]} />
        </mesh>
        <Anchor bus={bus} id="j-side" position={[I0 * U.w, slotY(J0) + U.h * 0.3, panelFace]} />
        <Anchor bus={bus} id="j-stack" position={[I0 * U.w + U.w * 0.7, slotY(J0) + U.h, panelFace]} />
      </group>
      {/* the block, a drawing */}
      <lineSegments geometry={blockLines} material={draw.block} />
      {/* the tower crane, a drawing; its rope, beam and slings in the world */}
      <group position={[MAST[0], 0, MAST[1]]}>
        <lineSegments geometry={crane.mast} material={draw.crane} />
        <group ref={jib}>
          <lineSegments geometry={crane.jib} material={draw.crane} />
        </group>
      </group>
      <lineSegments geometry={rig} material={draw.rig} frustumCulled={false} />
      <mesh ref={hookBlock} material={draw.rig}>
        <boxGeometry args={[0.45, 0.5, 0.3]} />
      </mesh>
    </group>
  )
}
