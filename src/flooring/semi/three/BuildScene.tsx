import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../../../facade/three/MeshInset'
import { Anchor } from '../../../facade/three/Stage3D'
import type { LabelBus } from '../../../facade/three/kit'
import { smooth, type Progress } from '../../../facade/progress'
import { block, merge } from '../../../facade/three/unit/parts'
import type { BuildRoom } from '../../data/three/BuildScene'
import { buttonGeometry, layer, Lines, PITCH, pourGeometry, SHOW, sortFrom, split, uvBox } from '../../data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../data/three/draw'
import { aim, PHONE_ROOM, shotAt, type View } from './camera'
import { circle, disposeKit, fabKit, grinder, grinderHeads, laserUnit, LAY, MESH_Y, mixerPump, oldTopping, OLD_TOP, PX, PZ, SLAB, TOP, waffle } from './fab'

/**
 * How yield is kept (Semiconductor Plant), on yellow, in the Data & AI Centres build's stage: the
 * client's scenes 3 to 8 on the very floor the problem ended on, kept at one size from the first step
 * to the last; only for the pour does the camera stand back to show the mixer-pump behind it, as the
 * Data & AI Centres build does. Only the floor is in its own materials; the machines are drawings.
 *
 *   0  diamond ground    the old topping clears; a planetary grinder takes the deck to a CSP-4 profile
 *   1  sealed, set out   the epoxy vapour barrier rolled on; a laser projects a level grid over the
 *                        slab, and the height buttons rise to it, from the laser out
 *   2  RTARIUM           the 10 mm mesh lowered onto the buttons; beside the floor a lens draws its
 *                        section as a blueprint: 5 mm under, 10 mm of mesh, 5 mm over to the finish
 *   3  the pour          the enclosed continuous mixer-pump behind the floor; the graphene self-levelling
 *                        concrete runs from the back edge to the front, over the mesh
 *   4  pore-refined      it sets; a lens beside it shows the paste inside: graphene platelets settling
 *                        into the capillaries, which close
 *   5  ground flat       one jointless plate; the grinder takes it ultra-flat, back to front
 *   6  ESD armour        the conductive primer rolled on, the copper grounding grid laid, the high-gloss
 *                        ESD top coat run over it, stopping short at the front left corner so the primer
 *                        and the grid under it stay in view
 *
 * `t` is the run as steps (step k over k..k+1). The mesh is drawn at 2.5 times its pitch (the Data &
 * AI Centres rule), the height buttons twice their width, so both read at the floor's size.
 */

type V = [number, number, number]
const MID = (PX[0] + PX[1]) / 2
/** the enclosed mixer-pump stands on the slab behind the piece */
const PUMP: V = [-0.9, SLAB, -2.35]
/** the laser on the slab at the floor's back left corner, its window's height */
const LASER: V = [PX[0] + 0.12, SLAB, PZ[0] + 0.12]
const LASER_Y = 0.08
/** the height buttons' grid, 300 mm, and its level (their heads) */
const GRID = 0.3
const GRID_Y = SLAB + LAY.barrier + 0.0105
/**
 * the lenses, both in one place: clear of the floor's right end, along the screen from it (the floor's
 * view looks from 30° round), inside the room; their middle and size, and where each looks in. A phone
 * has no room beside the floor: there the words carry it, and the lenses are left out
 */
const LENS = { c: [PX[1] + 1.07, SLAB + 0.3, PZ[1] - 0.62] as V, r: 0.8 }
const LOOK = { mesh: [1.0, MESH_Y, PZ[1]] as V, pores: [1.05, SLAB + 0.011, PZ[1]] as V }
const N_STEPS = 7
/** where the top coat stops at the front left corner (x, z) */
const CORNER: [number, number] = [-0.52, 0.24]

/** the floor's one view, with room over it for the grinder; and the pour's, standing back for the pump */
const FLOOR_VIEW: View = { box: [[PX[0], 0, PZ[0]], [PX[1], SLAB + 0.95, PZ[1]]], azim: 30, elev: 25, fill: 0.64 }
const POUR_VIEW: View = { box: [[PUMP[0] - 1.1, 0, PUMP[2] - 0.5], [PX[1] + 0.05, SLAB + 2.55, PZ[1]]], azim: 32, elev: 22, fill: 0.8 }
const VIEWS: View[] = [FLOOR_VIEW, FLOOR_VIEW, FLOOR_VIEW, POUR_VIEW, FLOOR_VIEW, FLOOR_VIEW, FLOOR_VIEW]

/** keeps z ≤ c */
const keepBack = (p: THREE.Plane, c: number) => p.set(new THREE.Vector3(0, 0, -1), c)
/** keeps x ≥ c */
const keepRight = (p: THREE.Plane, c: number) => p.set(new THREE.Vector3(1, 0, 0), -c)
/** keeps x ≤ c */
const keepLeft = (p: THREE.Plane, c: number) => p.set(new THREE.Vector3(-1, 0, 0), c)
/** a sweep across the piece, back to front, as `e` goes 0..1 */
const backToFront = (e: number) => PZ[0] - 0.02 + (PZ[1] - PZ[0] + 0.04) * e

/** the hose from the pump's outlet down onto the slab, along it, up over the piece's back edge */
function hoseGeometry() {
  const o = new THREE.Vector3(PUMP[0] + 1.06, PUMP[1] + 0.36, PUMP[2])
  const c = new THREE.CatmullRomCurve3([
    o,
    new THREE.Vector3(o.x + 0.2, SLAB + 0.12, o.z + 0.12),
    new THREE.Vector3(o.x + 0.3, SLAB + 0.03, o.z + 0.55),
    new THREE.Vector3(0.9, SLAB + 0.03, PZ[0] - 0.5),
    new THREE.Vector3(0.75, SLAB + 0.1, PZ[0] - 0.12),
    new THREE.Vector3(0.66, SLAB + 0.22, PZ[0] + 0.06),
    new THREE.Vector3(0.62, SLAB + 0.16, PZ[0] + 0.18),
  ])
  return new THREE.TubeGeometry(c, 110, 0.022, 12, false)
}

/** a seeded random, so the lenses draw the same every time */
function seeded(s: number) {
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** the paste in the pore lens, in its own units (radius 1): its grains, its capillaries, the graphene that closes them */
function poreLines() {
  const rnd = seeded(17)
  const grains = new Lines()
  const placed: [number, number, number][] = []
  for (let i = 0; i < 400 && placed.length < 34; i++) {
    const r = 0.06 + rnd() * 0.11
    const x = (rnd() * 2 - 1) * 0.92
    const y = (rnd() * 2 - 1) * 0.92
    if (Math.hypot(x, y) + r > 0.95) continue
    if (placed.some(([a, b, c]) => Math.hypot(a - x, b - y) < c + r + 0.05)) continue
    placed.push([x, y, r])
    circle(grains, [x, y, 0], r, 'z', 18)
  }
  // the capillaries: paths up through the paste, around the grains; a graphene platelet lodged every few steps
  const pores = new Lines()
  const flakes = new Lines()
  for (let k = 0; k < 6; k++) {
    let x = -0.72 + k * 0.29 + (rnd() - 0.5) * 0.08
    let y = -Math.sqrt(Math.max(0, 1 - x * x)) + 0.06
    let prev: number[] = [x, y, 0.002]
    let n = 0
    while (y < 0.94 && Math.hypot(x, y) < 0.96) {
      y += 0.07
      x += Math.sin(y * 5 + k * 1.7) * 0.05
      for (const [a, b, c] of placed) {
        const d = Math.hypot(x - a, y - b)
        if (d < c + 0.025) x += ((x - a) / Math.max(1e-3, d)) * (c + 0.025 - d)
      }
      if (Math.hypot(x, y) > 0.96) break
      const p = [x, y, 0.002]
      pores.seg(prev, p)
      if (n++ % 3 === 1) {
        const R = 0.035
        const a0 = rnd() * Math.PI
        for (let e = 0; e < 6; e++) {
          const a = a0 + (e / 6) * Math.PI * 2
          const b = a0 + ((e + 1) / 6) * Math.PI * 2
          flakes.seg([x + R * Math.cos(a), y + R * Math.sin(a), 0.004], [x + R * Math.cos(b), y + R * Math.sin(b), 0.004])
        }
      }
      prev = p
    }
  }
  return { grains, pores: sortFrom(pores, [0, -1, 0]), flakes: sortFrom(flakes, [0, -1, 0]) }
}

/**
 * The blueprint in the mesh lens, in its own units (radius 1): 20 mm drawn 0.9 high, so a millimetre is
 * 0.045. The slab and its hatching; two height buttons (disc, stem, T-head); RTARIUM between its two
 * faces, 5 mm off the slab, its pile between them; the finish level dashed at 20 mm; the dimension line
 * with its ticks at 0, 5, 15 and 20 mm. `BP` holds the levels, so the labels can point at them.
 */
export const BP = { slab: -0.45, mesh0: -0.225, mesh1: 0.225, finish: 0.45, dimX: 0.05 }
function blueprintLines() {
  const L = new Lines()
  const mesh = new Lines()
  const { slab, mesh0, mesh1, finish, dimX } = BP
  const span = (y: number) => Math.sqrt(Math.max(0, 0.92 * 0.92 - y * y))
  // the slab, hatched under its top
  L.seg([-span(slab), slab, 0.003], [dimX - 0.06, slab, 0.003])
  for (let x = -0.95; x < dimX; x += 0.11) {
    const a: [number, number] = [x, slab]
    const b: [number, number] = [x - 0.3, slab - 0.3]
    if (Math.hypot(b[0], b[1]) > 0.92 || Math.hypot(a[0], a[1]) > 0.92) continue
    L.seg([a[0], a[1], 0.003], [b[0], b[1], 0.003])
  }
  // two height buttons: disc, stem, the T-head inside RTARIUM's lower face
  for (const bx of [-0.52, -0.08]) {
    L.rectZ(bx - 0.16, slab, bx + 0.16, slab + 0.035, 0.003)
    L.seg([bx - 0.025, slab + 0.035, 0.003], [bx - 0.025, -0.01, 0.003])
    L.seg([bx + 0.025, slab + 0.035, 0.003], [bx + 0.025, -0.01, 0.003])
    L.rectZ(bx - 0.15, -0.01, bx + 0.15, 0.035, 0.003)
  }
  // RTARIUM: its two faces, the rovings' bumps along them, the pile between them
  const x0 = -span(mesh1) + 0.04
  const x1 = dimX - 0.08
  for (const [y, ph] of [
    [mesh0, 0],
    [mesh1, Math.PI],
  ] as [number, number][]) {
    let prev: number[] | null = null
    for (let x = x0; x <= x1 + 1e-6; x += 0.02) {
      const p = [x, y + 0.025 * Math.sin(x * 26 + ph), 0.004]
      if (prev) mesh.seg(prev, p)
      prev = p
    }
  }
  for (let x = x0; x + 0.06 <= x1; x += 0.06) mesh.seg([x, mesh0, 0.004], [x + 0.06, mesh1, 0.004])
  for (let x = x0 + 0.06; x <= x1; x += 0.06) mesh.seg([x, mesh0, 0.004], [x - 0.06, mesh1, 0.004])
  // the finish level, dashed
  for (let x = -span(finish); x < x1; x += 0.07) L.seg([x, finish, 0.003], [Math.min(x1, x + 0.04), finish, 0.003])
  // the dimension line and its ticks
  L.seg([dimX, slab, 0.003], [dimX, finish, 0.003])
  for (const y of [slab, mesh0, mesh1, finish]) L.seg([dimX - 0.05, y, 0.003], [dimX + 0.05, y, 0.003])
  return { ink: L, mesh }
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
    const k = fabKit()
    return {
      ...k,
      pour: k.slcWet.clone(),
      polish: new THREE.MeshStandardMaterial({ color: '#b9bab5', roughness: 0.28, transparent: true }),
      coatRun: k.coat.clone(),
      coatRunL: k.coat.clone(),
      lens: new THREE.MeshBasicMaterial({ color: '#171716', transparent: true, toneMapped: false }),
    }
  }, [])
  const set = useMemo(() => ({ wet: m.slcWet.color.clone(), dry: m.slc.color.clone() }), [m])

  const cut = useMemo(
    () => ({
      ground: new THREE.Plane(),
      barrier: new THREE.Plane(),
      // RTARIUM is kept only ahead of the pour, so none of it shows through the concrete that covers it
      covered: new THREE.Plane(new THREE.Vector3(0, 0, 1), 10),
      polish: new THREE.Plane(),
      cond: new THREE.Plane(),
      tape: new THREE.Plane(),
      front: new THREE.Plane(new THREE.Vector3(0, 0, -1), PZ[1]),
      corner: new THREE.Plane(new THREE.Vector3(0, 0, -1), CORNER[1]),
      back: new THREE.Plane(new THREE.Vector3(0, 0, 1), -PZ[0]),
    }),
    [],
  )
  useEffect(() => {
    m.ground.clippingPlanes = [cut.ground]
    m.barrier.clippingPlanes = [cut.barrier]
    m.barrier.polygonOffset = true
    m.barrier.polygonOffsetFactor = -1
    m.barrier.polygonOffsetUnits = -4
    m.ground.polygonOffset = true
    m.ground.polygonOffsetFactor = -1
    m.ground.polygonOffsetUnits = -2
    m.polish.clippingPlanes = [cut.polish]
    m.conductive.clippingPlanes = [cut.cond]
    m.copper.clippingPlanes = [cut.tape]
    m.pour.clippingPlanes = [cut.front, cut.back]
    m.coatRun.clippingPlanes = [cut.front, cut.back]
    m.coatRunL.clippingPlanes = [cut.corner, cut.back]
  }, [m, cut])

  const g = useMemo(() => {
    const w = waffle(PX, PZ)
    // the height buttons, set one after another from the laser out
    const spots: [number, number][] = []
    for (let x = PX[0] + GRID / 2; x < PX[1]; x += GRID) for (let z = PZ[0] + GRID / 2; z < PZ[1]; z += GRID) spots.push([x, z])
    const far = Math.max(...spots.map(([x, z]) => Math.hypot(x - LASER[0], z - LASER[2])))
    const y = TOP + LAY.cond
    const TW = 0.025
    return {
      ...w,
      old: oldTopping(PX, PZ),
      ground: layer(PX, PZ, SLAB, 0.0004, 2.6),
      barrier: layer(PX, PZ, SLAB, LAY.barrier, 2),
      spots: spots.map(([x, z]) => ({ at: [x, SLAB + LAY.barrier, z] as V, rank: Math.hypot(x - LASER[0], z - LASER[2]) / far })),
      button: buttonGeometry(),
      pour: pourGeometry(PX, PZ[1] - PZ[0] + 0.2, LAY.slc - LAY.barrier, 1.3),
      done: layer(PX, PZ, SLAB + LAY.barrier, LAY.slc - LAY.barrier, 2),
      polish: layer(PX, PZ, TOP, 0.0004, 2),
      cond: layer(PX, PZ, TOP, LAY.cond, 2),
      tape: merge([
        ...[-0.6, 0, 0.6].map((x) => block([x - TW / 2, y, PZ[0]], [x + TW / 2, y + LAY.tape, PZ[1]])),
        ...[-0.3, 0.3].map((z) => block([PX[0], y, z - TW / 2], [PX[1], y + LAY.tape, z + TW / 2])),
      ]),
      coat: uvBox(merge([block([PX[0], y, PZ[0]], [PX[1], y + LAY.coat, CORNER[1]]), block([CORNER[0], y, CORNER[1]], [PX[1], y + LAY.coat, PZ[1]])]), 2),
      // the coat's run in two, either side of the corner it stops short of: one front, as it is one pour
      coatRun: pourGeometry([CORNER[0], PX[1]], PZ[1] - PZ[0] + 0.2, LAY.coat, 2.4, 0.03),
      coatRunL: pourGeometry([PX[0], CORNER[0]], PZ[1] - PZ[0] + 0.2, LAY.coat, 2.4, 0.03),
      hose: hoseGeometry(),
      lens: new THREE.CircleGeometry(1, 72),
      catcher: new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
    }
  }, [])
  useEffect(
    () => () => {
      for (const x of Object.values(g)) if (x instanceof THREE.BufferGeometry) x.dispose()
      for (const x of [m.pour, m.polish, m.coatRun, m.coatRunL, m.lens]) x.dispose()
      disposeKit(m)
    },
    [g, m],
  )

  // the drawings: the machines and the laser's grid in ink; the lenses, light on dark
  const mats = useMemo(() => {
    // the grinder always stands on the floor, so it is drawn over it: never hidden by it
    const tool = ink(1.1)
    tool.depthTest = false
    return {
      kit: ink(1.1),
      tool,
      grid: ink(0.9, '#080808', 0.55),
      rim: ink(2),
      leader: ink(1.2),
      bp: ink(1.3, '#f2f0e9', 0.92),
      bpMesh: ink(1.6, '#fdd001', 1),
      grains: ink(1, '#9c978d', 0.9),
      pores: ink(2.2, '#cfe3f5', 1),
      flakes: ink(1.6, '#fdd001', 1),
    }
  }, [])
  useInkResolution(useMemo(() => Object.values(mats), [mats]))

  const lines = useMemo(() => {
    const P = new Lines()
    mixerPump(P)
    // the slab the pump stands on, drawn on beyond the piece
    const S = new Lines()
    S.seg([-2.3, 0, PZ[0] - 3.2], [PX[1], 0, PZ[0] - 3.2])
    S.seg([-2.3, 0, PZ[0] - 3.2], [-2.3, 0, PZ[0]])
    S.seg([-2.3, 0, PZ[0]], [PX[0], 0, PZ[0]])
    S.seg([PX[1], 0, PZ[0] - 3.2], [PX[1], 0, PZ[0]])
    const G = new Lines()
    grinder(G)
    const H = new Lines()
    grinderHeads(H)
    // the laser, and its grid over the slab at the buttons' heads, drawn from the laser out; its rays to the far corners
    const LZ = new Lines()
    laserUnit(LZ, LASER_Y)
    const grid = new Lines()
    for (let x = PX[0] + GRID / 2; x < PX[1]; x += GRID) grid.seg([x, GRID_Y, PZ[0]], [x, GRID_Y, PZ[1]])
    for (let z = PZ[0] + GRID / 2; z < PZ[1]; z += GRID) grid.seg([PX[0], GRID_Y, z], [PX[1], GRID_Y, z])
    const win: V = [LASER[0] + 0.031, LASER[1] + LASER_Y, LASER[2]]
    for (const [x, z] of [
      [PX[1], PZ[1]],
      [PX[1], PZ[0]],
      [PX[0], PZ[1]],
    ])
      grid.seg(win, [x, GRID_Y, z])
    const rim = new Lines()
    circle(rim, [0, 0, 0.005], 1, 'z', 72)
    // each lens's leader, from the point on the floor it looks into out to its rim
    const leader = (at: V) => {
      const L = new Lines()
      const c = new THREE.Vector3(...LENS.c)
      const a = new THREE.Vector3(...at)
      const r = a.clone().sub(c).normalize().multiplyScalar(LENS.r).add(c)
      L.seg([a.x, a.y, a.z], [r.x, r.y, r.z])
      return L
    }
    const bp = blueprintLines()
    return {
      pump: sortFrom(P, [0, 0, 0]),
      slab: S,
      grinder: G,
      heads: H,
      laser: LZ,
      grid: sortFrom(split(grid, 0.08), win),
      rim,
      meshLeader: leader(LOOK.mesh),
      poreLeader: leader(LOOK.pores),
      bp: bp.ink,
      bpMesh: bp.mesh,
      ...poreLines(),
    }
  }, [])
  const pumpD = useDrawing(lines.pump, mats.kit)
  const slabD = useDrawing(lines.slab, mats.kit)
  const grinderD = useDrawing(lines.grinder, mats.tool)
  const headsD = useDrawing(lines.heads, mats.tool)
  const laserD = useDrawing(lines.laser, mats.kit)
  const gridD = useDrawing(lines.grid, mats.grid)
  const rimA = useDrawing(lines.rim, mats.rim)
  const rimB = useDrawing(lines.rim, mats.rim)
  const meshLeaderD = useDrawing(lines.meshLeader, mats.leader)
  const poreLeaderD = useDrawing(lines.poreLeader, mats.leader)
  const bpD = useDrawing(lines.bp, mats.bp)
  const bpMeshD = useDrawing(lines.bpMesh, mats.bpMesh)
  const grainsD = useDrawing(lines.grains, mats.grains)
  const poresD = useDrawing(lines.pores, mats.pores)
  const flakesD = useDrawing(lines.flakes, mats.flakes)

  const buttons = useRef<THREE.InstancedMesh>(null)
  const meshGroup = useRef<THREE.Group>(null)
  const old = useRef<THREE.Mesh>(null)
  const groundMesh = useRef<THREE.Mesh>(null)
  const barrierMesh = useRef<THREE.Mesh>(null)
  const pourMesh = useRef<THREE.Mesh>(null)
  const doneMesh = useRef<THREE.Mesh>(null)
  const polishMesh = useRef<THREE.Mesh>(null)
  const condMesh = useRef<THREE.Mesh>(null)
  const tapeMesh = useRef<THREE.Mesh>(null)
  const coatRun = useRef<THREE.Group>(null)
  const coatMesh = useRef<THREE.Mesh>(null)
  const hose = useRef<THREE.Mesh>(null)
  const pumpGroup = useRef<THREE.Group>(null)
  const grinderGroup = useRef<THREE.Group>(null)
  const headGroup = useRef<THREE.Group>(null)
  const meshLens = useRef<THREE.Group>(null)
  const poreLens = useRef<THREE.Group>(null)
  const yarnClipped = useRef(false)
  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const scl = useMemo(() => new THREE.Vector3(), [])
  const at = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])

  useFrame(() => {
    const v = Math.min(N_STEPS - 1e-4, Math.max(0, t.value))
    const r = compact ? PHONE_ROOM : room.current
    aim(camera, size, shotAt(VIEWS, v, r, size.width / Math.max(1, size.height)))

    // RTARIUM's own material is made inside it: given its cut once it is there
    if (!yarnClipped.current && meshGroup.current) {
      meshGroup.current.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.Material | undefined
        if (mm && (o as THREE.Mesh).isMesh) {
          mm.clippingPlanes = [cut.covered]
          yarnClipped.current = true
        }
      })
    }

    // 0. the old topping lifts away; the grinder takes the deck back to front, ground behind it
    const clear = smooth(0.06, 0.3, v)
    if (old.current) {
      old.current.visible = clear < 0.999
      old.current.position.y = clear * 0.16
    }
    m.old.opacity = 1 - clear
    const pass0 = smooth(0.36, 0.78, v)
    const grind0 = v > 0.3 && v < 0.84
    const gz0 = PZ[0] + 0.3 + (PZ[1] - PZ[0] - 0.6) * pass0
    if (groundMesh.current) {
      groundMesh.current.visible = v >= 0.36
      keepBack(cut.ground, pass0 >= 0.999 ? PZ[1] + 0.05 : gz0 - 0.08)
    }
    // 5. the grinder again, over the set screed, its polish behind it
    const pass5 = smooth(5.18, 5.8, v)
    const grind5 = v > 5.1 && v < 5.88
    const gz5 = PZ[0] + 0.3 + (PZ[1] - PZ[0] - 0.6) * pass5
    if (polishMesh.current) {
      polishMesh.current.visible = v >= 5.18 && v < 6.34
      keepBack(cut.polish, pass5 >= 0.999 ? PZ[1] + 0.05 : gz5 - 0.08)
    }
    const grinding = grind0 || grind5
    const pass = grind0 ? pass0 : pass5
    grinderD.show(grinding ? 1 : 0)
    headsD.show(grinding ? 1 : 0)
    if (grinderGroup.current) {
      grinderGroup.current.visible = grinding
      grinderGroup.current.position.set(MID + (PX[1] - PX[0] - 0.8) * 0.5 * Math.sin(pass * Math.PI * 3), grind0 ? SLAB : TOP, grind0 ? gz0 : gz5)
    }
    if (headGroup.current) headGroup.current.rotation.y = pass * 48

    // 1. the barrier rolled on, right to left; the laser and its grid; the buttons rise to it from the laser out
    const onBarrier = smooth(1.06, 1.3, v)
    if (barrierMesh.current) {
      barrierMesh.current.visible = v >= 1.06
      keepRight(cut.barrier, PX[1] + 0.02 - (PX[1] - PX[0] + 0.04) * onBarrier)
    }
    const laserIn = smooth(1.32, 1.4, v)
    const setOut = v > 1.32 && v < 2.1
    laserD.show(setOut ? laserIn : 0)
    gridD.show(setOut ? smooth(1.38, 1.56, v) : 0)
    mats.grid.opacity = 0.55 * (1 - smooth(1.96, 2.1, v))
    const onButtons = smooth(1.56, 1.8, v)
    const bm = buttons.current
    if (bm) {
      g.spots.forEach(({ at: [x, y, z], rank }, i) => {
        const s = smooth(rank - 0.04, rank + 0.14, onButtons * 1.04)
        // drawn twice their width, so they read at the floor's size
        scl.set(Math.max(0.0001, 2 * s), Math.max(0.0001, s), Math.max(0.0001, 2 * s))
        at.set(x, y - (1 - s) * 0.012, z)
        bm.setMatrixAt(i, mtx.compose(at, q, scl))
      })
      bm.instanceMatrix.needsUpdate = true
      bm.visible = v >= 1.56
    }

    // 2. RTARIUM lowered onto the buttons; the blueprint of its section in the lens beside the floor
    const lower = smooth(2.1, 2.45, v)
    // 3. the pump drawn, the hose, the pour from the back edge to the front; then the clean layer it leaves
    const pumpOn = smooth(3.24, 3.36, v) * (1 - smooth(3.72, 3.8, v))
    pumpD.show(pumpOn)
    slabD.show(pumpOn > 0.01 ? 1 : 0)
    if (pumpGroup.current) pumpGroup.current.visible = pumpOn > 0.001
    if (hose.current) hose.current.visible = v > 3.32 && v < 3.8
    const pourE = smooth(3.36, 3.74, v)
    const poured = pourE > 0.985
    const front = PZ[0] - 0.04 + (PZ[1] - PZ[0] + 0.1) * pourE
    if (pourMesh.current) {
      pourMesh.current.visible = v >= 3.36 && !poured
      pourMesh.current.position.z = front
    }
    if (meshGroup.current) {
      meshGroup.current.visible = v >= 2.1 && !poured
      meshGroup.current.position.y = MESH_Y + (1 - lower) * 0.22
    }
    cut.covered.constant = v >= 3.36 ? -(front - 0.045) : 10
    if (doneMesh.current) doneMesh.current.visible = poured
    const lensRoom = compact ? 0 : 1
    const meshLensOn = smooth(2.48, 2.62, v) * (1 - smooth(2.8, 2.9, v)) * lensRoom
    if (meshLens.current) {
      meshLens.current.visible = meshLensOn > 0.002
      meshLens.current.scale.setScalar(Math.max(0.001, meshLensOn) * LENS.r)
    }
    meshLeaderD.show(meshLensOn > 0.6 ? 1 : 0)
    rimA.show(meshLensOn > 0.01 ? 1 : 0)
    bpD.show(meshLensOn > 0.01 ? 1 : 0)
    bpMeshD.show(meshLensOn > 0.01 ? 1 : 0)

    // 4. it sets; the pore lens opens beside it, the graphene settling into the capillaries, which close
    const dry = smooth(4.02, 4.2, v)
    m.pour.color.copy(set.wet).lerp(set.dry, dry)
    m.pour.roughness = 0.1 + 0.56 * dry
    m.pour.map = dry > 0.5 ? m.slc.map : null
    const poreOn = smooth(4.14, 4.3, v) * (1 - smooth(4.82, 4.92, v)) * lensRoom
    if (poreLens.current) {
      poreLens.current.visible = poreOn > 0.002
      poreLens.current.scale.setScalar(Math.max(0.001, poreOn) * LENS.r)
    }
    poreLeaderD.show(poreOn > 0.6 ? 1 : 0)
    rimB.show(poreOn > 0.01 ? 1 : 0)
    grainsD.show(poreOn > 0.01 ? 1 : 0)
    poresD.show(poreOn > 0.01 ? 1 - smooth(4.46, 4.76, v) * 0.85 : 0)
    flakesD.show(smooth(4.34, 4.62, v) * (poreOn > 0.01 ? 1 : 0))
    m.lens.opacity = Math.max(meshLensOn, poreOn)

    // 6. the conductive primer rolled on back to front, the copper grid laid left to right, the top coat run over it
    const onCond = smooth(6.06, 6.26, v)
    if (condMesh.current) {
      condMesh.current.visible = v >= 6.06
      keepBack(cut.cond, backToFront(onCond))
    }
    const onTape = smooth(6.28, 6.48, v)
    if (tapeMesh.current) {
      tapeMesh.current.visible = v >= 6.28
      keepLeft(cut.tape, PX[0] - 0.02 + (PX[1] - PX[0] + 0.04) * onTape)
    }
    const onCoat = smooth(6.52, 6.9, v)
    const coated = onCoat > 0.985
    if (coatRun.current) {
      coatRun.current.visible = v >= 6.52 && !coated
      coatRun.current.position.z = PZ[0] - 0.04 + (PZ[1] - PZ[0] + 0.1) * onCoat
    }
    if (coatMesh.current) coatMesh.current.visible = coated
  }, -1)

  const nx = Math.floor((PX[1] - PX[0] - 0.02) / (PITCH * SHOW))
  const nz = Math.floor((PZ[1] - PZ[0] - 0.02) / (PITCH * SHOW))
  // the lenses face the camera as the floor's view sees it
  const lensTurn = useMemo(() => new THREE.Euler((-FLOOR_VIEW.elev * Math.PI) / 180, (FLOOR_VIEW.azim * Math.PI) / 180, 0, 'YXZ'), [])
  return (
    <group>
      <mesh geometry={g.ribs} material={m.waffle} castShadow receiveShadow />
      <mesh geometry={g.deck} material={m.waffle} castShadow receiveShadow />
      <mesh ref={old} geometry={g.old} material={m.old} castShadow receiveShadow />
      <mesh ref={groundMesh} geometry={g.ground} material={m.ground} visible={false} receiveShadow />
      <mesh ref={barrierMesh} geometry={g.barrier} material={m.barrier} visible={false} renderOrder={1} receiveShadow />
      <instancedMesh ref={buttons} args={[g.button, m.button, g.spots.length]} castShadow visible={false} />
      <group ref={meshGroup} position={[MID, MESH_Y, (PZ[0] + PZ[1]) / 2]} visible={false}>
        <group rotation={[-Math.PI / 2, 0, 0]} scale={[SHOW, SHOW, 1]}>
          <Suspense fallback={null}>
            <MeshInset nx={nx} ny={nz} lod={4} />
          </Suspense>
        </group>
      </group>
      <mesh ref={pourMesh} geometry={g.pour} material={m.pour} position={[0, SLAB + LAY.barrier, 0]} visible={false} castShadow receiveShadow />
      <mesh ref={doneMesh} geometry={g.done} material={m.pour} visible={false} castShadow receiveShadow />
      <mesh ref={polishMesh} geometry={g.polish} material={m.polish} visible={false} receiveShadow />
      <mesh ref={condMesh} geometry={g.cond} material={m.conductive} visible={false} receiveShadow />
      <mesh ref={tapeMesh} geometry={g.tape} material={m.copper} visible={false} receiveShadow />
      <group ref={coatRun} position={[0, TOP + LAY.cond, 0]} visible={false}>
        <mesh geometry={g.coatRun} material={m.coatRun} receiveShadow />
        <mesh geometry={g.coatRunL} material={m.coatRunL} receiveShadow />
      </group>
      <mesh ref={coatMesh} geometry={g.coat} material={m.coat} visible={false} receiveShadow />
      <group position={LASER}>
        <primitive object={laserD.obj} />
      </group>
      <primitive object={gridD.obj} />
      <group ref={pumpGroup} position={PUMP} visible={false}>
        <primitive object={pumpD.obj} />
      </group>
      <group position={[0, SLAB, 0]}>
        <primitive object={slabD.obj} />
      </group>
      <mesh ref={hose} geometry={g.hose} material={m.rubber} visible={false} castShadow />
      <group ref={grinderGroup} visible={false}>
        <group rotation={[0, (-3 * Math.PI) / 4, 0]}>
          <primitive object={grinderD.obj} />
          <Anchor bus={bus} id="sb-grinder" position={[-0.8, 0.92, 0]} />
        </group>
        <group ref={headGroup}>
          <primitive object={headsD.obj} />
        </group>
      </group>
      {/* the lenses: dark discs drawn before their lines, which are drawn over them */}
      <group ref={meshLens} position={LENS.c} rotation={lensTurn} visible={false}>
        <mesh geometry={g.lens} material={m.lens} renderOrder={4} />
        <primitive object={bpD.obj} />
        <primitive object={bpMeshD.obj} />
        <primitive object={rimA.obj} />
        <Anchor bus={bus} id="sb-low" position={[BP.dimX, (BP.slab + BP.mesh0) / 2, 0.01]} />
        <Anchor bus={bus} id="sb-mid" position={[BP.dimX, 0, 0.01]} />
        <Anchor bus={bus} id="sb-up" position={[BP.dimX, (BP.mesh1 + BP.finish) / 2, 0.01]} />
      </group>
      <primitive object={meshLeaderD.obj} />
      <group ref={poreLens} position={LENS.c} rotation={lensTurn} visible={false}>
        <mesh geometry={g.lens} material={m.lens} renderOrder={4} />
        <primitive object={grainsD.obj} />
        <primitive object={poresD.obj} />
        <primitive object={flakesD.obj} />
        <primitive object={rimB.obj} />
        <Anchor bus={bus} id="sb-pores" position={[0.62, 0.72, 0]} />
      </group>
      <primitive object={poreLeaderD.obj} />
      <mesh geometry={g.catcher} material={m.catcher} position={[0, -0.002, 0]} receiveShadow />

      <Anchor bus={bus} id="sb-csp" position={[0.6, SLAB, 0.45]} />
      <Anchor bus={bus} id="sb-barrier" position={[-0.7, SLAB + LAY.barrier, 0.5]} />
      <Anchor bus={bus} id="sb-laser" position={[LASER[0] + 0.03, LASER[1] + LASER_Y + 0.03, LASER[2]]} />
      <Anchor bus={bus} id="sb-button" position={[PX[0] + GRID * 3.5, GRID_Y, PZ[1] - GRID / 2]} />
      <Anchor bus={bus} id="sb-mesh" position={[-0.45, MESH_Y + 0.005, 0.45]} />
      <Anchor bus={bus} id="sb-pump" position={[PUMP[0] - 0.3, PUMP[1] + 2.5, PUMP[2]]} />
      <Anchor bus={bus} id="sb-flow" position={[0.3, TOP, 0.2]} />
      <Anchor bus={bus} id="sb-joint" position={[0.3, TOP, 0.45]} />
      <Anchor bus={bus} id="sb-cond" position={[-1.0, TOP + LAY.cond, 0.5]} />
      <Anchor bus={bus} id="sb-tape" position={[-0.6, TOP + LAY.cond + LAY.tape, 0.62]} />
      <Anchor bus={bus} id="sb-coat" position={[0.2, TOP + LAY.cond + LAY.coat, -0.1]} />
      <Anchor bus={bus} id="sb-old" position={[0.8, OLD_TOP, 0.3]} />
    </group>
  )
}
