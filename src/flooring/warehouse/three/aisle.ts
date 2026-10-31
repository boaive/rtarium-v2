import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { Lines, sortFrom } from '../../data/three/dc'
import { ink, useInkResolution } from '../../data/three/draw'
import { circle, cradleLines, craneLines, POD, podLines, rackRun, RACK, type Map3, type View } from './parts'

/**
 * The fast floor, the failure's first shot and the solution's last: a length of one narrow aisle cut
 * out of a high-bay hall and set in the room like the page's other pieces, racks either side, AGVs and a
 * picking crane running its length, in the section's ink. The floor under it belongs to the scene. The
 * machines are cut by the piece's two ends as they run in and out of it.
 *
 * On a worn floor (`tick`'s `clean` false) the AGVs misbehave: they pitch at every joint, wander off
 * their lane, and now and then one faults, stopping skewed and in red, the one behind it stuck in the
 * queue. On RTARIUM (`clean`) they run true.
 */

export const AISLE = { half: 1.9, near: 8, far: 8 - 6 * RACK.bay, levels: 4, width: 3.3, joint: 4 }
/** the shot that fits it to a scene's room */
export const AISLE_VIEW: View = { box: [[-AISLE.width, 0, AISLE.far], [AISLE.width, AISLE.levels * RACK.level, AISLE.near]], azim: 38, elev: 24, fill: 0.98 }

const LANES: { x: number; way: number; speed: number; every: number }[] = [
  { x: 0.62, way: 1, speed: 6.2, every: 3 },
  { x: 0.62, way: 1, speed: 6.2, every: 0 },
  { x: 0.62, way: 1, speed: 6.2, every: 5 },
  { x: -0.34, way: -1, speed: 5, every: 4 },
  { x: -0.34, way: -1, speed: 5, every: 0 },
]
/** where the convoy holds while the camera is under the floor (null: that lane is gone) */
const HOLD: (number | null)[] = [1.1, -1.9, null, null, null]
const RUN = [AISLE.far - 1.4, AISLE.near + 1.4] as const
const NEAR_O = 0.42
const MID_O = 0.36
const FAR_O = 0.3

const wrap = (v: number) => {
  const len = RUN[1] - RUN[0]
  return RUN[0] + ((((v - RUN[0]) % len) + len) % len)
}

function rows() {
  const bands: [number, number, Lines][] = [
    [0, 2, new Lines()],
    [2, 4, new Lines()],
    [4, 6, new Lines()],
  ]
  const { half, near, levels } = AISLE
  const left: Map3 = (u, y, v) => [-half - v, y, near - u]
  const right: Map3 = (u, y, v) => [half + v, y, near - u]
  for (const [a, b, L] of bands) {
    for (const m of [left, right]) rackRun(L, m, b, levels, { from: a, load: 0.5 })
  }
  return bands.map(([, , L]) => sortFrom(L, [0, 0, near]))
}

/** how a wheel's load runs down into the slab, one bulb under each wheel of a pod: from the contact down */
function fanLines(depth: number) {
  const L = new Lines()
  const { wheelX, wheelZ } = POD
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = sx * wheelX
      const cz = sz * wheelZ
      for (let a = 0; a < 8; a++) {
        const az = ((a + 0.5) / 8) * Math.PI * 2
        for (const spread of [0.2, 0.5]) {
          const n = 6
          for (let k = 0; k < n; k++) {
            const t0 = k / n
            const t1 = (k + 1) / n
            const r0 = spread * Math.pow(t0, 0.7)
            const r1 = spread * Math.pow(t1, 0.7)
            L.seg([cx + r0 * Math.cos(az), -depth * t0, cz + r0 * Math.sin(az)], [cx + r1 * Math.cos(az), -depth * t1, cz + r1 * Math.sin(az)])
          }
        }
      }
    }
  const n = L.pts.length / 6
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => L.pts[b * 6 + 1] - L.pts[a * 6 + 1])
  const out = new Lines()
  for (const i of idx) out.pts.push(...L.pts.slice(i * 6, i * 6 + 6))
  return out
}

function segments(L: Lines, mat: LineSegments2['material'], order = 5) {
  const g = new LineSegmentsGeometry()
  g.setPositions(new Float32Array(L.pts))
  const o = new LineSegments2(g, mat)
  o.frustumCulled = false
  o.renderOrder = order
  return o
}

export function useAisle(color: string, { alertColor, stressDepth = 0.85, dim = 1 }: { alertColor?: string; stressDepth?: number; dim?: number } = {}) {
  const mats = useMemo(() => {
    const ends = [new THREE.Plane(new THREE.Vector3(0, 0, -1), AISLE.near), new THREE.Plane(new THREE.Vector3(0, 0, 1), -AISLE.far)]
    const out = {
      near: ink(0.85, color, NEAR_O * dim),
      mid: ink(0.75, color, MID_O * dim),
      far: ink(0.7, color, FAR_O * dim),
      machine: ink(1.5, color, dim),
      crane: ink(1.1, color, 0.9 * dim),
      alert: alertColor ? ink(1.7, alertColor, 1) : null,
      stress: alertColor ? ink(1.05, alertColor, 0.9) : null,
    }
    for (const m of [out.machine, out.crane, out.alert, out.stress]) if (m) m.clippingPlanes = ends
    return out
  }, [color, alertColor, dim])
  useInkResolution(useMemo(() => Object.values(mats).filter((m) => m !== null), [mats]))

  const world = useMemo(() => {
    const group = new THREE.Group()
    const [near, mid, far] = rows()
    const bands = [segments(near, mats.near), segments(mid, mats.mid), segments(far, mats.far)]
    bands.forEach((b) => group.add(b))
    const bandTotals = [near, mid, far].map((l) => l.pts.length / 6)

    const P = new Lines()
    podLines(P)
    const podGeo = new LineSegmentsGeometry()
    podGeo.setPositions(new Float32Array(P.pts))
    const fans = alertColor ? fanLines(stressDepth) : null
    const fanGeo = fans ? new LineSegmentsGeometry().setPositions(new Float32Array(fans.pts)) : null
    const span = RUN[1] - RUN[0]
    const pods = LANES.map((lane, i) => {
      const g = new THREE.Group()
      const line = new LineSegments2(podGeo, mats.machine)
      line.frustumCulled = false
      line.renderOrder = 6
      g.add(line)
      let alert: LineSegments2 | null = null
      if (mats.alert) {
        alert = new LineSegments2(podGeo, mats.alert)
        alert.frustumCulled = false
        alert.renderOrder = 7
        alert.visible = false
        g.add(alert)
      }
      if (fanGeo && mats.stress) {
        const f = new LineSegments2(fanGeo as LineSegmentsGeometry, mats.stress)
        f.frustumCulled = false
        f.renderOrder = 7
        g.add(f)
      }
      group.add(g)
      return { g, line, alert, lane, i, z: wrap(RUN[0] + ((i + 0.35) / LANES.length) * span * 1.3), last: 0, seen: 0, stopped: 0, skew: 0, jolt: 0, sway: i * 1.9 }
    })
    pods.forEach((p) => (p.last = Math.floor(p.z / AISLE.joint)))

    // the picking crane on its rail down the far side of the aisle, a load on its cradle
    const C = new Lines()
    craneLines(C, AISLE.levels * RACK.level + 0.3)
    const crane = new THREE.Group()
    crane.add(segments(C, mats.crane))
    const Cr = new Lines()
    cradleLines(Cr)
    const cradle = new THREE.Group()
    cradle.add(segments(Cr, mats.crane))
    crane.add(cradle)
    crane.position.x = -1.3
    group.add(crane)
    const rail = new Lines()
    for (const dx of [-0.04, 0.04]) rail.seg([-1.3 + dx, 0.01, AISLE.far], [-1.3 + dx, 0.01, AISLE.near])
    for (let z = AISLE.far; z < AISLE.near; z += 6) circle(rail, [-1.3, 0.012, z], 0.015, 'y', 6)
    const railLine = segments(rail, mats.far)
    group.add(railLine)
    let machinesOn = true
    let craneZ = wrap(AISLE.near - 6)
    let craneClock = 0

    return {
      group,
      /** how much of the aisle is drawn, from the near end: 0..1 */
      show(s: number) {
        const v = Math.min(1, Math.max(0, s))
        bands.forEach((b, i) => {
          const f = Math.min(1, Math.max(0, v * 3 - i))
          const n = Math.round(f * bandTotals[i])
          ;(b.geometry as LineSegmentsGeometry).instanceCount = n
          b.visible = n > 0
        })
        railLine.visible = v > 0.01
      },
      /** the machines' opacity (their lines), and whether they are there at all */
      machines(o: number) {
        mats.machine.opacity = Math.min(1, o * dim)
        mats.crane.opacity = 0.9 * o * dim
        crane.visible = o > 0.01
        machinesOn = o > 0.01
      },
      /** how far each bulb of stress has run down from its wheels, 0..1 */
      stress(share: number, o: number) {
        if (!mats.stress || !fanGeo) return
        mats.stress.opacity = o
        mats.stress.visible = o > 0.01
        ;(fanGeo as LineSegmentsGeometry).instanceCount = Math.round(Math.min(1, Math.max(0, share)) * (fans!.pts.length / 6))
      },
      /**
       * Runs the machines on by `dt` seconds. `clean`: true on RTARIUM's floor. `hold`: 0..1, how far
       * they have been brought to the slow convoy that stands while the camera is under the floor.
       */
      tick(dt: number, { clean = false, hold = 0, time = 0 }: { clean?: boolean; hold?: number; time?: number } = {}) {
        for (const p of pods) {
          const { lane } = p
          // caught behind the one in front of it in the lane: the queue a fault leaves
          let blocked = false
          if (!clean) {
            for (const o of pods) {
              if (o === p || o.lane.x !== lane.x) continue
              const gap = (o.z - p.z) * lane.way
              if (gap > 0 && gap < POD.l + 0.5) blocked = true
            }
          }
          if (p.stopped > 0) p.stopped = Math.max(0, p.stopped - dt)
          else if (!blocked) p.z += lane.way * lane.speed * dt
          if (p.z > RUN[1] || p.z < RUN[0]) {
            p.z = wrap(p.z)
            p.last = Math.floor(p.z / AISLE.joint)
          }
          // crossing a joint: a jolt, and now and then a fault
          const cell = Math.floor(p.z / AISLE.joint)
          if (cell !== p.last) {
            p.last = cell
            if (!clean) {
              p.jolt = 1
              p.seen++
              if (lane.every && p.seen % lane.every === 0) {
                p.stopped = 1.5
                p.skew = (p.i % 2 ? -1 : 1) * 0.26
              }
            }
          }
          p.jolt = Math.max(0, p.jolt - dt * 3.2)
          const faulted = p.stopped > 0
          if (!faulted) p.skew *= Math.exp(-dt * 2.4)
          const wander = clean ? 0 : (1 - hold) * (0.2 * Math.sin(time * 1.5 + p.sway) + 0.08 * Math.sin(time * 4.3 + p.sway * 2))
          const yaw = clean ? 0 : (1 - hold) * 0.07 * Math.cos(time * 1.5 + p.sway)
          const at = HOLD[p.i]
          const slow = at === null ? p.z : at + 0.28 * Math.sin(time * 0.8 + p.i)
          p.g.position.set(lane.x + wander + (faulted ? 0.1 * Math.sign(p.skew) : 0), 0.024 * p.jolt * (1 - hold), p.z + (slow - p.z) * hold)
          p.g.rotation.set(-0.07 * p.jolt * Math.sin(p.jolt * Math.PI) * (1 - hold), (lane.way > 0 ? 0 : Math.PI) + yaw + p.skew * (1 - hold), 0.035 * p.jolt * (1 - hold))
          p.g.visible = machinesOn && (at !== null || hold < 0.5)
          if (p.alert) {
            const on = faulted && hold < 0.5
            p.alert.visible = on
            p.line.visible = !on
          }
        }
        // the crane leaves with the racks; it runs and halts on a worn floor, steadily on a good one
        crane.visible = machinesOn && hold < 0.25
        craneClock += dt
        const go = clean ? 1 : Math.max(0, Math.sin(craneClock * 1.1) + 0.25)
        craneZ = wrap(craneZ - dt * 3.4 * go)
        crane.position.z = craneZ
        cradle.position.y = 2.8 + 2 * Math.sin(craneClock * 0.7)
      },
      dispose() {
        bands.forEach((b) => b.geometry.dispose())
        podGeo.dispose()
        ;(fanGeo as LineSegmentsGeometry | null)?.dispose()
        crane.traverse((o) => {
          if (o instanceof LineSegments2) o.geometry.dispose()
        })
        group.children.forEach((o) => {
          if (o instanceof LineSegments2) o.geometry.dispose()
        })
      },
    }
  }, [mats, alertColor, stressDepth, dim])
  useEffect(() => () => world.dispose(), [world])
  return world
}
