import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Box } from './Box'
import { Anchor } from './Stage3D'
import { approach, cloneMaterials, createMaterials, disposeMaterials, setOpacity, type FacadeMaterials, type LabelBus, type Shot } from './kit'
import { prefersReducedMotion } from '../../lib/motion'

/**
 * Stud Frame Cladding: an architectural concrete skin on a structural steel stud frame (the two
 * components of the client's design stage), joined by flex anchors (flexible L-shaped plates) at
 * ferrule inserts cast into the skin; on site the element is dropped onto an L frame on the
 * building and locked from the top. The window surround (head with a cornice, jambs, sill) is an
 * illustration of profiles interconnecting into an envelope, not a client design.
 * Axes: x along the wall, y up, z out; the wall's face on z = 0, the skins' back line 0.14 m out.
 */

export type StudView = 'outcome' | 'components' | 'anchor' | 'site' | 'preview'
type Part = 'wall' | 'surround' | 'skin' | 'frame' | 'anchors' | 'site'
const PARTS: Part[] = ['wall', 'surround', 'skin', 'frame', 'anchors', 'site']

const T = 0.018
const BACK = 0.14
const HEAD_L = 2.4
const STUDS = [-1.1, -0.55, 0, 0.55, 1.1]

export const STUD_SHOTS: Record<StudView, { wide: Shot; compact: Shot }> = {
  outcome: {
    wide: { target: [0, -1.0, 0.1], dist: 13.5, azim: 30, elev: 6, frame: [0.66, 0.5] },
    compact: { target: [0, -1.0, 0.1], dist: 18, azim: 26, elev: 6, frame: [0.5, 0.3] },
  },
  components: {
    wide: { target: [0, 0.29, 0.18], dist: 6.6, azim: 142, elev: 20, frame: [0.36, 0.5] },
    compact: { target: [0, 0.29, 0.18], dist: 8, azim: 142, elev: 20, frame: [0.5, 0.31] },
  },
  anchor: {
    wide: { target: [0.55, 0.22, 0.2], dist: 2.9, azim: 124, elev: 22, frame: [0.64, 0.44] },
    compact: { target: [0.55, 0.22, 0.2], dist: 2.8, azim: 126, elev: 16, frame: [0.5, 0.3] },
  },
  site: {
    wide: { target: [0.85, 0.12, 0.12], dist: 4.2, azim: 44, elev: 15, frame: [0.68, 0.46] },
    compact: { target: [0.5, 0.15, 0.15], dist: 8.4, azim: 50, elev: 13, frame: [0.5, 0.31] },
  },
  preview: {
    wide: { target: [0, 0.29, 0.18], dist: 7.4, azim: 150, elev: 18, frame: [0.5, 0.5] },
    compact: { target: [0, 0.29, 0.18], dist: 10.5, azim: 150, elev: 18, frame: [0.5, 0.5] },
  },
}

/* ---- thin-shell profiles ---------------------------------------------------------------- */

type P2 = [number, number]

/**
 * A skin of thickness T following a polyline (its outer face), as a closed outline: the outer
 * face, then the inner face offset by T towards `side` (+1 the left of the direction of travel,
 * -1 the right), mitred at every bend.
 */
function shellShape(path: P2[], side: 1 | -1) {
  const n = path.length
  const segNormal = (a: P2, b: P2): P2 => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dx, dy)
    return [(-dy / l) * side, (dx / l) * side]
  }
  const inner: P2[] = path.map((p, i) => {
    const n0 = i > 0 ? segNormal(path[i - 1], p) : null
    const n1 = i < n - 1 ? segNormal(p, path[i + 1]) : null
    if (!n0) return [p[0] + n1![0] * T, p[1] + n1![1] * T]
    if (!n1) return [p[0] + n0[0] * T, p[1] + n0[1] * T]
    const mx = n0[0] + n1[0]
    const my = n0[1] + n1[1]
    const ml = Math.hypot(mx, my) || 1
    const ux = mx / ml
    const uy = my / ml
    const k = T / Math.max(0.3, ux * n0[0] + uy * n0[1])
    return [p[0] + ux * k, p[1] + uy * k]
  })
  const shape = new THREE.Shape()
  shape.moveTo(path[0][0], path[0][1])
  for (let i = 1; i < n; i++) shape.lineTo(path[i][0], path[i][1])
  for (let i = n - 1; i >= 0; i--) shape.lineTo(inner[i][0], inner[i][1])
  shape.closePath()
  return shape
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, steps = 8): P2[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / steps
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })

/** the head: soffit, face, a band, an ovolo and a fascia, back to the wall line on top (u = out, v = up) */
const HEAD_PATH: P2[] = [[0, 0], [0.2, 0], [0.2, 0.3], [0.24, 0.3], [0.24, 0.38], ...arc(0.24, 0.5, 0.12, -Math.PI / 2, 0).slice(1), [0.4, 0.5], [0.4, 0.58], [0, 0.58]]
/** a projecting sill sloping back to the window */
const SILL_PATH: P2[] = [[0, -0.1], [0.34, -0.1], [0.34, -0.04], [0.18, 0], [0, 0]]
/** a jamb: return into the opening, the face, and a return back to the wall (u = away from the opening, v = out) */
const JAMB_PATH: P2[] = [[0, 0], [0, 0.22], [0.3, 0.22], [0.3, 0]]

function useExtrusion(path: P2[], side: 1 | -1, depth: number) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(shellShape(path, side), { depth, bevelEnabled: false, curveSegments: 1 }), [path, side, depth])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

/** a profile extruded along x (head, sill): shape u → z, v → y; centred on x = 0 */
function AlongX({ path, length, mat }: { path: P2[]; length: number; mat: THREE.Material }) {
  const geo = useExtrusion(path, 1, length)
  return <mesh geometry={geo} material={mat} rotation={[0, -Math.PI / 2, 0]} position={[length / 2, 0, BACK]} />
}

/** a profile extruded downwards from y = 0 (jambs): shape u → x (mirrored on the right), v → z */
function Down({ path, length, mat, mirror = false }: { path: P2[]; length: number; mat: THREE.Material; mirror?: boolean }) {
  const p = useMemo<P2[]>(() => (mirror ? path.map(([u, v]) => [-u, v] as P2).reverse() : path), [path, mirror])
  // mirrored and reversed, the path keeps its handedness: the skin is always on the right of travel
  const geo = useExtrusion(p, -1, length)
  return <mesh geometry={geo} material={mat} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, BACK]} />
}

/* ---- the head element: skin, stud frame, flex anchors --------------------------------------- */

function Diagonal({ a, b, mat }: { a: [number, number, number]; b: [number, number, number]; mat: THREE.Material }) {
  const { pos, len, rot } = useMemo(() => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const d = vb.clone().sub(va)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
    return { pos: va.add(vb).multiplyScalar(0.5).toArray() as [number, number, number], len: d.length(), rot: new THREE.Euler().setFromQuaternion(q) }
  }, [a, b])
  return (
    <mesh position={pos} rotation={rot} material={mat}>
      <boxGeometry args={[0.03, len, 0.03]} />
    </mesh>
  )
}

const DIAGONALS: [[number, number, number], [number, number, number]][] = [
  [
    [-1.1, 0.07, 0.06],
    [-0.55, 0.48, 0.06],
  ],
  [
    [0.55, 0.07, 0.06],
    [0, 0.48, 0.06],
  ],
  [
    [0.55, 0.48, 0.06],
    [1.1, 0.07, 0.06],
  ],
]

function StudFrame({ m }: { m: FacadeMaterials }) {
  const items: ReactNode[] = []
  const z0 = 0.04
  const z1 = 0.08
  items.push(<Box key="bc" from={[-1.15, 0.03, z0]} to={[1.15, 0.07, z1]} mat={m.steel} />)
  items.push(<Box key="tc" from={[-1.15, 0.48, z0]} to={[1.15, 0.52, z1]} mat={m.steel} />)
  for (const x of STUDS) items.push(<Box key={`s${x}`} from={[x - 0.02, 0.07, z0]} to={[x + 0.02, 0.48, z1]} mat={m.steel} />)
  DIAGONALS.forEach(([a, b], i) => items.push(<Diagonal key={`d${i}`} a={a} b={b} mat={m.steel} />))
  return <>{items}</>
}

function FlexAnchors({ m }: { m: FacadeMaterials }) {
  const items: ReactNode[] = []
  const zFace = BACK + 0.2 - T
  for (const x of [-1.1, -0.55, 0.55, 1.1]) {
    // a flexible L plate from the stud to a ferrule insert in the back of the face
    items.push(<Box key={`h${x}`} from={[x - 0.03, 0.17, 0.08]} to={[x + 0.03, 0.176, zFace]} mat={m.lightGauge} />)
    items.push(<Box key={`v${x}`} from={[x - 0.03, 0.12, zFace - 0.006]} to={[x + 0.03, 0.24, zFace]} mat={m.lightGauge} />)
    items.push(<Box key={`f${x}`} from={[x - 0.011, 0.19, zFace - 0.022]} to={[x + 0.011, 0.212, zFace]} mat={m.darkSteel} />)
    // and one from the top chord to the underside of the cap
    items.push(<Box key={`tv${x}`} from={[x - 0.03, 0.52, 0.074]} to={[x + 0.03, 0.562, 0.08]} mat={m.lightGauge} />)
    items.push(<Box key={`th${x}`} from={[x - 0.03, 0.556, 0.074]} to={[x + 0.03, 0.562, BACK + 0.06]} mat={m.lightGauge} />)
  }
  return <>{items}</>
}

/** on the building: L frames the element is dropped onto, levelling bolts, and the angles that lock it from the top */
function SiteFixings({ m }: { m: FacadeMaterials }) {
  const items: ReactNode[] = []
  for (const x of [-0.8, 0.8]) {
    items.push(<Box key={`lh${x}`} from={[x - 0.07, 0.018, 0]} to={[x + 0.07, 0.026, 0.1]} mat={m.darkSteel} />)
    items.push(<Box key={`lv${x}`} from={[x - 0.07, -0.12, 0]} to={[x + 0.07, 0.026, 0.008]} mat={m.darkSteel} />)
    items.push(
      <mesh key={`b${x}`} position={[x, 0.024, 0.06]} material={m.steel}>
        <cylinderGeometry args={[0.008, 0.008, 0.03, 10]} />
      </mesh>,
    )
    items.push(<Box key={`th${x}`} from={[x - 0.06, 0.52, 0]} to={[x + 0.06, 0.528, 0.09]} mat={m.darkSteel} />)
    items.push(<Box key={`td${x}`} from={[x - 0.06, 0.49, 0.084]} to={[x + 0.06, 0.528, 0.09]} mat={m.darkSteel} />)
  }
  return <>{items}</>
}

function Skin({ m }: { m: FacadeMaterials }) {
  return <AlongX path={HEAD_PATH} length={HEAD_L} mat={m.panel} />
}

/** the joint to the next element, filled with sealant over a backing rod, in the head's own profile */
function Joint({ m }: { m: FacadeMaterials }) {
  const geo = useExtrusion(HEAD_PATH, 1, 0.014)
  return <mesh geometry={geo} material={m.sealant} rotation={[0, -Math.PI / 2, 0]} position={[HEAD_L / 2 + 0.016, 0, BACK]} />
}

export function StudFrameModel({ view, bus, active = true, offset = [0, 0, 0] }: { view: StudView; bus: LabelBus; active?: boolean; offset?: [number, number, number] }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const base = useMemo(() => createMaterials(), [])
  const parts = useMemo(() => Object.fromEntries(PARTS.map((p) => [p, cloneMaterials(base)])) as Record<Part, FacadeMaterials>, [base])
  useEffect(
    () => () => {
      disposeMaterials(base)
      for (const p of PARTS) disposeMaterials(parts[p])
    },
    [base, parts],
  )
  const head = useRef<THREE.Group>(null)
  const cable = useRef<THREE.Mesh>(null)
  const state = useRef<Record<string, number>>({ all: 0, lift: 0, ...Object.fromEntries(PARTS.map((p) => [`o_${p}`, 0])) })
  const last = useRef<StudView | null>(null)

  useEffect(() => {
    // entering the site view, the element starts a little above its place and is lowered onto the L frame
    if (view === 'site' && last.current !== 'site' && !reduced) state.current.lift = 1.3
    last.current = view
    invalidate()
  }, [view, reduced, invalidate])
  useEffect(() => invalidate(), [active, invalidate])

  const vis: Record<StudView, Record<Part, number>> = {
    outcome: { wall: 1, surround: 1, skin: 1, frame: 1, anchors: 1, site: 0 },
    components: { wall: 0, surround: 0, skin: 1, frame: 1, anchors: 1, site: 0 },
    anchor: { wall: 0, surround: 0, skin: 1, frame: 1, anchors: 1, site: 0 },
    site: { wall: 1, surround: 0, skin: 1, frame: 1, anchors: 1, site: 1 },
    preview: { wall: 0, surround: 0, skin: 1, frame: 1, anchors: 1, site: 0 },
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = state.current
    const lam = reduced ? 1e3 : 3
    let moving = false
    const go = (k: string, to: number, l = lam) => {
      if (approach(s, k, to, l, dt, 2e-4)) moving = true
    }
    go('all', active ? 1 : 0, reduced ? 1e3 : 4.5)
    go('lift', 0, reduced ? 1e3 : 1.6)
    for (const p of PARTS) {
      go(`o_${p}`, vis[view][p])
      setOpacity(Object.values(parts[p]) as THREE.Material[], s[`o_${p}`] * s.all)
    }
    if (head.current) head.current.position.y = s.lift
    // the hoist line shows while the element is still being lowered
    if (cable.current) {
      const o = Math.min(1, s.lift / 0.25) * s.all
      ;(cable.current.material as THREE.Material).opacity = o
      cable.current.visible = o > 0.01
    }
    if (moving) invalidate()
  }, -2)

  return (
    <group position={offset}>
      <group>
        {/* the building wall with its window opening, behind the surround */}
        <Box from={[-2.0, -2.9, -0.25]} to={[-0.9, 1.0, 0]} mat={parts.wall.wall} />
        <Box from={[0.9, -2.9, -0.25]} to={[2.0, 1.0, 0]} mat={parts.wall.wall} />
        <Box from={[-0.9, 0.0, -0.25]} to={[0.9, 1.0, 0]} mat={parts.wall.wall} />
        <Box from={[-0.9, -2.9, -0.25]} to={[0.9, -2.4, 0]} mat={parts.wall.wall} />
        <Box from={[-0.9, -2.4, -0.14]} to={[0.9, 0, -0.11]} mat={parts.wall.glass} />
        {/* the room behind the glass, so the glass reads as a window and not as a hole in the wall */}
        <Box from={[-0.95, -2.45, -0.3]} to={[0.95, 0.05, -0.29]} mat={parts.wall.gasket} />
        <Box from={[-0.92, -2.4, -0.16]} to={[0.92, -2.34, -0.1]} mat={parts.wall.alu} />
        <Box from={[-0.92, -0.06, -0.16]} to={[0.92, 0, -0.1]} mat={parts.wall.alu} />
        <Anchor bus={bus} id="s-wall" position={[1.8, -1.6, 0]} />
      </group>
      <group>
        {/* jambs and sill: the other profiles of the surround */}
        <group position={[-0.9, 0, 0]}>
          <Down path={JAMB_PATH} length={2.4} mat={parts.surround.panel} mirror />
        </group>
        <group position={[0.9, 0, 0]}>
          <Down path={JAMB_PATH} length={2.4} mat={parts.surround.panel} />
        </group>
        <group position={[0, -2.4, 0]}>
          <AlongX path={SILL_PATH} length={2.4} mat={parts.surround.panel} />
        </group>
        <Anchor bus={bus} id="s-jamb" position={[1.2, -1.2, BACK + 0.22]} />
        <Anchor bus={bus} id="s-sill" position={[0.6, -2.42, BACK + 0.34]} />
      </group>
      <group ref={head}>
        <Skin m={parts.skin} />
        <StudFrame m={parts.frame} />
        <FlexAnchors m={parts.anchors} />
        <mesh ref={cable} position={[0, 3.3, 0.2]} material={parts.site.ink}>
          <cylinderGeometry args={[0.005, 0.005, 5.5, 6]} />
        </mesh>
        <Anchor bus={bus} id="s-head" position={[-0.5, 0.44, BACK + 0.29]} />
        <Anchor bus={bus} id="s-skin" position={[-0.7, 0.28, BACK + 0.2 - T]} />
        <Anchor bus={bus} id="s-frame" position={[-0.55, 0.36, 0.04]} />
        <Anchor bus={bus} id="s-stiffener" position={[0.82, 0.27, 0.045]} />
        <Anchor bus={bus} id="s-anchor" position={[-0.55, 0.174, 0.2]} />
        <Anchor bus={bus} id="s-plate" position={[0.55, 0.174, 0.22]} />
        <Anchor bus={bus} id="s-ferrule" position={[0.55, 0.2, BACK + 0.2 - T - 0.022]} />
        <Anchor bus={bus} id="s-tube" position={[0.55, 0.3, 0.04]} />
      </group>
      <group>
        <SiteFixings m={parts.site} />
        <group position={[HEAD_L + 0.03, 0, 0]}>
          <Skin m={parts.site} />
        </group>
        <Joint m={parts.site} />
        <Anchor bus={bus} id="s-lframe" position={[0.8, -0.06, 0.004]} />
        <Anchor bus={bus} id="s-bolt" position={[-0.8, 0.034, 0.06]} />
        <Anchor bus={bus} id="s-lock" position={[0.8, 0.528, 0.05]} />
        <Anchor bus={bus} id="s-joint" position={[HEAD_L / 2 + 0.009, 0.42, BACK + 0.24]} />
      </group>
    </group>
  )
}
