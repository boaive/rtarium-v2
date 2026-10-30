import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { LabelBus } from '../../facade/three/kit'
import { prefersReducedMotion } from '../../lib/motion'
import { FloorSample } from './FloorSample'

/**
 * The opening: a sample of the floor, isolated over its shadow on the yellow ground, as the Façade
 * overview's opening panel is. RTARIUM lies on the structural slab; as the page opens it settles, and
 * the screed is poured across the mesh from the right, stopping short so the bare mesh still reads.
 */
export function FloorHero({ bus, play }: { bus: LabelBus; play: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const group = useRef<THREE.Group>(null)
  const t = useRef({ rise: reduced ? 1 : 0, pour: reduced ? 1 : 0 })
  const pour = useRef(reduced ? 1 : 0)
  const [started, setStarted] = useState(reduced)
  useEffect(() => {
    if (!play || started) return
    const id = window.setTimeout(() => setStarted(true), 450)
    return () => window.clearTimeout(id)
  }, [play, started])
  useEffect(() => invalidate(), [started, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = t.current
    let moving = false
    // the sample settles over its shadow first, then the screed is poured across RTARIUM
    if (started && s.rise < 1) {
      s.rise = Math.min(1, s.rise + dt / 0.9)
      moving = true
    }
    if (started && s.rise > 0.55 && s.pour < 1) {
      s.pour = Math.min(1, s.pour + dt / 1.9)
      moving = true
    }
    pour.current = s.pour
    const rise = 1 - Math.pow(1 - s.rise, 3)
    // once it has settled it floats a little over its shadow, in time (the camera asks for the frames)
    const bob = reduced || s.rise < 1 ? 0 : 0.003 * Math.sin((performance.now() / 1000) * ((Math.PI * 2) / 6.5))
    if (group.current) group.current.position.y = (1 - rise) * 0.04 + bob
    if (moving) invalidate()
  }, -2)

  return (
    <group ref={group}>
      <FloorSample bus={bus} kind="pour" pour={pour} />
    </group>
  )
}
