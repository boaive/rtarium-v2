import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { approach } from '../../facade/three/kit'
import { MovingKeyLight } from '../../facade/three/Stage3D'
import { prefersReducedMotion } from '../../lib/motion'
import { merge } from '../../facade/three/unit/parts'
import { block, disposeFloorMaterials, floorMaterials } from './floor'

/**
 * The three applications side by side, each above its column, as the Façade overview's systems
 * stand: one camera, three floors of one size on one ground, each with what it carries, kept simple:
 *
 *   data & AI centres     a row of server racks
 *   automated warehouse   high shelving, a robot in its aisle
 *   semiconductor plant   a lithography tool on its isolated plinth
 *
 * They rise one after another as the section arrives; the one pointed at turns towards the visitor.
 * While the section is on screen each turns a little back and forth, in time.
 */

const FOV = 24
const DIST = 6
const TARGET_Y = 0.42
/** each floor plate, before scaling: its width (x), depth (z), its screed and slab */
const P = { w: 1.6, d: 1.1, t: 0.1 }
const TURN = -0.6

function racks() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) parts.push(block([-0.62 + i * 0.32, 0, -0.25], [-0.36 + i * 0.32, 0.86, 0.15]))
  return merge(parts)
}
function rackLights() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) parts.push(block([-0.6 + i * 0.32, 0.12 + j * 0.15, 0.151], [-0.38 + i * 0.32, 0.13 + j * 0.15, 0.156]))
  return merge(parts)
}
function shelving() {
  const parts: THREE.BufferGeometry[] = []
  for (const z of [-0.36, 0.12]) {
    for (const x of [-0.7, -0.24, 0.22, 0.68]) parts.push(block([x - 0.02, 0, z - 0.02], [x + 0.02, 1.0, z + 0.02]), block([x - 0.02, 0, z + 0.18], [x + 0.02, 1.0, z + 0.22]))
    for (const y of [0.25, 0.5, 0.75, 1.0]) parts.push(block([-0.72, y - 0.02, z - 0.02], [0.7, y, z + 0.22]))
  }
  return merge(parts)
}
function totes() {
  const parts: THREE.BufferGeometry[] = []
  for (const z of [-0.36, 0.12])
    for (const y of [0, 0.25, 0.5, 0.75]) for (let i = 0; i < 5; i++) if ((i + y * 8 + z * 10) % 3 !== 0) parts.push(block([-0.66 + i * 0.27, y + 0.01, z + 0.01], [-0.46 + i * 0.27, y + 0.15, z + 0.19]))
  return merge(parts)
}
function tool() {
  return merge([block([-0.5, 0.05, -0.3], [0.2, 0.62, 0.22]), block([0.2, 0.05, -0.2], [0.55, 0.42, 0.14]), block([-0.4, 0.62, -0.2], [0.05, 0.78, 0.12])])
}

interface Slot {
  build: (m: ReturnType<typeof trioMaterials>, g: ReturnType<typeof trioGeometry>) => ReactNode
}

function trioMaterials() {
  const f = floorMaterials()
  return {
    ...f,
    graphite: new THREE.MeshStandardMaterial({ color: '#1b1b1b', metalness: 0.35, roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: '#efece5', roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: '#8e949a', metalness: 0.6, roughness: 0.4 }),
    tote: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.7 }),
  }
}
function trioGeometry() {
  return {
    slab: block([-P.w / 2, -P.t, -P.d / 2], [P.w / 2, -0.02, P.d / 2]),
    screed: block([-P.w / 2, -0.02, -P.d / 2], [P.w / 2, 0, P.d / 2]),
    racks: racks(),
    lights: rackLights(),
    shelving: shelving(),
    totes: totes(),
    robot: block([-0.16, 0, -0.1], [0.16, 0.1, 0.1]),
    lamp: block([-0.04, 0.1, -0.04], [0.04, 0.12, 0.04]),
    plinth: block([-0.6, 0, -0.4], [0.62, 0.05, 0.34]),
    tool: tool(),
    window: block([-0.42, 0.3, 0.221], [0.1, 0.5, 0.226]),
  }
}

const SLOTS: Slot[] = [
  {
    build: (m, g) => (
      <>
        <mesh geometry={g.racks} material={m.graphite} castShadow receiveShadow />
        <mesh geometry={g.lights} material={m.mark} />
      </>
    ),
  },
  {
    build: (m, g) => (
      <>
        <mesh geometry={g.shelving} material={m.steel} castShadow receiveShadow />
        <mesh geometry={g.totes} material={m.tote} castShadow />
        <group position={[0.1, 0, 0.42]}>
          <mesh geometry={g.robot} material={m.graphite} castShadow />
          <mesh geometry={g.lamp} material={m.mark} />
        </group>
      </>
    ),
  },
  {
    build: (m, g) => (
      <>
        <mesh geometry={g.plinth} material={m.white} castShadow receiveShadow />
        <mesh geometry={g.tool} material={m.white} castShadow receiveShadow />
        <mesh geometry={g.window} material={m.graphite} />
      </>
    ),
  },
]

export function FlooringTrio({ play, hover, live, pick }: { play: boolean; hover: number | null; live?: { current: boolean }; pick?: number[] }) {
  // a page that shows only some of the three (the other applications) names which, in order
  const slots = useMemo(() => (pick ? SLOTS.filter((_, i) => pick.includes(i)) : SLOTS), [pick?.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const m = useMemo(trioMaterials, [])
  const g = useMemo(trioGeometry, [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      for (const x of [m.graphite, m.white, m.steel, m.tote]) x.dispose()
      disposeFloorMaterials(m)
    },
    [g, m],
  )

  // the slots sit under their columns: an equal share of the view's width each
  const aspect = size.width / Math.max(1, size.height)
  const viewW = 2 * DIST * Math.tan((FOV / 2) * (Math.PI / 180)) * aspect
  const colW = viewW / slots.length
  const fill = aspect < 2 ? 0.86 : 0.62
  const scale = (colW * fill) / (P.w * Math.cos(TURN) + P.d * Math.sin(-TURN))

  useEffect(() => {
    camera.fov = FOV
    camera.position.set(0, TARGET_Y + DIST * Math.sin(0.2), DIST * Math.cos(0.2))
    camera.lookAt(0, TARGET_Y, 0)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, invalidate])

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
    slots.forEach((_, i) => {
      // each rises in its turn once the section is there; the one pointed at turns towards the visitor
      const due = since.current && (reduced || now - since.current > 180 + i * 220) ? 1 : 0
      moving = approach(s, `r${i}`, due, reduced ? 100 : 5, dt) || moving
      moving = approach(s, `h${i}`, hover === i ? 1 : 0, 7, dt) || moving
      const gr = groups.current[i]
      if (!gr) return
      const r = 1 - Math.pow(1 - s[`r${i}`], 3)
      gr.position.set((i - (slots.length - 1) / 2) * colW, (1 - r) * -0.4, 0)
      gr.scale.setScalar(scale * Math.max(0.001, r))
      gr.visible = r > 0.002
      gr.rotation.y = TURN + 0.35 * s[`h${i}`] + (sway ? 0.05 * Math.sin(now / 1000 / 2.4 + i * 1.7) : 0)
    })
    if (moving || sway) invalidate()
  })

  return (
    <>
      <MovingKeyLight focus={[0, TARGET_Y, 0]} reach={3} />
      {slots.map((slot, i) => (
        <group key={i} ref={(el) => void (groups.current[i] = el)} visible={false}>
          <mesh geometry={g.slab} material={m.slab} castShadow receiveShadow />
          <mesh geometry={g.screed} material={m.screed} receiveShadow />
          {slot.build(m, g)}
        </group>
      ))}
      <mesh position={[0, -P.t * scale - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.catcher} receiveShadow>
        <planeGeometry args={[40, 40]} />
      </mesh>
    </>
  )
}
