import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor, MovingKeyLight } from '../../facade/three/Stage3D'
import { approach, type LabelBus } from '../../facade/three/kit'
import { smooth, type Progress } from '../../facade/progress'
import { prefersReducedMotion } from '../../lib/motion'
import { Lines, split } from '../../flooring/data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../flooring/data/three/draw'
import { disposeWallKit, wallKit } from './kit'
import { between, fit, type Room } from './fit'
import type { Building } from './buildings'

/**
 * A stream's building, on the warm white page, pinned for its run, as the Unitized page's slab to slab and the Data &
 * AI Centres page's frame to floor: four steps, the scroll the clock, the building put up as it would be on site.
 *
 *   0  the frame     the whole building's frame is drawn out from where its first wall will stand
 *   1  one wall      the camera goes in on that wall: its panels go up course by course, each lowered onto the one
 *                    below
 *   2  as required   the camera stands back; the panels go up where the building needs them next, course by course
 *   3  the rest      the rest go up; the finish (roof, doors, windows, docks) is drawn round them
 *
 * Panels never hang in the air: within a step every wall rises a course at a time, and a course is only lowered once
 * the one under it has landed. The panels are the one thing in their own concrete; the rest is a drawing. Every shot
 * is fitted to the room between the title and the bar, so nothing ever leaves it. `progress` runs 0..1.
 */

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** the drawing's segments sorted by their distance from a point, and those distances (for drawing it out to a radius) */
function byDistance(L: Lines, o: [number, number, number]) {
  const p = L.pts
  const n = p.length / 6
  const d = Array.from({ length: n }, (_, i) => Math.hypot((p[i * 6] + p[i * 6 + 3]) / 2 - o[0], (p[i * 6 + 1] + p[i * 6 + 4]) / 2 - o[1], (p[i * 6 + 2] + p[i * 6 + 5]) / 2 - o[2]))
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[a] - d[b])
  const out = new Lines()
  for (const i of idx) out.pts.push(...p.slice(i * 6, i * 6 + 6))
  return { lines: out, dist: idx.map((i) => d[i]) }
}

/** how far the camera is in on the first wall (0..1), at `t` (0..4): the room shows its edge while it is */
export const closerAt = (t: number) => ease(smooth(0.82, 1.12, t)) * (1 - ease(smooth(1.86, 2.2, t)))

export function StreamScene({ progress, bus, room, building }: { progress: Progress; bus: LabelBus; room: { current: Room }; building: Building }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => () => gl.setScissorTest(false), [gl])
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const m = useMemo(wallKit, [])
  useEffect(() => () => disposeWallKit(m), [m])
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => box.dispose(), [box])

  const mats = useMemo(() => ({ frame: ink(1.05, '#080808', 0.85), finish: ink(1, '#080808', 0.75) }), [])
  useInkResolution(useMemo(() => Object.values(mats), [mats]))
  const lines = useMemo(() => {
    const frame = split(building.frame, 0.8)
    const out = byDistance(frame, building.origin)
    return { frame: out.lines, finish: split(building.finish, 1.2) }
  }, [building])
  const frame = useDrawing(lines.frame, mats.frame)
  const finish = useDrawing(lines.finish, mats.finish)

  /**
   * When each panel is lowered, within its step: the step's courses (every height a panel starts at) go up one after
   * another, all its walls together, a wave along each wall; each panel's slot ends before the course above it begins,
   * so a panel is only ever lowered onto one that has landed.
   */
  const order = useMemo(() => {
    const out = building.panels.map(() => ({ a: 0, b: 0, step: 0 }))
    const steps = [...new Set(building.panels.map((p) => p.step))]
    for (const st of steps) {
      const ids = building.panels.map((_, i) => i).filter((i) => building.panels[i].step === st)
      const heights = [...new Set(ids.map((i) => Math.round(building.panels[i].a[1] * 100)))].sort((x, y) => x - y)
      const along = ids.map((i) => building.panels[i].a[0] + building.panels[i].a[2])
      const lo = Math.min(...along)
      const hi = Math.max(...along)
      const slot = 1 / (heights.length + 0.5)
      ids.forEach((i, k) => {
        const course = heights.indexOf(Math.round(building.panels[i].a[1] * 100))
        const wave = hi > lo ? (along[k] - lo) / (hi - lo) : 0
        const a = (course + 0.5 * wave) * slot
        out[i] = { a, b: a + 0.85 * slot, step: st }
      })
    }
    return out
  }, [building])
  /** how far a panel is lowered from: a little, as a crane sets it down */
  const drop = useMemo(() => Math.min(0.36, (building.box[1][1] - building.box[0][1]) / 30), [building])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const mx = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  const cur = useRef<Record<string, number> | null>(null)

  useEffect(() => {
    const on = () => invalidate()
    progress.listeners.add(on)
    return () => void progress.listeners.delete(on)
  }, [progress, invalidate])
  useEffect(() => {
    cur.current = null
    invalidate()
  }, [building, invalidate])

  useFrame((_, delta) => {
    const t = progress.value * 4
    // the camera: the whole building while its frame is drawn, in on the first wall while its panels go up, then
    // standing back to the whole again, turning a little as the rest go up
    const aspect = size.width / Math.max(1, size.height)
    const [fa, fe] = building.views.first
    const [wa, we] = building.views.whole
    const first = fit(building.first, fa, fe, room.current, aspect, 0.8)
    const whole = fit(building.box, wa + 8 * smooth(2.2, 4, t), we, room.current, aspect, 0.86)
    const shot = between(whole, first, closerAt(t))
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
    camera.near = Math.max(0.05, d * 0.01)
    camera.far = d * 6 + 80
    camera.position.set(c.tx + d * Math.cos(E) * Math.sin(A), c.ty + d * Math.sin(E), c.tz + d * Math.cos(E) * Math.cos(A))
    camera.lookAt(c.tx, c.ty, c.tz)
    camera.setViewOffset(size.width, size.height, -(c.fx - 0.5) * size.width, -(c.fy - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()
    // nothing is drawn outside the room: the close look at the first wall is cropped to it
    const r = room.current
    gl.setScissorTest(true)
    gl.setScissor(r.x * size.width - 6, (1 - r.y - r.h) * size.height - 6, r.w * size.width + 12, r.h * size.height + 12)

    // the frame: drawn first, out from where the first wall will stand; it steps back a little as the walls go on
    frame.show(smooth(0.06, 0.8, t))
    mats.frame.opacity = 0.85 - 0.25 * smooth(2.2, 3.4, t)
    // the finish, drawn round the walls in the last step
    finish.show(smooth(3.5, 3.92, t))

    // the panels: each comes down into its place in its step's turn
    const im = mesh.current
    if (im) {
      building.panels.forEach((p, i) => {
        const o = order[i]
        // each step's courses go up over most of its run (the first wall's over a little less, the camera coming in)
        const [s0, s1] = o.step === 1 ? [1.14, 1.84] : [o.step + 0.08, o.step + 0.9]
        const a = smooth(s0 + (s1 - s0) * o.a, s0 + (s1 - s0) * o.b, t)
        const e = easeOut(a)
        v.set((p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2 + (1 - e) * drop, (p.a[2] + p.b[2]) / 2)
        // (a panel not yet lowered is drawn at nothing)
        if (a > 0) sc.set(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2])
        else sc.setScalar(0.0001)
        mx.compose(v, q, sc)
        im.setMatrixAt(i, mx)
      })
      im.instanceMatrix.needsUpdate = true
    }
    if (moving) invalidate()
  }, -1)

  const [a, b] = building.box
  return (
    <group>
      <MovingKeyLight focus={[(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2]} reach={Math.max(b[0] - a[0], b[2] - a[2]) * 0.8} offset={[-14, 26, 20]} />
      <instancedMesh key={building.panels.length} ref={mesh} args={[box, m.concrete, building.panels.length]} castShadow receiveShadow frustumCulled={false} />
      <primitive object={frame.obj} />
      <primitive object={finish.obj} />
      {building.marks.map((k) => (
        <Anchor key={k.id} bus={bus} id={`st-${k.id}`} position={k.at} />
      ))}
    </group>
  )
}
