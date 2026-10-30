import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { LabelBus } from '../../../facade/three/kit'
import { prefersReducedMotion } from '../../../lib/motion'
import { Lines, LAYER, PLANK, rack, split } from './dc'
import { ink, useDrawing, useInkResolution } from './draw'
import { Piece } from './Piece'

/**
 * The opening: a piece of a data hall's floor, isolated over its shadow on the yellow ground, the
 * one thing in its own materials; on it a server rack, drawn, so the eye stays on the floor. As the
 * page opens the piece settles, then the rack is drawn up from its feet. RTARIUM shows in the corner
 * where the layers are stepped back.
 */

export const HERO_TARGET: [number, number, number] = [0.1, 0.5, 0]

/** a drawing's segments from the floor up, so it is drawn as it would be built */
function upwards(L: Lines) {
  const n = L.pts.length / 6
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.min(L.pts[a * 6 + 1], L.pts[a * 6 + 4]) - Math.min(L.pts[b * 6 + 1], L.pts[b * 6 + 4]))
  const out = new Lines()
  for (const i of idx) out.pts.push(...L.pts.slice(i * 6, i * 6 + 6))
  return out
}

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
    rack(L, 0.52, -0.22, PLANK.t + LAYER.screed + LAYER.esd)
    return upwards(split(L, 0.12))
  }, [])
  const drawing = useDrawing(lines, mat)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const s = t.current
    let moving = false
    // the piece settles over its shadow first, then the rack is drawn on it from its feet up
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
      <Piece bus={bus} ids={{ mesh: 'hd-mesh' }} />
      <primitive object={drawing.obj} />
    </group>
  )
}
