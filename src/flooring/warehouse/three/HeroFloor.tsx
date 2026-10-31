import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { LabelBus } from '../../../facade/three/kit'
import { prefersReducedMotion } from '../../../lib/motion'
import { Lines, split } from '../../data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../data/three/draw'
import { lgvLines, upwards } from './parts'
import { FLOOR_Y, Piece } from './Piece'

/**
 * The opening: a piece of the warehouse's floor, isolated over its shadow on the yellow ground, the
 * one thing in its own materials; on it a laser-guided truck with its load on the mast, drawn, so the
 * eye stays on the floor. The piece settles, then the truck is drawn up from its wheels. RTARIUM shows
 * in the corner where the layers are stepped back.
 */

export const HERO_TARGET: [number, number, number] = [0.1, 0.62, 0]

export function HeroFloor({ bus, play }: { bus: LabelBus; play: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const group = useRef<THREE.Group>(null)
  const t = useRef({ rise: reduced ? 1 : 0, draw: reduced ? 1 : 0 })
  const [started, setStarted] = useState(reduced)
  useEffect(() => {
    if (!play || started) return
    const id = window.setTimeout(() => setStarted(true), 450)
    return () => window.clearTimeout(id)
  }, [play, started])
  useEffect(() => invalidate(), [started, invalidate])

  const mat = useMemo(() => ink(1.25), [])
  useInkResolution(useMemo(() => [mat], [mat]))
  const lines = useMemo(() => {
    const L = new Lines()
    lgvLines(L)
    return upwards(split(L, 0.12))
  }, [])
  const drawing = useDrawing(lines, mat)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = t.current
    let moving = false
    if (started && s.rise < 1) {
      s.rise = Math.min(1, s.rise + dt / 0.9)
      moving = true
    }
    if (started && s.rise > 0.6 && s.draw < 1) {
      s.draw = Math.min(1, s.draw + dt / 1.8)
      moving = true
    }
    const rise = 1 - Math.pow(1 - s.rise, 3)
    const bob = reduced || s.rise < 1 ? 0 : 0.004 * Math.sin((performance.now() / 1000) * ((Math.PI * 2) / 6.5))
    if (group.current) group.current.position.y = (1 - rise) * 0.06 + bob
    if (drawing.show(1 - Math.pow(1 - s.draw, 2))) moving = true
    if (moving) invalidate()
  }, -2)

  return (
    <group ref={group}>
      <Piece bus={bus} ids={{ mesh: 'hw-mesh' }} />
      <group position={[0.2, FLOOR_Y, -0.16]} scale={0.8}>
        <primitive object={drawing.obj} />
      </group>
    </group>
  )
}
