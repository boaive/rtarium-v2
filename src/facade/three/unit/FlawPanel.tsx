import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { ArrowLine } from '../Box'
import { Anchor } from '../Stage3D'
import { approach, type LabelBus } from '../kit'
import { prefersReducedMotion } from '../../../lib/motion'
import { smooth } from '../../progress'
import { StudioFog } from './BurstUnit'

/**
 * The four problems of a conventional thin precast panel, on one panel (Unitized page, pain points).
 * The concrete is drawn see-through so the chopped fibre inside it reads. What it shows follows the
 * scroll exactly (`mix`, written by the section from the same value as its cards): `w`, how far each
 * problem is the one shown (the camera and the panel turn with it), and `act`, how far each has
 * played out:
 *
 *   0  direction weakness   the fibres turn to lie one way; the panel cracks along them
 *   1  clumping             the fibres gather into clumps, leaving bare concrete between
 *   2  isolated anchorage   seen from the back: one fixing takes the load through its bracket; the
 *                           stress gathers round it in rings, cracks run out from it, and the
 *                           cone of concrete it holds on comes out with it
 *   3  length to weight     the panel grows longer, and has to grow thicker with it
 *
 * Pointing at a passed problem (`hover`) shows it played out, easing there and back in time; dragging
 * turns the panel. A visual model of each problem, not a test.
 */

const W = 1.2
const H = 0.8
const T = 0.03
const N = 360
const CLUMPS: [number, number][] = [
  [-0.38, 0.2],
  [0.05, 0.24],
  [0.4, 0.12],
  [-0.24, -0.2],
  [0.24, -0.22],
]

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** the crack: a ragged line across the panel, a little above the middle */
function crackY(x: number) {
  return 0.03 + 0.018 * Math.sin(x * 23 + 1.2) + 0.011 * Math.sin(x * 57 + 0.4) + 0.006 * Math.sin(x * 131)
}

/** one half of the panel, above or below the crack, as a slab of the panel's thickness */
function halfGeometry(upper: boolean) {
  const s = new THREE.Shape()
  const steps = 60
  s.moveTo(-W / 2, upper ? H / 2 : -H / 2)
  s.lineTo(W / 2, upper ? H / 2 : -H / 2)
  for (let i = 0; i <= steps; i++) {
    const x = W / 2 - (i / steps) * W
    s.lineTo(x, crackY(x))
  }
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false })
  g.translate(0, 0, -T / 2)
  return g
}

export const FLAW_STATES = 4
const FLAW_IDS = [0, 1, 2, 3]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** the one fixing, on the back face */
const FIX: [number, number] = [0.15, -0.08]
const CONE_R = 0.085

/** the cracks a pulled fixing opens on the back face: ragged lines out from it, and the ring at the cone's edge */
function crackGeometry() {
  const rnd = seeded(29)
  const pts: number[] = []
  for (let k = 0; k < 9; k++) {
    let a = (k / 9) * Math.PI * 2 + rnd() * 0.4
    let r = 0.018
    let x = Math.cos(a) * r
    let y = Math.sin(a) * r
    const end = 0.11 + rnd() * 0.07
    while (r < end) {
      r += 0.012
      a += (rnd() - 0.5) * 0.35
      const nx = Math.cos(a) * r
      const ny = Math.sin(a) * r
      pts.push(x, y, 0, nx, ny, 0)
      x = nx
      y = ny
    }
  }
  const ring: number[] = []
  for (let i = 0; i < 48; i++) {
    const a0 = (i / 48) * Math.PI * 2
    const a1 = ((i + 1) / 48) * Math.PI * 2
    const j0 = CONE_R * (1 + (rnd() - 0.5) * 0.08)
    const j1 = CONE_R * (1 + (rnd() - 0.5) * 0.08)
    ring.push(Math.cos(a0) * j0, Math.sin(a0) * j0, 0, Math.cos(a1) * j1, Math.sin(a1) * j1, 0)
  }
  const g = (arr: number[]) => {
    const b = new THREE.BufferGeometry()
    b.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    return b
  }
  return { radial: g(pts), ring: g(ring), radialCount: pts.length / 3 }
}

export interface FlawMix {
  /** how far each problem is the one shown (they sum to 1) */
  w: number[]
  /** how far each has played out */
  act: number[]
}

export function FlawPanel({ mix, hover, drag, bus, live, compact = false }: { mix: { current: FlawMix }; hover: number | null; drag: { current: number }; bus: LabelBus; live: { current: boolean }; compact?: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  const m = useMemo(
    () => ({
      // see-through concrete: the fibre inside it is what matters here
      concrete: new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.9, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }),
      edge: new THREE.LineBasicMaterial({ color: '#e9e4d8', transparent: true, opacity: 0.55 }),
      fibre: new THREE.MeshStandardMaterial({ color: '#f4f6f2', emissive: '#6d736f', roughness: 0.35 }),
      cone: new THREE.MeshStandardMaterial({ color: '#bdb6a8', roughness: 0.95 }),
      steel: new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.75, roughness: 0.32 }),
      load: new THREE.MeshBasicMaterial({ color: '#fdd001', toneMapped: false, transparent: true }),
      crack: new THREE.LineBasicMaterial({ color: '#fdd001', transparent: true, opacity: 0.95, toneMapped: false }),
      stress: new THREE.MeshBasicMaterial({ color: '#fdd001', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    }),
    [],
  )
  const cracks = useMemo(crackGeometry, [])
  /** each ring fades on its own, so each has its own material */
  const stressMats = useMemo(() => [0, 1, 2].map(() => m.stress.clone()), [m])
  const geo = useMemo(() => {
    const upper = halfGeometry(true)
    const lower = halfGeometry(false)
    const whole = new THREE.BoxGeometry(W, H, T)
    return {
      upper,
      lower,
      whole,
      wholeEdges: new THREE.EdgesGeometry(whole),
      upperEdges: new THREE.EdgesGeometry(upper, 30),
      lowerEdges: new THREE.EdgesGeometry(lower, 30),
      fibre: new THREE.CylinderGeometry(0.0022, 0.0022, 0.06, 5).rotateZ(Math.PI / 2),
      cone: new THREE.CylinderGeometry(0.022, 0.085, T * 0.98, 28, 1).rotateX(Math.PI / 2),
      ferrule: new THREE.CylinderGeometry(0.014, 0.014, 0.034, 14).rotateX(Math.PI / 2),
      bolt: new THREE.CylinderGeometry(0.008, 0.008, 0.09, 10).rotateX(Math.PI / 2),
      // the bracket the load comes in through: an angle bolted to the fixing
      bracket: new THREE.BoxGeometry(0.11, 0.07, 0.006),
      bracketLeg: new THREE.BoxGeometry(0.11, 0.006, 0.07).translate(0, -0.035, -0.035),
      ring: new THREE.RingGeometry(0.94, 1, 64),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      Object.values(m).forEach((x) => x.dispose())
      cracks.radial.dispose()
      cracks.ring.dispose()
      stressMats.forEach((x) => x.dispose())
    },
    [geo, m, cracks, stressMats],
  )

  // each strand: where it lies, its turn in the panel's plane, and the clump it gathers into
  const fibres = useMemo(() => {
    const rnd = seeded(11)
    return Array.from({ length: N }, () => {
      const c = CLUMPS[Math.floor(rnd() * CLUMPS.length)]
      const r = Math.sqrt(rnd()) * 0.07
      const t = rnd() * Math.PI * 2
      const a = rnd() * Math.PI
      return {
        x: (rnd() - 0.5) * (W - 0.08),
        y: (rnd() - 0.5) * (H - 0.08),
        z: (rnd() - 0.5) * T * 0.6,
        a,
        // turning to lie flat: whichever way is nearer
        to: a < Math.PI / 2 ? 0 : Math.PI,
        cx: c[0] + Math.cos(t) * r,
        cy: c[1] + Math.sin(t) * r,
      }
    })
  }, [])

  /** the pointed-at problem blended over the scroll's (`h`), and which one it was (`at`) */
  const s = useRef({ h: 0, at: 0 })
  const strands = useRef<THREE.InstancedMesh>(null)
  const panel = useRef<THREE.Group>(null)
  const upper = useRef<THREE.Group>(null)
  const lower = useRef<THREE.Group>(null)
  const cone = useRef<THREE.Group>(null)
  const pull = useRef<THREE.Group>(null)
  const split = useRef<THREE.Group>(null)
  const splitArrows = useRef<(THREE.Group | null)[]>([])
  const whole = useRef<THREE.Group>(null)
  const weight = useRef<THREE.Group>(null)
  const stress = useRef<(THREE.Mesh | null)[]>([])
  const crackGroup = useRef<THREE.Group>(null)
  const crackRing = useRef<THREE.LineSegments>(null)
  useEffect(() => invalidate(), [hover, invalidate])

  const mx = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const zAxis = useMemo(() => new THREE.Vector3(0, 0, 1), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const k = s.current
    let moving = false
    if (hover !== null) k.at = hover
    if (approach(k, 'h', hover !== null ? 1 : 0, reduced ? 1e3 : 5, dt, 1e-3)) moving = true
    // the scroll's problem, or the one pointed at, played out
    const W = FLAW_IDS.map((i) => lerp(mix.current.w[i] ?? 0, i === k.at ? 1 : 0, k.h))
    const A = FLAW_IDS.map((i) => lerp(mix.current.act[i] ?? 0, i === k.at ? 1 : (mix.current.act[i] ?? 0), k.h))
    const align = W[0] * smooth(0, 0.55, A[0])
    const crackOpen = W[0] * smooth(0.45, 1, A[0])
    const gather = W[1] * smooth(0, 1, A[1])
    const grow = W[3] * smooth(0, 1, A[3])
    // the camera: in front for most, round the back for the anchor, further off as the panel grows
    const az = 18 + W[2] * 134 + W[3] * 10 + drag.current
    const el = 12 + W[2] * 6 + W[3] * 4
    // (the grown panel and the arrow of its weight under it both kept in the box)
    // on the open stage the panel stands a little further off, so it and its arrows keep clear of the edges
    const d = (3.1 - W[2] * 0.4 + W[3] * 0.45 + grow * 3.2) * (compact ? 1.15 : 1.22)
    const t = performance.now() / 1000
    const idle = !reduced && live.current
    const sway = idle ? 3 * Math.sin((t * Math.PI * 2) / 14) : 0
    const Az = ((az + sway) * Math.PI) / 180
    const E = (el * Math.PI) / 180
    const ty = -grow * 0.21 + W[2] * FIX[1] * 0.8
    const tx = W[2] * FIX[0] * 0.8
    camera.fov = 26
    camera.position.set(tx + d * Math.cos(E) * Math.sin(Az), ty + d * Math.sin(E), d * Math.cos(E) * Math.cos(Az))
    camera.lookAt(tx, ty, 0)
    // held a little high on a large screen, clear of the title block under it
    camera.setViewOffset(size.width, size.height, 0, compact ? 0 : size.height * 0.04, size.width, size.height)
    camera.updateProjectionMatrix()

    // the fibres: turned to lie one way, gathered into clumps, or gone for the long panel
    const im = strands.current
    if (im) {
      const fade = 1 - W[3]
      sc.setScalar(Math.max(0.001, fade))
      fibres.forEach((f, i) => {
        const a = f.a + (f.to - f.a) * align
        const x = f.x + (f.cx - f.x) * gather
        const y = f.y + (f.cy - f.y) * gather
        // strands in the upper half travel with it as the crack opens
        const off = (y > crackY(x) ? 1 : -1) * 0.016 * crackOpen
        q.setFromAxisAngle(zAxis, a)
        v.set(x, y + off, f.z)
        mx.compose(v, q, sc)
        im.setMatrixAt(i, mx)
      })
      im.instanceMatrix.needsUpdate = true
      im.visible = fade > 0.01
    }
    // the panel is whole unless it is cracking; then it is its two halves
    const cracked = crackOpen > 0.004
    if (whole.current) whole.current.visible = !cracked
    if (upper.current) {
      upper.current.visible = cracked
      upper.current.position.y = 0.016 * crackOpen
    }
    if (lower.current) {
      lower.current.visible = cracked
      lower.current.position.y = -0.016 * crackOpen
    }
    // the pull across the fibres comes on as they turn, before the crack opens
    const pullOn = W[0] * smooth(0.1, 0.45, A[0])
    if (split.current) split.current.visible = pullOn > 0.01
    // each arrow grows out from the panel's edge
    for (const a of splitArrows.current) a?.scale.set(1, Math.max(0.001, pullOn), 1)
    // the anchorage, played out with the scroll: the load comes on, the stress gathers in rings
    // round the fixing, cracks run out from it, and the cone comes out with it
    const t2 = A[2] * 2.8
    const load = smooth(0, 0.6, t2)
    const crack = smooth(0.9, 1.8, t2)
    const out = smooth(1.8, 2.6, t2)
    if (cone.current) {
      cone.current.visible = W[2] > 0.01
      cone.current.position.z = -out * 0.07
    }
    if (pull.current) {
      pull.current.visible = W[2] > 0.01
      pull.current.scale.setScalar(Math.max(0.001, W[2] * (0.35 + 0.65 * load)))
      pull.current.position.z = -T / 2 - 0.08 - out * 0.07
    }
    // the rings: stress gathering round the one fixing, ring after ring until it lets go
    stress.current.forEach((ring, i) => {
      if (!ring) return
      const ph = (((t2 - 0.3) / 1.4 + i / 3) % 1 + 1) % 1
      const on = W[2] > 0.5 && t2 > 0.3 && out < 0.05
      ring.visible = on
      ring.scale.setScalar(0.02 + ph * 0.16)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = on ? 0.55 * (1 - ph) * load : 0
    })
    if (crackGroup.current) crackGroup.current.visible = W[2] > 0.01 && crack > 0.001
    cracks.radial.setDrawRange(0, Math.floor((cracks.radialCount * crack) / 2) * 2)
    if (crackRing.current) crackRing.current.visible = crack > 0.6
    m.load.opacity = 1
    if (panel.current) {
      panel.current.scale.y = 1 + grow * 1.1
      panel.current.scale.z = 1 + grow * 2.2
    }
    if (weight.current) {
      weight.current.position.y = (-H / 2) * (1 + grow * 1.1) - 0.08
      weight.current.visible = grow > 0.01
      weight.current.scale.setScalar(Math.max(0.001, grow))
    }
    if (moving || idle) invalidate()
  }, -1)

  return (
    <group>
      <group ref={panel}>
        <group ref={whole}>
          <mesh geometry={geo.whole} material={m.concrete} renderOrder={2} castShadow />
          <lineSegments geometry={geo.wholeEdges} material={m.edge} />
        </group>
        <group ref={upper} visible={false}>
          <mesh geometry={geo.upper} material={m.concrete} renderOrder={2} castShadow />
          <lineSegments geometry={geo.upperEdges} material={m.edge} />
        </group>
        <group ref={lower} visible={false}>
          <mesh geometry={geo.lower} material={m.concrete} renderOrder={2} castShadow />
          <lineSegments geometry={geo.lowerEdges} material={m.edge} />
        </group>
        <instancedMesh ref={strands} args={[geo.fibre, m.fibre, N]} frustumCulled={false} />
        {/* the fixing at the back, its bracket, and the cone of concrete it holds on */}
        <group ref={cone} position={[FIX[0], FIX[1], 0]} visible={false}>
          <mesh geometry={geo.cone} material={m.cone} />
          <mesh geometry={geo.ferrule} material={m.steel} position={[0, 0, -T / 2 + 0.006]} />
          <mesh geometry={geo.bolt} material={m.steel} position={[0, 0, -T / 2 - 0.02]} />
          <group position={[0, 0, -T / 2 - 0.004]}>
            <mesh geometry={geo.bracket} material={m.steel} />
            <mesh geometry={geo.bracketLeg} material={m.steel} />
          </group>
        </group>
        {/* on the back face round the fixing: the stress rings and the cracks */}
        <group position={[FIX[0], FIX[1], -T / 2 - 0.0012]} rotation={[0, Math.PI, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} ref={(el) => void (stress.current[i] = el)} geometry={geo.ring} material={stressMats[i]} visible={false} />
          ))}
          <group ref={crackGroup} visible={false}>
            <lineSegments geometry={cracks.radial} material={m.crack} />
            <lineSegments ref={crackRing} geometry={cracks.ring} material={m.crack} visible={false} />
          </group>
        </group>
        <Anchor bus={bus} id="f-crack" position={[0.38, crackY(0.38), T / 2]} />
        <Anchor bus={bus} id="f-bare" position={[-0.05, -0.02, T / 2]} />
        <Anchor bus={bus} id="f-top" position={[-W / 2, H / 2, T / 2]} />
        <Anchor bus={bus} id="f-edge" position={[W / 2, -H / 4, T / 2]} />
      </group>
      {/* the pull that opens the crack, across the fibres */}
      <group ref={split} visible={false}>
        <group ref={(el) => void (splitArrows.current[0] = el)} position={[-0.42, H / 2 + 0.03, 0]}>
          <ArrowLine length={0.14} mat={m.load} radius={0.006} />
        </group>
        <group ref={(el) => void (splitArrows.current[1] = el)} position={[-0.42, -H / 2 - 0.03, 0]} rotation={[0, 0, Math.PI]}>
          <ArrowLine length={0.14} mat={m.load} radius={0.006} />
        </group>
      </group>
      {/* the load on the fixing, pulling it out of the back */}
      <group ref={pull} position={[FIX[0], FIX[1], -T / 2 - 0.08]} visible={false}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ArrowLine length={0.26} mat={m.load} radius={0.006} />
        </group>
        <Anchor bus={bus} id="f-cone" position={[0, 0, 0.05]} />
      </group>
      {/* the studio the burst stands in: a fine grid going into the dark, the shadows on it */}
      <StudioFog color="#0b0b0b" near={7} far={16} />
      <gridHelper args={[14, 56, '#2e2e2e', '#232323']} position={[0, -0.98, 0]} />
      <mesh position={[0, -0.975, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <shadowMaterial color="#000000" opacity={0.42} transparent depthWrite={false} />
      </mesh>
      {/* its own weight, growing with it */}
      <group ref={weight} position={[0, -H / 2 - 0.08, 0.12]} visible={false}>
        <group rotation={[0, 0, Math.PI]}>
          <ArrowLine length={0.34} mat={m.load} radius={0.008} />
        </group>
      </group>
    </group>
  )
}
