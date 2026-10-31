import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor } from '../../../facade/three/Stage3D'
import type { LabelBus } from '../../../facade/three/kit'
import { smooth, type Progress } from '../../../facade/progress'
import { prefersReducedMotion } from '../../../lib/motion'
import type { BuildRoom } from '../../data/three/BuildScene'
import { Lines, sortFrom, split } from '../../data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../data/three/draw'
import { aim, CUT_AT, PHONE_ROOM, shotAt, type View } from './camera'
import { airHandler, chiller, circle, disposeKit, fabKit, OLD_TOP, OPTICS_FOOT, oht, oldTopping, PX, PZ, rail, scanner, sectionAtX, SEAM, SLAB, vacuumPump, WAFER, WAFER_R, waffle, WAF } from './fab'
import { RED, vibeMaterial } from './vibe'

/**
 * The problem (Semiconductor Plant), on black, in the build's stage: the client's first two scenes in
 * five steps. The floor is the old one: the waffle slab under a 50 mm brittle topping with its
 * saw-cut joint, the one thing in its own materials; the cleanroom and its tools are drawn in amber,
 * the threats in red.
 *
 *   0  the standard     a lithography scanner on the floor, the AMHS rail over the aisle, a vehicle
 *                       running along it
 *   1  the line         down past the machine to a wafer on its chuck: the beam prints a circuit line
 *   2  the shockwave    seen from the side, red fronts rise from the floor up to the wafer; it shakes,
 *                       the beam blurs, the rest of the line is printed broken, and the die is lost
 *   3  under the floor  down through the floor: the coffered slab from below, the subfab's pumps,
 *                       chiller and air handler shaking it, the fronts running up column, slab and
 *                       topping
 *   4  vapour and dust  a section at the joint: moisture rising through the concrete's capillaries,
 *                       cement dust lifting out of the joint into the air
 *
 * Steps 1 and 2 are close on the wafer, cut to a square round the die being printed (a section, as the
 * floor's close-ups are). The stage cuts rather than travels where the scale changes (`CUTS`: into the
 * wafer, out under the slab, in to the joint): the 3D dissolves and comes back in its new shot, so
 * nothing ever crosses the room's edges. Every shot keeps to part of the room, as the build's do.
 */

type V = [number, number, number]
const ON = OLD_TOP
/** the wafer's top, and the optics' foot, in the scene */
const W: V = [WAFER[0], ON + WAFER[1] + 0.0012, WAFER[2]]
const FOOT: V = [OPTICS_FOOT[0], ON + OPTICS_FOOT[1], OPTICS_FOOT[2]]
const RAIL = { y: ON + 2.3, z: 0.68, x0: -1.75, x1: 1.75, top: ON + 2.7 }
/** the subfab's floor, the column under the slab's rib crossing */
const SUB = -2.1
const COL: [number, number] = [0, -0.45]
/** step 4's section: between two cuts across the piece (in coffers), in front of a cut along it */
const CUT = { x0: 0.12, x1: 0.62, z: 0.3 }
/** the close-ups' square of wafer round the die, and how far the fronts rise under it */
const TILE = 0.035
const RISE = 0.075
/** the plant under the slab: two vacuum pumps, a chiller, an air handler, on the subfab floor */
const PLANT = { pumps: [[-1.45, 0.35], [-0.85, 0.4]] as [number, number][], chiller: [-1.5, -1.2] as [number, number], ahu: [0.9, -1.4] as [number, number] }
const AMBER = '#fdd001'

const VIEWS: View[] = [
  { box: [[-1.75, 0, -0.75], [1.75, RAIL.top, 0.9]], azim: 30, elev: 13, fill: 0.76 },
  { box: [[W[0] - TILE, W[1], W[2] - TILE], [W[0] + TILE, W[1] + 0.003, W[2] + TILE]], azim: 24, elev: 44, fill: 0.62 },
  { box: [[W[0] - TILE, W[1] - RISE, W[2] - TILE], [W[0] + TILE, W[1] + 0.006, W[2] + TILE]], azim: 24, elev: 14, fill: 0.6 },
  { box: [[-2.65, SUB, -1.95], [2.25, ON, 0.8]], azim: 30, elev: 5, fill: 0.76 },
  { box: [[0.14, SLAB - 0.09, 0.42], [0.6, ON + 0.14, PZ[1]]], azim: 24, elev: 9, fill: 0.62 },
]
/** the steps whose move on to the next is a cut, not a camera move */
export const THREAT_CUTS = [0, 2, 3]

/** a drawing's segments, split into those wholly near a place and the rest */
function partition(L: Lines, near: (p: number[]) => boolean): [Lines, Lines] {
  const a = new Lines()
  const b = new Lines()
  for (let i = 0; i < L.pts.length; i += 6) {
    const s = L.pts.slice(i, i + 6)
    ;(near(s.slice(0, 3)) && near(s.slice(3)) ? a : b).pts.push(...s)
  }
  return [a, b]
}

/** polished silicon: a cool dark grey-blue with a sheen, its dies on a grid, the edge left bare */
function waferTexture() {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S * 0.38, S * 0.34, 0, S / 2, S / 2, S * 0.62)
  grad.addColorStop(0, '#6c7890')
  grad.addColorStop(1, '#262c39')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  const px = S / (2 * WAFER_R)
  const dw = 0.026 * px
  const dh = 0.033 * px
  const R = S / 2 - 0.004 * px
  for (let j = -6; j <= 6; j++)
    for (let i = -7; i <= 7; i++) {
      const x0 = S / 2 + (i - 0.5) * dw
      const y0 = S / 2 + (j - 0.5) * dh
      const inside = [
        [x0, y0],
        [x0 + dw, y0],
        [x0, y0 + dh],
        [x0 + dw, y0 + dh],
      ].every(([x, y]) => Math.hypot(x - S / 2, y - S / 2) < R)
      if (!inside) continue
      const hue = 205 + ((i * 7 + j * 13) % 40)
      g.fillStyle = `hsla(${hue}, 40%, 62%, ${0.08 + (((i + j) & 3) * 0.03).toFixed(2)})`
      g.fillRect(x0 + 2, y0 + 2, dw - 4, dh - 4)
      g.strokeStyle = 'rgba(170, 186, 214, 0.55)'
      g.lineWidth = 1.5
      g.strokeRect(x0 + 1, y0 + 1, dw - 2, dh - 2)
      g.strokeStyle = 'rgba(170, 186, 214, 0.18)'
      g.lineWidth = 1
      for (let k = 1; k < 4; k++) g.strokeRect(x0 + k * 8, y0 + k * 9, dw - k * 16, dh - k * 18)
    }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** the beam: additive light, fading out a little way up from where it prints, so it never runs out of the room */
function beamMaterial(color: string, opacity: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying float vV;
      void main() {
        vV = uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vV;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity * (1.0 - smoothstep(0.0, 0.32, vV)));
      }`,
  })
}

/**
 * The circuit line printed on the die at the wafer's middle: a serpentine of tracks with their stubs,
 * the first part clean (printed before the shock), the rest broken (printed while the stage shakes).
 */
function circuit() {
  const pts: [number, number][] = []
  const rows = 9
  for (let r = 0; r < rows; r++) {
    const z = -0.008 + r * 0.002
    const a = r % 2 ? 0.009 : -0.009
    const b = -a
    pts.push([a, z])
    // a stub off the track at a third of its length, and back
    const s = a + (b - a) * (0.3 + 0.1 * (r % 3))
    pts.push([s, z], [s, z + 0.0008], [s + (b - a) * 0.06, z + 0.0008], [s + (b - a) * 0.06, z], [b, z])
  }
  const split = Math.round(pts.length * 0.58)
  return { pts, split }
}

export function ThreatScene({ t, bus, compact, room, live }: { t: Progress; bus: LabelBus; compact: boolean; room: { current: BuildRoom }; live: { current: boolean } }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  const m = useMemo(() => {
    const k = fabKit()
    return {
      ...k,
      capSlab: k.waffle.clone(),
      capTop: k.old.clone(),
      wafer: new THREE.MeshStandardMaterial({ map: waferTexture(), metalness: 0.55, roughness: 0.2, envMapIntensity: 1.3, transparent: true }),
      waferEdge: new THREE.MeshStandardMaterial({ color: '#3a404c', metalness: 0.5, roughness: 0.35, transparent: true }),
      beam: beamMaterial('#fff1a8', 0.5),
      ghost: beamMaterial(RED, 0.35),
      spot: new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      vapour: new THREE.MeshBasicMaterial({ color: '#bfe0ff', transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }),
      dust: new THREE.MeshBasicMaterial({ color: '#d8d2c6', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }),
    }
  }, [])

  // step 4's section box: kept between two cuts across the piece and in front of one along it
  const cut = useMemo(
    () => ({
      left: new THREE.Plane(new THREE.Vector3(1, 0, 0), -(PX[0] - 0.01)),
      right: new THREE.Plane(new THREE.Vector3(-1, 0, 0), PX[1] + 0.01),
      back: new THREE.Plane(new THREE.Vector3(0, 0, 1), -(PZ[0] - 0.01)),
      foot: new THREE.Plane(new THREE.Vector3(0, 1, 0), 10),
      // the close-ups' square of wafer
      tL: new THREE.Plane(new THREE.Vector3(1, 0, 0), 10),
      tR: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10),
      tB: new THREE.Plane(new THREE.Vector3(0, 0, 1), 10),
      tF: new THREE.Plane(new THREE.Vector3(0, 0, -1), 10),
    }),
    [],
  )
  const front = useMemo(() => vibeMaterial('z', ON, { speed: 0.3, wave: 0.11 }), [])
  const side = useMemo(() => vibeMaterial('x', ON, { speed: 0.3, wave: 0.11 }), [])
  // the fronts rising to the wafer from below, on a plane through it
  const rise = useMemo(() => vibeMaterial('z', 10, { speed: 0.016, wave: 0.011, plain: true, thick: 0.045, fade: [W[0] - TILE, W[0] + TILE, W[1] - RISE, 0.016] }), [])
  useEffect(() => {
    const box = [cut.left, cut.right, cut.back, cut.foot]
    for (const x of [m.waffle, m.old, m.vapour, m.dust, front.material, side.material]) x.clippingPlanes = box
    m.capSlab.clippingPlanes = [cut.back, cut.foot]
    m.capTop.clippingPlanes = [cut.back]
    m.wafer.clippingPlanes = [cut.tL, cut.tR, cut.tB, cut.tF]
    m.waferEdge.clippingPlanes = [cut.tL, cut.tR, cut.tB, cut.tF]
  }, [m, cut, front, side])

  const g = useMemo(() => {
    const w = waffle(PX, PZ)
    const c = circuit()
    return {
      ...w,
      top: oldTopping(PX, PZ),
      cap: sectionAtX(0, [PZ[0], PZ[1]]),
      capTop: new THREE.PlaneGeometry(PZ[1] - PZ[0], ON - SLAB).rotateY(Math.PI / 2).translate(0, (SLAB + ON) / 2, 0),
      // the wafer, 0.8 mm thick, its top at the origin
      wafer: new THREE.CylinderGeometry(WAFER_R, WAFER_R, 0.0008, 96).translate(0, -0.0004, 0),
      // drawn where it stands: its fronts are read in its own coordinates
      rise: new THREE.PlaneGeometry(2 * TILE, RISE + 0.012).translate(W[0], W[1] - RISE + (RISE + 0.012) / 2, W[2]),
      beam: new THREE.CylinderGeometry(0.011, 0.0012, 1, 18, 1, true).translate(0, 0.5, 0),
      spot: new THREE.CircleGeometry(0.0035, 20).rotateX(-Math.PI / 2),
      faceZ: new THREE.PlaneGeometry(PX[1] - PX[0], ON).translate(0, ON / 2, PZ[1] + 0.0015),
      faceX: new THREE.PlaneGeometry(PZ[1] - PZ[0], ON).rotateY(Math.PI / 2).translate(PX[1] + 0.0015, ON / 2, 0),
      vapour: new THREE.SphereGeometry(0.0024, 8, 6),
      mote: new THREE.BoxGeometry(0.0022, 0.0022, 0.0022),
      circuit: c,
    }
  }, [])
  useEffect(
    () => () => {
      for (const x of Object.values(g)) if (x instanceof THREE.BufferGeometry) x.dispose()
      m.wafer.map?.dispose()
      for (const x of [m.capSlab, m.capTop, m.wafer, m.waferEdge, m.beam, m.ghost, m.spot, m.vapour, m.dust, front.material, side.material, rise.material]) x.dispose()
      disposeKit(m)
    },
    [g, m, front, side, rise],
  )

  // the drawings: the room in amber, the threats in red
  const mats = useMemo(() => {
    return {
      room: ink(1.05, AMBER, 0.8),
      near: ink(1.3, AMBER, 0.9),
      vehicle: ink(1.05, AMBER, 0.85),
      good: ink(2.4, AMBER, 1),
      bad: ink(2.4, RED, 1),
      mark: ink(1.6, RED, 1),
      plant: ink(1.1, AMBER, 0.85),
      hum: [0, 1, 2, 3, 4, 5].map(() => ink(1.3, RED, 1)),
      pulse: ink(1.6, RED, 1),
      pores: ink(1, '#f2f0e9', 0.4),
    }
  }, [])
  useInkResolution(useMemo(() => [mats.room, mats.near, mats.vehicle, mats.good, mats.bad, mats.mark, mats.plant, ...mats.hum, mats.pulse, mats.pores], [mats]))
  useEffect(() => {
    mats.pores.clippingPlanes = [cut.left, cut.right, cut.back]
    for (const x of [mats.near, mats.good, mats.bad, mats.mark]) x.clippingPlanes = [cut.tL, cut.tR, cut.tB, cut.tF]
  }, [mats, cut])

  const lines = useMemo(() => {
    const S = new Lines()
    scanner(S, ON)
    const [near, rest] = partition(S, (p) => Math.hypot(p[0] - W[0], p[2] - W[2]) < 0.175 && p[1] > W[1] - 0.03 && p[1] < FOOT[1] + 0.005)
    const R = new Lines()
    rail(R, RAIL.x0, RAIL.x1, RAIL.y, RAIL.z, RAIL.top)
    const room = new Lines()
    room.pts.push(...rest.pts, ...R.pts)
    const O = new Lines()
    oht(O)
    // the circuit: the clean part, and the broken rest
    const { pts, split: k } = g.circuit
    const good = new Lines()
    for (let i = 0; i + 1 <= k && i + 1 < pts.length; i++) good.seg([W[0] + pts[i][0], W[1] + 0.0004, W[2] + pts[i][1]], [W[0] + pts[i + 1][0], W[1] + 0.0004, W[2] + pts[i + 1][1]])
    let seedv = 5
    const jit = () => ((seedv = (seedv * 16807) % 2147483647) / 2147483647 - 0.5) * 0.0016
    const bad = new Lines()
    let last: number[] = [W[0] + pts[k][0], W[1] + 0.0004, W[2] + pts[k][1]]
    for (let i = k; i + 1 < pts.length; i++) {
      const [a, b] = pts[i]
      const [c, d] = pts[i + 1]
      for (let s = 1; s <= 4; s++) {
        const p = [W[0] + a + ((c - a) * s) / 4 + jit(), W[1] + 0.0004, W[2] + b + ((d - b) * s) / 4 + jit()]
        bad.seg(last, p)
        last = p
      }
    }
    // the lost die, marked
    const mark = new Lines()
    const hw = 0.013
    const hd = 0.0165
    for (const [a, b] of [
      [
        [-hw, -hd],
        [hw, -hd],
      ],
      [
        [hw, -hd],
        [hw, hd],
      ],
      [
        [hw, hd],
        [-hw, hd],
      ],
      [
        [-hw, hd],
        [-hw, -hd],
      ],
    ])
      mark.seg([W[0] + a[0], W[1] + 0.0006, W[2] + a[1]], [W[0] + b[0], W[1] + 0.0006, W[2] + b[1]])
    // a ring of unit radius, for the fronts
    const ring = new Lines()
    circle(ring, [0, 0, 0], 1, 'y', 64)
    // the subfab: its floor, the column, the plant, drawn out from the column's foot
    const P = new Lines()
    P.seg([-2.65, SUB, -1.95], [2.25, SUB, -1.95])
    P.seg([2.25, SUB, -1.95], [2.25, SUB, 0.8])
    P.seg([2.25, SUB, 0.8], [-2.65, SUB, 0.8])
    P.seg([-2.65, SUB, 0.8], [-2.65, SUB, -1.95])
    P.box([COL[0] - 0.22, SUB, COL[1] - 0.22], [COL[0] + 0.22, 0, COL[1] + 0.22])
    P.box([COL[0] - 0.4, SUB, COL[1] - 0.4], [COL[0] + 0.4, SUB + 0.08, COL[1] + 0.4])
    const place = (L: Lines, at: V, turn = 0) => {
      const c = Math.cos(turn)
      const s = Math.sin(turn)
      for (let i = 0; i < L.pts.length; i += 3) {
        const x = L.pts[i]
        const z = L.pts[i + 2]
        P.pts.push(at[0] + x * c + z * s, at[1] + L.pts[i + 1], at[2] - x * s + z * c)
      }
    }
    const v1 = new Lines()
    vacuumPump(v1)
    for (const [x, z] of PLANT.pumps) place(v1, [x, SUB, z])
    const ch = new Lines()
    chiller(ch)
    place(ch, [PLANT.chiller[0], SUB, PLANT.chiller[1]])
    const ah = new Lines()
    airHandler(ah)
    place(ah, [PLANT.ahu[0], SUB, PLANT.ahu[1]])
    // the capillaries on step 4's face: fine paths up through deck and topping
    const pores = new Lines()
    for (let k2 = 0; k2 < 11; k2++) {
      const x0 = 0.1 + k2 * 0.042
      let prev = [x0, SLAB - WAF.deck + 0.004, PZ[1] + 0.0012]
      for (let y = SLAB - WAF.deck + 0.012; y <= ON - 0.002; y += 0.008) {
        const p = [x0 + 0.004 * Math.sin(y * 140 + k2 * 2.1), y, PZ[1] + 0.0012]
        pores.seg(prev, p)
        prev = p
      }
    }
    return { room, near, vehicle: O, good, bad, mark, ring, plant: sortFrom(split(P, 0.4), [COL[0], SUB, COL[1]]), pores }
  }, [g])
  const roomD = useDrawing(lines.room, mats.room)
  const nearD = useDrawing(lines.near, mats.near)
  const vehicleD = useDrawing(lines.vehicle, mats.vehicle)
  const goodD = useDrawing(lines.good, mats.good)
  const badD = useDrawing(lines.bad, mats.bad)
  const markD = useDrawing(lines.mark, mats.mark)
  const plantD = useDrawing(lines.plant, mats.plant)
  const hums = [
    useDrawing(lines.ring, mats.hum[0]),
    useDrawing(lines.ring, mats.hum[1]),
    useDrawing(lines.ring, mats.hum[2]),
    useDrawing(lines.ring, mats.hum[3]),
    useDrawing(lines.ring, mats.hum[4]),
    useDrawing(lines.ring, mats.hum[5]),
  ]
  const poresD = useDrawing(lines.pores, mats.pores)
  /** a square round the column, rising up it */
  const pulseLines = useMemo(() => {
    const L = new Lines()
    const r = 0.26
    L.seg([-r, 0, -r], [r, 0, -r])
    L.seg([r, 0, -r], [r, 0, r])
    L.seg([r, 0, r], [-r, 0, r])
    L.seg([-r, 0, r], [-r, 0, -r])
    return L
  }, [])
  const pulses = [useDrawing(pulseLines, mats.pulse), useDrawing(pulseLines, mats.pulse), useDrawing(pulseLines, mats.pulse)]

  const piece = useRef<THREE.Group>(null)
  const cap = useRef<THREE.Group>(null)
  const vehicle = useRef<THREE.Group>(null)
  const wafer = useRef<THREE.Group>(null)
  const beam = useRef<THREE.Mesh>(null)
  const ghosts = useRef<(THREE.Mesh | null)[]>([])
  const spot = useRef<THREE.Mesh>(null)
  const humGroups = useRef<(THREE.Group | null)[]>([])
  const pulseGroups = useRef<(THREE.Group | null)[]>([])
  const vapour = useRef<THREE.InstancedMesh>(null)
  const motes = useRef<THREE.InstancedMesh>(null)
  const faces = useRef<THREE.Group>(null)
  const riseMesh = useRef<THREE.Mesh>(null)

  /** the machines that shake the slab, where their hum spreads from on the subfab floor */
  const sources: V[] = useMemo(
    () => [
      [PLANT.pumps[0][0], SUB + 0.01, PLANT.pumps[0][1]],
      [PLANT.chiller[0], SUB + 0.01, PLANT.chiller[1]],
      [PLANT.ahu[0], SUB + 0.01, PLANT.ahu[1]],
    ],
    [],
  )
  const vap = useMemo(() => Array.from({ length: 44 }, (_, i) => ({ k: i % 11, ph: (i * 0.618) % 1, sp: 0.7 + ((i * 37) % 10) / 20 })), [])
  const dustSeeds = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ z: CUT.z + 0.02 + (((i * 0.383) % 1) * (PZ[1] - CUT.z - 0.03)), ph: (i * 0.618) % 1, sp: 0.6 + ((i * 29) % 10) / 14 })), [])
  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const head = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])

  /** the point on the circuit at `share` of its clean part (or, past 1, into the broken rest) */
  const along = (share: number, out: THREE.Vector3) => {
    const { pts, split: k } = g.circuit
    const n = share <= 1 ? share * k : k + (share - 1) * (pts.length - 1 - k)
    const i = Math.min(pts.length - 2, Math.floor(n))
    const f = Math.min(1, n - i)
    out.set(W[0] + pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, W[1], W[2] + pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f)
    return out
  }

  useFrame(() => {
    const v = Math.min(VIEWS.length - 1e-4, Math.max(0, t.value))
    const r = compact ? PHONE_ROOM : room.current
    aim(camera, size, shotAt(VIEWS, v, r, size.width / Math.max(1, size.height), THREAT_CUTS))
    const time = live.current && !reduced ? performance.now() / 1000 : 0
    let ticking = false

    // the floor: gone as the camera goes in to the wafer, back as it comes down under the slab
    const floorOn = v < CUT_AT || v >= 2 + CUT_AT ? 1 : 0
    for (const x of [m.waffle, m.old, m.capSlab, m.capTop]) x.opacity = Math.min(1, floorOn)
    if (piece.current) piece.current.visible = floorOn > 0.002

    // the room: the scanner, the rail and its vehicle, in amber; only what is round the wafer stays in close
    const roomOn = v < CUT_AT ? 1 : 0
    mats.room.opacity = 0.8 * roomOn
    mats.vehicle.opacity = 0.85 * roomOn
    roomD.obj.visible = roomOn > 0.002
    vehicleD.obj.visible = roomOn > 0.002
    const nearOn = v < 2 + CUT_AT ? 1 : 0
    mats.near.opacity = 0.9 * nearOn
    nearD.obj.visible = nearOn > 0.002
    if (vehicle.current) {
      const s = time ? 0.5 - 0.5 * Math.cos((time * Math.PI * 2) / 18) : 0.35
      vehicle.current.position.set(RAIL.x0 + 0.5 + (RAIL.x1 - RAIL.x0 - 1) * s, RAIL.y, RAIL.z)
      if (roomOn > 0.002 && time) ticking = true
    }

    // the wafer, and the line printed on it: clean, then broken as the shock arrives; cut to its square in close
    const tile = v < CUT_AT ? 0.6 : TILE
    cut.tL.constant = -(W[0] - tile)
    cut.tR.constant = W[0] + tile
    cut.tB.constant = -(W[2] - tile)
    cut.tF.constant = W[2] + tile
    if (wafer.current) wafer.current.visible = nearOn > 0.002
    m.wafer.opacity = nearOn
    m.waferEdge.opacity = nearOn
    const printA = smooth(1.15, 1.72, v)
    const printB = smooth(2.42, 2.74, v)
    goodD.show(printA)
    badD.show(printB)
    mats.good.opacity = nearOn
    mats.bad.opacity = nearOn
    const marked = smooth(2.74, 2.8, v) * nearOn
    markD.show(marked > 0.01 ? 1 : 0)
    mats.mark.opacity = marked
    // the shake: in time, while the fronts pass the stage
    const shake = smooth(2.28, 2.4, v) * (1 - smooth(2.74, 2.82, v))
    const jx = shake * 0.0014 * Math.sin(time * 41)
    const jz = shake * 0.0011 * Math.sin(time * 33 + 1.3)
    if (wafer.current) wafer.current.position.set(jx, 0, jz)
    if (shake > 0 && time) ticking = true
    // the beam, from the optics' foot to where it prints
    const beamOn = smooth(1.08, 1.16, v) * (1 - smooth(2.74, 2.8, v))
    along(printB > 0 ? 1 + printB : printA, head)
    head.x += jx
    head.z += jz
    dir.set(FOOT[0] - head.x, FOOT[1] - head.y, FOOT[2] - head.z)
    const len = dir.length()
    dir.normalize()
    if (beam.current) {
      beam.current.visible = beamOn > 0.01
      beam.current.position.copy(head)
      beam.current.quaternion.setFromUnitVectors(up, dir)
      beam.current.scale.set(1, len, 1)
    }
    m.beam.uniforms.uOpacity.value = 0.6 * beamOn
    ghosts.current.forEach((gh, i) => {
      if (!gh) return
      gh.visible = shake > 0.02 && beamOn > 0.01
      gh.position.set(head.x + (i ? -1 : 1) * 0.0022 * Math.sin(time * 37 + i), head.y, head.z + (i ? 1 : -1) * 0.0018 * Math.sin(time * 29 + i))
      gh.quaternion.copy(beam.current?.quaternion ?? gh.quaternion)
      gh.scale.set(1, len, 1)
    })
    m.ghost.uniforms.uOpacity.value = 0.45 * shake
    if (spot.current) {
      spot.current.visible = beamOn > 0.01
      spot.current.position.set(head.x, W[1] + 0.0006, head.z)
      spot.current.scale.setScalar(1 + shake * 1.6)
    }
    m.spot.color.set(shake > 0.3 ? RED : '#fff6c8')

    // the fronts, rising from the floor below up to the wafer and through it
    const rising = smooth(2.1, 2.26, v) * (1 - smooth(2.74, 2.84, v)) * nearOn
    rise.u.uShow.value = rising
    rise.u.uTime.value = time
    if (riseMesh.current) riseMesh.current.visible = rising > 0.002
    if (rising > 0.002 && time) ticking = true

    // under the floor: the plant drawn, its hum spreading on the subfab floor, pulses up the column
    const under = v < 3 + CUT_AT ? smooth(3.04, 3.36, v) : 0
    plantD.show(smooth(3.04, 3.4, v))
    mats.plant.opacity = 0.85
    plantD.obj.visible = v > 3.02 && v < 3 + CUT_AT
    hums.forEach((h, i) => {
      const src = sources[i % 3]
      const ph = ((time * 0.45 + (i >= 3 ? 0.5 : 0) + i * 0.13) % 1 + 1) % 1
      const gr = humGroups.current[i]
      h.show(under > 0.01 ? 1 : 0)
      if (gr) {
        gr.position.set(src[0], src[1], src[2])
        gr.scale.setScalar(0.25 + ph * 0.9)
      }
      mats.hum[i].opacity = under * (1 - ph) * 0.9
    })
    pulses.forEach((p, i) => {
      const ph = ((time * 0.5 + i / 3) % 1 + 1) % 1
      const gr = pulseGroups.current[i]
      p.show(under > 0.01 ? 1 : 0)
      if (gr) gr.position.set(COL[0], SUB + ph * (0 - SUB), COL[1])
    })
    mats.pulse.opacity = under
    // the fronts on the slab's cut faces, running up through it and its topping
    front.u.uShow.value = under
    side.u.uShow.value = under
    front.u.uTime.value = time
    side.u.uTime.value = time
    if (faces.current) faces.current.visible = under > 0.002
    if (under > 0.002 && time) ticking = true

    // step 4: the section at the joint closes round it as the camera comes in
    const box = v >= 3 + CUT_AT ? 1 : 0
    cut.left.constant = -(PX[0] - 0.01 + (CUT.x0 - PX[0] + 0.01) * box)
    cut.right.constant = PX[1] + 0.01 - (PX[1] + 0.01 - CUT.x1) * box
    cut.back.constant = -(PZ[0] - 0.01 + (CUT.z - PZ[0] + 0.01) * box)
    cut.foot.constant = -THREE.MathUtils.lerp(-0.01, SLAB - 0.11, box)
    if (cap.current) {
      cap.current.visible = box > 0.002
      cap.current.position.x = cut.right.constant
    }
    // moisture up the capillaries, dust out of the joint
    const wet = smooth(4.1, 4.35, v)
    const dusty = smooth(4.3, 4.6, v)
    poresD.show(wet > 0.01 ? 1 : 0)
    mats.pores.opacity = 0.4 * wet
    m.vapour.opacity = 0.9 * wet
    m.dust.opacity = 0.85 * dusty
    const vm = vapour.current
    if (vm) {
      vm.visible = wet > 0.01
      if (vm.visible) {
        const y0 = SLAB - WAF.deck + 0.006
        vap.forEach(({ k, ph, sp }, i) => {
          const u = (((time * 0.09 * sp + ph) % 1) + 1) % 1
          const y = y0 + u * (ON - 0.003 - y0)
          const x0 = 0.1 + k * 0.042
          mtx.makeTranslation(x0 + 0.004 * Math.sin(y * 140 + k * 2.1), y, PZ[1] + 0.0018)
          vm.setMatrixAt(i, mtx)
        })
        vm.instanceMatrix.needsUpdate = true
        if (time) ticking = true
      }
    }
    const dm = motes.current
    if (dm) {
      dm.visible = dusty > 0.01
      if (dm.visible) {
        dustSeeds.forEach(({ z, ph, sp }, i) => {
          const u = (((time * 0.08 * sp + ph) % 1) + 1) % 1
          mtx.makeTranslation(SEAM + Math.sin(time * 0.8 + ph * 9) * 0.01 * (0.2 + u), ON + u * 0.13, z + Math.cos(time * 0.6 + ph * 7) * 0.008 * u)
          dm.setMatrixAt(i, mtx)
        })
        dm.instanceMatrix.needsUpdate = true
      }
    }
    if (ticking) invalidate()
  }, -1)

  return (
    <group>
      <group ref={piece}>
        <mesh geometry={g.ribs} material={m.waffle} castShadow receiveShadow />
        <mesh geometry={g.deck} material={m.waffle} castShadow receiveShadow />
        <mesh geometry={g.top} material={m.old} castShadow receiveShadow />
        <group ref={cap} visible={false}>
          <mesh geometry={g.cap} material={m.capSlab} />
          <mesh geometry={g.capTop} material={m.capTop} />
        </group>
        <group ref={faces} visible={false}>
          <mesh geometry={g.faceZ} material={front.material} renderOrder={3} />
          <mesh geometry={g.faceX} material={side.material} renderOrder={3} />
        </group>
        <primitive object={poresD.obj} />
        <instancedMesh ref={vapour} args={[g.vapour, m.vapour, vap.length]} visible={false} frustumCulled={false} renderOrder={4} />
        <instancedMesh ref={motes} args={[g.mote, m.dust, dustSeeds.length]} visible={false} frustumCulled={false} renderOrder={4} />
      </group>
      <primitive object={roomD.obj} />
      <primitive object={nearD.obj} />
      <group ref={vehicle}>
        <primitive object={vehicleD.obj} />
      </group>
      <group ref={wafer}>
        <mesh geometry={g.wafer} material={[m.waferEdge, m.wafer, m.waferEdge]} position={[W[0], W[1] - 0.0002, W[2]]} />
        <primitive object={goodD.obj} />
        <primitive object={badD.obj} />
        <primitive object={markD.obj} />
      </group>
      <mesh ref={beam} geometry={g.beam} material={m.beam} visible={false} renderOrder={6} />
      {[0, 1].map((i) => (
        <mesh key={i} ref={(el) => void (ghosts.current[i] = el)} geometry={g.beam} material={m.ghost} visible={false} renderOrder={6} />
      ))}
      <mesh ref={spot} geometry={g.spot} material={m.spot} visible={false} renderOrder={7} />
      <mesh ref={riseMesh} geometry={g.rise} material={rise.material} visible={false} renderOrder={3} />
      <primitive object={plantD.obj} />
      {hums.map((h, i) => (
        <group key={i} ref={(el) => void (humGroups.current[i] = el)}>
          <primitive object={h.obj} />
        </group>
      ))}
      {pulses.map((p, i) => (
        <group key={i} ref={(el) => void (pulseGroups.current[i] = el)}>
          <primitive object={p.obj} />
        </group>
      ))}

      <Anchor bus={bus} id="tt-scanner" position={[FOOT[0] - 0.2, ON + 1.95, -0.05]} />
      <Anchor bus={bus} id="tt-amhs" position={[-1.2, RAIL.y + 0.07, RAIL.z]} />
      <Anchor bus={bus} id="tt-line" position={[W[0] + g.circuit.pts[g.circuit.split][0], W[1], W[2] + g.circuit.pts[g.circuit.split][1]]} />
      <Anchor bus={bus} id="tt-wave" position={[W[0] - TILE + 0.008, W[1] - RISE * 0.55, W[2]]} />
      <Anchor bus={bus} id="tt-defect" position={[W[0] + 0.013, W[1], W[2] - 0.0165]} />
      <Anchor bus={bus} id="tt-plant" position={[-1.75, SUB + 1.1, -0.45]} />
      <Anchor bus={bus} id="tt-topping" position={[0.9, (SLAB + ON) / 2, PZ[1]]} />
      <Anchor bus={bus} id="tt-vapour" position={[0.48, SLAB - 0.03, PZ[1]]} />
      <Anchor bus={bus} id="tt-dust" position={[SEAM, ON + 0.08, 0.6]} />
    </group>
  )
}
