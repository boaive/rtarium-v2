import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * The Gulf's midday sun: a hard, high key light that casts crisp shadows, kept at the same angle to
 * whatever the camera is looking at (`focus`, read every frame), its shadow camera sized to `reach`
 * (m) about it. Hard light here means a darker, sharper shadow on the ground, not a warmer colour: the
 * light stays white.
 */
export function Sun({
  focus,
  reach,
  offset = [-5, 12, 6],
  intensity = 3.1,
}: {
  focus: { current: THREE.Vector3 }
  reach: { current: number }
  offset?: [number, number, number]
  intensity?: number
}) {
  const light = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const l = light.current
    if (!l) return
    scene.add(l.target)
    return () => void scene.remove(l.target)
  }, [scene])
  const last = useRef(-1)
  useFrame(() => {
    const l = light.current
    if (!l) return
    const f = focus.current
    const r = reach.current
    const k = Math.max(1, r / 4)
    l.position.set(f.x + offset[0] * k, f.y + offset[1] * k, f.z + offset[2] * k)
    l.target.position.copy(f)
    l.target.updateMatrixWorld()
    if (r !== last.current) {
      const c = l.shadow.camera
      c.left = -r
      c.right = r
      c.top = r
      c.bottom = -r
      c.near = 0.5
      c.far = Math.hypot(...offset) * k * 2.2
      c.updateProjectionMatrix()
      last.current = r
    }
  }, -1)
  return (
    <directionalLight
      ref={light}
      intensity={intensity}
      color="#ffffff"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0003}
      shadow-normalBias={0.02}
      shadow-radius={1}
    />
  )
}
