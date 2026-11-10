import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { approach } from '../../facade/three/kit'
import { MovingKeyLight } from '../../facade/three/Stage3D'
import { merge } from '../../facade/three/unit/parts'
import { prefersReducedMotion } from '../../lib/motion'
import { buildingOf, type BuildId, type Building, type Mat } from './buildings'
import { material } from './StreamScene'

/**
 * The three streams' buildings side by side, finished, each above its column, as the other closes stand (the
 * flooring's trio: its camera, its light, its rise and its turn on hover). The parts are the builds' own, merged a set
 * for each material; the gable panels keep their cut tops.
 */

const DEG = Math.PI / 180
const FOV = 10
const DIST = 14.6
const TARGET_Y = 0.2
const ELEV = 0.2
const TURN = -0.62

/** a building's parts as one geometry for each material, stood on the ground about its middle */
function shapes(b: Building) {
  const by = new Map<Mat, THREE.BufferGeometry[]>()
  const [lo, hi] = b.box
  const cx = (lo[0] + hi[0]) / 2
  const cz = (lo[2] + hi[2]) / 2
  for (const p of b.parts) {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.deleteAttribute('uv')
    const pos = g.getAttribute('position')
    const k = p.cut?.axis === 'x' ? 0 : 2
    for (let j = 0; j < pos.count; j++) {
      const ux = pos.getX(j) + 0.5
      const uy = pos.getY(j) + 0.5
      const uz = pos.getZ(j) + 0.5
      const x = p.a[0] + ux * (p.b[0] - p.a[0])
      let y = p.a[1] + uy * (p.b[1] - p.a[1])
      const z = p.a[2] + uz * (p.b[2] - p.a[2])
      if (p.cut && uy > 0.5) y = p.cut.y0 + (p.cut.y1 - p.cut.y0) * (k === 0 ? ux : uz)
      pos.setXYZ(j, x - cx, y - lo[1], z - cz)
    }
    g.computeVertexNormals()
    if (!by.has(p.mat)) by.set(p.mat, [])
    by.get(p.mat)!.push(g)
  }
  const list = [...by.entries()].map(([mat, gs]) => {
    const g = merge(gs)
    gs.forEach((x) => x.dispose())
    return { mat, g, m: material(mat, b.colors[mat] ?? '#cccccc') }
  })
  return { list, w: hi[0] - lo[0], h: hi[1] - lo[1], d: hi[2] - lo[2] }
}

export function WallsTrio({
  ids,
  play,
  hover,
  live,
  fill,
  height = 0.48,
  spin = false,
}: {
  ids: BuildId[]
  play: boolean
  hover: number | null
  live?: { current: boolean }
  /** the share of its column a model takes (default: by how many share the band) */
  fill?: number
  /** the most of the canvas's height a model takes */
  height?: number
  /** turning slowly all the while it is on screen (one building shown on its own) */
  spin?: boolean
}) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const models = useMemo(() => ids.map((id) => shapes(buildingOf(id))), [ids.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () =>
      models.forEach((x) =>
        x.list.forEach((p) => {
          p.g.dispose()
          p.m.dispose()
        }),
      ),
    [models],
  )

  // the slots sit under their columns: an equal share of the view's width each
  const aspect = size.width / Math.max(1, size.height)
  const depth = DIST * Math.cos(ELEV)
  const viewW = 2 * depth * Math.tan((FOV / 2) * DEG) * aspect
  const viewH = 2 * depth * Math.tan((FOV / 2) * DEG)
  const colW = viewW / models.length
  const xs = models.map((_, i) => (i - (models.length - 1) / 2) * colW)
  // each takes the same share of its column, and never more of the canvas's height than leaves room above it
  // (two to a band are wider: they keep to the same height, clear of the line over them)
  const scales = models.map((b) => Math.min((colW * (fill ?? (models.length < 3 ? 0.5 : 0.66))) / (b.w * Math.cos(TURN) + b.d * Math.sin(-TURN)), (viewH * height) / b.h))
  const groundY = -0.004

  useEffect(() => {
    camera.fov = FOV
    camera.position.set(0, TARGET_Y + DIST * Math.sin(ELEV), depth)
    camera.lookAt(0, camera.position.y, 0)
    camera.setViewOffset(size.width, size.height, 0, (Math.tan(ELEV) / Math.tan((FOV / 2) * DEG)) * (size.height / 2), size.width, size.height)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, depth, invalidate])

  const groups = useRef<(THREE.Group | null)[]>([])
  const t = useRef<Record<string, number>>({ r0: 0, r1: 0, r2: 0, h0: 0, h1: 0, h2: 0 })
  const since = useRef(0)
  const turned = useRef(0)
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
    // one building on its own turns all the way round, slowly, while it is on screen
    if (spin && sway && since.current) turned.current += dt * ((Math.PI * 2) / 40)
    for (let i = 0; i < models.length; i++) {
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
      g.rotation.y = TURN + Math.atan2(-xs[i], depth) + s[`h${i}`] * 0.32 + (spin ? turned.current : sway ? 0.07 * Math.sin((now / 1000) * ((Math.PI * 2) / 16) + i * 1.9) : 0)
      g.scale.setScalar(scales[i] * (0.94 + 0.06 * r) * (1 + 0.04 * s[`h${i}`]))
    }
    if (moving || (sway && since.current)) invalidate()
  }, -2)

  return (
    <>
      <MovingKeyLight focus={[0, TARGET_Y, 0]} reach={viewW / 1.6} offset={[-2.5, 12, 5]} />
      {models.map((b, i) => (
        <group key={i} ref={(el) => void (groups.current[i] = el)} visible={false}>
          {b.list.map((p) => (
            <mesh key={p.mat} geometry={p.g} material={p.m} castShadow={p.mat !== 'glass'} receiveShadow={p.mat !== 'glass'} />
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
