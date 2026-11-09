import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchor, MovingKeyLight } from '../../facade/three/Stage3D'
import { approach, type LabelBus } from '../../facade/three/kit'
import { smooth, type Progress } from '../../facade/progress'
import { prefersReducedMotion } from '../../lib/motion'
import { Lines, split } from '../../flooring/data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../flooring/data/three/draw'
import { between, fit, type Box, type Room } from './fit'
import type { Building, Mat, Part } from './buildings'
import { WIRE } from '../../three/wire'

/**
 * A stream's building, on the warm white page, pinned for its run, as the Unitized page's slab to slab: the scroll the
 * clock, the building put up as it would be on site. It never opens on an empty stage (owner, 3 Nov 2026):
 *
 *   0  one panel    the first panel already stands in its place, close, the frame drawn just round it; the camera
 *                   draws slowly back as the rest of the frame is drawn out from it, to the whole building
 *   1  one wall     its panels go up course by course, each lowered onto the one below: the jambs, the steel lintels
 *                   over the openings, the horizontal panels on them (on a large building the camera goes part of
 *                   the way in on that wall meanwhile)
 *   2  as required  the walls the building needs next
 *   3  the rest     the rest, and the finish: the windows and doors set in from outside (the home's partition first,
 *                   the camera going in on it: one side, the services in the void, the other side)
 *
 * The panels, their steel and the fittings are solid, each in its standard colour; the structure is a drawing. Every
 * shot is fitted to the room between the title and the bar, so nothing ever leaves it. `progress` runs 0..1.
 */

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** how close the camera is on the first panel (0..1), at `t` (0..4): the room shows its edge while it is */
export const closerAt = (t: number) => 1 - ease(smooth(0.04, 0.96, t))

/** each step's run of the clock; within step 3, the panels take its first part and the finish the rest */
const RUN: Record<number, [number, number]> = { 1: [1.06, 1.92], 2: [2.06, 2.92], 3: [3.04, 3.96] }
const REST3: [number, number] = [0, 0.55]

/**
 * The drawing's segments sorted by their distance from a point across the ground (their height left out, so a column
 * is drawn whole, never a piece of it hanging in the air), and those distances (for drawing it out to a radius)
 */
function byDistance(L: Lines, o: [number, number, number]) {
  const p = L.pts
  const n = p.length / 6
  const d = Array.from({ length: n }, (_, i) => Math.hypot((p[i * 6] + p[i * 6 + 3]) / 2 - o[0], (p[i * 6 + 2] + p[i * 6 + 5]) / 2 - o[2]))
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[a] - d[b])
  const out = new Lines()
  for (const i of idx) out.pts.push(...p.slice(i * 6, i * 6 + 6))
  return { lines: out, dist: idx.map((i) => d[i]) }
}

/**
 * When each part goes in (on the build's clock), and from where. Within a step (or a phase of one) the parts go up a
 * course at a time, all its walls together, a wave along each wall; each slot ends before the course above begins, so
 * nothing is lowered onto what has not landed. What is set in from outside (a window, a door) goes in as one, along.
 */
function schedule(parts: Part[], seed: number) {
  const out = parts.map(() => ({ t0: -1, t1: 0 }))
  const groups = new Map<string, number[]>()
  parts.forEach((p, i) => {
    if (i === seed) return
    const ph = p.phase ?? (p.step === 3 ? REST3 : [0, 1])
    const k = `${p.step}|${ph[0]}|${ph[1]}|${p.from ? 'in' : 'up'}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(i)
  })
  for (const ids of groups.values()) {
    const p0 = parts[ids[0]]
    const [r0, r1] = RUN[p0.step]
    const ph = p0.phase ?? (p0.step === 3 ? REST3 : [0, 1])
    const [g0, g1] = [r0 + (r1 - r0) * ph[0], r0 + (r1 - r0) * ph[1]]
    const pos = ids.map((i) => parts[i].a[0] + parts[i].a[2])
    const lo = Math.min(...pos)
    const hi = Math.max(...pos)
    const heights = p0.from ? [0] : [...new Set(ids.map((i) => Math.round(parts[i].a[1] * 100)))].sort((x, y) => x - y)
    const slot = 1 / (heights.length + 0.5)
    ids.forEach((i, k) => {
      const course = p0.from ? 0 : heights.indexOf(Math.round(parts[i].a[1] * 100))
      const wave = hi > lo ? (pos[k] - lo) / (hi - lo) : 0
      const a = p0.from ? 0.55 * wave : (course + 0.5 * wave) * slot
      const b = p0.from ? a + 0.45 : a + 0.85 * slot
      out[i] = { t0: g0 + (g1 - g0) * a, t1: g0 + (g1 - g0) * b }
    })
  }
  return out
}

/** each kind of part's look: a painted panel matt, the steel a little metallic, the glass clear */
function material(mat: Mat, color: string) {
  const metal = mat === 'steel' || mat === 'metal'
  if (mat === 'glass') return new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.45, depthWrite: false })
  return new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.4 : mat === 'frame' || mat === 'door' ? 0.5 : 0.78, metalness: metal ? 0.55 : 0.02 })
}

export function StreamScene({ progress, bus, room, building }: { progress: Progress; bus: LabelBus; room: { current: Room }; building: Building }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => () => gl.setScissorTest(false), [gl])
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => box.dispose(), [box])

  const inks = useMemo(() => ({ frame: ink(1.05, '#080808', 0.85), finish: ink(1, '#080808', 0.7) }), [])
  useInkResolution(useMemo(() => Object.values(inks), [inks]))
  const seedPart = building.parts[building.seed]
  const lines = useMemo(() => {
    const frame = byDistance(split(building.frame, 0.8), building.origin)
    return { frame: frame.lines, dist: frame.dist, finish: split(building.finish, 1.2) }
  }, [building])
  const frame = useDrawing(lines.frame, inks.frame)
  const finish = useDrawing(lines.finish, inks.finish)
  /** the start: the first panel and a little room round it, and how far out the frame is drawn there */
  const start = useMemo(() => {
    const [a, b] = [seedPart.a, seedPart.b]
    const h = b[1] - a[1]
    const m = Math.max(1.0, h * 0.42)
    const sb: Box = [
      [a[0] - m, 0, a[2] - m],
      [b[0] + m, b[1] + m * 0.4, b[2] + m],
    ]
    return { box: sb, r0: Math.max(2.6, h * 1.2), rmax: lines.dist[lines.dist.length - 1] ?? 1 }
  }, [seedPart, lines])

  const order = useMemo(() => schedule(building.parts, building.seed), [building])
  /** how far a part is lowered from: a little, as a crane sets it down */
  const drop = useMemo(() => Math.min(0.36, (building.box[1][1] - building.box[0][1]) / 30), [building])
  /** the parts a box will not do for (a gable's, cut to the roof) on their own; the rest instanced, a set for each material */
  const sets = useMemo(() => {
    const plain = new Map<Mat, number[]>()
    const own: { i: number; geo: THREE.BufferGeometry }[] = []
    building.parts.forEach((p, i) => {
      if (p.cut) {
        const g = new THREE.BoxGeometry(1, 1, 1)
        const pos = g.getAttribute('position')
        const k = p.cut.axis === 'x' ? 0 : 2
        for (let j = 0; j < pos.count; j++) {
          const x = p.a[0] + (pos.getX(j) + 0.5) * (p.b[0] - p.a[0])
          const y = p.a[1] + (pos.getY(j) + 0.5) * (p.b[1] - p.a[1])
          const z = p.a[2] + (pos.getZ(j) + 0.5) * (p.b[2] - p.a[2])
          const f = pos.getComponent(j, k) + 0.5
          pos.setXYZ(j, x, pos.getY(j) > 0 ? p.cut.y0 + (p.cut.y1 - p.cut.y0) * f : y, z)
        }
        g.computeVertexNormals()
        own.push({ i, geo: g })
      } else {
        if (!plain.has(p.mat)) plain.set(p.mat, [])
        plain.get(p.mat)!.push(i)
      }
    })
    return { plain: [...plain.entries()], own }
  }, [building])
  useEffect(() => () => sets.own.forEach((o) => o.geo.dispose()), [sets])
  const mats = useMemo(() => {
    const out = new Map<Mat, THREE.MeshStandardMaterial>()
    for (const p of building.parts) if (!out.has(p.mat)) out.set(p.mat, material(p.mat, building.colors[p.mat] ?? '#cccccc'))
    return out
  }, [building])
  useEffect(() => () => mats.forEach((x) => x.dispose()), [mats])
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])
  const owned = useRef<(THREE.Mesh | null)[]>([])
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
    // the camera: close on the first panel, drawing back to the whole building as its frame is drawn out; then the whole,
    // turning a little as the rest goes up (and in on the home's partition while it goes in)
    const aspect = size.width / Math.max(1, size.height)
    const [fa, fe] = building.views.first
    const [wa, we] = building.views.whole
    const near = fit(start.box, fa, fe, room.current, aspect, 0.62)
    const whole = fit(building.box, wa + 6 * smooth(1.2, 4, t), we, room.current, aspect, 0.86)
    let shot = between(near, whole, 1 - closerAt(t))
    // a large building's first wall: part of the way in on it while it goes up, back out for the next
    if (building.first) {
      const w = 0.5 * ease(smooth(1.0, 1.22, t) * (1 - smooth(1.86, 2.12, t)))
      if (w > 0) shot = between(shot, fit(building.first, fa, fe + 4, room.current, aspect, 0.86), w)
    }
    const cl = building.close
    if (cl) {
      const w = ease(smooth(cl.at[0], cl.at[1], t) * (1 - smooth(cl.at[2], cl.at[3], t)))
      if (w > 0) shot = between(shot, fit(cl.box, cl.view[0], cl.view[1], room.current, aspect, 0.8), w)
    }
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
    // nothing is drawn outside the room: the close look is cropped to it
    const r = room.current
    gl.setScissorTest(true)
    gl.setScissor(r.x * size.width - 6, (1 - r.y - r.h) * size.height - 6, r.w * size.width + 12, r.h * size.height + 12)

    // the frame: just round the first panel at the start, drawn out from it to the whole as the camera draws back; it
    // steps back a little as the walls go on
    const reach = start.r0 + (start.rmax - start.r0) * ease(smooth(0.02, 0.94, t))
    let n = 0
    for (let lo = 0, hi = lines.dist.length; lo < hi; ) {
      const mid = (lo + hi) >> 1
      if (lines.dist[mid] <= reach) lo = n = mid + 1
      else hi = mid
    }
    frame.show(lines.dist.length ? n / lines.dist.length : 0)
    inks.frame.opacity = WIRE.opacity * (1 - 0.3 * smooth(2.2, 3.4, t))
    finish.show(smooth(3.62, 3.9, t))

    /** how far a part is in (0: not yet, 1: in place) */
    const inAt = (i: number) => (i === building.seed ? 1 : smooth(order[i].t0, order[i].t1, t))
    const place = (p: Part, k: number) => {
      const e = easeOut(k)
      v.set((p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2)
      if (p.from) v.set(v.x + p.from[0] * (1 - e), v.y + p.from[1] * (1 - e), v.z + p.from[2] * (1 - e))
      else v.y += (1 - e) * drop
    }
    sets.plain.forEach(([, ids], s) => {
      const im = meshes.current[s]
      if (!im) return
      ids.forEach((i, k) => {
        const p = building.parts[i]
        const a = inAt(i)
        place(p, a)
        // (a part not yet in is drawn at nothing)
        if (a > 0) sc.set(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2])
        else sc.setScalar(0.0001)
        mx.compose(v, q, sc)
        im.setMatrixAt(k, mx)
      })
      im.instanceMatrix.needsUpdate = true
    })
    sets.own.forEach((o, k) => {
      const el = owned.current[k]
      if (!el) return
      const a = inAt(o.i)
      el.visible = a > 0
      el.position.set(0, (1 - easeOut(a)) * drop, 0)
    })
    if (moving) invalidate()
  }, -1)

  const [a, b] = building.box
  return (
    <group>
      <MovingKeyLight focus={[(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2]} reach={Math.max(b[0] - a[0], b[2] - a[2]) * 0.8} offset={[-14, 26, 20]} />
      {sets.plain.map(([mat, ids], s) => (
        <instancedMesh
          key={`${building.id}-${mat}-${ids.length}`}
          ref={(el) => void (meshes.current[s] = el)}
          args={[box, mats.get(mat), ids.length]}
          castShadow={mat !== 'glass'}
          receiveShadow
          frustumCulled={false}
          renderOrder={mat === 'glass' ? 2 : 0}
        />
      ))}
      {sets.own.map((o, k) => (
        <mesh key={`${building.id}-${o.i}`} ref={(el) => void (owned.current[k] = el)} geometry={o.geo} material={mats.get(building.parts[o.i].mat)} castShadow receiveShadow visible={false} />
      ))}
      <primitive object={frame.obj} />
      <primitive object={finish.obj} />
      {building.marks.map((k) => (
        <Anchor key={k.id} bus={bus} id={`st-${k.id}`} position={k.at} />
      ))}
    </group>
  )
}
