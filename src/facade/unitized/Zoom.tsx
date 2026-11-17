import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'

/**
 * A phone's scene drawn larger or smaller in its frame, over the camera the scene has just set (after it, before the
 * frame is drawn): the one knob that sizes a scene the way the Unitized page's are sized on a phone, whatever way the
 * scene places its own camera (as the dev film page's zoom, src/dev/FilmUnitized.tsx). A section whose camera goes from
 * a close look to the whole building gives each step its own (`by`); a new one is eased to, as a camera move, never cut.
 */
export function Zoom({ by }: { by: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const now = useRef<number | null>(null)
  useFrame((_, dt) => {
    const from = now.current ?? by
    const next = Math.abs(by - from) < 1e-3 ? by : from + (by - from) * Math.min(1, Math.max(0, dt) * 3.2)
    now.current = next
    if (camera.zoom !== next) {
      camera.zoom = next
      camera.updateProjectionMatrix()
    }
    if (next !== by) invalidate()
  }, -0.5)
  return null
}
