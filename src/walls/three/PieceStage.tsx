import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MovingKeyLight } from '../../facade/three/Stage3D'
import { approach, type LabelBus, type Shot } from '../../facade/three/kit'
import { smooth, type Progress } from '../../facade/progress'
import { prefersReducedMotion } from '../../lib/motion'
import { PanelPiece, type PiecePose } from './PanelPiece'
import { PW } from './piece'
import { between, fit, type Box, type Room } from './fit'

/**
 * The panels (Wall Panels), on the pinned yellow screen: the whole panel of the client's 30 mm plan, 600 × 3600 mm (its GRP
 * grid, its four ferrules and four tie holes exactly as drawn: owner, 3 Nov 2026), in the middle of the room, the same
 * panel throughout. It stands on end, leaning a little and turned so its face is seen at an angle, and its layers burst
 * sideways, side by side, each a tall strip seen whole (the owner's sketch). The scroll is the clock, and the visitor can
 * stop anywhere:
 *
 *   the 30 mm panel, whole  →  it bursts: all its layers stand apart through its thickness at once  →  marked  →  it
 *   closes  →  it divides, the core goes in, it joins: the 100 mm panel  →  it bursts the same way  →  marked  →  it
 *   closes
 *
 * Every stretch of the scroll moves something; the camera keeps the piece, at every moment, inside its room.
 */

export const PIECE_LEN = 3.6

/** the run, as fractions: when each thing happens (the marks come one by one over theirs) */
export const RUN_AT = {
  burst30: [0.03, 0.13],
  open30: [0.032, 0.07],
  marks30: [0.15, 0.4],
  close30: [0.42, 0.5],
  divide: [0.51, 0.545],
  core: [0.545, 0.635],
  join: [0.635, 0.67],
  burst100: [0.68, 0.78],
  open100: [0.682, 0.72],
  marks100: [0.8, 0.95],
  close100: [0.955, 0.995],
} as const

/** the parts each panel's list marks, in its order (the list's rows and the model's anchors) */
export const ORDER30 = ['pp-cover', 'pp-tie', 'pp-ferrule', 'pp-zone', 'pp-grp', 'pp-back']
export const ORDER100 = ['pp-inner7', 'pp-ferrule100', 'pp-mesh6i', 'pp-rod', 'pp-cover2', 'pp-clip', 'pp-core', 'pp-outer']

/** how far through a run of marks we are: the k-th of n comes up at its share */
export const markAt = ([a, b]: readonly [number, number], n: number, k: number, p: number) => smooth(a + ((b - a) * k) / n, a + ((b - a) * (k + 0.35)) / n, p)

/** a straight ramp from a to b (the pose's eases are the layers' own, applied once) */
const ramp = (a: number, b: number, v: number) => Math.min(1, Math.max(0, (v - a) / (b - a)))

/** the piece's pose at `p` (0..1 of the run) */
export function piecePoseAt(p: number, out: PiecePose) {
  const A = RUN_AT
  const b30 = ramp(A.burst30[0], A.burst30[1], p) * (1 - ramp(A.close30[0] + 0.02, A.close30[1], p))
  // (the RTARIUM shows as its mesh as soon as the layers part, never as a third concrete layer; it is cast in again
  // only as they close)
  const o30 = smooth(A.open30[0], A.open30[1], p) * (1 - smooth(A.close30[1] - 0.022, A.close30[1], p))
  const stage = 3 * smooth(A.divide[0], A.join[1], p)
  // (the three steps of the change, each its own share of the run)
  const st = p < A.divide[0] ? 0 : p < A.divide[1] ? smooth(A.divide[0], A.divide[1], p) : p < A.core[1] ? 1 + smooth(A.core[0], A.core[1], p) : 2 + smooth(A.join[0], A.join[1], p)
  const b100 = ramp(A.burst100[0], A.burst100[1], p) * (1 - ramp(A.close100[0], A.close100[1], p))
  const o100 = smooth(A.open100[0], A.open100[1], p) * (1 - smooth(A.close100[1] - 0.018, A.close100[1], p))
  out.stage = Number.isFinite(st) ? st : stage
  out.burst = out.stage >= 3 ? b100 : b30
  out.open = out.stage >= 3 ? o100 : o30
  // the marking: each part lit from its mark until the next one's, the last until it closes
  const sip = out.stage >= 3
  const order = sip ? ORDER100 : ORDER30
  const marks = sip ? A.marks100 : A.marks30
  const close = sip ? A.close100 : A.close30
  for (const id of [...ORDER30, ...ORDER100]) out.lit[id] = 0
  order.forEach((id, k) => {
    const next = k < order.length - 1 ? markAt(marks, order.length, k + 1, p) : 0
    out.lit[id] = markAt(marks, order.length, k, p) * (1 - next)
  })
  out.marking = markAt(marks, order.length, 0, p) * (1 - smooth(close[0], close[0] + 0.02, p))
  return out
}

/** drawn wider than its 600 mm in the burst (owner, matching the reference): every position across it scales with it */
const ACROSS = 3
/** and as many times its thickness, so its 30, 70 and 100 mm read in proportion with that width (gaps are the stage's, in the room) */
const THICK = 3
const W2 = PW * ACROSS
const L = PIECE_LEN
/**
 * How the panel is turned (the owner's sketch, 3 Nov 2026): standing on end, its length up (the piece's own frame: x across,
 * y along, z through it), leaning back 6°, turned 50° about the vertical, and drawn three times its width (the reference's proportion) so its face is seen at an angle and the
 * line its layers burst along (through its thickness) runs to the right and back: the layers stand side by side, the inner
 * face's on the left, each one a tall strip seen whole, clear of the next (checked against the gaps: nothing hidden).
 */
const DEG = Math.PI / 180
const TURN = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -50 * DEG)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -6 * DEG))
/** the room's box round the turned panel, its layers reaching `zr` either side of its middle (and `xr` past its edge: the core coming in) */
function turnedBox(zr: number, xr = 0): Box {
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity)
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  const v = new THREE.Vector3()
  for (const x of [-0.02, W2 + 0.02 + xr])
    for (const y of [-0.02, L + 0.02])
      for (const z of [-zr, zr]) {
        v.set(x, y, z).applyQuaternion(TURN)
        lo.min(v)
        hi.max(v)
      }
  return [lo.toArray() as [number, number, number], hi.toArray() as [number, number, number]]
}
const CENTRE = new THREE.Vector3(W2 / 2, L / 2, 0).applyQuaternion(TURN).toArray() as [number, number, number]
/** what the camera frames: the panel whole; and burst, its layers' reach (30 mm: three layers and the ferrules; the SIP: seven) */
const VIEW = {
  whole: { box: turnedBox(0.16), azim: 0, elev: 16, fill: 0.9 },
  open30: { box: turnedBox(0.78), azim: 0, elev: 16, fill: 0.96 },
  change: { box: turnedBox(0.4, W2 * 0.9), azim: 0, elev: 16, fill: 0.92 },
  open100: { box: turnedBox(2.3), azim: 0, elev: 16, fill: 0.97 },
}

export function PieceStage({ t, bus, room }: { t: Progress; bus: LabelBus; room: { current: Room } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const pose = useRef<PiecePose>({ stage: 0, burst: 0, open: 0, lit: {}, marking: 0 })
  const cur = useRef<Record<string, number> | null>(null)

  useEffect(() => {
    const on = () => invalidate()
    t.listeners.add(on)
    return () => void t.listeners.delete(on)
  }, [t, invalidate])

  useFrame((_, delta) => {
    const p = Math.max(0, Math.min(1, t.value))
    piecePoseAt(p, pose.current)
    const A = RUN_AT
    // the camera: whole → opened → whole → the change → whole → opened → whole, eased between
    const aspect = size.width / Math.max(1, size.height)
    const shotOf = (v: (typeof VIEW)[keyof typeof VIEW]) => fit(v.box, v.azim, v.elev, room.current, aspect, v.fill)
    const whole = shotOf(VIEW.whole)
    let shot: Shot
    if (p < A.divide[0]) shot = between(whole, shotOf(VIEW.open30), smooth(A.burst30[0], A.burst30[1], p) * (1 - smooth(A.close30[0], A.close30[1], p)))
    else if (p < A.join[1] + 0.02) shot = between(whole, shotOf(VIEW.change), smooth(A.divide[0], A.divide[0] + 0.03, p) * (1 - smooth(A.join[0] + 0.02, A.join[1] + 0.02, p)))
    else shot = between(whole, shotOf(VIEW.open100), smooth(A.burst100[0], A.burst100[1], p) * (1 - smooth(A.close100[0], A.close100[1], p)))
    const to = { tx: shot.target[0], ty: shot.target[1], tz: shot.target[2], ld: Math.log(shot.dist), azim: shot.azim, elev: shot.elev, fx: shot.frame![0], fy: shot.frame![1] }
    if (!cur.current || reduced) cur.current = { ...to }
    const c = cur.current
    const dt = Math.min(delta, 1 / 20)
    let moving = false
    for (const k of Object.keys(to) as (keyof typeof to)[]) if (approach(c, k, to[k], 8, dt, 1e-4)) moving = true
    const az = (c.azim * Math.PI) / 180
    const el = (c.elev * Math.PI) / 180
    const d = Math.exp(c.ld)
    camera.fov = 26
    camera.near = Math.max(0.01, d * 0.02)
    camera.far = d * 6 + 10
    camera.position.set(c.tx + d * Math.cos(el) * Math.sin(az), c.ty + d * Math.sin(el), c.tz + d * Math.cos(el) * Math.cos(az))
    camera.lookAt(c.tx, c.ty, c.tz)
    camera.setViewOffset(size.width, size.height, -(c.fx - 0.5) * size.width, -(c.fy - 0.5) * size.height, size.width, size.height)
    camera.updateProjectionMatrix()
    if (moving) invalidate()
  }, -1)

  return (
    <group>
      <MovingKeyLight focus={CENTRE} reach={2.6} offset={[-3, 6, 6]} />
      <group quaternion={TURN}>
        <group scale={[1, 1, THICK]}>
          <PanelPiece len={L} pose={pose} bus={bus} wide={ACROSS} />
        </group>
      </group>
    </group>
  )
}
