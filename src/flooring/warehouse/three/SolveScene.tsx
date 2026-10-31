import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../../../facade/three/MeshInset'
import { Anchor, MovingKeyLight } from '../../../facade/three/Stage3D'
import { smooth, type Progress } from '../../../facade/progress'
import type { LabelBus } from '../../../facade/three/kit'
import { Wake } from '../../../facade/three/rain/lines'
import { block } from '../../../facade/three/unit/parts'
import { prefersReducedMotion } from '../../../lib/motion'
import { type BuildRoom, fit } from '../../data/three/BuildScene'
import { buttonGeometry, disposeFloorKit, floorKit, layer, Lines, PITCH, pourGeometry, pump, SHOW, sortFrom, split, uvBox } from '../../data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../data/three/draw'
import { AISLE, AISLE_VIEW, useAisle } from './aisle'
import { jointSurface, screedBody } from './joint'
import { applyCam, blasterLines, camOf, mixView, rideOnBlades, rideOnLines, TROWEL, type View } from './parts'
import { ducts } from './Piece'

/**
 * The solution, on yellow: the broken piece of the failure, made again from its base, the floor in its
 * own materials and every machine a drawing.
 *
 *   0  preparation  the damaged screed goes; the base is shot-blasted to its ICRI CSP-5 profile, primed,
 *                   and anchor buttons set on it at one height
 *   1  the mesh     RTARIUM, a rigid flat sheet (it does not bend or roll), comes in over the back edge and
 *                   snaps down into the buttons; then a section close up: 5 mm of cover below it, 5 mm above
 *   2  the pour     the H1-561 pumps self-levelling concrete over the mesh, at 800 mm slump flow
 *   3  the bays     the camera goes overhead as the floor grows out to the whole plate: the saw-cut grid of
 *                   a standard floor is wiped away, three monolithic bays left
 *   4  the trowel   a ride-on power trowel works the cured slab to a glass finish behind it
 *   5  the wear coat  the resin run on; the corner steps back to show the whole stack, RTARIUM in it
 *   6  the loop     the failure's first shot again, the same aisle running true on this floor
 *
 * `t` is the run as steps (step k over k..k+1), eased by the section.
 */

export const N_STEPS = 7
const X: [number, number] = [-1.2, 1.2]
const Z: [number, number] = [-0.9, 0.9]
/** the old screed's thickness, so the base's top is here; RTARIUM's 20 mm, the wear coat on it */
const OLD = 0.05
const B = -OLD
const FOOT = B - 0.2
const TOP = B + 0.02
const COAT = TOP + 0.0025
const MESH_Y = B + 0.01
/** the close-up's section: a small piece of the front left corner, shallow enough for millimetres to read */
const NEAR = { x: X[0] + 0.15, z: Z[1] - 0.15, y: B - 0.05 }
/** where each layer stands back from the corner once the floor is done */
const STEP = { coat: [-0.72, 0.36], screed: [-0.94, 0.62] } as const
/** the whole floor plate, and the two joints it keeps */
const PLATE = { x: [-26, 26] as [number, number], z: [-17, 9] as [number, number], joints: [-8.67, 8.67] }
const PUMP: [number, number, number] = [-0.2, FOOT, -2.1]

/** the piece, as every step shows it: one box, one view, one size in the room */
const WHOLE: View = { box: [[X[0], FOOT, Z[0]], [X[1], B + 0.6, Z[1]]], azim: 30, elev: 26, fill: 0.74 }
const CLOSE: View = { box: [[X[0], NEAR.y, NEAR.z], [NEAR.x, TOP + 0.002, Z[1]]], azim: 26, elev: 13, fill: 0.62 }
const POUR: View = { box: [[PUMP[0] - 1.4, FOOT, PUMP[2] - 0.55], [X[1] + 0.05, FOOT + 2.1, Z[1]]], azim: 32, elev: 22, fill: 0.98 }
/** the camera's keys, as (when, what): held from one key to the next unless their views differ */
const KEYS: [number, View][] = [
  [0, WHOLE],
  [1.42, WHOLE],
  [1.56, CLOSE],
  [1.84, CLOSE],
  [1.98, WHOLE],
  [2.14, POUR],
  [2.86, POUR],
  [3.04, WHOLE],
  // the bays' own view, fitted to the plate as it grows and shrinks, stands between these two
  [4.04, WHOLE],
  [5.96, WHOLE],
  [6.3, AISLE_VIEW],
  [7, AISLE_VIEW],
]

/** the floor over the piece, from the front left: `cut`s are planes keeping what is on one side of them */
function keepX(p: THREE.Plane, c: number) {
  p.set(new THREE.Vector3(1, 0, 0), -c)
}
function keepUnderX(p: THREE.Plane, c: number) {
  p.set(new THREE.Vector3(-1, 0, 0), c)
}
function keepZ(p: THREE.Plane, c: number) {
  p.set(new THREE.Vector3(0, 0, 1), -c)
}
function keepUnderZ(p: THREE.Plane, c: number) {
  p.set(new THREE.Vector3(0, 0, -1), c)
}

function hoseGeometry() {
  const o = new THREE.Vector3(PUMP[0] + 1.05, FOOT + 0.52, PUMP[2])
  const c = new THREE.CatmullRomCurve3([
    o,
    new THREE.Vector3(o.x + 0.2, FOOT + 0.2, o.z + 0.1),
    new THREE.Vector3(o.x + 0.3, FOOT + 0.03, o.z + 0.5),
    new THREE.Vector3(1.0, FOOT + 0.03, Z[0] - 0.5),
    new THREE.Vector3(0.82, B - 0.02, Z[0] - 0.12),
    new THREE.Vector3(0.72, B + 0.14, Z[0] + 0.06),
    new THREE.Vector3(0.68, B + 0.08, Z[0] + 0.18),
  ])
  return new THREE.TubeGeometry(c, 110, 0.022, 12, false)
}

/** a shot-blasted surface: open aggregate, deep and rough, as a bump map */
function blastedMaterial() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const x = c.getContext('2d')!
  x.fillStyle = '#8f8b82'
  x.fillRect(0, 0, 512, 512)
  let s = 29
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < 16000; i++) {
    const v = 58 + rnd() * 150
    x.fillStyle = `rgba(${v},${v - 3},${v - 10},${0.3 + rnd() * 0.6})`
    x.beginPath()
    x.arc(rnd() * 512, rnd() * 512, 0.6 + rnd() * rnd() * 5, 0, Math.PI * 2)
    x.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2.4, 1.8)
  const bump = t.clone()
  bump.colorSpace = THREE.NoColorSpace
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: bump, bumpScale: 4, roughness: 1, transparent: true })
}

export function SolveScene({ t, bus, compact, room, live }: { t: Progress; bus: LabelBus; compact: boolean; room: { current: BuildRoom }; live: { current: boolean } }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  const m = useMemo(() => {
    const k = floorKit()
    const coat = new THREE.MeshStandardMaterial({ color: '#b1b5b2', roughness: 0.14, transparent: true, envMapIntensity: 0.9, side: THREE.DoubleSide })
    return {
      ...k,
      old: k.screed.clone(),
      pour: k.screed.clone(),
      done: k.screed.clone(),
      plate: k.screed.clone(),
      polish: new THREE.MeshStandardMaterial({ color: '#c4c0b7', roughness: 0.16, transparent: true, envMapIntensity: 0.9, side: THREE.DoubleSide }),
      coatWet: coat.clone(),
      coat,
      armour: new THREE.MeshStandardMaterial({ color: '#a7aba7', roughness: 0.2, envMapIntensity: 0.7, transparent: true }),
      blasted: blastedMaterial(),
      ghost: new THREE.MeshStandardMaterial({ color: '#d8d4ca', roughness: 0.9, transparent: true, opacity: 0.3, depthWrite: false }),
      cap: k.plank.clone(),
      duct: k.rubber.clone(),
    }
  }, [])
  const set = useMemo(() => ({ wet: m.wet.color.clone(), dry: m.screed.color.clone() }), [m])

  const cut = useMemo(
    () => ({
      // the old screed, stripped off from the right
      strip: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10),
      // the close-up's section box: on the slab and what is on it
      boxX: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10),
      boxZ: new THREE.Plane(new THREE.Vector3(0, 0, 1), 10),
      boxY: new THREE.Plane(new THREE.Vector3(0, 1, 0), 10),
      // the same box on RTARIUM and its buttons, which is also how they show in the finished corner
      meshX: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10),
      meshZ: new THREE.Plane(new THREE.Vector3(0, 0, 1), 10),
      covered: new THREE.Plane(new THREE.Vector3(0, 0, 1), 10),
      backEdge: new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z[0]),
      blast: new THREE.Plane(new THREE.Vector3(0, 0, -1), 10),
      primer: new THREE.Plane(new THREE.Vector3(0, 0, -1), 10),
      polish: new THREE.Plane(new THREE.Vector3(0, 0, -1), 10),
      front: new THREE.Plane(new THREE.Vector3(0, 0, -1), Z[1]),
      back: new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z[0]),
      // the corner each finished layer stands back from
      screedX: new THREE.Plane(new THREE.Vector3(1, 0, 0), 10),
      screedZ: new THREE.Plane(new THREE.Vector3(0, 0, -1), 10),
      coatX: new THREE.Plane(new THREE.Vector3(1, 0, 0), 10),
      coatZ: new THREE.Plane(new THREE.Vector3(0, 0, -1), 10),
    }),
    [],
  )
  useEffect(() => {
    const box = [cut.boxX, cut.boxZ, cut.boxY]
    m.plank.clippingPlanes = box
    m.cap.clippingPlanes = [cut.boxZ, cut.boxY]
    m.duct.clippingPlanes = box
    m.ghost.clippingPlanes = box
    m.old.clippingPlanes = [cut.strip]
    m.blasted.clippingPlanes = [cut.blast, ...box]
    m.primer.clippingPlanes = [cut.primer, ...box]
    m.primer.polygonOffset = true
    m.primer.polygonOffsetFactor = -1
    m.primer.polygonOffsetUnits = -4
    m.primer.opacity = 0.62
    m.primer.color.set('#4a463f')
    m.primer.roughness = 0.5
    m.button.clippingPlanes = [cut.meshX, cut.meshZ]
    m.pour.clippingPlanes = [cut.front, cut.back]
    m.coatWet.clippingPlanes = [cut.front, cut.back]
    // the finished layers: only what is past both planes of their corner is taken away
    m.done.clippingPlanes = [cut.screedX, cut.screedZ]
    m.done.clipIntersection = true
    m.done.side = THREE.DoubleSide
    m.polish.clippingPlanes = [cut.coatX, cut.coatZ, cut.polish]
    m.coat.clippingPlanes = [cut.coatX, cut.coatZ]
    m.coat.clipIntersection = true
  }, [m, cut])

  const g = useMemo(() => {
    const spots: [number, number][] = []
    for (let x = X[0] + 0.075; x < X[1]; x += 0.15) for (let z = Z[0] + 0.075; z < Z[1]; z += 0.15) spots.push([x, z])
    const dist = spots.map(([x, z]) => Math.hypot(x - X[0], z - Z[1]))
    const far = Math.max(...dist)
    const unit = block([-0.5, FOOT, -0.5], [0.5, TOP + 0.0004, 0.5])
    return {
      old: jointSurface(X, Z, { focusX: 0.36, nx: 200, nz: 160 }).top,
      oldBody: screedBody(X, Z, OLD),
      base: uvBox(block([X[0], FOOT, Z[0]], [X[1], B, Z[1]]), 2.2),
      ducts: ducts(X, Z[1], FOOT + 0.05),
      blasted: layer(X, Z, B + 0.0004, 0.0003, 1),
      primer: layer(X, Z, B + 0.0009, 0.0003, 1),
      spots: spots.map(([x, z], i) => ({ at: [x, B + 0.001, z] as [number, number, number], rank: dist[i] / far })),
      button: buttonGeometry(),
      pour: pourGeometry(X, Z[1] - Z[0] + 0.2, TOP - B - 0.002, 0.7),
      done: uvBox(block([X[0], B + 0.002, Z[0]], [X[1], TOP, Z[1]]), 2),
      polish: layer(X, Z, TOP, 0.0004, 2),
      coatFlow: pourGeometry(X, Z[1] - Z[0] + 0.2, COAT - TOP - 0.0004, 2.1, 0.03),
      coat: layer(X, Z, TOP + 0.0004, COAT - TOP - 0.0004, 2),
      ghost: block([X[0], B + 0.001, Z[0]], [X[1], TOP, Z[1]]),
      cap: new THREE.PlaneGeometry(Z[1] - Z[0], B - FOOT).rotateY(Math.PI / 2).translate(0, (B + FOOT) / 2, 0),
      hose: hoseGeometry(),
      catcher: new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
      unit,
      cover: block([X[0], FOOT, Z[0]], [X[1], TOP + 0.0004, Z[1]]),
      world: new THREE.BoxGeometry(1, 0.14, 1).translate(0, -0.07, 0),
    }
  }, [])
  useEffect(
    () => () => {
      for (const x of Object.values(g)) if (x instanceof THREE.BufferGeometry) x.dispose()
      for (const x of [m.old, m.pour, m.done, m.plate, m.polish, m.coatWet, m.coat, m.armour, m.ghost, m.cap, m.duct]) x.dispose()
      m.blasted.map?.dispose()
      m.blasted.bumpMap?.dispose()
      m.blasted.dispose()
      disposeFloorKit(m)
    },
    [g, m],
  )

  const aisle = useAisle('#080808', { dim: 1.5 })

  const mats = useMemo(() => {
    const tool = ink(1.1)
    tool.depthTest = false
    const mirror = ink(1, '#080808', 0.2)
    mirror.depthTest = false
    const ghost = ink(0.9, '#080808', 0.42)
    const bays = ink(2.2)
    ghost.depthTest = false
    bays.depthTest = false
    return { kit: ink(1.1), tool, dims: ink(1.3), ghost, bays, mirror }
  }, [])
  useInkResolution(useMemo(() => Object.values(mats), [mats]))
  const lines = useMemo(() => {
    const P = new Lines()
    pump(P)
    const Tr = new Lines()
    rideOnLines(Tr)
    const Bl = new Lines()
    rideOnBlades(Bl)
    const Sb = new Lines()
    blasterLines(Sb)
    // the dimension ladder on the section's cut face, and the levels across it
    const D = new Lines()
    const dx = NEAR.x + 0.014
    const zf = Z[1] + 0.0008
    D.seg([dx, B, zf], [dx, TOP, zf])
    for (const y of [B, B + 0.005, B + 0.015, TOP]) {
      D.seg([dx - 0.004, y, zf], [dx + 0.004, y, zf])
      for (let x = X[0]; x < dx - 0.006; x += 0.009) D.seg([x, y, zf], [Math.min(dx - 0.006, x + 0.005), y, zf])
    }
    // a standard floor's saw-cut grid over the plate, wiped away; the two joints the monolithic bays keep
    const G = new Lines()
    const [x0, x1] = PLATE.x
    const [z0, z1] = PLATE.z
    for (let x = x0; x <= x1; x += 5.2) G.seg([x, TOP + 0.02, z0], [x, TOP + 0.02, z1])
    for (let z = z0; z <= z1; z += 5.2) G.seg([x0, TOP + 0.02, z], [x1, TOP + 0.02, z])
    const Bays = new Lines()
    for (const x of PLATE.joints) Bays.seg([x, TOP + 0.03, z0], [x, TOP + 0.03, z1])
    return { pump: sortFrom(P, [0, 0, 0]), trowel: Tr, blades: Bl, blaster: Sb, dims: D, grid: sortFrom(split(G, 2), [0, 0, 0]), bays: sortFrom(split(Bays, 1.5), [0, 0, 0]) }
  }, [])
  const pumpD = useDrawing(lines.pump, mats.kit)
  const trowelD = useDrawing(lines.trowel, mats.tool)
  const bladesA = useDrawing(lines.blades, mats.tool)
  const bladesB = useDrawing(lines.blades, mats.tool)
  const blasterD = useDrawing(lines.blaster, mats.tool)
  const dimsD = useDrawing(lines.dims, mats.dims)
  const gridD = useDrawing(lines.grid, mats.ghost)
  const baysD = useDrawing(lines.bays, mats.bays)
  const mirrorD = useDrawing(lines.trowel, mats.mirror)

  const piece = useRef<THREE.Group>(null)
  const oldBody = useRef<THREE.Mesh>(null)
  const oldTop = useRef<THREE.Mesh>(null)
  const blasted = useRef<THREE.Mesh>(null)
  const primer = useRef<THREE.Mesh>(null)
  const buttons = useRef<THREE.InstancedMesh>(null)
  const meshGroup = useRef<THREE.Group>(null)
  const ghost = useRef<THREE.Mesh>(null)
  const cap = useRef<THREE.Mesh>(null)
  const catcher = useRef<THREE.Mesh>(null)
  const pourMesh = useRef<THREE.Mesh>(null)
  const doneMesh = useRef<THREE.Mesh>(null)
  const polishMesh = useRef<THREE.Mesh>(null)
  const flowMesh = useRef<THREE.Mesh>(null)
  const coatMesh = useRef<THREE.Mesh>(null)
  const hose = useRef<THREE.Mesh>(null)
  const pumpGroup = useRef<THREE.Group>(null)
  const blaster = useRef<THREE.Group>(null)
  const dims = useRef<THREE.Group>(null)
  const trowel = useRef<THREE.Group>(null)
  const mirror = useRef<THREE.Group>(null)
  const rotorA = useRef<THREE.Group>(null)
  const rotorB = useRef<THREE.Group>(null)
  const strips = useRef<(THREE.Mesh | null)[]>([])
  const cover = useRef<THREE.Mesh>(null)
  const world = useRef<THREE.Group>(null)
  const worldFloor = useRef<THREE.Mesh>(null)
  const yarnClipped = useRef(false)
  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const one = useMemo(() => new THREE.Vector3(), [])
  const at = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])

  useFrame((_, delta) => {
    const v = Math.min(N_STEPS - 1e-4, Math.max(0, t.value))
    const dt = Math.min(delta, 1 / 20)

    // how far the floor has grown out to the whole plate, and back
    const grow = smooth(3.06, 3.58, v) * (1 - smooth(3.84, 4.04, v))
    const e = 1 - Math.pow(1 - grow, 2)
    const x0 = X[0] + (PLATE.x[0] - X[0]) * e
    const x1 = X[1] + (PLATE.x[1] - X[1]) * e
    const z0 = Z[0] + (PLATE.z[0] - Z[0]) * e
    const z1 = Z[1] + (PLATE.z[1] - Z[1]) * e

    // the camera: its keys, each held until it moves on to the next
    const aspect = size.width / Math.max(1, size.height)
    const r = compact ? { x: 0.04, y: 0.13, w: 0.92, h: 0.36 } : room.current
    let view = KEYS[KEYS.length - 1][1]
    if (v >= 3.04 && v < 4.04) {
      // the plate: the view goes overhead as it grows, back as it shrinks; always fitted to what there is of it
      const l = (a: number, b: number) => a + (b - a) * e
      view = { box: [[x0, FOOT, z0], [x1, l(B + 0.6, TOP), z1]], azim: l(WHOLE.azim, 20), elev: l(WHOLE.elev, 58), fill: l(WHOLE.fill, 0.86) }
    } else {
      for (let i = 0; i < KEYS.length - 1; i++) {
        if (v < KEYS[i + 1][0]) {
          const [a, va] = KEYS[i]
          const [b, vb] = KEYS[i + 1]
          view = mixView(va, vb, smooth(a, b, v))
          break
        }
      }
    }
    applyCam(camera, size, camOf(fit(view.box, view.azim, view.elev, r, aspect, view.fill)))
    const loop = smooth(5.96, 6.3, v)

    // 0. the old screed stripped off; the blaster's pass; the primer spread on; the buttons set
    const strip = smooth(0.03, 0.22, v)
    cut.strip.constant = X[1] + 0.02 - (X[1] - X[0] + 0.04) * strip
    if (oldTop.current) {
      if (!oldTop.current.morphTargetInfluences) oldTop.current.updateMorphTargets()
      if (oldTop.current.morphTargetInfluences) oldTop.current.morphTargetInfluences[0] = 1
      oldTop.current.visible = strip < 0.999
    }
    if (oldBody.current) oldBody.current.visible = strip < 0.999
    const pass = smooth(0.25, 0.5, v)
    const blastOn = pass > 0 && pass < 1
    keepUnderZ(cut.blast, Z[0] - 0.02 + (Z[1] - Z[0] + 0.04) * pass)
    if (blasted.current) blasted.current.visible = pass > 0
    blasterD.show(blastOn ? 1 : 0)
    if (blaster.current) {
      blaster.current.visible = blastOn
      blaster.current.position.set(0.8 * Math.sin(pass * Math.PI * 5), B, Z[0] + 0.42 + (Z[1] - Z[0] - 0.66) * pass)
    }
    const prime = smooth(0.52, 0.68, v)
    keepUnderZ(cut.primer, Z[0] - 0.02 + (Z[1] - Z[0] + 0.04) * prime)
    if (primer.current) primer.current.visible = prime > 0
    const setting = smooth(0.74, 0.92, v)
    const bm = buttons.current
    if (bm) {
      g.spots.forEach(({ at: [x, y, z], rank }, i) => {
        const s = smooth(rank - 0.05, rank + 0.1, setting * 1.05)
        // their discs drawn wider than they are, so they read at the size of the piece
        one.set(Math.max(0.0001, s) * 2.1, Math.max(0.0001, s), Math.max(0.0001, s) * 2.1)
        at.set(x, y + (1 - s) * 0.02, z)
        bm.setMatrixAt(i, mtx.compose(at, q, one))
      })
      bm.instanceMatrix.needsUpdate = true
      bm.visible = v >= 0.7 && v < 6.4
    }

    // 1. RTARIUM, flat and rigid, slides in over the back edge (cut there, so it never leaves the piece), then snaps down
    const lay = smooth(1.04, 1.3, v)
    const snap = smooth(1.3, 1.38, v)
    const pourE = smooth(2.3, 2.78, v)
    const poured = pourE > 0.985
    const front = Z[0] - 0.04 + (Z[1] - Z[0] + 0.1) * pourE
    // the section box closes as the camera comes in; it opens again for the pour
    const shut = smooth(1.42, 1.56, v) * (1 - smooth(1.84, 1.98, v))
    const boxX = NEAR.x + (X[1] + 0.02 - NEAR.x) * (1 - shut)
    const boxZ = NEAR.z + (Z[0] - 0.02 - NEAR.z) * (1 - shut)
    const boxY = NEAR.y + (FOOT - 0.02 - NEAR.y) * (1 - shut)
    keepUnderX(cut.boxX, boxX)
    keepZ(cut.boxZ, boxZ)
    cut.boxY.set(new THREE.Vector3(0, 1, 0), -boxY)
    if (cap.current) {
      cap.current.visible = shut > 0.002
      cap.current.position.set(boxX, 0, (Z[0] + Z[1]) / 2)
    }
    // RTARIUM and its buttons keep to that box, and later to the corner of the finished floor
    const corner = smooth(5.44, 5.64, v) * (1 - smooth(5.88, 5.96, v))
    const showCorner = corner > 0.001
    keepUnderX(cut.meshX, showCorner ? STEP.screed[0] : boxX)
    keepZ(cut.meshZ, showCorner ? STEP.screed[1] : boxZ)
    keepZ(cut.covered, v >= 2.3 && !showCorner ? front - 0.045 : -10)
    if (!yarnClipped.current && meshGroup.current) {
      meshGroup.current.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.Material | undefined
        if (mm && (o as THREE.Mesh).isMesh) {
          mm.clippingPlanes = [cut.meshX, cut.meshZ, cut.covered, cut.backEdge]
          yarnClipped.current = true
        }
      })
    }
    if (meshGroup.current) {
      meshGroup.current.visible = (v >= 1.04 && !poured) || (showCorner && v < 6.4)
      meshGroup.current.position.y = MESH_Y + (1 - snap) * 0.04
      meshGroup.current.position.z = -(Z[1] - Z[0]) * (1 - lay)
    }
    if (ghost.current) ghost.current.visible = shut > 0.6
    // the section stands on nothing: the piece's shadow would fall where it no longer is
    if (catcher.current) catcher.current.visible = shut < 0.01
    dimsD.show(smooth(1.56, 1.62, v) * (1 - smooth(1.78, 1.84, v)))
    if (dims.current) dims.current.visible = v > 1.54 && v < 1.86

    // 2. the pump drawn, the hose, the pour from the back edge to the front; its clean layer
    const pumpOn = smooth(2.12, 2.24, v) * (1 - smooth(2.78, 2.86, v))
    pumpD.show(pumpOn)
    if (pumpGroup.current) pumpGroup.current.visible = pumpOn > 0.001
    if (hose.current) hose.current.visible = v > 2.22 && v < 2.82
    if (pourMesh.current) {
      pourMesh.current.visible = v >= 2.3 && !poured
      pourMesh.current.position.z = front
    }
    if (doneMesh.current) doneMesh.current.visible = poured && v < 6.4
    const dry = smooth(2.96, 3.14, v)
    for (const mm of [m.pour, m.done, m.plate]) {
      mm.color.copy(set.wet).lerp(set.dry, dry)
      mm.roughness = 0.12 + 0.66 * dry
    }

    // 3. the plate grown out in its own concrete; the saw-cut grid drawn and wiped; the bays' two joints
    const rects: [number, number, number, number][] = [
      [x0, X[0], z0, z1],
      [X[1], x1, z0, z1],
      [X[0], X[1], Z[1], z1],
      [X[0], X[1], z0, Z[0]],
    ]
    rects.forEach(([a, b, za, zb], i) => {
      const s = strips.current[i]
      if (!s) return
      s.visible = b - a > 0.01 && zb - za > 0.01
      s.position.set((a + b) / 2, 0, (za + zb) / 2)
      s.scale.set(Math.max(0.001, b - a), 1, Math.max(0.001, zb - za))
    })
    if (cover.current) cover.current.visible = e > 0.002
    gridD.show(smooth(3.1, 3.42, v) * (1 - smooth(3.5, 3.72, v)))
    baysD.show(smooth(3.56, 3.76, v) * (1 - smooth(3.82, 3.9, v)))

    // 4. the ride-on trowel's passes, the polish left behind it, the machine doubled in the shine
    const tp = smooth(4.14, 4.84, v)
    const trowelOn = v > 4.1 && v < 4.88
    const tz = Z[0] + 0.3 + (Z[1] - Z[0] - 0.6) * tp
    const tx = 0.52 * Math.sin(tp * Math.PI * 3.5)
    if (polishMesh.current) {
      polishMesh.current.visible = v >= 4.14 && v < 5.44
      keepUnderZ(cut.polish, Z[0] - 0.02 + (Z[1] - Z[0] + 0.04) * tp)
    }
    trowelD.show(trowelOn ? 1 : 0)
    bladesA.show(trowelOn ? 1 : 0)
    bladesB.show(trowelOn ? 1 : 0)
    mirrorD.show(trowelOn ? 1 : 0)
    if (trowel.current) {
      trowel.current.visible = trowelOn
      trowel.current.position.set(tx, TOP, tz)
    }
    if (mirror.current) {
      mirror.current.visible = trowelOn
      mirror.current.position.set(tx, TOP, tz)
    }
    if (rotorA.current) rotorA.current.rotation.y = tp * 70
    if (rotorB.current) rotorB.current.rotation.y = -tp * 70

    // 5. the wear coat run on; then the corner stands back to the whole stack
    const coatE = smooth(5.06, 5.42, v)
    const coated = coatE > 0.985
    if (flowMesh.current) {
      flowMesh.current.visible = v >= 5.06 && !coated
      flowMesh.current.position.z = Z[0] - 0.04 + (Z[1] - Z[0] + 0.1) * coatE
    }
    if (coatMesh.current) coatMesh.current.visible = coated && v < 6.4
    // planes that take away only what is past both: out of reach until the corner opens
    const lerp = (a: number, b: number) => a + (b - a) * corner
    keepX(cut.screedX, lerp(X[0] - 0.1, STEP.screed[0]))
    keepUnderZ(cut.screedZ, lerp(Z[1] + 0.1, STEP.screed[1]))
    keepX(cut.coatX, lerp(X[0] - 0.1, STEP.coat[0]))
    keepUnderZ(cut.coatZ, lerp(Z[1] + 0.1, STEP.coat[1]))

    // 6. the loop: the aisle drawn on out from the piece, the floor out to its length, the machines running
    if (piece.current) piece.current.visible = v < 6.4 && e < 0.02
    const onWorld = loop > 0.001
    if (world.current) world.current.visible = onWorld
    if (onWorld) {
      aisle.machines(smooth(6.4, 6.56, v))
      aisle.tick(live.current && !reduced ? dt : 0, { clean: true })
      aisle.show(smooth(6.3, 6.5, v))
      if (worldFloor.current) {
        const fx0 = X[0] + (-AISLE.width - X[0]) * loop
        const fx1 = X[1] + (AISLE.width - X[1]) * loop
        const fz0 = Z[0] + (AISLE.far - Z[0]) * loop
        const fz1 = Z[1] + (AISLE.near - Z[1]) * loop
        worldFloor.current.position.set((fx0 + fx1) / 2, 0, (fz0 + fz1) / 2)
        worldFloor.current.scale.set(fx1 - fx0, 1, fz1 - fz0)
      }
      if (live.current && !reduced) invalidate()
    }
  }, -2)

  const nx = Math.floor((X[1] - X[0] - 0.02) / (PITCH * SHOW))
  const nz = Math.floor((Z[1] - Z[0] - 0.02) / (PITCH * SHOW))
  return (
    <group>
      <Wake live={live} />
      <MovingKeyLight focus={[0, 0, 0]} reach={3.6} offset={[-4, 7, 5]} />
      <group ref={piece}>
        <mesh geometry={g.base} material={m.plank} castShadow receiveShadow />
        <mesh geometry={g.ducts} material={m.duct} />
        <mesh ref={cap} geometry={g.cap} material={m.cap} visible={false} />
        <group position={[0, 0, 0]}>
          <mesh ref={oldBody} geometry={g.oldBody} material={m.old} castShadow />
          <mesh ref={oldTop} geometry={g.old} material={m.old} />
        </group>
        <mesh ref={blasted} geometry={g.blasted} material={m.blasted} visible={false} receiveShadow />
        <mesh ref={primer} geometry={g.primer} material={m.primer} visible={false} renderOrder={1} />
        <instancedMesh ref={buttons} args={[g.button, m.button, g.spots.length]} castShadow visible={false} />
        <group ref={meshGroup} position={[0, MESH_Y, 0]} visible={false}>
          <group rotation={[-Math.PI / 2, 0, 0]} scale={[SHOW, SHOW, 1]}>
            <Suspense fallback={null}>
              <MeshInset nx={nx} ny={nz} lod={4} />
            </Suspense>
          </group>
        </group>
        <mesh ref={ghost} geometry={g.ghost} material={m.ghost} visible={false} renderOrder={2} />
        <group ref={dims} visible={false}>
          <primitive object={dimsD.obj} />
        </group>
        <mesh ref={pourMesh} geometry={g.pour} material={m.pour} position={[0, B + 0.002, 0]} visible={false} castShadow receiveShadow />
        <mesh ref={doneMesh} geometry={g.done} material={m.done} visible={false} castShadow receiveShadow />
        <mesh ref={polishMesh} geometry={g.polish} material={m.polish} visible={false} receiveShadow />
        <mesh ref={flowMesh} geometry={g.coatFlow} material={m.coatWet} position={[0, TOP + 0.0004, 0]} visible={false} receiveShadow />
        <mesh ref={coatMesh} geometry={g.coat} material={m.coat} visible={false} receiveShadow />
        <mesh ref={catcher} geometry={g.catcher} material={m.catcher} position={[0, FOOT - 0.002, 0]} receiveShadow />
      </group>

      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(el) => void (strips.current[i] = el)} geometry={g.unit} material={m.plate} visible={false} />
      ))}
      <mesh ref={cover} geometry={g.cover} material={m.plate} visible={false} />
      <primitive object={gridD.obj} />
      <primitive object={baysD.obj} />

      <group ref={pumpGroup} position={PUMP} visible={false}>
        <primitive object={pumpD.obj} />
      </group>
      <mesh ref={hose} geometry={g.hose} material={m.rubber} visible={false} castShadow />
      <group ref={blaster} scale={0.62} visible={false}>
        <primitive object={blasterD.obj} />
      </group>
      <group ref={trowel} scale={0.5} visible={false}>
        <primitive object={trowelD.obj} />
        <group ref={rotorA} position={[-TROWEL.x, 0, 0]}>
          <primitive object={bladesA.obj} />
        </group>
        <group ref={rotorB} position={[TROWEL.x, 0, 0]}>
          <primitive object={bladesB.obj} />
        </group>
        <Anchor bus={bus} id="sv-trowel" position={[0.3, 1.4, -0.2]} />
      </group>
      <group ref={mirror} scale={[0.5, -0.5, 0.5]} visible={false}>
        <primitive object={mirrorD.obj} />
      </group>

      <group ref={world} position={[0, COAT, 0]} visible={false}>
        <mesh ref={worldFloor} geometry={g.world} material={m.armour} />
        <primitive object={aisle.group} />
      </group>

      <Anchor bus={bus} id="sv-csp" position={[0.85, B + 0.001, -0.62]} />
      <Anchor bus={bus} id="sv-button" position={[X[0] + 0.375, B + 0.01, Z[1] - 0.225]} />
      <Anchor bus={bus} id="sv-c2" position={[NEAR.x + 0.014, TOP - 0.0025, Z[1]]} />
      <Anchor bus={bus} id="sv-m" position={[NEAR.x + 0.014, B + 0.01, Z[1]]} />
      <Anchor bus={bus} id="sv-c1" position={[NEAR.x + 0.014, B + 0.0025, Z[1]]} />
      <Anchor bus={bus} id="sv-pump" position={[PUMP[0] - 0.7, FOOT + 1.62, PUMP[2] + 0.2]} />
      <Anchor bus={bus} id="sv-flow" position={[0.4, TOP, 0.2]} />
      <Anchor bus={bus} id="sv-bay" position={[0, TOP, -6]} />
      <Anchor bus={bus} id="sv-joint" position={[8.67, TOP, -4]} />
      <Anchor bus={bus} id="sv-coat" position={[0.4, COAT, -0.2]} />
      <Anchor bus={bus} id="sv-mesh" position={[-1.08, MESH_Y + 0.006, 0.76]} />
      <Anchor bus={bus} id="sv-slab" position={[0.6, FOOT + 0.1, Z[1]]} />
    </group>
  )
}
