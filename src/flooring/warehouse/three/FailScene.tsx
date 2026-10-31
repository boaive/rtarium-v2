import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor } from '../../../facade/three/Stage3D'
import { smooth, type Progress } from '../../../facade/progress'
import type { LabelBus } from '../../../facade/three/kit'
import { Wake } from '../../../facade/three/rain/lines'
import { block, merge } from '../../../facade/three/unit/parts'
import { prefersReducedMotion } from '../../../lib/motion'
import { type BuildRoom, fit } from '../../data/three/BuildScene'
import { disposeFloorKit, floorKit, Lines, sortFrom, split, uvBox } from '../../data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../data/three/draw'
import { AISLE, AISLE_VIEW, useAisle } from './aisle'
import { crackPaths, GROOVE, jointSeam, jointSurface, screedBody } from './joint'
import { applyCam, camOf, circle, mixView, POD, podLines, type View, wheelLines } from './parts'

/**
 * The failure, on black: the page's one use of red. One scene, five beats, each a piece fitted to the
 * room right of the words (never out to the screen's edges), the camera moving in the gap between them.
 *
 *   0  at full speed   a length of the aisle: AGVs and a picking crane, wandering, jolting at the joints,
 *                      faulting and queueing behind one another
 *   1  into the slab   the racks drawn away, the camera down to the floor's edge: a block of the slab as a
 *                      wireframe grid, the stress paths running down from every wheel, in red
 *   2  the joint       one small piece of the floor: a traditional screed on the structural base, a
 *                      saw-cut joint across it, the drive wheel rolling over it
 *   3  spall and crack a smaller piece about the cut: its edges spall, the floor beside it pits, micro-cracks
 *                      run out (the surface's own morph target, the chips, and the cracks in red)
 *   4  system stop     the piece opens out for the whole AGV: its wheel caught in the broken joint, the body
 *                      tipped, the laser scanner thrown off the guide line; it turns red, and it stops
 *
 * `t` is the run as beats (beat k over k..k+1), eased by the section.
 */

export const N_BEATS = 5
const RED = '#ff3b2f'
const INK = '#f2f0e9'
const X: [number, number] = [-1.2, 1.2]
const Z: [number, number] = [-0.9, 0.9]
const T = 0.05
/** how large the whole AGV is drawn on the piece, so all of it stands on the floor */
const AGV = 0.7
/** where the drive wheel runs, and where it catches, just short of the cut */
const WX = POD.wheelX
const CAUGHT = -0.018
const R = POD.wheelR
/** the piece's half-width in the wheel's beat and in the close-up, and how deep each is cut */
const NEAR = { wheel: 0.34, close: 0.23, foot: -T - 0.09 }
const FOOT = -T - 0.2
/** the block of slab under the floor */
const GRID = { x: [-2.6, 2.6] as [number, number], z: [-3.6, 2.6] as [number, number], ys: [0, -0.1, -0.5, -0.9] }

const VIEWS: View[] = [
  AISLE_VIEW,
  { box: [[GRID.x[0], GRID.ys[3], GRID.z[0]], [GRID.x[1], 0.75, GRID.z[1]]], azim: 34, elev: 7, fill: 0.86 },
  { box: [[WX - NEAR.wheel, NEAR.foot, -NEAR.wheel], [WX + NEAR.wheel, 0.26, NEAR.wheel]], azim: 38, elev: 17, fill: 0.74 },
  { box: [[WX - NEAR.close, NEAR.foot, -NEAR.close], [WX + NEAR.close, 0.06, NEAR.close]], azim: 28, elev: 34, fill: 0.76 },
  { box: [[X[0], FOOT, Z[0]], [X[1], 0.72, Z[1]]], azim: 34, elev: 21, fill: 0.76 },
]

/** the slab as a wireframe: its layers, the lines both ways on each, the verticals between them */
function latticeLines() {
  const strong = new Lines()
  const fine = new Lines()
  const [x0, x1] = GRID.x
  const [z0, z1] = GRID.z
  GRID.ys.forEach((y, l) => {
    const L = l < 2 ? strong : fine
    for (let x = x0; x <= x1 + 1e-6; x += 0.4) L.seg([x, y, z0], [x, y, z1])
    for (let z = z0; z <= z1 + 1e-6; z += 0.4) L.seg([x0, y, z], [x1, y, z])
  })
  for (let x = x0; x <= x1 + 1e-6; x += 0.4) for (let z = z0; z <= z1 + 1e-6; z += 0.4) fine.seg([x, 0, z], [x, GRID.ys[3], z])
  return { strong: sortFrom(split(strong, 0.8), [0.6, 0, 0]), fine: sortFrom(fine, [0.6, 0, 0]) }
}

/** the saw-cut joints across the floor of the aisle, in the racing shot */
function floorJoints() {
  const g: THREE.BufferGeometry[] = []
  for (let z = AISLE.near - AISLE.joint; z > AISLE.far; z -= AISLE.joint) g.push(block([-AISLE.half, 0.001, z - 0.014], [AISLE.half, 0.0025, z + 0.014]))
  return merge(g)
}

export function FailScene({ t, bus, compact, room, live }: { t: Progress; bus: LabelBus; compact: boolean; room: { current: BuildRoom }; live: { current: boolean } }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  // the section box the piece is cut to: its near faces carry caps, its far ones are never seen
  const cut = useMemo(
    () => ({
      x1: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10),
      x0: new THREE.Plane(new THREE.Vector3(1, 0, 0), 10),
      z1: new THREE.Plane(new THREE.Vector3(0, 0, -1), 10),
      z0: new THREE.Plane(new THREE.Vector3(0, 0, 1), 10),
      y: new THREE.Plane(new THREE.Vector3(0, 1, 0), 10),
    }),
    [],
  )
  const m = useMemo(() => {
    const k = floorKit()
    k.screed.color.set('#a9a69e')
    const planes = [cut.x1, cut.x0, cut.z1, cut.z0, cut.y]
    k.screed.clippingPlanes = planes
    k.plank.clippingPlanes = planes
    return {
      ...k,
      worn: new THREE.MeshStandardMaterial({ color: '#34332f', roughness: 0.5, transparent: true }),
      seam: new THREE.MeshBasicMaterial({ color: '#f2f0e9', transparent: true, toneMapped: false }),
      cut: new THREE.MeshBasicMaterial({ color: '#0a0a0a', transparent: true, toneMapped: false, clippingPlanes: planes }),
      contact: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, toneMapped: false, depthWrite: false }),
      tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.7, transparent: true }),
      capScreed: new THREE.MeshStandardMaterial({ color: '#a9a69e', roughness: 0.82, transparent: true, side: THREE.DoubleSide }),
      capBase: new THREE.MeshStandardMaterial({ color: '#8d8a83', roughness: 0.9, transparent: true, side: THREE.DoubleSide }),
    }
  }, [cut])
  const specimen = useMemo(() => {
    const s = jointSurface(X, Z, { focusX: WX, nx: 260, nz: 200 })
    return {
      top: s.top,
      body: screedBody(X, Z, T),
      base: uvBox(block([X[0], FOOT, Z[0]], [X[1], -T, Z[1]]), 2.2),
      seam: jointSeam(X),
      cracks: crackPaths(X, { height: s.wornAt, focus: WX, spread: 0.55, count: 16, reach: 0.62 }),
    }
  }, [])
  const g = useMemo(
    () => ({
      floor: new THREE.BoxGeometry(2 * AISLE.width, 0.14, AISLE.near - AISLE.far).translate(0, -0.07, (AISLE.near + AISLE.far) / 2),
      joints: floorJoints(),
      tyre: new THREE.CylinderGeometry(R, R, POD.wheelW, 32).rotateZ(Math.PI / 2),
      chip: new THREE.TetrahedronGeometry(0.009),
      contact: new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
      // the caps: unit planes, moved and sized to the box's near faces every frame
      capX: new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2),
      capZ: new THREE.PlaneGeometry(1, 1),
      notch: new THREE.BoxGeometry(0.002, GROOVE.depth, GROOVE.half * 2),
    }),
    [],
  )
  useEffect(
    () => () => {
      for (const x of Object.values(g)) x.dispose()
      specimen.top.dispose()
      specimen.body.dispose()
      specimen.base.dispose()
      specimen.seam.dispose()
      for (const x of [m.worn, m.seam, m.cut, m.contact, m.tyre, m.capScreed, m.capBase]) x.dispose()
      disposeFloorKit(m)
    },
    [g, m, specimen],
  )

  const aisle = useAisle(INK, { alertColor: RED })
  const mats = useMemo(() => {
    const planes = [cut.x1, cut.x0, cut.z1, cut.z0]
    const crack = ink(1.25, RED, 1)
    crack.clippingPlanes = planes
    const guide = ink(1.4, INK, 0.7)
    guide.clippingPlanes = planes
    return {
      gridStrong: ink(1.1, INK, 0.7),
      gridFine: ink(0.7, INK, 0.2),
      wheel: ink(1.2, INK, 1),
      crack,
      podBody: ink(1.25, INK, 1),
      fan: ink(1, INK, 0.75),
      guide,
      beacon: ink(2.2, RED, 1),
      contact: ink(1.6, RED, 1),
    }
  }, [cut])
  useInkResolution(useMemo(() => Object.values(mats), [mats]))
  const lines = useMemo(() => {
    const W = new Lines()
    wheelLines(W, R, POD.wheelW)
    const Fk = new Lines()
    // the fork that holds it, up to where the body will be
    for (const x of [-POD.wheelW / 2 - 0.012, POD.wheelW / 2 + 0.012]) {
      Fk.seg([x, 0, 0], [x, R + 0.1, 0])
      Fk.seg([x, 0, 0], [x, R + 0.1, -0.05])
      Fk.seg([x, R + 0.1, 0], [x, R + 0.1, -0.05])
    }
    Fk.box([-POD.wheelW / 2 - 0.03, R + 0.1, -0.08], [POD.wheelW / 2 + 0.03, R + 0.12, 0.03])
    const Pd = new Lines()
    podLines(Pd)
    // the fan of the laser scanner, out over the floor ahead of it, and the sweep it draws there
    const F = new Lines()
    const n = 17
    const reach = 0.86
    const drop = POD.lidar[1] + 0.05
    let last: number[] | null = null
    for (let i = 0; i < n; i++) {
      const a = -0.72 + (1.44 * i) / (n - 1)
      const e = [Math.sin(a) * reach, -drop, Math.cos(a) * reach]
      F.seg([0, 0, 0], e)
      if (last) F.seg(last, e)
      last = e
    }
    const G = new Lines()
    for (let z = Z[0] + 0.02; z < Z[1] - 0.06; z += 0.12) G.seg([0, 0.002, z], [0, 0.002, z + 0.07])
    const B = new Lines()
    circle(B, [0, 0, 0], 0.06, 'y', 14)
    circle(B, [0, 0, 0], 0.1, 'y', 18)
    const C = new Lines()
    for (const c of specimen.cracks) C.seg(c.a, c.b)
    const J = new Lines()
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      J.seg([0.07 * Math.cos(a), 0.003, 0.07 * Math.sin(a)], [0.12 * Math.cos(a), 0.003, 0.12 * Math.sin(a)])
    }
    return { wheel: W, fork: Fk, pod: split(Pd, 0.2), fan: F, guide: G, beacon: B, crack: C, jolt: J, ...latticeLines() }
  }, [specimen])
  const wheelD = useDrawing(lines.wheel, mats.wheel)
  const forkD = useDrawing(lines.fork, mats.wheel)
  const podD = useDrawing(lines.pod, mats.podBody)
  const fanD = useDrawing(lines.fan, mats.fan)
  const guideD = useDrawing(lines.guide, mats.guide)
  const beaconD = useDrawing(lines.beacon, mats.beacon)
  const crackD = useDrawing(lines.crack, mats.crack)
  const joltD = useDrawing(lines.jolt, mats.contact)
  const strong = useDrawing(lines.strong, mats.gridStrong)
  const fine = useDrawing(lines.fine, mats.gridFine)

  const floor = useRef<THREE.Mesh>(null)
  const joints = useRef<THREE.Mesh>(null)
  const piece = useRef<THREE.Group>(null)
  const top = useRef<THREE.Mesh>(null)
  const wheel = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const contact = useRef<THREE.Mesh>(null)
  const pod = useRef<THREE.Group>(null)
  const fan = useRef<THREE.Group>(null)
  const beacon = useRef<THREE.Group>(null)
  const jolt = useRef<THREE.Group>(null)
  const chips = useRef<THREE.InstancedMesh>(null)
  const capXS = useRef<THREE.Mesh>(null)
  const capXB = useRef<THREE.Mesh>(null)
  const capZS = useRef<THREE.Mesh>(null)
  const capZB = useRef<THREE.Mesh>(null)
  const notch = useRef<THREE.Mesh>(null)
  const time = useRef(0)
  const roll = useRef(0)
  const chipSeeds = useMemo(() => {
    let s = 91
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    return Array.from({ length: 70 }, () => ({ x: WX + (rnd() - 0.5) * 0.42, side: rnd() < 0.5 ? -1 : 1, at: rnd() * 0.75, out: 0.03 + rnd() * 0.12, up: 0.02 + rnd() * 0.05, spin: rnd() * 6 }))
  }, [])
  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const qt = useMemo(() => new THREE.Quaternion(), [])
  const eu = useMemo(() => new THREE.Euler(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const scl = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])

  useFrame((_, delta) => {
    const v = Math.min(N_BEATS - 1e-4, Math.max(0, t.value))
    const k = Math.floor(v)
    const f = v - k
    const dt = Math.min(delta, 1 / 20)
    const on = live.current && !reduced

    // the camera: each beat's fitted shot, moving on in the gap before the next
    const aspect = size.width / Math.max(1, size.height)
    const r = compact ? { x: 0.04, y: 0.13, w: 0.92, h: 0.36 } : room.current
    const view = k < N_BEATS - 1 ? mixView(VIEWS[k], VIEWS[k + 1], smooth(0.78, 1, f)) : VIEWS[k]
    applyCam(camera, size, camOf(fit(view.box, view.azim, view.elev, r, aspect, view.fill)))

    // the aisle: misbehaving in time; its racks drawn away as the camera goes down to the slab
    const stepTime = on ? dt : 0
    time.current += stepTime
    const under = smooth(0.6, 0.8, v)
    aisle.group.visible = v < 1.96
    if (aisle.group.visible) {
      aisle.machines(1 - smooth(1.56, 1.7, v))
      aisle.tick(stepTime * (1 - 0.6 * under), { hold: under, time: time.current })
      aisle.show(1 - under)
      const stressOn = smooth(0.8, 1, v) * (1 - smooth(1.56, 1.7, v))
      aisle.stress(0.12 + 0.88 * ((time.current * 0.55) % 1), stressOn)
    }
    m.worn.opacity = 1 - under
    m.seam.opacity = 1 - under
    if (floor.current) floor.current.visible = under < 0.995
    if (joints.current) joints.current.visible = under < 0.995
    const gridOn = smooth(0.66, 0.84, v) * (1 - smooth(1.58, 1.76, v))
    strong.show(gridOn)
    fine.show(gridOn)

    // the piece, in the slab's place: cut small, smaller, then open to its whole size for the AGV
    const here = smooth(1.74, 1.96, v)
    if (piece.current) piece.current.visible = here > 0.002
    for (const x of [m.plank, m.screed, m.tyre, m.cut, m.capScreed, m.capBase]) x.opacity = here
    const closer = smooth(2.78, 3, v)
    const open = smooth(3.82, 4.14, v)
    const half = NEAR.wheel + (NEAR.close - NEAR.wheel) * closer
    const xa = WX - half + (X[0] - (WX - half)) * open
    const xb = WX + half + (X[1] - (WX + half)) * open
    const za = -half + (Z[0] + half) * open
    const zb = half + (Z[1] - half) * open
    const foot = NEAR.foot + (FOOT - NEAR.foot) * open
    cut.x1.constant = xb
    cut.x0.constant = -xa
    cut.z1.constant = zb
    cut.z0.constant = -za
    cut.y.constant = -foot
    const midZ = (za + zb) / 2
    const midX = (xa + xb) / 2
    if (capXS.current && capXB.current && capZS.current && capZB.current && notch.current) {
      const lift = 0.0008
      capXS.current.position.set(xb + lift, -T / 2, midZ)
      capXS.current.scale.set(1, T, zb - za)
      capXB.current.position.set(xb + lift, (foot - T) / 2, midZ)
      capXB.current.scale.set(1, -T - foot, zb - za)
      capZS.current.position.set(midX, -T / 2, zb + lift)
      capZS.current.scale.set(xb - xa, T, 1)
      capZB.current.position.set(midX, (foot - T) / 2, zb + lift)
      capZB.current.scale.set(xb - xa, -T - foot, 1)
      notch.current.position.set(xb + 2 * lift, -GROOVE.depth / 2, 0)
    }

    // the surface breaks up as the wheels go on crossing it
    const damage = smooth(2.32, 3.72, v)
    if (top.current) {
      if (!top.current.morphTargetInfluences) top.current.updateMorphTargets()
      if (top.current.morphTargetInfluences) top.current.morphTargetInfluences[0] = damage
    }
    crackD.show(smooth(0.22, 1, damage))
    const chip = chips.current
    if (chip) {
      chipSeeds.forEach((c, i) => {
        const a = smooth(c.at, c.at + 0.22, damage)
        const arc = 4 * a * (1 - a)
        pos.set(c.x, -0.004 + arc * c.up * 2 + (a > 0 ? 0.004 : 0), c.side * (0.008 + a * c.out))
        eu.set(a * c.spin, c.spin, a * c.spin * 0.7)
        qt.setFromEuler(eu)
        scl.setScalar(a > 0.001 ? 0.7 + (i % 4) * 0.3 : 0.0001)
        chip.setMatrixAt(i, mtx.compose(pos, qt, scl))
      })
      chip.instanceMatrix.needsUpdate = true
      chip.visible = damage > 0.001
    }

    // the wheel: over the cut and over it again, until it catches and holds
    const wheelOn = v >= 1.94
    const caught = smooth(3.82, 4.14, v)
    if (on && caught < 0.5) roll.current += dt * 0.42
    const cycle = reduced ? 0.42 : roll.current % 1
    const free = (cycle * 2 - 1) * half * 0.74
    const wz = free + (CAUGHT - free) * caught
    const near = Math.abs(wz)
    const drop = 0.008 * (1 + damage) * (1 - smooth(0, 0.035, near))
    const hop = (1 - caught) * 0.007 * Math.max(0, 1 - Math.abs(wz - 0.05) / 0.05)
    const scale = 1 + (AGV - 1) * caught
    if (wheel.current) {
      wheel.current.visible = wheelOn
      wheel.current.position.set(WX, R * scale - drop + hop, wz)
      wheel.current.scale.setScalar(scale)
    }
    if (spin.current) spin.current.rotation.x = wz / R
    wheelD.show(wheelOn ? 1 : 0)
    forkD.show(wheelOn && caught < 0.9 ? 1 : 0)
    if (contact.current) {
      contact.current.visible = wheelOn
      contact.current.position.set(WX, 0.0012, wz)
      contact.current.scale.set(POD.wheelW * 0.95 * scale, 1, R * 0.8 * scale)
    }
    const hit = 1 - smooth(0, 0.05, near)
    mats.contact.opacity = hit * (1 - caught * 0.15)
    if (jolt.current) {
      jolt.current.visible = wheelOn && hit > 0.02
      jolt.current.position.set(WX, 0, 0)
      jolt.current.scale.setScalar(0.7 + damage * 0.6)
    }

    // the AGV drawn on over its wheel; tipped forward over the broken edge
    const body = smooth(4.1, 4.42, v)
    const tip = smooth(4.3, 4.6, v)
    podD.show(body)
    if (pod.current) {
      pod.current.visible = body > 0.002
      pod.current.position.set(WX - POD.wheelX * AGV, 0.01 * tip, CAUGHT - POD.wheelZ * AGV)
      pod.current.rotation.x = (2.6 * tip * Math.PI) / 180
    }
    guideD.show(body)
    const off = smooth(4.42, 4.66, v)
    const blink = on ? 0.5 + 0.5 * Math.sign(Math.sin(performance.now() / 150)) : 1
    fanD.show(body)
    mats.fan.color.set(off > 0.5 ? RED : INK)
    mats.podBody.color.set(off > 0.5 ? RED : INK)
    mats.wheel.color.set(off > 0.5 ? RED : INK)
    mats.fan.opacity = off > 0.5 ? 0.42 + 0.5 * blink : 0.72
    if (fan.current) fan.current.rotation.set((-9 * off * Math.PI) / 180, (15 * off * Math.PI) / 180, (6 * off * Math.PI) / 180)
    if (beacon.current) beacon.current.visible = off > 0.5
    mats.beacon.opacity = 0.35 + 0.65 * blink
    beaconD.show(off > 0.5 ? 1 : 0)

    if (on) invalidate()
  }, -1)

  return (
    <group>
      <Wake live={live} />
      <primitive object={aisle.group} />
      <mesh ref={floor} geometry={g.floor} material={m.worn} />
      <mesh ref={joints} geometry={g.joints} material={m.seam} />
      <primitive object={strong.obj} />
      <primitive object={fine.obj} />

      <group ref={piece} visible={false}>
        <mesh geometry={specimen.base} material={m.plank} />
        <mesh geometry={specimen.body} material={m.screed} />
        <mesh geometry={specimen.seam} material={m.cut} />
        <mesh ref={top} geometry={specimen.top} material={m.screed} />
        <mesh ref={capXS} geometry={g.capX} material={m.capScreed} />
        <mesh ref={capXB} geometry={g.capX} material={m.capBase} />
        <mesh ref={capZS} geometry={g.capZ} material={m.capScreed} />
        <mesh ref={capZB} geometry={g.capZ} material={m.capBase} />
        <mesh ref={notch} geometry={g.notch} material={m.cut} />
        <mesh ref={contact} geometry={g.contact} material={m.contact} visible={false} />
        <instancedMesh ref={chips} args={[g.chip, m.screed, chipSeeds.length]} visible={false} />
        <primitive object={crackD.obj} />
        <group ref={jolt} visible={false}>
          <primitive object={joltD.obj} />
        </group>
        <group position={[WX, 0, 0]}>
          <primitive object={guideD.obj} />
        </group>
      </group>

      <group ref={wheel} visible={false}>
        <group ref={spin}>
          <mesh geometry={g.tyre} material={m.tyre} />
          <primitive object={wheelD.obj} />
        </group>
        <primitive object={forkD.obj} />
      </group>
      <group ref={pod} scale={AGV} visible={false}>
        <primitive object={podD.obj} />
        <group position={POD.lidar}>
          <group ref={fan}>
            <primitive object={fanD.obj} />
          </group>
        </group>
        <group ref={beacon} position={[0.3, POD.h + 0.37, -0.5]} visible={false}>
          <primitive object={beaconD.obj} />
        </group>
        <Anchor bus={bus} id="fl-laser" position={[POD.lidar[0], POD.lidar[1] + 0.02, POD.lidar[2]]} />
      </group>

      <Anchor bus={bus} id="fl-stress" position={[0.98, -0.3, 0.9]} />
      <Anchor bus={bus} id="fl-joint" position={[WX + 0.2, 0, 0.002]} />
      <Anchor bus={bus} id="fl-crack" position={[WX - 0.08, 0, 0.1]} />
    </group>
  )
}
