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
 * The panels (Wall Panels), on the pinned yellow screen: one piece of panel, 600 × 1200 mm, standing upright in
 * the middle of the screen, the same piece throughout. The scroll is the clock, and the visitor can stop anywhere:
 *
 *   the 30 mm panel, whole  →  it bursts: all its layers stand apart through its thickness at once, the camera
 *   coming round to the side so each is seen whole (the Unitized unit's burst)  →  marked  →  it closes  →  it
 *   divides, the core goes in, it joins: the 100 mm panel  →  it bursts the same way  →  marked  →  it closes
 *
 * Every stretch of the scroll moves something; the camera keeps the piece, at every moment, inside its room.
 */

export const PIECE_LEN = 1.2

/** the run, as fractions: when each thing happens (the marks come one by one over theirs) */
export const RUN_AT = {
  burst30: [0.03, 0.13],
  open30: [0.1, 0.15],
  marks30: [0.15, 0.4],
  close30: [0.42, 0.5],
  divide: [0.51, 0.56],
  core: [0.56, 0.61],
  join: [0.61, 0.66],
  burst100: [0.68, 0.78],
  open100: [0.74, 0.8],
  marks100: [0.8, 0.95],
  close100: [0.955, 0.995],
} as const

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** the piece's pose at `p` (0..1 of the run) */
export function piecePoseAt(p: number, out: PiecePose) {
  const A = RUN_AT
  const b30 = smooth(A.burst30[0], A.burst30[1], p) * (1 - smooth(A.close30[0] + 0.02, A.close30[1], p))
  const o30 = smooth(A.open30[0], A.open30[1], p) * (1 - smooth(A.close30[0], A.close30[1] - 0.03, p))
  const stage = 3 * smooth(A.divide[0], A.join[1], p)
  // (the three steps of the change, each its own share of the run)
  const st = p < A.divide[0] ? 0 : p < A.divide[1] ? smooth(A.divide[0], A.divide[1], p) : p < A.core[1] ? 1 + smooth(A.core[0], A.core[1], p) : 2 + smooth(A.join[0], A.join[1], p)
  const b100 = smooth(A.burst100[0], A.burst100[1], p) * (1 - smooth(A.close100[0], A.close100[1], p))
  const o100 = smooth(A.open100[0], A.open100[1], p) * (1 - smooth(A.close100[0] - 0.01, A.close100[1] - 0.005, p))
  out.stage = Number.isFinite(st) ? st : stage
  out.burst = out.stage >= 3 ? b100 : b30
  out.open = out.stage >= 3 ? o100 : o30
  return out
}

const W2 = PW
const L = PIECE_LEN
/** what the camera frames: the piece whole (from the front, a little to the side), and burst (from the side, as the Unitized unit is) */
const VIEW = {
  whole: { box: [[-0.02, 0, -0.06], [W2 + 0.03, L, 0.06]] as Box, azim: 26, elev: 9, fill: 0.93 },
  open30: { box: [[-0.02, 0, -0.38], [W2 + 0.02, L, 0.5]] as Box, azim: 56, elev: 13, fill: 0.94 },
  change: { box: [[-0.02, 0, -0.18], [W2 + 0.26, L, 0.18]] as Box, azim: 32, elev: 10, fill: 0.92 },
  open100: { box: [[-0.02, 0, -0.86], [W2 + 0.02, L, 0.86]] as Box, azim: 58, elev: 13, fill: 0.94 },
}

export function PieceStage({ t, bus, room }: { t: Progress; bus: LabelBus; room: { current: Room } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const pose = useRef<PiecePose>({ stage: 0, burst: 0, open: 0 })
  const cur = useRef<Record<string, number> | null>(null)
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#4a3000', transparent: true, opacity: 0.18, depthWrite: false }), [])
  useEffect(() => () => catcher.dispose(), [catcher])

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
    if (p < A.divide[0]) shot = between(whole, shotOf(VIEW.open30), ease(smooth(A.burst30[0], A.burst30[1], p) * (1 - smooth(A.close30[0], A.close30[1], p))))
    else if (p < A.join[1] + 0.02) shot = between(whole, shotOf(VIEW.change), ease(smooth(A.divide[0], A.divide[0] + 0.03, p) * (1 - smooth(A.join[0] + 0.02, A.join[1] + 0.02, p))))
    else shot = between(whole, shotOf(VIEW.open100), ease(smooth(A.burst100[0], A.burst100[1], p) * (1 - smooth(A.close100[0], A.close100[1], p))))
    const to = { tx: shot.target[0], ty: shot.target[1], tz: shot.target[2], ld: Math.log(shot.dist), azim: shot.azim, elev: shot.elev, fx: shot.frame![0], fy: shot.frame![1] }
    if (!cur.current || reduced) cur.current = { ...to }
    const c = cur.current
    const dt = Math.min(delta, 1 / 20)
    let moving = false
    for (const k of Object.keys(to) as (keyof typeof to)[]) if (approach(c, k, to[k], 7, dt, 1e-4)) moving = true
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
      <MovingKeyLight focus={[W2 / 2, L / 2, 0]} reach={1.4} offset={[-3, 6, 6]} />
      <PanelPiece len={L} pose={pose} bus={bus} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W2 / 2, -0.001, 0]} material={catcher} receiveShadow>
        <planeGeometry args={[4, 4]} />
      </mesh>
    </group>
  )
}
