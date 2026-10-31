import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../../facade/three/MeshInset'
import { Anchor } from '../../facade/three/Stage3D'
import type { LabelBus, Shot } from '../../facade/three/kit'
import { mixShot } from '../../facade/three/ScrubRig'
import { smooth, type Progress } from '../../facade/progress'
import { merge } from '../../facade/three/unit/parts'
import { Lines } from '../../facade/three/rain/building'
import { FatLines, fatMaterial } from '../../facade/three/rain/lines'
import { block, disposeFloorMaterials, floorMaterials } from './floor'

/**
 * The core features, on yellow, in the Rainscreen bridge's stage: one floor (a structural slab in two
 * bays, the screed over it) standing in the room right of the words. Each feature plays out on it, the
 * camera moving only between features; what moves is what the words say:
 *
 *   0  3D basalt web          inside a border the screed lifts away: a flat mesh and loose steel fibres
 *                             in it drop out, and RTARIUM's continuous web rises in their place
 *   1  crack suppression      seen from the side: a loaded pallet rack comes down on the second bay, it drops at
 *                             the joint, and the screed bends over the joint with it, whole
 *   2  jointless              from above: the saw-cut joints close, from the middle out, and the floor
 *                             opens out into one plate
 *   3  vibration dampening    a robot, drawn in lines, crosses the floor, its wheels turning; the rings it sends out
 *                             die within a stride
 *   4  zero rust              two windows in the screed: steel in one rusts and stains the floor round it;
 *                             RTARIUM in the other stays as it was
 *   5  low-carbon             the floor's embodied carbon, a block over it, shrinks down
 *
 * `t` is the run as features (feature k over k..k+1), eased by the section; the scroll is the clock.
 * Movements are drawn larger than they are, so they can be seen at all.
 */

export const N_FEATURES = 6

const W = 2.4
const D = 1.6
const SLAB = 0.18
const SC = 0.03
/** the border the screed lifts away inside (feature 0): x0, x1, z0, z1 */
const LIFT: [number, number, number, number] = [-0.72, 0.72, -0.46, 0.46]
/** RTARIUM drawn 2.5 times its pitch so its web reads at this size */
const SHOW = 2.5
/** the two windows of feature 4: steel, then RTARIUM */
const WIN_STEEL: [number, number, number, number] = [-0.78, -0.22, 0.12, 0.62]
const WIN_MESH: [number, number, number, number] = [0.22, 0.78, 0.12, 0.62]
/** how far the second bay drops at the joint (rad), drawn far larger than it is */
const DROP = 0.05
/** the saw-cut joints: lines across and along the floor */
const CUTS_X = [-0.6, 0, 0.6]
const CUTS_Z = [-0.4, 0.4]
/** the robot's path, and the rings it leaves */
const RINGS = 7

export interface FeatureAxis {
  x: number
  y: number
}

function shots(compact: boolean, ax: FeatureAxis): Shot[] {
  const fr: [number, number] = compact ? [0.5, 0.4] : [ax.x, ax.y]
  const k = compact ? 1.45 : 1
  return [
    // one scale throughout: each stands the floor at about the same width on the screen
    { target: [0, 0, 0], dist: 10.5 * k, azim: 28, elev: 34, frame: fr },
    { target: [0.15, 0.25, 0], dist: 8.8 * k, azim: 4, elev: 7, frame: fr },
    { target: [0, 0, 0], dist: 11.5 * k, azim: 18, elev: 64, frame: fr },
    { target: [0, 0.1, 0], dist: 10.5 * k, azim: 34, elev: 36, frame: fr },
    { target: [0, 0, 0.1], dist: 9.6 * k, azim: 12, elev: 40, frame: fr },
    { target: [0, 0.4, 0], dist: 10.5 * k, azim: 30, elev: 20, frame: fr },
  ]
}

/** the loaded pallet rack, in lines, standing on the floor at its origin: uprights, beams, a load on each level */
function rackLines() {
  const L = new Lines()
  const [w, d, h] = [0.34, 0.2, 1.0]
  for (const x of [-w, w])
    for (const z of [-d, d]) {
      L.box([x - 0.02, 0, z - 0.02], [x + 0.02, h, z + 0.02])
      L.box([x - 0.05, 0, z - 0.05], [x + 0.05, 0.012, z + 0.05])
    }
  // the bracing up each end
  for (const x of [-w, w]) for (let y = 0.02; y < h - 0.1; y += 0.24) L.seg([x, y, -d], [x, y + 0.24, d])
  for (const y of [0.04, 0.36, 0.68, h]) {
    L.rectZ(-w, y - 0.025, w, y, d)
    L.rectZ(-w, y - 0.025, w, y, -d)
  }
  // the pallets and what is on them
  for (const y of [0.04, 0.36, 0.68])
    for (const x of [-0.17, 0.17]) {
      L.box([x - 0.14, y, -d + 0.02], [x + 0.14, y + 0.025, d - 0.02])
      L.box([x - 0.13, y + 0.025, -d + 0.03], [x + 0.13, y + 0.24, d - 0.03])
      L.seg([x - 0.13, y + 0.025, d - 0.03], [x + 0.13, y + 0.24, d - 0.03])
      L.seg([x + 0.13, y + 0.025, d - 0.03], [x - 0.13, y + 0.24, d - 0.03])
    }
  return L.geometry()
}

/** the robot's body, in lines, its wheels apart: x along its way, on the floor at its origin */
function robotLines() {
  const L = new Lines()
  // the chassis, its bumper, the vents along its side
  L.box([-0.4, 0.07, -0.25], [0.4, 0.2, 0.25])
  L.box([0.4, 0.09, -0.2], [0.46, 0.15, 0.2])
  for (let x = -0.16; x <= 0.16; x += 0.04) L.seg([x, 0.1, 0.25], [x, 0.17, 0.25])
  // the lift: a deck, a scissor on each side, the platform with its grid
  L.box([-0.26, 0.2, -0.21], [0.34, 0.23, 0.21])
  for (const z of [-0.2, 0.2]) {
    L.seg([-0.22, 0.23, z], [0.3, 0.37, z])
    L.seg([0.3, 0.23, z], [-0.22, 0.37, z])
  }
  L.box([-0.26, 0.37, -0.21], [0.34, 0.4, 0.21])
  for (let x = -0.16; x < 0.34; x += 0.1) L.seg([x, 0.4, -0.21], [x, 0.4, 0.21])
  for (let z = -0.14; z < 0.21; z += 0.07) L.seg([-0.26, 0.4, z], [0.34, 0.4, z])
  // the control tower at its back: a screen and a keypad on its side, a sensor on a mast
  L.box([-0.42, 0.2, -0.13], [-0.29, 0.54, 0.13])
  L.rectX(-0.08, 0.42, 0.08, 0.51, -0.42)
  L.rectZ(-0.4, 0.42, -0.31, 0.51, 0.13)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) L.rectZ(-0.4 + i * 0.032, 0.3 + j * 0.032, -0.378 + i * 0.032, 0.322 + j * 0.032, 0.13)
  L.seg([-0.355, 0.54, 0], [-0.355, 0.7, 0])
  L.box([-0.38, 0.7, -0.025], [-0.33, 0.74, 0.025])
  return L.geometry()
}

/** a wheel in lines: a tyre, a hub, its spokes, about its own centre, facing z */
function wheelLines() {
  const L = new Lines()
  const R = 0.07
  const n = 20
  for (const [r, z] of [[R, 0.02], [R, -0.02], [0.03, 0.02]] as const)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const b = ((i + 1) / n) * Math.PI * 2
      L.seg([r * Math.cos(a), r * Math.sin(a), z], [r * Math.cos(b), r * Math.sin(b), z])
    }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    L.seg([0.03 * Math.cos(a), 0.03 * Math.sin(a), 0.02], [R * Math.cos(a), R * Math.sin(a), 0.02])
  }
  return L.geometry()
}
const WHEELS: [number, number][] = [
  [-0.26, 0.27],
  [0.26, 0.27],
  [-0.26, -0.27],
  [0.26, -0.27],
]

/** a plate of screed with holes in it, laid flat (holes as x0, x1, z0, z1) */
function holed(holes: [number, number, number, number][]) {
  const s = new THREE.Shape([new THREE.Vector2(-W / 2, D / 2), new THREE.Vector2(W / 2, D / 2), new THREE.Vector2(W / 2, -D / 2), new THREE.Vector2(-W / 2, -D / 2)].map((p) => new THREE.Vector2(p.x, -p.y)))
  for (const [x0, x1, z0, z1] of holes) s.holes.push(new THREE.Path([new THREE.Vector2(x0, -z0), new THREE.Vector2(x0, -z1), new THREE.Vector2(x1, -z1), new THREE.Vector2(x1, -z0)]))
  const g = new THREE.ExtrudeGeometry(s, { depth: SC, bevelEnabled: false })
  // laid flat: shape (x, y) → plan (x, −z), extruded up
  g.rotateX(-Math.PI / 2)
  g.computeVertexNormals()
  return g
}

/** the screed's bend over the joint as the second bay drops by `a` (rad): smooth over about 30 cm, then straight */
const bendAt = (x: number, a: number) => -a * 0.15 * Math.log(1 + Math.exp(x / 0.15))

export function FeatureScene({ t, bus, compact, axis }: { t: Progress; bus: LabelBus; compact: boolean; axis: { current: FeatureAxis } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const m = useMemo(() => {
    const f = floorMaterials()
    return {
      ...f,
      steel: new THREE.MeshStandardMaterial({ color: '#7d838a', metalness: 0.7, roughness: 0.38 }),
      rust: new THREE.MeshStandardMaterial({ color: '#5a2709', roughness: 0.9, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      // the rack and the robot, drawn in lines
      wire: fatMaterial('#080808', 1.5, 1),
      cut: new THREE.MeshBasicMaterial({ color: '#080808', toneMapped: false }),
      carbon: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false }),
      grid: new THREE.LineBasicMaterial({ color: '#2a2a2a', transparent: true }),
      ghost: new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0.5 }),
      rings: Array.from({ length: RINGS }, () => new THREE.MeshBasicMaterial({ color: '#080808', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })),
    }
  }, [])

  const geo = useMemo(() => {
    const screed = new THREE.BoxGeometry(W, SC, D, 120, 1, 1).translate(0, SC / 2, 0)
    const base = Float32Array.from(screed.getAttribute('position').array as Float32Array)
    const [x0, x1, z0, z1] = LIFT
    // the flat mesh: a square grid, 10 cm
    const grid: number[] = []
    for (let x = x0 + 0.05; x < x1; x += 0.1) grid.push(x, 0.012, z0 + 0.02, x, 0.012, z1 - 0.02)
    for (let z = z0 + 0.05; z < z1; z += 0.1) grid.push(x0 + 0.02, 0.012, z, x1 - 0.02, 0.012, z)
    const flat = new THREE.BufferGeometry()
    flat.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3))
    // the steel fibres, short and loose, lying every which way
    const fibre = new THREE.CylinderGeometry(0.0035, 0.0035, 0.06, 5).rotateZ(Math.PI / 2)
    // the steel window's bars and the stain they leave
    const [sx0, sx1, sz0, sz1] = WIN_STEEL
    const bars: THREE.BufferGeometry[] = []
    for (const z of [sz0 + 0.12, (sz0 + sz1) / 2, sz1 - 0.12]) bars.push(new THREE.CylinderGeometry(0.008, 0.008, sx1 - sx0 - 0.04, 10).rotateZ(Math.PI / 2).translate((sx0 + sx1) / 2, 0.012, z))
    for (const x of [sx0 + 0.12, (sx0 + sx1) / 2, sx1 - 0.12]) bars.push(new THREE.CylinderGeometry(0.008, 0.008, sz1 - sz0 - 0.04, 10).rotateX(Math.PI / 2).translate(x, 0.02, (sz0 + sz1) / 2))
    // the carbon block, and its outline where it began
    const carbon = new THREE.BoxGeometry(1.1, 1.1, 1.1).translate(0, 0.55, 0)
    const outline = new THREE.EdgesGeometry(carbon)
    return {
      screed,
      base,
      lifted: holed([LIFT]),
      cover: block([x0 + 0.002, 0, z0 + 0.002], [x1 - 0.002, SC, z1 - 0.002]),
      windows: holed([WIN_STEEL, WIN_MESH]),
      slabL: block([-W / 2, -SLAB, -D / 2], [-0.003, 0, D / 2]),
      slabR: block([0.003, -SLAB, -D / 2], [W / 2, 0, D / 2]),
      flat,
      fibre,
      bars: merge(bars),
      stain: new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
      // (standing clear of the screed, so the two never fight for the same depth)
      cutsX: block([-0.008, SC, -D / 2 + 0.01], [0.008, SC + 0.004, D / 2 - 0.01]),
      cutsZ: block([-W / 2 + 0.01, SC, -0.008], [W / 2 - 0.01, SC + 0.004, 0.008]),
      ring: new THREE.RingGeometry(0.96, 1, 72).rotateX(-Math.PI / 2),
      rack: rackLines(),
      robot: robotLines(),
      wheel: wheelLines(),
      carbon,
      outline,
    }
  }, [])
  // the loose fibres: where each lies, and its turn
  const fibres = useMemo(() => {
    const [x0, x1, z0, z1] = LIFT
    let seed = 11
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    return Array.from({ length: 140 }, () => new THREE.Matrix4().compose(new THREE.Vector3(x0 + 0.05 + rnd() * (x1 - x0 - 0.1), 0.016, z0 + 0.05 + rnd() * (z1 - z0 - 0.1)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0)), new THREE.Vector3(1, 1, 1)))
  }, [])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => (g as THREE.BufferGeometry).dispose?.())
      for (const x of [m.steel, m.rust, m.wire, m.cut, m.carbon, m.grid, m.ghost, ...m.rings]) x.dispose()
      disposeFloorMaterials(m)
    },
    [geo, m],
  )

  const floor = useRef<THREE.Group>(null)
  const bay = useRef<THREE.Group>(null)
  const screed = useRef<THREE.Mesh>(null)
  const lifted = useRef<THREE.Group>(null)
  const cover = useRef<THREE.Mesh>(null)
  const flat = useRef<THREE.Group>(null)
  const fibreMesh = useRef<THREE.InstancedMesh>(null)
  const web = useRef<THREE.Group>(null)
  const load = useRef<THREE.Group>(null)
  const wheels = useRef<(THREE.Group | null)[]>([])
  const cutsX = useRef<(THREE.Mesh | null)[]>([])
  const cutsZ = useRef<(THREE.Mesh | null)[]>([])
  const robot = useRef<THREE.Group>(null)
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const windows = useRef<THREE.Group>(null)
  const stain = useRef<THREE.Mesh>(null)
  const carbon = useRef<THREE.Group>(null)
  const outline = useRef<THREE.LineSegments>(null)
  const coverMat = useMemo(() => m.screed.clone(), [m])
  useEffect(() => () => coverMat.dispose(), [coverMat])
  const bent = useRef(-1)

  useEffect(() => {
    const f = fibreMesh.current
    if (!f) return
    fibres.forEach((x, i) => f.setMatrixAt(i, x))
    f.instanceMatrix.needsUpdate = true
  }, [fibres])
  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])

  useFrame(() => {
    const v = Math.min(N_FEATURES - 1e-4, Math.max(0, t.value))
    const k = Math.floor(v)
    const f = v - k
    const list = shots(compact, axis.current)
    const shot = k < N_FEATURES - 1 ? mixShot(list[k], list[k + 1], smooth(0.8, 1, f)) : list[k]
    const A = (shot.azim * Math.PI) / 180
    const E = (shot.elev * Math.PI) / 180
    const [tx, ty, tz] = shot.target
    camera.fov = 26
    camera.near = 0.01
    camera.far = 200
    camera.position.set(tx + shot.dist * Math.cos(E) * Math.sin(A), ty + shot.dist * Math.sin(E), tz + shot.dist * Math.cos(E) * Math.cos(A))
    camera.lookAt(tx, ty, tz)
    const fr = shot.frame ?? [0.5, 0.5]
    camera.setViewOffset(size.width, size.height, -(fr[0] - 0.5) * size.width, -(fr[1] - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()

    // 0. the web: the screed lifts away inside its border; the flat mesh and the loose fibres drop out,
    //    and RTARIUM's continuous web rises in their place; then the screed settles back
    const in0 = v < 1 - 0.02
    const lift = smooth(0.08, 0.26, v) * (1 - smooth(0.82, 0.96, v))
    const oldOut = smooth(0.42, 0.56, v)
    const webIn = smooth(0.5, 0.7, v)
    if (lifted.current) lifted.current.visible = in0
    if (cover.current) cover.current.position.y = lift * 0.55
    coverMat.opacity = 1 - smooth(0.3, 1, lift)
    coverMat.depthWrite = coverMat.opacity > 0.97
    if (flat.current) {
      flat.current.visible = in0 && lift > 0.05 && oldOut < 0.999
      flat.current.position.y = -oldOut * 0.05
    }
    m.grid.opacity = 1 - oldOut
    if (fibreMesh.current) fibreMesh.current.visible = in0 && lift > 0.05 && oldOut < 0.999
    if (web.current) {
      web.current.visible = in0 && webIn > 0.01
      web.current.scale.y = Math.max(0.001, webIn)
    }

    // 1. the load comes down on the second bay; the bay drops at the joint; the screed bends over it, whole
    const at1 = v - 1
    const down = smooth(0.12, 0.42, at1) * (1 - smooth(0.82, 0.96, at1))
    // (it lands, the bay gives under it with a little give and settle, and is relieved as it is lifted)
    const give = smooth(0.36, 0.62, at1) * (1 - smooth(0.78, 0.92, at1))
    const settle = 1 + 0.12 * Math.sin(Math.PI * smooth(0.48, 0.7, at1))
    const a = k === 1 ? DROP * give * settle : 0
    if (load.current) {
      load.current.visible = k === 1 && down > 0.002
      // it comes down square, and tilts with the bay once it stands on it
      load.current.position.set(0.7, SC + (1 - down) * 1.6 - Math.sin(a) * 0.7, 0)
      load.current.rotation.z = -a
    }
    if (bay.current) bay.current.rotation.z = -a
    if (screed.current && Math.abs(a - bent.current) > 1e-5) {
      bent.current = a
      const pos = screed.current.geometry.getAttribute('position') as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      for (let i = 0; i < pos.count; i++) arr[i * 3 + 1] = geo.base[i * 3 + 1] + bendAt(geo.base[i * 3], a)
      pos.needsUpdate = true
      screed.current.geometry.computeVertexNormals()
    }

    // 2. the saw-cut joints close, from the middle out; then the floor opens out into one plate
    const at2 = v - 2
    const cutsShown = v > 1.8 && v < 3.02
    const close = (d: number) => smooth(0.14 + d * 0.22, 0.34 + d * 0.22, at2)
    CUTS_X.forEach((x, i) => {
      const c = cutsX.current[i]
      if (!c) return
      const s = 1 - close(Math.abs(x) / 0.6)
      c.visible = cutsShown && s > 0.01
      c.scale.x = Math.max(0.01, s)
    })
    CUTS_Z.forEach((z, i) => {
      const c = cutsZ.current[i]
      if (!c) return
      const s = 1 - close(0.4 + Math.abs(z))
      c.visible = cutsShown && s > 0.01
      c.scale.z = Math.max(0.01, s)
    })
    const grow = k === 2 ? smooth(0.62, 0.86, at2) * (1 - smooth(0.9, 1, at2)) : 0
    if (floor.current) floor.current.scale.set(1 + 0.3 * grow, 1, 1 + 0.22 * grow)

    // 3. the robot crosses; each stride sends a ring out, and the floor takes it within the stride
    const at3 = v - 3
    const u = smooth(0.1, 0.86, at3)
    const rx = -0.7 + 1.4 * u
    if (robot.current) {
      robot.current.visible = k === 3
      robot.current.position.set(rx, SC, 0)
    }
    // its wheels roll as far as it has come
    wheels.current.forEach((w) => void (w && (w.rotation.z = -(1.4 * u) / 0.07)))
    rings.current.forEach((r, i) => {
      if (!r) return
      const born = (i + 0.5) / RINGS
      const age = u - born
      const on = k === 3 && age > 0 && at3 < 0.96
      r.visible = on
      if (!on) return
      const s = 0.4 + age * 2
      r.scale.set(s, 1, s)
      r.position.set(-0.7 + 1.4 * born, SC + 0.003, 0)
      m.rings[i].opacity = 0.8 * Math.exp(-age * 11)
    })

    // 4. two windows: the steel in one rusts and stains the floor round it; RTARIUM in the other stays
    const at4 = v - 4
    const in4 = v > 3.82 && v < 5.02
    if (windows.current) windows.current.visible = in4
    const rust = smooth(0.18, 0.7, at4)
    m.steel.color.set('#7d838a').lerp(new THREE.Color('#8a3b12'), k === 4 ? rust : 0)
    m.steel.metalness = 0.7 * (1 - (k === 4 ? rust : 0))
    if (stain.current) {
      const s = k === 4 ? smooth(0.3, 0.86, at4) : 0
      stain.current.visible = s > 0.01
      stain.current.scale.set(0.28 + 0.12 * s, 1, 0.24 + 0.1 * s)
      m.rust.opacity = 0.42 * s
    }

    // 5. the floor's embodied carbon, a block over it, shrinks down; its outline stays where it began
    const at5 = v - 5
    if (carbon.current) {
      carbon.current.visible = k === 5
      const s = 1 - 0.62 * smooth(0.18, 0.78, at5)
      carbon.current.scale.setScalar(s)
    }
    if (outline.current) outline.current.visible = k === 5 && at5 > 0.18

    // the whole screed is drawn whole, except where a window or the lifting border stands in for it
    if (screed.current) screed.current.visible = !in0 && !in4
  }, -1)

  const [lx0, lx1, lz0, lz1] = LIFT
  const [mx0, mx1, mz0, mz1] = WIN_MESH
  return (
    <group>
      <group ref={floor}>
        <mesh geometry={geo.slabL} material={m.slab} castShadow receiveShadow />
        {/* the second bay, pivoted at the joint */}
        <group ref={bay}>
          <mesh geometry={geo.slabR} material={m.slab} castShadow receiveShadow />
        </group>
        <mesh ref={screed} geometry={geo.screed} material={m.screed} castShadow receiveShadow />
        {CUTS_X.map((x, i) => (
          <mesh key={`x${i}`} ref={(el) => void (cutsX.current[i] = el)} geometry={geo.cutsX} material={m.cut} position={[x, 0, 0]} visible={false} renderOrder={1} />
        ))}
        {CUTS_Z.map((z, i) => (
          <mesh key={`z${i}`} ref={(el) => void (cutsZ.current[i] = el)} geometry={geo.cutsZ} material={m.cut} position={[0, 0, z]} visible={false} renderOrder={1} />
        ))}

        {/* 0. the screed with its border, the cover that lifts, what is under it */}
        <group ref={lifted} visible={false}>
          <mesh geometry={geo.lifted} material={m.screed} castShadow receiveShadow />
          <mesh ref={cover} geometry={geo.cover} material={coverMat} castShadow />
          <group ref={flat}>
            <lineSegments geometry={geo.flat} material={m.grid} />
            <instancedMesh ref={fibreMesh} args={[geo.fibre, m.steel, fibres.length]} castShadow />
          </group>
          <group ref={web} position={[0, 0.002, 0]}>
            <group scale={[SHOW, 1, SHOW]}>
              <group rotation={[-Math.PI / 2, 0, 0]}>
                <Suspense fallback={null}>
                  <MeshInset nx={Math.floor((lx1 - lx0 - 0.04) / (0.012 * SHOW))} ny={Math.floor((lz1 - lz0 - 0.04) / (0.012 * SHOW))} lod={6} />
                </Suspense>
              </group>
            </group>
          </group>
        </group>

        {/* 4. the screed with its two windows: steel in one, RTARIUM in the other */}
        <group ref={windows} visible={false}>
          <mesh geometry={geo.windows} material={m.screed} castShadow receiveShadow />
          <mesh geometry={geo.bars} material={m.steel} castShadow />
          <mesh ref={stain} geometry={geo.stain} material={m.rust} position={[(WIN_STEEL[0] + WIN_STEEL[1]) / 2, SC + 0.0008, (WIN_STEEL[2] + WIN_STEEL[3]) / 2]} visible={false} />
          <group position={[(mx0 + mx1) / 2, 0.002, (mz0 + mz1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <Suspense fallback={null}>
              <MeshInset nx={Math.floor((mx1 - mx0 - 0.02) / 0.012)} ny={Math.floor((mz1 - mz0 - 0.02) / 0.012)} lod={3} />
            </Suspense>
          </group>
        </group>
      </group>

      {/* 1. the load (what is drawn in lines goes after the floor, or the floor would paint over it wherever it stands further off) */}
      <group ref={load} visible={false} renderOrder={2}>
        <FatLines geometry={geo.rack} material={m.wire} />
      </group>

      {/* 3. the robot */}
      <group ref={robot} visible={false} renderOrder={2}>
        <FatLines geometry={geo.robot} material={m.wire} />
        {WHEELS.map(([x, z], i) => (
          <group key={i} ref={(el) => void (wheels.current[i] = el)} position={[x, 0.07, z]} renderOrder={2}>
            <FatLines geometry={geo.wheel} material={m.wire} />
          </group>
        ))}
        <Anchor bus={bus} id="ff-robot" position={[-0.355, 0.72, 0]} />
      </group>
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh key={i} ref={(el) => void (rings.current[i] = el)} geometry={geo.ring} material={m.rings[i]} visible={false} renderOrder={1} />
      ))}

      {/* 5. the carbon block, and its outline where it began */}
      <group ref={carbon} position={[0, SC, 0]} visible={false}>
        <mesh geometry={geo.carbon} material={m.carbon} />
      </group>
      <lineSegments ref={outline} geometry={geo.outline} material={m.ghost} position={[0, SC, 0]} visible={false} />

      {/* the anchors for the labels */}
      <Anchor bus={bus} id="ff-web" position={[0.3, 0.02, 0.2]} />
      <Anchor bus={bus} id="ff-old" position={[-0.4, 0.02, -0.2]} />
      <Anchor bus={bus} id="ff-joint" position={[0, SC, D / 2]} />
      <Anchor bus={bus} id="ff-load" position={[0.7, SC + 1.02, 0.2]} />
      <Anchor bus={bus} id="ff-plate" position={[0.9, SC, 0.6]} />
      <Anchor bus={bus} id="ff-cut" position={[0.6, SC, -0.4]} />
      <Anchor bus={bus} id="ff-steel" position={[(WIN_STEEL[0] + WIN_STEEL[1]) / 2, SC, WIN_STEEL[3]]} />
      <Anchor bus={bus} id="ff-mesh" position={[(mx0 + mx1) / 2, SC, mz1]} />
      <Anchor bus={bus} id="ff-carbon" position={[0, SC + 1.1, 0]} />
      <mesh position={[0, -SLAB - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.catcher} receiveShadow>
        <planeGeometry args={[12, 12]} />
      </mesh>
    </group>
  )
}
