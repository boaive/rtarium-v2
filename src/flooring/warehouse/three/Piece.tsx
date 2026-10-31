import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { MeshInset } from '../../../facade/three/MeshInset'
import { Anchor } from '../../../facade/three/Stage3D'
import type { LabelBus } from '../../../facade/three/kit'
import { block, merge } from '../../../facade/three/unit/parts'
import { buttonSpots } from '../../data/three/Piece'
import { buttonGeometry, disposeFloorKit, floorKit, LAYER, layer, PITCH, uvBox } from '../../data/three/dc'

/**
 * A piece of the finished warehouse floor, cut out of the hall and set on the ground over its shadow:
 * a structural slab (solid, its post-tensioning ducts on the cut face), the 20 mm RTARIUM screed and
 * the resin wear coat. At its front left corner the layers are stepped back, each a little further
 * than the one over it, down to RTARIUM on its anchor buttons: the Data & AI Centres opening's piece,
 * on the warehouse's own base.
 */

export const PIECE = { x: [-1.14, 1.14] as [number, number], z: [-0.9, 0.9] as [number, number], t: 0.14 }
export const COAT = 0.003
/** where each layer stops at the corner: the coat, then the screed (the mesh shows inside it) */
const STEP = { coat: [-0.6, 0.34], screed: [-0.84, 0.56] } as const
export const FLOOR_Y = PIECE.t + LAYER.screed + COAT

function stepped(y0: number, t: number, [cx, cz]: readonly [number, number]) {
  const [x0, x1] = PIECE.x
  const [z0, z1] = PIECE.z
  return uvBox(merge([block([x0, y0, z0], [x1, y0 + t, cz]), block([cx, y0, cz], [x1, y0 + t, z1])]), 2)
}

/** the post-tensioning ducts along the slab, seen end-on where the cut face shows them */
export function ducts([x0, x1]: [number, number], z: number, y = 0.045, every = 0.38) {
  const g: THREE.BufferGeometry[] = []
  for (let x = x0 + every / 2; x < x1; x += every) g.push(new THREE.CircleGeometry(0.02, 20).scale(1.45, 0.72, 1).translate(x, y, z + 0.0006).toNonIndexed())
  return merge(g)
}

export function Piece({ bus, ids = {}, ground = true }: { bus?: LabelBus; ids?: { mesh?: string; screed?: string; coat?: string; slab?: string }; ground?: boolean }) {
  const m = useMemo(() => {
    const k = floorKit()
    k.esd.color.set('#b5b9b6')
    k.esd.roughness = 0.2
    return k
  }, [])
  const top = PIECE.t
  const g = useMemo(() => {
    const [sx, sz] = STEP.screed
    const spots = buttonSpots([PIECE.x[0], sx], [sz, PIECE.z[1]], 0.09)
    const b = buttonGeometry()
    const buttons = merge(spots.map(([x, z]) => b.clone().translate(x, top, z)))
    b.dispose()
    return {
      slab: uvBox(block([PIECE.x[0], 0, PIECE.z[0]], [PIECE.x[1], top, PIECE.z[1]]), 2.2),
      ducts: ducts(PIECE.x, PIECE.z[1]),
      primer: layer(PIECE.x, PIECE.z, top, LAYER.primer),
      screed: stepped(top, LAYER.screed, STEP.screed),
      coat: stepped(top + LAYER.screed, COAT, STEP.coat),
      buttons,
      catcher: new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2),
    }
  }, [top])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      disposeFloorKit(m)
    },
    [g, m],
  )
  const [sx, sz] = STEP.screed
  const w = sx - PIECE.x[0]
  const d = PIECE.z[1] - sz
  const nx = Math.floor((w - 0.006) / PITCH)
  const nz = Math.floor((d - 0.006) / PITCH)
  const meshY = top + LAYER.cover + LAYER.mesh / 2

  return (
    <group>
      <mesh geometry={g.slab} material={m.plank} castShadow receiveShadow />
      <mesh geometry={g.ducts} material={m.rubber} />
      <mesh geometry={g.primer} material={m.primer} />
      <mesh geometry={g.buttons} material={m.button} castShadow />
      <group position={[PIECE.x[0] + w / 2, meshY, sz + d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <Suspense fallback={null}>
          <MeshInset nx={nx} ny={nz} lod={2.4} shadows />
        </Suspense>
      </group>
      <mesh geometry={g.screed} material={m.screed} castShadow receiveShadow />
      <mesh geometry={g.coat} material={m.esd} castShadow receiveShadow />
      {ground && <mesh geometry={g.catcher} material={m.catcher} position={[0, -0.05, 0]} receiveShadow />}
      {bus && (
        <>
          {ids.mesh && <Anchor bus={bus} id={ids.mesh} position={[PIECE.x[0] + w * 0.45, meshY + 0.004, sz + d * 0.55]} />}
          {ids.screed && <Anchor bus={bus} id={ids.screed} position={[(STEP.screed[0] + STEP.coat[0]) / 2, top + LAYER.screed, PIECE.z[1] - 0.06]} />}
          {ids.coat && <Anchor bus={bus} id={ids.coat} position={[0.1, FLOOR_Y, 0.5]} />}
          {ids.slab && <Anchor bus={bus} id={ids.slab} position={[0.3, 0.07, PIECE.z[1]]} />}
        </>
      )}
    </group>
  )
}
