import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor } from '../../../facade/three/Stage3D'
import { approach, type LabelBus, type Shot } from '../../../facade/three/kit'
import { smooth, type Progress } from '../../../facade/progress'
import { prefersReducedMotion } from '../../../lib/motion'
import { block } from '../../../facade/three/unit/parts'
import { disposeFloorKit, floorKit, hollowCore, layer, Lines, PLANK, rack, sortFrom, split } from './dc'
import { ink, useDrawing, useInkResolution } from './draw'
import { BX, BZ, CENTRES, EPOXY, fit, TOP, type BuildRoom } from './BuildScene'
import { floorsLines, frameLines, hallLines, LEVELS, plantLines, RIDGE, shellLines, X0, X1, Z0, Z1 } from './building'

/**
 * Frame to floor (Data & AI Centres), after Slab to slab on the Unitized page: on the page's warm white,
 * the floor the build ended on, alone; its racks are drawn on it, as in the opening. Then the floor
 * grows out, real, to the whole storey of a data hall while the hall is drawn on it, row by row from
 * the piece; then the AI centre is drawn round it: its PEB frame, the hollow-core floor above and the
 * rooms below, the walls, the solar roof, the chillers and the generators. Only the floor is in its own
 * materials; the rest is a drawing, and the camera keeps all of it to a part of the screen.
 */

/** when each thing happens (fractions of the section's run) */
export const FRAME = {
  racks: [0.05, 0.16],
  grow: [0.2, 0.46],
  hall: [0.26, 0.5],
  frame: [0.52, 0.66],
  floors: [0.57, 0.71],
  shell: [0.68, 0.82],
  plant: [0.72, 0.84],
} as const

const FLOOR = TOP + EPOXY
type Box = [[number, number, number], [number, number, number]]
/**
 * the floor alone, as large as the build left it; the floor and its racks; the whole storey; the building
 * (the floor's own view is fitted by width, the room's full width, so it comes in at the size it ended on)
 */
const OPEN = { box: [[BX[0], 0, BZ[0]], [BX[1], 0.15, BZ[1]]] as Box, azim: 30, elev: 25, fill: 0.44 }
const VIEWS: { box: Box; azim: number; elev: number; fill: number }[] = [
  { box: [[BX[0], 0, BZ[0]], [BX[1], 2.2, BZ[1]]], azim: 30, elev: 24, fill: 0.78 },
  { box: [[X0, 0, Z0], [X1, 4.6, Z1]], azim: 30, elev: 32, fill: 0.68 },
  { box: [[X0 - 6, LEVELS[0] - 0.6, Z0], [X1 + 6, RIDGE, Z1]], azim: 30, elev: 22, fill: 0.84 },
]

/** a shot between two, its distance moving by ratio (a zoom out reads even all the way) */
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

/** a drawing's segments from the floor up */
function upwards(L: Lines) {
  const n = L.pts.length / 6
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.min(L.pts[a * 6 + 1], L.pts[a * 6 + 4]) - Math.min(L.pts[b * 6 + 1], L.pts[b * 6 + 4]))
  const out = new Lines()
  for (const i of idx) out.pts.push(...L.pts.slice(i * 6, i * 6 + 6))
  return out
}

export function FrameScene({ progress, bus, room }: { progress: Progress; bus: LabelBus; room: { current: BuildRoom } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  const m = useMemo(floorKit, [])
  const g = useMemo(() => {
    const hc = hollowCore(CENTRES, BX, BZ)
    return {
      ...hc,
      screed: layer(BX, BZ, PLANK.t, TOP - PLANK.t, 2),
      cond: layer(BX, BZ, TOP, EPOXY / 2, 2),
      esd: layer(BX, BZ, TOP + EPOXY / 2, EPOXY / 2, 2),
      // a unit block for the floor that grows round the piece: the slab and its screed, and its coating
      body: block([-0.5, 0, -0.5], [0.5, TOP, 0.5]),
      coat: block([-0.5, TOP, -0.5], [0.5, FLOOR, 0.5]),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      disposeFloorKit(m)
    },
    [g, m],
  )

  const mats = useMemo(
    () => ({ racks: ink(1.15), hall: ink(0.8, '#080808', 0.55), frame: ink(0.95, '#080808', 0.78), floors: ink(0.8, '#080808', 0.32), shell: ink(0.9, '#080808', 0.68), plant: ink(0.9, '#080808', 0.7) }),
    [],
  )
  useInkResolution(useMemo(() => Object.values(mats), [mats]))
  const lines = useMemo(() => {
    const R = new Lines()
    for (const x of [0, 0.6, 1.2]) rack(R, x, 0, FLOOR, 1, true)
    const mid: [number, number, number] = [(BX[0] + BX[1]) / 2, FLOOR, 0]
    return {
      racks: upwards(split(R, 0.12)),
      // cut into short pieces, so each grows out from the floor rather than appearing whole
      hall: sortFrom(split(hallLines(FLOOR), 1.2), mid),
      frame: sortFrom(split(frameLines(), 1.5), mid),
      floors: sortFrom(split(floorsLines(), 2), mid),
      shell: upwards(shellLines()),
      plant: upwards(plantLines()),
    }
  }, [])
  const racks = useDrawing(lines.racks, mats.racks)
  const hall = useDrawing(lines.hall, mats.hall)
  const frame = useDrawing(lines.frame, mats.frame)
  const floors = useDrawing(lines.floors, mats.floors)
  const shell = useDrawing(lines.shell, mats.shell)
  const plant = useDrawing(lines.plant, mats.plant)

  // the floor round the piece: four strips (left, right, front, back), each a slab and its coating
  const strips = useRef<(THREE.Group | null)[]>([])
  const cur = useRef<Record<string, number> | null>(null)

  useEffect(() => {
    const on = () => invalidate()
    progress.listeners.add(on)
    return () => void progress.listeners.delete(on)
  }, [progress, invalidate])

  useFrame((_, delta) => {
    const p = progress.value
    // the camera: the floor, then the hall, then the building, each fitted to the room, eased
    const aspect = size.width / Math.max(1, size.height)
    // while the floor grows, the camera keeps what there is of it framed, standing back as it spreads
    const gr = smooth(FRAME.grow[0], FRAME.grow[1], p)
    const e = 1 - Math.pow(1 - gr, 2)
    const x0 = BX[0] + (X0 - BX[0]) * e
    const x1 = BX[1] + (X1 - BX[1]) * e
    const z0 = BZ[0] + (Z0 - BZ[0]) * e
    const z1 = BZ[1] + (Z1 - BZ[1]) * e
    const [v0, v1, v2] = VIEWS
    const l = (a: number, b: number) => a + (b - a) * e
    const growing = fit([[x0, 0, z0], [x1, l(2.2, 4.6), z1]], l(v0.azim, v1.azim), l(v0.elev, v1.elev), room.current, aspect, l(v0.fill, v1.fill))
    // it opens on the floor alone, close; it stands back as the racks are drawn on it
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

    // the floor grows out from the piece to the whole storey
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

    // the drawings, each in its turn; the hall lightens as the building comes round it
    racks.show(smooth(FRAME.racks[0], FRAME.racks[1], p))
    hall.show(smooth(FRAME.hall[0], FRAME.hall[1], p))
    frame.show(smooth(FRAME.frame[0], FRAME.frame[1], p))
    floors.show(smooth(FRAME.floors[0], FRAME.floors[1], p))
    shell.show(smooth(FRAME.shell[0], FRAME.shell[1], p))
    plant.show(smooth(FRAME.plant[0], FRAME.plant[1], p))
    const far = smooth(FRAME.frame[0], FRAME.shell[1], p)
    mats.hall.opacity = 0.55 - 0.25 * far
    mats.racks.opacity = 1 - 0.45 * far
    if (moving) invalidate()
  }, -1)

  return (
    <group>
      <mesh geometry={g.planks} material={m.plank} />
      <mesh geometry={g.grout} material={m.grout} />
      <mesh geometry={g.screed} material={m.screed} />
      <mesh geometry={g.cond} material={m.conductive} />
      <mesh geometry={g.esd} material={m.esd} />
      {[0, 1, 2, 3].map((i) => (
        <group key={i} ref={(el) => void (strips.current[i] = el)} visible={false}>
          <mesh geometry={g.body} material={m.plank} />
          <mesh geometry={g.coat} material={m.esd} />
        </group>
      ))}
      <primitive object={racks.obj} />
      <primitive object={hall.obj} />
      <primitive object={frame.obj} />
      <primitive object={floors.obj} />
      <primitive object={shell.obj} />
      <primitive object={plant.obj} />
      <Anchor bus={bus} id="ff-floor" position={[(BX[0] + BX[1]) / 2 + 6, FLOOR, Z1]} />
      <Anchor bus={bus} id="ff-piece" position={[BX[0] + 0.3, FLOOR, BZ[1]]} />
    </group>
  )
}
