import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { MeshInset } from '../../../facade/three/MeshInset'
import { Anchor } from '../../../facade/three/Stage3D'
import type { LabelBus } from '../../../facade/three/kit'
import { block, merge } from '../../../facade/three/unit/parts'
import { buttonGeometry, disposeFloorKit, floorKit, hollowCore, LAYER, layer, PITCH, PLANK, uvBox } from './dc'

/**
 * A piece of the finished floor, cut out of a data hall and set on the ground over its shadow: two
 * hollow-core planks and the joint between them (their cores open on the cut face), the 20 mm RTARIUM
 * screed and the ESD coating. At its front left corner the layers are stepped back, each a little
 * further than the one over it, down to RTARIUM on its anchor buttons over the primed slab: the
 * order the floor is made in, read from the top down.
 */

/** the piece: across two planks (the joint at x = 0), cut between cores; along the planks */
export const PIECE = { x: [-1.14, 1.14] as [number, number], z: [-0.9, 0.9] as [number, number] }
/** where each layer stops at the corner: the coating, then the screed (the mesh shows inside it) */
const STEP = { esd: [-0.6, 0.34], screed: [-0.84, 0.56] } as const

/** the anchors' grid, 300 mm apart, kept clear of the edges */
export function buttonSpots([x0, x1]: [number, number], [z0, z1]: [number, number], pitch = 0.3) {
  const out: [number, number][] = []
  for (let x = x0 + pitch / 2; x < x1; x += pitch) for (let z = z0 + pitch / 2; z < z1; z += pitch) out.push([x, z])
  return out
}

/** a layer over the piece, less the corner it is stepped back from */
function stepped(y0: number, t: number, [cx, cz]: readonly [number, number]) {
  const [x0, x1] = PIECE.x
  const [z0, z1] = PIECE.z
  return uvBox(merge([block([x0, y0, z0], [x1, y0 + t, cz]), block([cx, y0, cz], [x1, y0 + t, z1])]), 2)
}

export function Piece({
  bus,
  ids = {},
  ground = true,
}: {
  bus?: LabelBus
  ids?: { mesh?: string; screed?: string; esd?: string; slab?: string; joint?: string }
  /** its shadow on the ground under it (the opening's); off where it is part of something larger */
  ground?: boolean
}) {
  const m = useMemo(floorKit, [])
  const top = PLANK.t
  const g = useMemo(() => {
    const hc = hollowCore([-0.6, 0.6], PIECE.x, PIECE.z)
    // the corner where the screed is stepped back to the mesh: its anchors, just under RTARIUM
    const [sx, sz] = STEP.screed
    const spots = buttonSpots([PIECE.x[0], sx], [sz, PIECE.z[1]], 0.09)
    const b = buttonGeometry()
    const buttons = merge(spots.map(([x, z]) => b.clone().translate(x, top, z)))
    b.dispose()
    return {
      ...hc,
      primer: layer(PIECE.x, PIECE.z, top, LAYER.primer),
      screed: stepped(top, LAYER.screed, STEP.screed),
      conductive: stepped(top + LAYER.screed, 0.0012, STEP.esd),
      esd: stepped(top + LAYER.screed + 0.0012, LAYER.esd - 0.0012, STEP.esd),
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

  // RTARIUM in the stepped-back corner, at its own pitch, 5 mm off the slab
  const [sx, sz] = STEP.screed
  const w = sx - PIECE.x[0]
  const d = PIECE.z[1] - sz
  const nx = Math.floor((w - 0.006) / PITCH)
  const nz = Math.floor((d - 0.006) / PITCH)
  const meshY = top + LAYER.cover + LAYER.mesh / 2

  return (
    <group>
      <mesh geometry={g.planks} material={m.plank} castShadow receiveShadow />
      <mesh geometry={g.grout} material={m.grout} receiveShadow />
      <mesh geometry={g.primer} material={m.primer} />
      <mesh geometry={g.buttons} material={m.button} castShadow />
      <group position={[PIECE.x[0] + w / 2, meshY, sz + d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <Suspense fallback={null}>
          <MeshInset nx={nx} ny={nz} lod={2.4} shadows />
        </Suspense>
      </group>
      <mesh geometry={g.screed} material={m.screed} castShadow receiveShadow />
      <mesh geometry={g.conductive} material={m.conductive} receiveShadow />
      <mesh geometry={g.esd} material={m.esd} castShadow receiveShadow />
      {ground && <mesh geometry={g.catcher} material={m.catcher} position={[0, -0.05, 0]} receiveShadow />}
      {bus && (
        <>
          {ids.mesh && <Anchor bus={bus} id={ids.mesh} position={[PIECE.x[0] + w * 0.45, meshY + 0.004, sz + d * 0.55]} />}
          {ids.screed && <Anchor bus={bus} id={ids.screed} position={[(STEP.screed[0] + STEP.esd[0]) / 2, top + LAYER.screed, PIECE.z[1] - 0.06]} />}
          {ids.esd && <Anchor bus={bus} id={ids.esd} position={[0.1, top + LAYER.screed + LAYER.esd, 0.5]} />}
          {ids.slab && <Anchor bus={bus} id={ids.slab} position={[-0.28, 0.06, PIECE.z[1]]} />}
          {ids.joint && <Anchor bus={bus} id={ids.joint} position={[0, top - 0.02, PIECE.z[1]]} />}
        </>
      )}
    </group>
  )
}
