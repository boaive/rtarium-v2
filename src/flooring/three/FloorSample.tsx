import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../../facade/three/MeshInset'
import { Anchor } from '../../facade/three/Stage3D'
import type { LabelBus } from '../../facade/three/kit'
import { merge } from '../../facade/three/unit/parts'
import { block, disposeFloorMaterials, floorMaterials, ragged } from './floor'

/**
 * A sample of the floor, isolated over its shadow: a structural slab, RTARIUM laid on it, the screed
 * over both. Three ways of seeing it:
 *
 *   cracked  no RTARIUM: the slab has moved at its joint, and the screed has cracked right over it
 *   cut      RTARIUM under the screed, a window cut back through the screed to show it
 *   pour     the screed poured across RTARIUM from the right, stopping short: `pour` (0..1) is how far,
 *            read every frame, so the opening can pour it in time
 */

export const SAMPLE = { w: 0.6, d: 0.4, slab: 0.07, screed: 0.022 } as const
/** the window cut back through the screed, at the front right corner: x0, x1, z0, z1 */
const WINDOW: [number, number, number, number] = [0.05, 0.25, 0.03, 0.17]
/** where a full pour stops: the screed covers from here to the right edge */
const CAST_TO = -0.08
/** how far the right half of the slab has dropped at its joint (rad) in the cracked sample */
const DROP = 0.035

export type SampleKind = 'cracked' | 'cut' | 'pour'

/** a unit block from x = 0 (its free edge, made uneven) to x = 1, the screed's depth, the sample's width */
function raggedScreed(seed: number, k = 0.035) {
  const g = new THREE.BoxGeometry(1, SAMPLE.screed, SAMPLE.d, 1, 1, 40).translate(0.5, SAMPLE.screed / 2, 0)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) if (pos.getX(i) < 0.01) pos.setX(i, k * ragged(pos.getZ(i), seed))
  g.computeVertexNormals()
  return g
}

export function FloorSample({ bus, kind, pour }: { bus: LabelBus; kind: SampleKind; pour?: { current: number } }) {
  const invalidate = useThree((s) => s.invalidate)
  const m = useMemo(floorMaterials, [])
  const { w, d, slab, screed } = SAMPLE
  const geo = useMemo(() => {
    const [x0, x1, z0, z1] = WINDOW
    return {
      slab: block([-w / 2, -slab, -d / 2], [w / 2, 0, d / 2]),
      half: block([0, -slab, -d / 2], [w / 2, 0, d / 2]),
      // the screed with its window: what is left of it round the cut
      framed: merge([
        block([-w / 2, 0, -d / 2], [x0, screed, d / 2]),
        block([x1, 0, -d / 2], [w / 2, screed, d / 2]),
        block([x0, 0, -d / 2], [x1, screed, z0]),
        block([x0, 0, z1], [x1, screed, d / 2]),
      ]),
      // the cracked screed: a left piece and a right piece, their ragged edges meeting over the joint
      // (the left piece is mirrored, so its edge is drawn the other way to meet the right one's)
      crackL: raggedScreed(0.4, -0.012),
      crackR: raggedScreed(0.4, 0.012),
      cast: raggedScreed(1.2),
      crackLine: block([-0.0016, screed - 0.0004, -d / 2], [0.0016, screed + 0.0003, d / 2]),
    }
  }, [w, d, slab, screed])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      disposeFloorMaterials(m)
    },
    [geo, m],
  )

  const cast = useRef<THREE.Mesh>(null)
  const done = useRef(-1)
  useFrame(() => {
    if (kind !== 'pour' || !cast.current) return
    const p = pour?.current ?? 1
    if (p === done.current) return
    done.current = p
    const e = 1 - Math.pow(1 - p, 3)
    const x0 = w / 2 - (w / 2 - CAST_TO) * e
    cast.current.visible = e > 0.002
    cast.current.position.x = x0
    cast.current.scale.x = Math.max(1e-3, w / 2 - x0)
    invalidate()
  })

  // RTARIUM, lying on the slab: the model is a sheet in XZ, its upper face up
  const mesh = (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
      <Suspense fallback={null}>
        <MeshInset nx={Math.floor((w - 0.01) / 0.012)} ny={Math.floor((d - 0.01) / 0.012)} lod={2.2} shadows />
      </Suspense>
    </group>
  )

  return (
    <group>
      {kind === 'cracked' ? (
        <>
          <mesh geometry={geo.slab} material={m.slab} castShadow receiveShadow scale={[0.5, 1, 1]} position={[-w / 4, 0, 0]} />
          {/* the right half of the slab has dropped at its joint, and taken its half of the screed with it */}
          <group rotation={[0, 0, -DROP]}>
            <mesh geometry={geo.half} material={m.slab} castShadow receiveShadow position={[0.003, 0, 0]} />
            <mesh geometry={geo.crackR} material={m.screed} castShadow receiveShadow position={[0.0015, 0, 0]} scale={[w / 2 - 0.0015, 1, 1]} />
          </group>
          <mesh geometry={geo.crackL} material={m.screed} castShadow receiveShadow position={[-0.0015, 0, 0]} scale={[-(w / 2 - 0.0015), 1, 1]} />
          <mesh geometry={geo.crackLine} material={m.ink} />
          <Anchor bus={bus} id="fl-crack" position={[0, screed, d / 2 - 0.06]} />
          <Anchor bus={bus} id="fl-slab" position={[-w / 4, -slab / 2, d / 2]} />
        </>
      ) : (
        <>
          <mesh geometry={geo.slab} material={m.slab} castShadow receiveShadow />
          {mesh}
          {kind === 'cut' ? (
            <mesh geometry={geo.framed} material={m.screed} castShadow receiveShadow />
          ) : (
            <mesh ref={cast} geometry={geo.cast} material={m.screed} castShadow receiveShadow visible={false} />
          )}
          <Anchor bus={bus} id="fl-mesh" position={kind === 'cut' ? [(WINDOW[0] + WINDOW[1]) / 2, 0.006, (WINDOW[2] + WINDOW[3]) / 2] : [-0.2, 0.006, 0.05]} />
          <Anchor bus={bus} id="fl-screed" position={[0.2, screed, -0.08]} />
          <Anchor bus={bus} id="fl-slab" position={[-w / 4, -slab / 2, d / 2]} />
        </>
      )}
      <mesh position={[0, -slab - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.catcher} receiveShadow>
        <planeGeometry args={[3, 3]} />
      </mesh>
    </group>
  )
}
