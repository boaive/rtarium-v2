import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor } from '../../../facade/three/Stage3D'
import { approach, type LabelBus, type Shot } from '../../../facade/three/kit'
import { smooth, type Progress } from '../../../facade/progress'
import { block } from '../../../facade/three/unit/parts'
import { prefersReducedMotion } from '../../../lib/motion'
import { type BuildRoom, fit } from '../../data/three/BuildScene'
import { disposeFloorKit, floorKit, LAYER, layer, Lines, sortFrom, split } from '../../data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../data/three/draw'
import { aisleLines, EAVES, frameLines, plantLines, RIDGE, shellLines, X0, X1, Z0, Z1 } from './building'
import { podLines, RACK, rackRun, upwards, type Map3 } from './parts'
import { COAT, ducts, FLOOR_Y, PIECE } from './Piece'

/**
 * Frame to floor, the Data & AI Centres section's build-up in warehouse geometry: on the page's warm
 * white, the floor the build ended on, alone; a bay of racking and its truck are drawn on it. Then the
 * floor grows out, real, to the whole hall while the aisles are drawn on it, row by row from the piece;
 * then the high bay is drawn round it: its portal frame, then the walls, the roof, the docks with their
 * trailers, the offices and the sprinkler tanks. Only the floor is in its own materials.
 */

export const FRAME = {
  racks: [0.05, 0.16],
  grow: [0.2, 0.46],
  aisles: [0.26, 0.5],
  frame: [0.52, 0.68],
  shell: [0.68, 0.82],
  plant: [0.72, 0.84],
} as const

type Box = [[number, number, number], [number, number, number]]
const BX = PIECE.x
const BZ = PIECE.z
const OPEN = { box: [[BX[0], 0, BZ[0]], [BX[1], 0.2, BZ[1]]] as Box, azim: 30, elev: 25, fill: 0.44 }
const VIEWS: { box: Box; azim: number; elev: number; fill: number }[] = [
  { box: [[BX[0], 0, BZ[0]], [BX[1], 4, BZ[1]]], azim: 30, elev: 24, fill: 0.8 },
  { box: [[X0, 0, Z0], [X1, 11, Z1]], azim: 30, elev: 30, fill: 0.78 },
  { box: [[X0 - 8, 0, Z0 - 14], [X1 + 9, RIDGE, Z1]], azim: 30, elev: 22, fill: 1 },
]

function between(a: Shot, b: Shot, t: number): Shot {
  const l = (x: number, y: number) => x + (y - x) * t
  return {
    target: [l(a.target[0], b.target[0]), l(a.target[1], b.target[1]), l(a.target[2], b.target[2])],
    dist: Math.exp(l(Math.log(a.dist), Math.log(b.dist))),
    azim: l(a.azim, b.azim),
    elev: l(a.elev, b.elev),
    frame: [l(a.frame![0], b.frame![0]), l(a.frame![1], b.frame![1])],
  }
}

export function FrameScene({ progress, bus, room }: { progress: Progress; bus: LabelBus; room: { current: BuildRoom } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  const m = useMemo(() => {
    const k = floorKit()
    k.esd.color.set('#b5b9b6')
    k.esd.roughness = 0.24
    return k
  }, [])
  const g = useMemo(
    () => ({
      slab: block([BX[0], 0, BZ[0]], [BX[1], PIECE.t, BZ[1]]),
      ducts: ducts(BX, BZ[1]),
      screed: layer(BX, BZ, PIECE.t, LAYER.screed, 2),
      coat: layer(BX, BZ, PIECE.t + LAYER.screed, COAT, 2),
      body: block([-0.5, 0, -0.5], [0.5, PIECE.t + LAYER.screed, 0.5]),
      skin: block([-0.5, PIECE.t + LAYER.screed, -0.5], [0.5, FLOOR_Y, 0.5]),
    }),
    [],
  )
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      disposeFloorKit(m)
    },
    [g, m],
  )

  const mats = useMemo(() => ({ racks: ink(1.15), aisles: ink(0.72, '#080808', 0.5), frame: ink(1, '#080808', 0.85), shell: ink(0.85, '#080808', 0.6), plant: ink(0.9, '#080808', 0.72) }), [])
  useInkResolution(useMemo(() => Object.values(mats), [mats]))
  const lines = useMemo(() => {
    const R = new Lines()
    // the first bay of racking at the back of the piece, the truck on the floor in front of it
    const bay: Map3 = (u, y, v) => [BX[0] + 0.02 + u * (2.24 / RACK.bay), FLOOR_Y + y * 0.72, BZ[0] + 0.02 + (1 - v / RACK.depth) * 0.86]
    rackRun(R, bay, 1, 3, { load: 1 })
    const T = new Lines()
    podLines(T)
    // the AGV on the floor in front of it, running across
    for (let i = 0; i < T.pts.length; i += 3) {
      const x = T.pts[i]
      const z = T.pts[i + 2]
      T.pts[i] = 0.1 + z * 0.9
      T.pts[i + 1] = FLOOR_Y + T.pts[i + 1] * 0.9
      T.pts[i + 2] = 0.42 - x * 0.9
    }
    R.pts.push(...T.pts)
    const mid: [number, number, number] = [(BX[0] + BX[1]) / 2, FLOOR_Y, 0]
    return {
      racks: upwards(split(R, 0.12)),
      aisles: sortFrom(split(aisleLines(FLOOR_Y), 2.4), mid),
      frame: sortFrom(split(frameLines(), 2.4), mid),
      shell: upwards(shellLines()),
      plant: upwards(plantLines()),
    }
  }, [])
  const racks = useDrawing(lines.racks, mats.racks)
  const aisles = useDrawing(lines.aisles, mats.aisles)
  const frame = useDrawing(lines.frame, mats.frame)
  const shell = useDrawing(lines.shell, mats.shell)
  const plant = useDrawing(lines.plant, mats.plant)

  const strips = useRef<(THREE.Group | null)[]>([])
  const cur = useRef<Record<string, number> | null>(null)

  useEffect(() => {
    const on = () => invalidate()
    progress.listeners.add(on)
    return () => void progress.listeners.delete(on)
  }, [progress, invalidate])

  useFrame((_, delta) => {
    const p = progress.value
    const aspect = size.width / Math.max(1, size.height)
    const gr = smooth(FRAME.grow[0], FRAME.grow[1], p)
    const e = 1 - Math.pow(1 - gr, 2)
    const x0 = BX[0] + (X0 - BX[0]) * e
    const x1 = BX[1] + (X1 - BX[1]) * e
    const z0 = BZ[0] + (Z0 - BZ[0]) * e
    const z1 = BZ[1] + (Z1 - BZ[1]) * e
    const [v0, v1, v2] = VIEWS
    const l = (a: number, b: number) => a + (b - a) * e
    const growing = fit([[l(v0.box[0][0], x0), 0, l(v0.box[0][2], z0)], [l(v0.box[1][0], x1), l(4, 11), z1]], l(v0.azim, v1.azim), l(v0.elev, v1.elev), room.current, aspect, l(v0.fill, v1.fill))
    const opening = between(fit(OPEN.box, OPEN.azim, OPEN.elev, room.current, aspect, OPEN.fill), growing, smooth(0.02, FRAME.racks[1] - 0.02, p))
    const shot = between(opening, fit(v2.box, v2.azim, v2.elev, room.current, aspect, v2.fill), smooth(FRAME.frame[0] - 0.02, FRAME.shell[1] - 0.06, p))
    const to = { tx: shot.target[0], ty: shot.target[1], tz: shot.target[2], ld: Math.log(shot.dist), azim: shot.azim, elev: shot.elev, fx: shot.frame![0], fy: shot.frame![1] }
    if (!cur.current || reduced) cur.current = { ...to }
    const c = cur.current
    const dt = Math.min(delta, 1 / 20)
    let moving = false
    for (const k of Object.keys(to) as (keyof typeof to)[]) if (approach(c, k, to[k], 6, dt, 1e-4)) moving = true
    const A = (c.azim * Math.PI) / 180
    const E = (c.elev * Math.PI) / 180
    const d = Math.exp(c.ld)
    camera.fov = 26
    camera.near = Math.max(0.02, d * 0.01)
    camera.far = d * 6 + 50
    camera.position.set(c.tx + d * Math.cos(E) * Math.sin(A), c.ty + d * Math.sin(E), c.tz + d * Math.cos(E) * Math.cos(A))
    camera.lookAt(c.tx, c.ty, c.tz)
    camera.setViewOffset(size.width, size.height, -(c.fx - 0.5) * size.width, -(c.fy - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()

    const rects: [number, number, number, number][] = [
      [x0, BX[0], z0, z1],
      [BX[1], x1, z0, z1],
      [BX[0], BX[1], BZ[1], z1],
      [BX[0], BX[1], z0, BZ[0]],
    ]
    rects.forEach(([a, b, za, zb], i) => {
      const s = strips.current[i]
      if (!s) return
      s.visible = b - a > 0.01 && zb - za > 0.01
      s.position.set((a + b) / 2, 0, (za + zb) / 2)
      s.scale.set(Math.max(0.001, b - a), 1, Math.max(0.001, zb - za))
    })

    racks.show(smooth(FRAME.racks[0], FRAME.racks[1], p))
    aisles.show(smooth(FRAME.aisles[0], FRAME.aisles[1], p))
    frame.show(smooth(FRAME.frame[0], FRAME.frame[1], p))
    shell.show(smooth(FRAME.shell[0], FRAME.shell[1], p))
    plant.show(smooth(FRAME.plant[0], FRAME.plant[1], p))
    const far = smooth(FRAME.frame[0], FRAME.shell[1], p)
    mats.aisles.opacity = 0.5 - 0.2 * far
    mats.racks.opacity = 1 - 0.4 * far
    if (moving) invalidate()
  }, -1)

  return (
    <group>
      <mesh geometry={g.slab} material={m.plank} />
      <mesh geometry={g.ducts} material={m.rubber} />
      <mesh geometry={g.screed} material={m.screed} />
      <mesh geometry={g.coat} material={m.esd} />
      {[0, 1, 2, 3].map((i) => (
        <group key={i} ref={(el) => void (strips.current[i] = el)} visible={false}>
          <mesh geometry={g.body} material={m.plank} />
          <mesh geometry={g.skin} material={m.esd} />
        </group>
      ))}
      <primitive object={racks.obj} />
      <primitive object={aisles.obj} />
      <primitive object={frame.obj} />
      <primitive object={shell.obj} />
      <primitive object={plant.obj} />
      <Anchor bus={bus} id="fw-floor" position={[6, FLOOR_Y, Z1]} />
      <Anchor bus={bus} id="fw-piece" position={[BX[0] + 0.3, FLOOR_Y, BZ[1]]} />
      <Anchor bus={bus} id="fw-eaves" position={[X0, EAVES, Z1]} />
    </group>
  )
}
