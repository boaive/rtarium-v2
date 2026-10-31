import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor } from '../../../facade/three/Stage3D'
import { approach, type LabelBus } from '../../../facade/three/kit'
import { smooth, type Progress } from '../../../facade/progress'
import { prefersReducedMotion } from '../../../lib/motion'
import { block } from '../../../facade/three/unit/parts'
import { fit, type BuildRoom } from '../../data/three/BuildScene'
import { layer, Lines, sortFrom, split } from '../../data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../data/three/draw'
import { between, type Box } from './camera'
import { disposeKit, fabKit, FLOOR, LAY, processTool, PX, PZ, SLAB, TOP, waffle, WAF } from './fab'
import { bayLines, CEIL, CUB, fabLines, STACK, SUB, underLines, X0, X1, Z0, Z1 } from './fabBuilding'
import { upwards } from './HeroFloor'

/**
 * Frame to floor (Semiconductor Plant), after the Data & AI Centres page's: on the page's warm white,
 * the floor the build ended on, alone; a process tool is drawn on it, as in the opening. Then the floor
 * grows out, real, to the whole cleanroom while the bay is drawn on it (the tools in their rows, the
 * AMHS over the aisles, the fan-filter ceiling); then what carries it is drawn under it (the waffle's
 * ribs, the columns, the subfab and its pumps), and the fab round it: the long-span trusses, the walls,
 * the roof's plant and stacks, the central utility building. Only the floor is in its own materials.
 */

/** when each thing happens (fractions of the section's run) */
export const FRAME = {
  tool: [0.05, 0.16],
  grow: [0.2, 0.46],
  bay: [0.26, 0.5],
  under: [0.52, 0.66],
  fab: [0.66, 0.84],
} as const

const YB = WAF.depth - WAF.deck
/** the floor alone, as large as the build left it; the floor and its tool; the cleanroom; the fab */
const OPEN = { box: [[PX[0], 0, PZ[0]], [PX[1], FLOOR, PZ[1]]] as Box, azim: 30, elev: 25, fill: 0.44 }
const VIEWS: { box: Box; azim: number; elev: number; fill: number }[] = [
  { box: [[PX[0], 0, PZ[0]], [PX[1], FLOOR + 2.2, PZ[1] + 0.4]], azim: 30, elev: 22, fill: 0.78 },
  { box: [[X0, 0, Z0], [X1, CEIL, Z1]], azim: 30, elev: 30, fill: 0.7 },
  { box: [[X0, SUB, Z0], [CUB.x1, STACK, Z1]], azim: 30, elev: 18, fill: 0.86 },
]

export function FrameScene({ progress, bus, room }: { progress: Progress; bus: LabelBus; room: { current: BuildRoom } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  const m = useMemo(fabKit, [])
  const g = useMemo(() => {
    const w = waffle(PX, PZ)
    return {
      ...w,
      slc: layer(PX, PZ, SLAB, LAY.slc, 2),
      cond: layer(PX, PZ, TOP, LAY.cond, 2),
      coat: layer(PX, PZ, TOP + LAY.cond, LAY.coat, 2),
      // a unit block for the floor that grows round the piece: the deck and its screed, and its coating
      body: block([-0.5, YB, -0.5], [0.5, TOP, 0.5]),
      top: block([-0.5, TOP, -0.5], [0.5, FLOOR, 0.5]),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      disposeKit(m)
    },
    [g, m],
  )

  const mats = useMemo(() => ({ tool: ink(1.15), bay: ink(0.8, '#080808', 0.5), under: ink(0.85, '#080808', 0.5), fab: ink(0.95, '#080808', 0.72) }), [])
  useInkResolution(useMemo(() => Object.values(mats), [mats]))
  const lines = useMemo(() => {
    const T = new Lines()
    processTool(T, 0.28, -0.2, FLOOR, { w: 1.3, d: 0.95, h: 1.95, ports: 2 })
    const mid: [number, number, number] = [0, FLOOR, 0]
    return {
      tool: upwards(split(T, 0.12)),
      // cut into short pieces, so each grows out from the floor rather than appearing whole
      bay: sortFrom(split(bayLines(), 1.2), mid),
      under: sortFrom(split(underLines(), 1.5), [0, 0, 0]),
      fab: upwards(split(fabLines(), 2.4)),
    }
  }, [])
  const tool = useDrawing(lines.tool, mats.tool)
  const bay = useDrawing(lines.bay, mats.bay)
  const under = useDrawing(lines.under, mats.under)
  const fab = useDrawing(lines.fab, mats.fab)

  // the floor round the piece: four strips (left, right, front, back), each a deck and its coating
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
    // while the floor grows, the camera keeps what there is of it framed, standing back as it spreads
    const gr = smooth(FRAME.grow[0], FRAME.grow[1], p)
    const e = 1 - Math.pow(1 - gr, 2)
    const x0 = PX[0] + (X0 - PX[0]) * e
    const x1 = PX[1] + (X1 - PX[1]) * e
    const z0 = PZ[0] + (Z0 - PZ[0]) * e
    const z1 = PZ[1] + (Z1 - PZ[1]) * e
    const [v0, v1, v2] = VIEWS
    const l = (a: number, b: number) => a + (b - a) * e
    const growing = fit([[x0, 0, z0], [x1, l(FLOOR + 2.2, CEIL), z1]], l(v0.azim, v1.azim), l(v0.elev, v1.elev), room.current, aspect, l(v0.fill, v1.fill))
    // it opens on the floor alone, close; it stands back as the tool is drawn on it
    const opening = between(fit(OPEN.box, OPEN.azim, OPEN.elev, room.current, aspect, OPEN.fill), growing, smooth(0.02, FRAME.tool[1] - 0.02, p))
    const shot = between(opening, fit(v2.box, v2.azim, v2.elev, room.current, aspect, v2.fill), smooth(FRAME.under[0] - 0.02, FRAME.fab[1] - 0.06, p))
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
    camera.far = d * 6 + 60
    camera.position.set(c.tx + d * Math.cos(E) * Math.sin(A), c.ty + d * Math.sin(E), c.tz + d * Math.cos(E) * Math.cos(A))
    camera.lookAt(c.tx, c.ty, c.tz)
    camera.setViewOffset(size.width, size.height, -(c.fx - 0.5) * size.width, -(c.fy - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()

    // the floor grows out from the piece to the whole cleanroom
    const rects: [number, number, number, number][] = [
      [x0, PX[0], z0, z1],
      [PX[1], x1, z0, z1],
      [PX[0], PX[1], PZ[1], z1],
      [PX[0], PX[1], z0, PZ[0]],
    ]
    rects.forEach(([a, b, za, zb], i) => {
      const s = strips.current[i]
      if (!s) return
      s.visible = b - a > 0.01 && zb - za > 0.01
      s.position.set((a + b) / 2, 0, (za + zb) / 2)
      s.scale.set(Math.max(0.001, b - a), 1, Math.max(0.001, zb - za))
    })

    // the drawings, each in its turn; the bay lightens as the fab comes round it
    tool.show(smooth(FRAME.tool[0], FRAME.tool[1], p))
    bay.show(smooth(FRAME.bay[0], FRAME.bay[1], p))
    under.show(smooth(FRAME.under[0], FRAME.under[1], p))
    fab.show(smooth(FRAME.fab[0], FRAME.fab[1], p))
    const far = smooth(FRAME.under[0], FRAME.fab[1], p)
    mats.bay.opacity = 0.5 - 0.22 * far
    mats.tool.opacity = 1 - 0.45 * far
    if (moving) invalidate()
  }, -1)

  return (
    <group>
      <mesh geometry={g.ribs} material={m.waffle} />
      <mesh geometry={g.deck} material={m.waffle} />
      <mesh geometry={g.slc} material={m.slc} />
      <mesh geometry={g.cond} material={m.conductive} />
      <mesh geometry={g.coat} material={m.coat} />
      {[0, 1, 2, 3].map((i) => (
        <group key={i} ref={(el) => void (strips.current[i] = el)} visible={false}>
          <mesh geometry={g.body} material={m.waffle} />
          <mesh geometry={g.top} material={m.coat} />
        </group>
      ))}
      <primitive object={tool.obj} />
      <primitive object={bay.obj} />
      <primitive object={under.obj} />
      <primitive object={fab.obj} />
      <Anchor bus={bus} id="sf-floor" position={[6, FLOOR, Z1]} />
      <Anchor bus={bus} id="sf-piece" position={[PX[0] + 0.3, FLOOR, PZ[1]]} />
    </group>
  )
}
