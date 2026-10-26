import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { approach } from './kit'
import { prefersReducedMotion } from '../../lib/motion'

/** one soft elliptical falloff, drawn once and shared */
let texture: THREE.CanvasTexture | null = null
function shadowTexture() {
  if (texture) return texture
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(0,0,0,1)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  texture = new THREE.CanvasTexture(c)
  return texture
}

/**
 * An unseen floor under a model on a light ground: a soft pool of shade, and the model's own
 * shadow from the key light caught on it, so the model sits there like a product on a table
 * instead of floating. It comes and goes with its model.
 */
export function SoftShadow({ on, position, size, strength = 0.22 }: { on: boolean; position: [number, number, number]; size: [number, number]; strength?: number }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: shadowTexture(), color: '#1d1a14', transparent: true, opacity: 0, depthWrite: false }), [])
  const catcher = useMemo(() => new THREE.ShadowMaterial({ color: '#2a241a', transparent: true, opacity: 0, depthWrite: false }), [])
  useEffect(
    () => () => {
      mat.dispose()
      catcher.dispose()
    },
    [mat, catcher],
  )
  const s = useRef<Record<string, number>>({ o: 0 })
  useEffect(() => invalidate(), [on, invalidate])
  useFrame((_, delta) => {
    if (approach(s.current, 'o', on ? 1 : 0, reduced ? 1e3 : 3, Math.min(delta, 1 / 20), 1e-3)) invalidate()
    mat.opacity = s.current.o * strength
    mat.visible = s.current.o > 0.003
    catcher.opacity = s.current.o * 0.2
    catcher.visible = mat.visible
  }, -2)
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh material={mat} renderOrder={-1}>
        <planeGeometry args={size} />
      </mesh>
      <mesh material={catcher} receiveShadow renderOrder={-1} position={[0, 0, 0.002]}>
        <planeGeometry args={[size[0] * 2.6, size[1] * 4]} />
      </mesh>
    </group>
  )
}

/** every mesh inside casts and receives shadows (set once, when the models have mounted) */
export function CastShadows({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    // the models build their parts on mount; one frame later they are all there
    const id = requestAnimationFrame(() =>
      ref.current?.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.castShadow = true
        m.receiveShadow = true
      }),
    )
    return () => cancelAnimationFrame(id)
  }, [])
  return <group ref={ref}>{children}</group>
}
