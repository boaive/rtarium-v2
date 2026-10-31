import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { approach } from '../../facade/three/kit'
import { MovingKeyLight } from '../../facade/three/Stage3D'
import { prefersReducedMotion } from '../../lib/motion'
import { merge } from '../../facade/three/unit/parts'
import { block, disposeFloorMaterials, floorMaterials } from './floor'

/**
 * The three applications side by side, each above its column, as the Façade overview's systems stand
 * (its camera, its light, its turn on hover). Each is the same piece of floor (slab, RTARIUM, screed,
 * the layers showing at its edge) with what it has to carry:
 *
 *   data & AI centres     two rows of server racks either side of an aisle, cable trays over them
 *   automated warehouse   pallet racking, loaded, an autonomous robot in its lane
 *   semiconductor plant   a process tool and its load ports on a raised floor, an overhead carrier
 *
 * Sizes and details are of the kind, not of a project. They rise one after another as the section
 * arrives; the one pointed at turns towards the visitor.
 *
 * Every model stands straight: the camera looks level from above, its frame lowered onto the floors (a
 * shift lens), so what stands upright is drawn upright across the whole width; from far back on a long
 * lens, each floor turned as much again as it stands off to the side, so the three are seen alike.
 */

const DEG = Math.PI / 180
const FOV = 10
const DIST = 14.6
/** the floor stands below the middle of the canvas, its front corner clear of the words under it */
const TARGET_Y = 0.2
/** how far above the floors the camera stands, as the angle they are seen from (rad) */
const ELEV = 0.16
const TURN = -0.62
const P = { w: 1.6, d: 1.1, t: 0.1 }

type Key = 'graphite' | 'door' | 'steel' | 'upright' | 'beam' | 'carton' | 'timber' | 'white' | 'glass' | 'led' | 'lane'
type Parts = Partial<Record<Key, THREE.BufferGeometry[]>>
const put = (p: Parts, k: Key, ...g: THREE.BufferGeometry[]) => void (p[k] ??= []).push(...g)

function dataCentre() {
  const p: Parts = {}
  const W = 0.27
  const H = 1.08
  for (const [z0, z1] of [
    [-0.42, -0.14],
    [0.06, 0.34],
  ])
    for (let i = 0; i < 5; i++) {
      const x0 = -0.675 + i * W
      const x1 = x0 + W - 0.008
      put(p, 'graphite', block([x0, 0, z0], [x1, H, z1]))
      // the door, its handle, its status lights, the vents down it
      put(p, 'door', block([x0 + 0.012, 0.03, z1], [x1 - 0.012, H - 0.03, z1 + 0.006]))
      put(p, 'steel', block([x1 - 0.04, 0.5, z1 + 0.006], [x1 - 0.028, 0.62, z1 + 0.014]))
      for (let j = 0; j < 7; j++) put(p, 'graphite', block([x0 + 0.03, 0.12 + j * 0.13, z1 + 0.006], [x1 - 0.06, 0.135 + j * 0.13, z1 + 0.008]))
      for (let j = 0; j < 4; j++) put(p, 'led', block([x0 + 0.03 + j * 0.022, H - 0.075, z1 + 0.006], [x0 + 0.042 + j * 0.022, H - 0.063, z1 + 0.008]))
    }
  // the cable trays over the rows: two rails and their rungs, on short hangers
  for (const z of [-0.28, 0.2]) {
    put(p, 'steel', block([-0.7, H + 0.1, z - 0.07], [0.7, H + 0.118, z - 0.06]), block([-0.7, H + 0.1, z + 0.06], [0.7, H + 0.118, z + 0.07]))
    for (let x = -0.68; x <= 0.68; x += 0.08) put(p, 'steel', block([x, H + 0.1, z - 0.06], [x + 0.012, H + 0.106, z + 0.06]))
    for (const x of [-0.5, 0, 0.5]) put(p, 'steel', block([x - 0.006, H, z - 0.006], [x + 0.006, H + 0.1, z + 0.006]))
  }
  return p
}

function warehouse() {
  const p: Parts = {}
  const [z0, z1] = [-0.46, -0.02]
  const H = 1.24
  const X = [-0.74, 0, 0.74]
  // the uprights, each a frame braced across its depth
  for (const x of X) {
    for (const z of [z0, z1]) put(p, 'upright', block([x - 0.018, 0, z - 0.018], [x + 0.018, H, z + 0.018]))
    for (let y = 0.08; y < H - 0.1; y += 0.2) put(p, 'upright', block([x - 0.006, y, z0], [x + 0.006, y + 0.012, z1]))
  }
  // the beams, each level, and on each the pallets and their load (no two alike)
  let n = 0
  for (const y of [0, 0.31, 0.62, 0.93]) {
    if (y) for (let b = 0; b < 2; b++) for (const z of [z0, z1]) put(p, 'beam', block([X[b] + 0.018, y - 0.035, z - 0.012], [X[b + 1] - 0.018, y, z + 0.012]))
    for (let b = 0; b < 2; b++)
      for (const cx of [X[b] + 0.2, X[b] + 0.54]) {
        n++
        if (n % 7 === 3) continue
        const h = 0.13 + ((n * 37) % 11) * 0.011
        put(p, 'timber', block([cx - 0.14, y + 0.002, z0 + 0.03], [cx + 0.14, y + 0.022, z1 - 0.03]))
        put(p, 'carton', block([cx - 0.13, y + 0.022, z0 + 0.04], [cx + 0.13, y + 0.022 + h, z1 - 0.04]))
        put(p, 'timber', block([cx - 0.13, y + 0.022 + h * 0.5, z1 - 0.04], [cx + 0.13, y + 0.022 + h * 0.5 + 0.004, z1 - 0.038]))
      }
  }
  put(p, 'beam', block([-0.74, H - 0.03, z0 - 0.012], [0.74, H, z0 + 0.012]), block([-0.74, H - 0.03, z1 - 0.012], [0.74, H, z1 + 0.012]))
  // the lane marked on the floor, and the robot in it carrying a tote on its lift
  for (const z of [0.09, 0.47]) put(p, 'lane', block([-0.76, 0, z], [0.76, 0.002, z + 0.018]))
  put(p, 'graphite', block([-0.04, 0.018, 0.17], [0.32, 0.09, 0.39]))
  put(p, 'door', block([0.03, 0.09, 0.2], [0.25, 0.105, 0.36]))
  put(p, 'carton', block([0.04, 0.105, 0.21], [0.24, 0.24, 0.35]))
  put(p, 'led', block([0.32, 0.05, 0.2], [0.324, 0.065, 0.36]))
  for (const x of [0.02, 0.26]) for (const z of [0.165, 0.39]) put(p, 'door', block([x - 0.025, 0, z - 0.008], [x + 0.025, 0.04, z + 0.008]))
  return p
}

function semiconductor() {
  const p: Parts = {}
  const F = 0.05
  // the raised floor on its pedestals, its tiles marked out
  put(p, 'white', block([-0.74, 0.012, -0.48], [0.74, F, 0.48]))
  for (const x of [-0.7, 0, 0.7]) for (const z of [-0.44, 0.44]) put(p, 'steel', block([x - 0.012, 0, z - 0.012], [x + 0.012, 0.012, z + 0.012]))
  for (let x = -0.74; x < 0.74; x += 0.185) put(p, 'lane', block([x, F, -0.48], [x + 0.003, F + 0.001, 0.48]))
  for (let z = -0.48; z < 0.48; z += 0.185) put(p, 'lane', block([-0.74, F, z], [0.74, F + 0.001, z + 0.003]))
  // the tool: its chamber with a viewing window, its upper module, its service unit
  put(p, 'white', block([-0.62, F, -0.34], [0.1, 0.76, 0.14]), block([-0.48, 0.76, -0.26], [-0.02, 0.92, 0.08]), block([0.1, F, -0.26], [0.56, 0.5, 0.12]))
  put(p, 'steel', block([-0.5, 0.38, 0.14], [-0.06, 0.64, 0.146]))
  put(p, 'glass', block([-0.48, 0.4, 0.146], [-0.08, 0.62, 0.15]))
  put(p, 'door', block([-0.58, 0.12, 0.14], [-0.04, 0.3, 0.144]))
  for (let i = 0; i < 6; i++) put(p, 'graphite', block([-0.56, 0.15 + i * 0.024, 0.144], [-0.06, 0.156 + i * 0.024, 0.146]))
  // the load ports along the service unit's front, a carrier on each
  put(p, 'steel', block([0.13, 0.26, 0.12], [0.54, 0.28, 0.25]))
  for (const x of [0.16, 0.3, 0.44]) {
    put(p, 'white', block([x, 0.28, 0.13], [x + 0.08, 0.37, 0.23]))
    put(p, 'graphite', block([x + 0.02, 0.37, 0.16], [x + 0.06, 0.385, 0.2]))
  }
  // the signal tower
  put(p, 'steel', block([0.5, 0.5, -0.2], [0.51, 0.54, -0.19]))
  put(p, 'beam', block([0.495, 0.54, -0.205], [0.515, 0.585, -0.185]))
  put(p, 'led', block([0.495, 0.585, -0.205], [0.515, 0.625, -0.185]))
  // the overhead track, and a carrier hanging from it over the ports
  const R = 1.12
  for (const x of [-0.7, 0.7]) put(p, 'steel', block([x - 0.012, F, 0.31], [x + 0.012, R, 0.334]))
  put(p, 'steel', block([-0.72, R, 0.3], [0.72, R + 0.03, 0.344]))
  put(p, 'graphite', block([0.22, R - 0.075, 0.28], [0.36, R, 0.364]))
  put(p, 'white', block([0.25, R - 0.17, 0.285], [0.33, R - 0.075, 0.36]))
  return p
}

function trioMaterials() {
  const f = floorMaterials()
  const std = (color: string, metalness: number, roughness: number) => new THREE.MeshStandardMaterial({ color, metalness, roughness })
  return {
    ...f,
    graphite: std('#1d1f21', 0.45, 0.5),
    door: std('#2e3134', 0.5, 0.42),
    steel: std('#8e949a', 0.65, 0.4),
    upright: std('#3f4a57', 0.5, 0.45),
    beam: std('#d9a900', 0.2, 0.5),
    carton: std('#ad8b5e', 0, 0.9),
    timber: std('#8a6d48', 0, 0.9),
    white: std('#e8e6e0', 0.05, 0.55),
    glass: std('#20282d', 0.7, 0.12),
    led: new THREE.MeshBasicMaterial({ color: '#fdd001', toneMapped: false }),
    lane: new THREE.MeshBasicMaterial({ color: '#b9b5ac' }),
    rtarium: std('#a07a55', 0.05, 0.75),
  }
}

export function FlooringTrio({ play, hover, live, pick }: { play: boolean; hover: number | null; live?: { current: boolean }; pick?: number[] }) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const m = useMemo(trioMaterials, [])
  const geo = useMemo(() => {
    const floor = {
      slab: block([-P.w / 2, -P.t, -P.d / 2], [P.w / 2, -0.036, P.d / 2]),
      layer: block([-P.w / 2 + 0.002, -0.036, -P.d / 2 + 0.002], [P.w / 2 - 0.002, -0.02, P.d / 2 - 0.002]),
      screed: block([-P.w / 2, -0.02, -P.d / 2], [P.w / 2, 0, P.d / 2]),
    }
    const models = [dataCentre(), warehouse(), semiconductor()].map((p) => (Object.entries(p) as [Key, THREE.BufferGeometry[]][]).map(([k, list]) => ({ k, g: merge(list) })))
    return { floor, models }
  }, [])
  // a page that shows only some of the three (the other applications) names which, in order
  const slots = useMemo(() => (pick ? geo.models.filter((_, i) => pick.includes(i)) : geo.models), [geo, pick?.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      Object.values(geo.floor).forEach((g) => g.dispose())
      geo.models.forEach((list) => list.forEach((x) => x.g.dispose()))
      for (const x of [m.graphite, m.door, m.steel, m.upright, m.beam, m.carton, m.timber, m.white, m.glass, m.led, m.lane, m.rtarium]) x.dispose()
      disposeFloorMaterials(m)
    },
    [geo, m],
  )

  // the slots sit under their columns: an equal share of the view's width each, at the floors' depth
  const aspect = size.width / Math.max(1, size.height)
  const depth = DIST * Math.cos(ELEV)
  const viewW = 2 * depth * Math.tan((FOV / 2) * DEG) * aspect
  const colW = viewW / slots.length
  const xs = slots.map((_, i) => (i - (slots.length - 1) / 2) * colW)
  // the share of its column a floor takes, the cladding models' own; never taller than the canvas allows
  const fill = aspect < 2 ? 0.8 : 0.47
  const scale = Math.min((colW * fill) / (P.w * Math.cos(TURN) + P.d * Math.sin(-TURN)), 1.02)
  const groundY = -P.t * scale - 0.004

  useEffect(() => {
    camera.fov = FOV
    camera.position.set(0, TARGET_Y + DIST * Math.sin(ELEV), depth)
    camera.lookAt(0, camera.position.y, 0)
    // the frame lowered until the target stands in the middle of the canvas, as the tipped camera had it
    camera.setViewOffset(size.width, size.height, 0, (Math.tan(ELEV) / Math.tan((FOV / 2) * DEG)) * (size.height / 2), size.width, size.height)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, depth, invalidate])

  const groups = useRef<(THREE.Group | null)[]>([])
  const t = useRef<Record<string, number>>({ r0: 0, r1: 0, r2: 0, h0: 0, h1: 0, h2: 0 })
  const since = useRef(0)
  useEffect(() => {
    if (play && !since.current) since.current = performance.now()
    invalidate()
  }, [play, invalidate])
  useEffect(() => invalidate(), [hover, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = t.current
    const now = performance.now()
    let moving = false
    const sway = !reduced && (live?.current ?? false)
    for (let i = 0; i < slots.length; i++) {
      // each rises in its turn once the section is there
      const due = since.current && (reduced || now - since.current > 250 + i * 220)
      if (since.current && !due) moving = true
      if (approach(s, `r${i}`, due ? 1 : 0, reduced ? 1e3 : 3.2, dt, 1e-3)) moving = true
      if (approach(s, `h${i}`, hover === i ? 1 : 0, reduced ? 1e3 : 5, dt, 1e-3)) moving = true
      const g = groups.current[i]
      if (!g) continue
      const r = 1 - Math.pow(1 - s[`r${i}`], 3)
      g.position.set(xs[i], (1 - r) * -0.7, 0)
      g.visible = r > 0.002
      // turned by as much as it stands off to the side, so the camera sees it as it sees the middle one
      g.rotation.y = TURN + Math.atan2(-xs[i], depth) + s[`h${i}`] * 0.32 + (sway ? 0.07 * Math.sin((now / 1000) * ((Math.PI * 2) / 16) + i * 1.9) : 0)
      g.scale.setScalar(scale * (0.94 + 0.06 * r) * (1 + 0.04 * s[`h${i}`]))
    }
    if (moving || (sway && since.current)) invalidate()
  }, -2)

  return (
    <>
      {/* light from high overhead, so each model's shadow stays in its own column */}
      <MovingKeyLight focus={[0, TARGET_Y, 0]} reach={viewW / 1.6} offset={[-2.5, 12, 5]} />
      {slots.map((list, i) => (
        <group key={i} ref={(el) => void (groups.current[i] = el)} visible={false}>
          <mesh geometry={geo.floor.slab} material={m.slab} castShadow receiveShadow />
          <mesh geometry={geo.floor.layer} material={m.rtarium} castShadow />
          <mesh geometry={geo.floor.screed} material={m.screed} castShadow receiveShadow />
          {list.map(({ k, g }) => (
            <mesh key={k} geometry={g} material={m[k]} castShadow={k !== 'lane' && k !== 'led'} receiveShadow={k !== 'lane' && k !== 'led'} />
          ))}
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} receiveShadow>
        <planeGeometry args={[viewW * 1.4, 8]} />
        <shadowMaterial color="#2a241a" opacity={0.16} transparent depthWrite={false} />
      </mesh>
    </>
  )
}
