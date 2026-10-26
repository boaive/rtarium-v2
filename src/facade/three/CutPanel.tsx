import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Box } from './Box'
import { MeshInset } from './MeshInset'
import { approach, setOpacity, PITCH_M } from './kit'
import { prefersReducedMotion } from '../../lib/motion'

/**
 * A flat panel (in the XY plane, from `zb` at its back to `zf` at its face) with a window cut
 * into it: around the cut it is solid; inside it the front cover and the concrete within the
 * mesh zone lift away when `open`, and the real mesh is seen at mid-thickness on the back cover.
 * `fade` is the panel's own opacity, set by the scene. `side` is the face that is cut open: the
 * building side (`back`) shows the mesh as it is seen from the cavity.
 */
export function CutPanel({
  rect,
  cut,
  zb,
  zf,
  mat,
  open,
  mesh,
  fade,
  side = 'front',
}: {
  rect: [number, number, number, number]
  cut: [number, number, number, number]
  zb: number
  zf: number
  mat: THREE.Material
  open: boolean
  mesh: boolean
  fade: MutableRefObject<number>
  side?: 'front' | 'back'
}) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const [x0, y0, x1, y1] = rect
  const [cx0, cy0, cx1, cy1] = cut
  const cover = (zf - zb) / 4
  const mats = useMemo(() => [mat.clone(), mat.clone()], [mat])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
  const fill = useRef<THREE.Mesh>(null)
  const front = useRef<THREE.Mesh>(null)
  const insets = useRef<THREE.Group>(null)
  const t = useRef<Record<string, number>>({ k: 0 })
  useEffect(() => invalidate(), [open, invalidate])

  const applied = useRef(-1)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    // the scene sets `fade` in the same frame; if it moved since the last frame drawn here, draw once more
    let moving = approach(t.current, 'k', open ? 1 : 0, reduced ? 1e3 : 1.8, dt)
    if (Math.abs(applied.current - fade.current) > 1e-4) moving = true
    applied.current = fade.current
    const k = t.current.k
    // the cover goes first, the concrete inside the mesh a beat later; both lift out along z
    const a = Math.min(1, k * 1.5)
    const b = Math.min(1, Math.max(0, k * 1.5 - 0.35))
    const ease = (v: number) => 1 - Math.pow(1 - v, 3)
    const out = side === 'front' ? 1 : -1
    if (front.current) front.current.position.z = (side === 'front' ? zf - cover / 2 : zb + cover / 2) + out * ease(a) * 0.12
    if (fill.current) fill.current.position.z = (zb + zf) / 2 + out * ease(b) * 0.08
    setOpacity([mats[1]], (1 - ease(a)) * fade.current)
    setOpacity([mats[0]], (1 - ease(b)) * fade.current)
    if (insets.current) insets.current.visible = k > 0.02 && fade.current > 0.3
    if (moving) invalidate()
  }, -2)

  const cx = (cx0 + cx1) / 2
  const cy = (cy0 + cy1) / 2
  return (
    <>
      {cy0 > y0 && <Box from={[x0, y0, zb]} to={[x1, cy0, zf]} mat={mat} />}
      {y1 > cy1 && <Box from={[x0, cy1, zb]} to={[x1, y1, zf]} mat={mat} />}
      {cx0 > x0 && <Box from={[x0, cy0, zb]} to={[cx0, cy1, zf]} mat={mat} />}
      {x1 > cx1 && <Box from={[cx1, cy0, zb]} to={[x1, cy1, zf]} mat={mat} />}
      {side === 'front' ? <Box from={[cx0, cy0, zb]} to={[cx1, cy1, zb + cover]} mat={mat} /> : <Box from={[cx0, cy0, zf - cover]} to={[cx1, cy1, zf]} mat={mat} />}
      <mesh ref={fill} position={[cx, cy, (zb + zf) / 2]} material={mats[0]}>
        <boxGeometry args={[cx1 - cx0, cy1 - cy0, zf - zb - 2 * cover]} />
      </mesh>
      <mesh ref={front} position={[cx, cy, side === 'front' ? zf - cover / 2 : zb + cover / 2]} material={mats[1]}>
        <boxGeometry args={[cx1 - cx0, cy1 - cy0, cover]} />
      </mesh>
      {mesh && (
        <group ref={insets} position={[cx, cy, (zb + zf) / 2]} visible={false}>
          <Suspense fallback={null}>
            <MeshInset nx={Math.floor((cx1 - cx0) / PITCH_M)} ny={Math.floor((cy1 - cy0) / PITCH_M)} />
          </Suspense>
        </group>
      )}
    </>
  )
}
