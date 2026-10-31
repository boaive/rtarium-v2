import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { LabelBus } from '../../../facade/three/kit'
import { MovingKeyLight } from '../../../facade/three/Stage3D'
import { prefersReducedMotion } from '../../../lib/motion'
import { Wake } from '../../../facade/three/rain/lines'
import { Piece } from './Piece'

/**
 * The floor as the fab consultant reads it: the finished piece of the opening, alone, turned so its cut
 * face (the waffle's ribs under it) and its stepped corner are seen together, every layer of the
 * build-up in view; it turns a little in its own time while on screen.
 */
export function BuildUp({ bus, live }: { bus: LabelBus; live: { current: boolean } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useFrame(() => {
    const t = performance.now() / 1000
    const az = ((-36 + (reduced ? 0 : 5 * Math.sin((t * Math.PI * 2) / 14))) * Math.PI) / 180
    const el = (28 * Math.PI) / 180
    const d = 5.8
    const target: [number, number, number] = [-0.3, 0.32, 0.15]
    camera.fov = 26
    camera.position.set(target[0] + d * Math.cos(el) * Math.sin(az), target[1] + d * Math.sin(el), target[2] + d * Math.cos(el) * Math.cos(az))
    camera.lookAt(...target)
    camera.updateProjectionMatrix()
    if (live.current && !reduced) invalidate()
  }, -1)
  return (
    <>
      <Wake live={live} />
      <MovingKeyLight focus={[0, 0.3, 0]} reach={2} offset={[-3, 6, 4]} />
      <Piece bus={bus} ids={{ mesh: 'su-mesh', slc: 'su-slc', coat: 'su-coat', tape: 'su-tape', slab: 'su-slab' }} />
    </>
  )
}
