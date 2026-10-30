import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../../../facade/three/MeshInset'
import { Anchor } from '../../../facade/three/Stage3D'
import type { LabelBus, Shot } from '../../../facade/three/kit'
import { mixShot } from '../../../facade/three/ScrubRig'
import { smooth, type Progress } from '../../../facade/progress'
import { bend, blades, buttonGeometry, disposeFloorKit, floorKit, hollowCore, layer, Lines, PITCH, PLANK, plankTops, pourGeometry, pump, SHOW, sortFrom, trowel, uvBox } from './dc'
import { ink, useDrawing, useInkResolution } from './draw'

/**
 * Built up from the slab (Data & AI Centres): one piece of a data hall's floor on the yellow ground,
 * across three hollow-core planks and their joints, the one thing shown in its own materials; the
 * mixer-pump and the power trowel are drawings. One scene plays each step, the camera moving only
 * between them (the Unitized answers' rule). Every step's shot is fitted to the room right of the
 * words (its width, and the height between the title and the bar), the piece and what works on it
 * never filling more than part of it.
 *
 *   0  the bare slab      a section model of the piece's front left corner, the first joint in it: the
 *                         grout, the step between two cambers, the mild undulations under a level line
 *   1  primer, anchors    the bonding primer rolled across; the anchor buttons set on a grid
 *   2  the mesh           RTARIUM lowered onto the T-stems, 5 mm off the slab
 *   3  the pour           the whole piece again, the H1-561 mixer-pump behind it, its hose over the back
 *                         edge; the free-flow concrete runs from there to the front, over the mesh
 *   4  power trowelled    the screed sets; the trowel works it from back to front, polished behind it
 *   5  ESD coating        the conductive primer rolled on, the self-levelling epoxy run over it
 *
 * `t` is the run as steps (step k over k..k+1), eased by the section. Sizes are the client's (120 mm
 * planks, 10 mm buttons, a 10 mm mesh 5 mm off the slab, 20 mm in all); the mesh is drawn at 2.5
 * times its pitch, as the Rainscreen bridge draws it, and the undulations a little more than they are.
 */

/** the piece: across three planks, two joints, its left end a little short of the first (where the close-ups look) */
export const BX: [number, number] = [-0.4, 1.6]
export const BZ: [number, number] = [-0.6, 0.6]
export const CENTRES = [-0.6, 0.6, 1.8]
const MID = (BX[0] + BX[1]) / 2
const LIE = { lift: [0, -0.003, -0.0015], wave: 0.0015 }
const MESH_Y = 0.13
export const TOP = 0.14
const COND = 0.0013
export const EPOXY = 0.0025
export const N_STEPS = 6
/** the close-ups' section box: the piece's front left corner, its first joint in it; the cut falls between cores */
const NEAR_X = 0.25
const NEAR_Z = 0.0
/** the mixer-pump stands behind the piece, seen square behind it from the camera's side */
const PUMP: [number, number, number] = [-0.55, 0, -2.15]

/** the room the 3D keeps to, as fractions of its canvas: the words' right to the bar's right, the title to the bar */
export interface BuildRoom {
  x: number
  y: number
  w: number
  h: number
}

type Box = [[number, number, number], [number, number, number]]
const DEG = Math.PI / 180

/**
 * A shot that fits a box into the room: looking at its middle from `azim`, `elev`, as far away as it
 * takes for it to fill `fill` of the room's width or height (whichever binds), the room's middle on it.
 */
export function fit(box: Box, azim: number, elev: number, room: BuildRoom, aspect: number, fill: number): Shot {
  const [a, b] = box
  const c = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  const A = azim * DEG
  const E = elev * DEG
  const back = new THREE.Vector3(Math.cos(E) * Math.sin(A), Math.sin(E), Math.cos(E) * Math.cos(A))
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize()
  const up = back.clone().cross(right)
  let w = 0
  let h = 0
  let d = 0
  const p = new THREE.Vector3()
  for (const x of [a[0], b[0]])
    for (const y of [a[1], b[1]])
      for (const z of [a[2], b[2]]) {
        p.set(x, y, z).sub(c)
        w = Math.max(w, Math.abs(p.dot(right)))
        h = Math.max(h, Math.abs(p.dot(up)))
        d = Math.max(d, Math.abs(p.dot(back)))
      }
  const t = Math.tan(13 * DEG)
  const dist = Math.max(h / (t * room.h * fill), w / (t * aspect * room.w * fill)) + d
  return { target: [c.x, c.y, c.z], dist, azim, elev, frame: [room.x + room.w / 2, room.y + room.h / 2] }
}

/** what each step frames: its box, its view, and how much of the room it may fill */
const VIEWS: { box: Box; azim: number; elev: number; fill: number }[] = [
  { box: [[BX[0], 0, NEAR_Z], [NEAR_X, 0.13, BZ[1]]], azim: 28, elev: 18, fill: 0.62 },
  { box: [[BX[0], 0, NEAR_Z], [NEAR_X, 0.13, BZ[1]]], azim: 30, elev: 36, fill: 0.62 },
  { box: [[BX[0], 0, NEAR_Z], [NEAR_X, 0.14, BZ[1]]], azim: 24, elev: 15, fill: 0.62 },
  { box: [[PUMP[0] - 1.4, 0, PUMP[2] - 0.55], [BX[1] + 0.05, 2.1, BZ[1]]], azim: 32, elev: 22, fill: 0.82 },
  { box: [[BX[0], 0, BZ[0] - 0.4], [BX[1], 0.7, BZ[1]]], azim: 32, elev: 25, fill: 0.8 },
  { box: [[BX[0], 0, BZ[0]], [BX[1], 0.15, BZ[1]]], azim: 30, elev: 25, fill: 0.64 },
]
/** the trowel's step as it was first framed: the trowel keeps the size on screen it had then, however close the floor is */
const TROWEL_SIZE: (typeof VIEWS)[number] = { box: [[BX[0], 0, BZ[0] - 0.75], [BX[1], 0.95, BZ[1]]], azim: 32, elev: 25, fill: 0.66 }

/** a plane keeping what is on one side of z = c: `keep` 'front' keeps z ≥ c, 'back' keeps z ≤ c */
function setCutZ(p: THREE.Plane, keep: 'front' | 'back', c: number) {
  if (keep === 'back') p.set(new THREE.Vector3(0, 0, -1), c)
  else p.set(new THREE.Vector3(0, 0, 1), -c)
}
/** a plane keeping x ≥ c */
function setCutX(p: THREE.Plane, c: number) {
  p.set(new THREE.Vector3(1, 0, 0), -c)
}
/** a sweep across the piece, back to front, as `e` goes 0..1 */
const backToFront = (e: number) => BZ[0] - 0.02 + (BZ[1] - BZ[0] + 0.04) * e

/** the level line over the slab, dashed, so the planks' undulations read under it */
function levelLines() {
  const L = new Lines()
  for (let x = BX[0]; x < NEAR_X; x += 0.03) L.seg([x, 0.1225, BZ[1] + 0.002], [Math.min(NEAR_X, x + 0.016), 0.1225, BZ[1] + 0.002])
  return L
}

/** the hose from the pump's outlet down to the floor, along it, up over the piece's back edge to the nozzle */
function hoseGeometry() {
  const o = new THREE.Vector3(PUMP[0] + 1.05, 0.52, PUMP[2])
  const c = new THREE.CatmullRomCurve3([
    o,
    new THREE.Vector3(o.x + 0.2, 0.2, o.z + 0.1),
    new THREE.Vector3(o.x + 0.3, 0.03, o.z + 0.5),
    new THREE.Vector3(1.0, 0.03, BZ[0] - 0.5),
    new THREE.Vector3(0.8, 0.12, BZ[0] - 0.12),
    new THREE.Vector3(0.7, 0.26, BZ[0] + 0.06),
    new THREE.Vector3(0.66, 0.2, BZ[0] + 0.18),
  ])
  return new THREE.TubeGeometry(c, 110, 0.022, 12, false)
}

export function BuildScene({ t, bus, compact, room }: { t: Progress; bus: LabelBus; compact: boolean; room: { current: BuildRoom } }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  const m = useMemo(() => {
    const k = floorKit()
    return {
      ...k,
      // the poured screed: wet, then set, then trowelled; the polish the trowel leaves
      pour: k.screed.clone(),
      polish: new THREE.MeshStandardMaterial({ color: '#b7b3aa', roughness: 0.3, transparent: true }),
      epoxy: k.esd.clone(),
      cap: k.plank.clone(),
    }
  }, [])
  const set = useMemo(() => ({ wet: m.wet.color.clone(), dry: m.screed.color.clone() }), [m])

  // the cuts: the close-ups' section box; the primer, coating and polish as they are rolled on; the pours' fronts
  const cut = useMemo(
    () => ({
      boxX: new THREE.Plane(new THREE.Vector3(-1, 0, 0), NEAR_X),
      boxZ: new THREE.Plane(new THREE.Vector3(0, 0, 1), -NEAR_Z),
      // RTARIUM is kept only ahead of the pour, so none of it shows through the concrete that covers it
      covered: new THREE.Plane(new THREE.Vector3(0, 0, 1), 10),
      primer: new THREE.Plane(),
      cond: new THREE.Plane(),
      polish: new THREE.Plane(),
      // a pour is kept to the piece: behind its front edge and in front of its back edge
      front: new THREE.Plane(new THREE.Vector3(0, 0, -1), BZ[1]),
      back: new THREE.Plane(new THREE.Vector3(0, 0, 1), -BZ[0]),
    }),
    [],
  )
  useEffect(() => {
    const box = [cut.boxX, cut.boxZ]
    m.plank.clippingPlanes = box
    m.grout.clippingPlanes = box
    m.button.clippingPlanes = box
    m.cap.clippingPlanes = [cut.boxZ]
    m.primer.clippingPlanes = [cut.primer, ...box]
    m.primer.polygonOffset = true
    m.primer.polygonOffsetFactor = -1
    m.primer.polygonOffsetUnits = -4
    m.primer.opacity = 0.72
    m.primer.color.set('#5e5a53')
    m.primer.roughness = 0.22
    m.conductive.clippingPlanes = [cut.cond]
    m.polish.clippingPlanes = [cut.polish]
    m.pour.clippingPlanes = [cut.front, cut.back]
    m.epoxy.clippingPlanes = [cut.front, cut.back]
  }, [m, cut])

  const g = useMemo(() => {
    const hc = hollowCore(CENTRES, BX, BZ, LIE)
    const spots: [number, number][] = []
    for (let x = BX[0] + 0.075; x < BX[1]; x += 0.15) for (let z = BZ[0] + 0.075; z < BZ[1]; z += 0.15) spots.push([x, z])
    // the buttons in the close-up are set one after another from its corner; the rest, out of sight, together
    const inBox = (x: number, z: number) => x < NEAR_X && z > NEAR_Z
    const near = spots.filter(([x, z]) => inBox(x, z)).sort((a, b) => Math.hypot(a[0] - BX[0], a[1] - BZ[1]) - Math.hypot(b[0] - BX[0], b[1] - BZ[1]))
    const slabTop = (x: number, z: number) => {
      const i = x < 0 ? 0 : x < 1.2 ? 1 : 2
      const u = (z - BZ[0]) / (BZ[1] - BZ[0])
      return PLANK.t + LIE.lift[i] * (0.6 + 0.4 * Math.sin(Math.PI * u)) + LIE.wave * Math.sin(u * Math.PI * 2 + i * 1.7)
    }
    return {
      ...hc,
      tops: plankTops(CENTRES, BX, BZ, LIE),
      spots: spots.map(([x, z]) => {
        const k = near.findIndex((s) => s[0] === x && s[1] === z)
        return { at: [x, slabTop(x, z), z] as [number, number, number], rank: k < 0 ? 1 : k / Math.max(1, near.length) }
      }),
      button: buttonGeometry(),
      done: layer(BX, BZ, PLANK.t + 0.002, TOP - PLANK.t - 0.002, 2),
      pour: pourGeometry(BX, BZ[1] - BZ[0] + 0.2, TOP - PLANK.t - 0.002, 0.7),
      polish: layer(BX, BZ, TOP, 0.0004, 2),
      cond: layer(BX, BZ, TOP, COND, 2),
      esd: layer(BX, BZ, TOP + COND, EPOXY - COND, 2),
      epoxy: pourGeometry(BX, BZ[1] - BZ[0] + 0.2, EPOXY - COND, 2.1, 0.03),
      hose: hoseGeometry(),
      catcher: new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
      // the cap on the cut along the planks, one for each plank it may fall in, lying as the plank does
      caps: CENTRES.map((_, i) => {
        const c = new THREE.PlaneGeometry(BZ[1] - BZ[0], PLANK.t, 18, 1).rotateY(Math.PI / 2).translate(0, PLANK.t / 2, (BZ[0] + BZ[1]) / 2)
        bend(c, LIE.lift[i] ?? 0, LIE.wave, i, BZ[0], BZ[1])
        return uvBox(c, 2.2)
      }),
    }
  }, [])
  useEffect(
    () => () => {
      for (const x of Object.values(g)) if (x instanceof THREE.BufferGeometry) x.dispose()
      g.caps.forEach((c) => c.dispose())
      for (const x of [m.pour, m.polish, m.epoxy, m.cap]) x.dispose()
      disposeFloorKit(m)
    },
    [g, m],
  )

  // the drawings: the pump, the trowel and its blades, the level line
  const mats = useMemo(() => {
    // the trowel always stands on the floor, so it is drawn over it: never hidden by it
    const tool = ink(1.1)
    tool.depthTest = false
    return { kit: ink(1.1), tool, level: ink(1.4) }
  }, [])
  useInkResolution(useMemo(() => Object.values(mats), [mats]))
  const lines = useMemo(() => {
    const P = new Lines()
    pump(P)
    const T = new Lines()
    trowel(T)
    const B = new Lines()
    blades(B)
    return { pump: sortFrom(P, [0, 0, 0]), trowel: T, blades: B, level: levelLines() }
  }, [])
  const pumpD = useDrawing(lines.pump, mats.kit)
  const trowelD = useDrawing(lines.trowel, mats.tool)
  const bladesD = useDrawing(lines.blades, mats.tool)
  const level = useDrawing(lines.level, mats.level)

  const buttons = useRef<THREE.InstancedMesh>(null)
  const meshGroup = useRef<THREE.Group>(null)
  const pourMesh = useRef<THREE.Mesh>(null)
  const doneMesh = useRef<THREE.Mesh>(null)
  const epoxyMesh = useRef<THREE.Mesh>(null)
  const esdMesh = useRef<THREE.Mesh>(null)
  const condMesh = useRef<THREE.Mesh>(null)
  const primerMesh = useRef<THREE.Mesh>(null)
  const polishMesh = useRef<THREE.Mesh>(null)
  const hose = useRef<THREE.Mesh>(null)
  const pumpGroup = useRef<THREE.Group>(null)
  const trowelGroup = useRef<THREE.Group>(null)
  const bladeGroup = useRef<THREE.Group>(null)
  const cap = useRef<THREE.Mesh>(null)
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

  useFrame(() => {
    const v = Math.min(N_STEPS - 1e-4, Math.max(0, t.value))
    const k = Math.floor(v)
    const f = v - k
    // the camera: each step's fitted shot, moving on only in the gap before the next
    const aspect = size.width / Math.max(1, size.height)
    const r = compact ? { x: 0.04, y: 0.13, w: 0.92, h: 0.36 } : room.current
    const shotOf = (i: number) => fit(VIEWS[i].box, VIEWS[i].azim, VIEWS[i].elev, r, aspect, VIEWS[i].fill)
    const shot = k < N_STEPS - 1 ? mixShot(shotOf(k), shotOf(k + 1), smooth(0.8, 1, f)) : shotOf(k)
    const A = (shot.azim * Math.PI) / 180
    const E = (shot.elev * Math.PI) / 180
    const [tx, ty, tz] = shot.target
    camera.fov = 26
    // a near plane in proportion to the distance keeps the millimetre layers from fighting at any size
    camera.near = Math.max(0.005, shot.dist * 0.02)
    camera.far = shot.dist * 8 + 20
    camera.position.set(tx + shot.dist * Math.cos(E) * Math.sin(A), ty + shot.dist * Math.sin(E), tz + shot.dist * Math.cos(E) * Math.cos(A))
    camera.lookAt(tx, ty, tz)
    const fr = shot.frame ?? [0.5, 0.5]
    camera.setViewOffset(size.width, size.height, -(fr[0] - 0.5) * size.width, -(fr[1] - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()

    // the section box opens once the camera is back out for the pour: the floor and RTARIUM grow out together
    const shut = 1 - smooth(3.02, 3.26, v)
    const bx = NEAR_X + (BX[1] + 0.01 - NEAR_X) * (1 - shut)
    cut.boxX.constant = bx
    cut.boxZ.constant = -(NEAR_Z + (BZ[0] - 0.01 - NEAR_Z) * (1 - shut))
    if (cap.current) {
      const i = bx < 0 ? 0 : bx < 1.2 ? 1 : 2
      cap.current.visible = shut > 0.002
      cap.current.position.x = bx
      if (cap.current.geometry !== g.caps[i]) cap.current.geometry = g.caps[i]
    }
    // RTARIUM's own material is made inside it: given the box once it is there
    if (!yarnClipped.current && meshGroup.current) {
      meshGroup.current.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.Material | undefined
        if (mm && (o as THREE.Mesh).isMesh) {
          mm.clippingPlanes = [cut.boxX, cut.boxZ, cut.covered]
          yarnClipped.current = true
        }
      })
    }

    // 0. the bare slab: the level line over its undulations
    level.show(smooth(0.12, 0.4, v) * (1 - smooth(0.84, 0.92, v)))
    // 1. the primer rolled on, right to left; the buttons set one after another from the corner
    const onPrimer = smooth(1.08, 1.36, v)
    if (primerMesh.current) {
      primerMesh.current.visible = v >= 1.08
      setCutX(cut.primer, NEAR_X + 0.02 - (NEAR_X - BX[0] + 0.04) * onPrimer)
    }
    const onButtons = smooth(1.38, 1.78, v)
    const bm = buttons.current
    if (bm) {
      g.spots.forEach(({ at: [x, y, z], rank }, i) => {
        const s = smooth(rank - 0.04, rank + 0.14, onButtons * 1.04)
        one.setScalar(Math.max(0.0001, s))
        at.set(x, y + (1 - s) * 0.02, z)
        bm.setMatrixAt(i, mtx.compose(at, q, one))
      })
      bm.instanceMatrix.needsUpdate = true
      bm.visible = v >= 1.38
    }
    // 3. the pump drawn, the hose, the pour from the back edge to the front; then the clean layer it leaves
    const pumpOn = smooth(3.24, 3.36, v) * (1 - smooth(3.88, 3.96, v))
    pumpD.show(pumpOn)
    if (pumpGroup.current) pumpGroup.current.visible = pumpOn > 0.001
    if (hose.current) hose.current.visible = v > 3.32 && v < 3.92
    const pourE = smooth(3.4, 3.88, v)
    const poured = pourE > 0.985
    const front = BZ[0] - 0.04 + (BZ[1] - BZ[0] + 0.1) * pourE
    if (pourMesh.current) {
      pourMesh.current.visible = v >= 3.4 && !poured
      pourMesh.current.position.z = front
    }
    // 2. RTARIUM lowered onto the stems; covered by the pour as it comes, and gone under it once poured
    const lower = smooth(2.12, 2.55, v)
    if (meshGroup.current) {
      meshGroup.current.visible = v >= 2.12 && !poured
      meshGroup.current.position.y = MESH_Y + (1 - lower) * 0.22
    }
    cut.covered.constant = v >= 3.4 ? -(front - 0.045) : 10
    if (doneMesh.current) doneMesh.current.visible = poured
    // 4. the screed sets; the trowel works it back to front, polished behind it
    const dry = smooth(4.0, 4.16, v)
    m.pour.color.copy(set.wet).lerp(set.dry, dry)
    m.pour.roughness = 0.12 + 0.66 * dry
    const pass = smooth(4.18, 4.8, v)
    const trowelOn = v > 4.1 && v < 4.88
    const tz0 = BZ[0] + 0.3 + (BZ[1] - BZ[0] - 0.6) * pass
    const tx0 = MID + (BX[1] - BX[0] - 0.7) * 0.5 * Math.sin(pass * Math.PI * 3)
    if (polishMesh.current) {
      polishMesh.current.visible = v >= 4.18 && v < 5.34
      setCutZ(cut.polish, 'back', pass >= 0.999 ? BZ[1] + 0.05 : tz0 - 0.05)
    }
    trowelD.show(trowelOn ? 1 : 0)
    bladesD.show(trowelOn ? 1 : 0)
    if (trowelGroup.current) {
      trowelGroup.current.visible = trowelOn
      trowelGroup.current.position.set(tx0, TOP, tz0)
      // closer to the floor than first framed, the trowel is made smaller by as much: its size on screen stays
      trowelGroup.current.scale.setScalar(shotOf(4).dist / fit(TROWEL_SIZE.box, TROWEL_SIZE.azim, TROWEL_SIZE.elev, r, aspect, TROWEL_SIZE.fill).dist)
    }
    if (bladeGroup.current) bladeGroup.current.rotation.y = pass * 60
    // 5. the conductive primer rolled on back to front, the epoxy run over it; then its clean layer
    const onCond = smooth(5.08, 5.34, v)
    if (condMesh.current) {
      condMesh.current.visible = v >= 5.08
      setCutZ(cut.cond, 'back', backToFront(onCond))
    }
    const onEpoxy = smooth(5.4, 5.86, v)
    const coated = onEpoxy > 0.985
    if (epoxyMesh.current) {
      epoxyMesh.current.visible = v >= 5.4 && !coated
      epoxyMesh.current.position.z = BZ[0] - 0.04 + (BZ[1] - BZ[0] + 0.1) * onEpoxy
    }
    if (esdMesh.current) esdMesh.current.visible = coated
  }, -1)

  const nx = Math.floor((BX[1] - BX[0] - 0.02) / (PITCH * SHOW))
  const nz = Math.floor((BZ[1] - BZ[0] - 0.02) / (PITCH * SHOW))
  return (
    <group>
      <mesh geometry={g.planks} material={m.plank} castShadow receiveShadow />
      <mesh geometry={g.grout} material={m.grout} receiveShadow />
      <mesh ref={cap} geometry={g.caps[1]} material={m.cap} visible={false} />
      <mesh ref={primerMesh} geometry={g.tops} material={m.primer} renderOrder={1} visible={false} />
      <instancedMesh ref={buttons} args={[g.button, m.button, g.spots.length]} castShadow visible={false} />
      <group ref={meshGroup} position={[MID, MESH_Y, (BZ[0] + BZ[1]) / 2]} visible={false}>
        <group rotation={[-Math.PI / 2, 0, 0]} scale={[SHOW, SHOW, 1]}>
          <Suspense fallback={null}>
            <MeshInset nx={nx} ny={nz} lod={4} />
          </Suspense>
        </group>
      </group>
      <mesh ref={pourMesh} geometry={g.pour} material={m.pour} position={[0, PLANK.t + 0.002, 0]} visible={false} castShadow receiveShadow />
      <mesh ref={doneMesh} geometry={g.done} material={m.pour} visible={false} castShadow receiveShadow />
      <mesh ref={polishMesh} geometry={g.polish} material={m.polish} visible={false} receiveShadow />
      <mesh ref={condMesh} geometry={g.cond} material={m.conductive} visible={false} receiveShadow />
      <mesh ref={epoxyMesh} geometry={g.epoxy} material={m.epoxy} position={[0, TOP + COND, 0]} visible={false} receiveShadow />
      <mesh ref={esdMesh} geometry={g.esd} material={m.esd} visible={false} receiveShadow />
      <primitive object={level.obj} />
      <group ref={pumpGroup} position={PUMP} visible={false}>
        <primitive object={pumpD.obj} />
      </group>
      <mesh ref={hose} geometry={g.hose} material={m.rubber} visible={false} castShadow />
      {/* the handle trails behind the trowel, back and to the right, as it works towards the front */}
      <group ref={trowelGroup} visible={false}>
        <group rotation={[0, (-3 * Math.PI) / 4, 0]}>
          <primitive object={trowelD.obj} />
          <Anchor bus={bus} id="bd-trowel" position={[-0.78, 0.9, 0]} />
        </group>
        <group ref={bladeGroup}>
          <primitive object={bladesD.obj} />
        </group>
      </group>
      <mesh geometry={g.catcher} material={m.catcher} position={[0, -0.002, 0]} receiveShadow />

      <Anchor bus={bus} id="bd-joint" position={[0, PLANK.t - 0.004, BZ[1]]} />
      <Anchor bus={bus} id="bd-wave" position={[0.14, 0.1225, BZ[1]]} />
      <Anchor bus={bus} id="bd-primer" position={[0.12, PLANK.t, 0.22]} />
      <Anchor bus={bus} id="bd-button" position={[BX[0] + 0.075, PLANK.t + 0.011, BZ[1] - 0.075]} />
      <Anchor bus={bus} id="bd-mesh" position={[BX[0] + 0.12, MESH_Y + 0.005, BZ[1] - 0.01]} />
      <Anchor bus={bus} id="bd-gap" position={[BX[0] + 0.03, PLANK.t + 0.0025, BZ[1]]} />
      <Anchor bus={bus} id="bd-pump" position={[PUMP[0] - 0.7, 1.62, PUMP[2] + 0.2]} />
      <Anchor bus={bus} id="bd-flow" position={[0.3, TOP, 0.1]} />
      <Anchor bus={bus} id="bd-cond" position={[1.35, TOP + COND, 0.45]} />
      <Anchor bus={bus} id="bd-epoxy" position={[0.2, TOP + EPOXY, -0.2]} />
    </group>
  )
}
