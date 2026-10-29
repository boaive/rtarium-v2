import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { disposeUnitMaterials, planarUV, unitMaterials } from '../unit/parts'
import { BACK, COAT, CUTAWAY, SKIN, bandGeometry, block, ferruleGeometry, flexMaterial, frameMembers, holeGeometry, latticeMatrices, merge, plateGeometry, stitchGeometries, type Lattice } from './cornice'

/**
 * The stud frame element (see `cornice.ts`), built once and handed to its scene as an `ElementApi`:
 * the scene moves its parts directly every frame (the skin's two coats, RTARIUM's strips and their
 * stitches, the ferrules, the frame and its members, the plates' flex), so nothing here re-renders
 * while the story plays.
 *
 *   root      the whole element
 *   skin      the two coats, RTARIUM in them; scaled along x by the skin's thermal strain
 *   mesh      RTARIUM, its stitches and the ferrule inserts set on it, moved out along z to be laid in
 *   frame     the stud frame, its holes and the flex anchors, moved as one
 *
 * With `cutaway`, a window in the corona's face is cut back through the face coat to RTARIUM (the
 * opening's anatomy); `cover` is the piece taken out, for the scene to lift away.
 */

const BRONZE = '#a07a55'
const PILE = '#4a3322'

export interface ElementApi {
  root: THREE.Group | null
  skin: THREE.Group | null
  coat: THREE.Mesh | null
  backing: THREE.Mesh | null
  mesh: THREE.Group | null
  frame: THREE.Group | null
  members: (THREE.Mesh | null)[]
  plates: THREE.Mesh | null
  holes: THREE.Mesh | null
  rovings: THREE.InstancedMesh | null
  fibres: THREE.InstancedMesh | null
  stitches: (THREE.Mesh | null)[]
  cover: THREE.Mesh | null
  lattice: Lattice | null
  mats: {
    coat: THREE.MeshStandardMaterial
    backing: THREE.MeshStandardMaterial
    steel: THREE.MeshStandardMaterial
    plate: THREE.MeshStandardMaterial
    ferrule: THREE.MeshStandardMaterial
    /** the ferrules' bores, dark, shown with the ferrules */
    bore: THREE.MeshBasicMaterial
    roving: THREE.MeshStandardMaterial
    fibre: THREE.MeshStandardMaterial
    thread: THREE.MeshStandardMaterial
    /** the holes drilled in the frame */
    ink: THREE.MeshBasicMaterial
    /** the cut's faces, and the piece taken out of it */
    cut: THREE.MeshStandardMaterial
    cover: THREE.MeshStandardMaterial
  }
  /** the skin's thermal strain (its growth over its length), shared by the skin's scale and the plates' bend */
  strain: { value: number }
  /** clipping for the spray passes (world space): the face coat is laid where x < its constant, the backing where x > −its constant */
  planes: { coat: THREE.Plane; back: THREE.Plane }
  /** strips laid in (0..1, one after another) and stitched (0..1, along the folds) */
  lay: (strips: number, stitched: number) => void
}

export function createElementApi(): ElementApi {
  const api: ElementApi = {
    root: null,
    skin: null,
    coat: null,
    backing: null,
    mesh: null,
    frame: null,
    members: [],
    plates: null,
    holes: null,
    rovings: null,
    fibres: null,
    stitches: [],
    cover: null,
    lattice: null,
    mats: null as unknown as ElementApi['mats'],
    strain: { value: 0 },
    planes: { coat: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e3), back: new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e3) },
    lay: (strips, stitched) => {
      const L = api.lattice
      if (L && api.rovings && api.fibres) {
        const n = L.starts.rovings.length
        const k = strips * n
        const s = Math.min(n, Math.floor(k))
        const f = k - s
        const at = (starts: number[], total: number) => (s >= n ? total : starts[s] + Math.floor(((starts[s + 1] ?? total) - starts[s]) * f))
        api.rovings.count = at(L.starts.rovings, L.rovings.length)
        api.fibres.count = at(L.starts.fibres, L.fibres.length)
      }
      for (const m of api.stitches) {
        if (!m) continue
        const total = m.geometry.index ? m.geometry.index.count : 0
        const per = total / Math.max(1, (m.geometry as THREE.TubeGeometry).parameters.tubularSegments)
        m.geometry.setDrawRange(0, Math.floor(((total / per) * stitched)) * per)
        m.visible = stitched > 0.001
      }
    },
  }
  return api
}

export function Element({ api, ends = false, lattice = true, shadows = true, cutaway = false }: { api: ElementApi; ends?: boolean; lattice?: boolean; shadows?: boolean; cutaway?: boolean }) {
  const geo = useMemo(() => {
    const ferrules = ferruleGeometry()
    const c = CUTAWAY
    const face = BACK + c.u
    const deep = face - c.depth
    return {
      coat: planarUV(bandGeometry(0, COAT), 1.1),
      backing: planarUV(bandGeometry(COAT, SKIN), 1.1),
      members: frameMembers(),
      ferrules: ferrules.body,
      bores: ferrules.bore,
      holes: holeGeometry(),
      plates: plateGeometry(),
      stitches: stitchGeometries(),
      // the window: the inner backing left at its foot, its four cut faces, and the piece taken out
      cutFaces: merge([
        block([c.x0, c.v0, face - SKIN], [c.x1, c.v1, deep]),
        block([c.x0, c.v0, deep], [c.x0 + 0.0008, c.v1, face]),
        block([c.x1 - 0.0008, c.v0, deep], [c.x1, c.v1, face]),
        block([c.x0, c.v0, deep], [c.x1, c.v0 + 0.0008, face]),
        block([c.x0, c.v1 - 0.0008, deep], [c.x1, c.v1, face]),
      ]),
      cover: planarUV(block([c.x0 + 0.0008, c.v0 + 0.0008, deep], [c.x1 - 0.0008, c.v1 - 0.0008, face]), 1.1),
    }
  }, [])

  const mats = useMemo(() => {
    const u = unitMaterials()
    const coat = u.concrete.clone()
    const backing = u.concrete.clone()
    const cut = u.concrete.clone()
    const cover = u.concrete.clone()
    // galvanized: a lighter, spangled grey
    const steel = new THREE.MeshStandardMaterial({ color: '#b3b8bc', metalness: 0.72, roughness: 0.34, transparent: true })
    const plate = flexMaterial(steel)
    const ferrule = new THREE.MeshStandardMaterial({ color: '#6c7176', metalness: 0.6, roughness: 0.38, transparent: true })
    const roving = new THREE.MeshStandardMaterial({ color: BRONZE, roughness: 0.62, metalness: 0.05, transparent: true })
    const fibre = new THREE.MeshStandardMaterial({ color: PILE, roughness: 0.7, transparent: true })
    const thread = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6, transparent: true })
    const ink = new THREE.MeshBasicMaterial({ color: '#080808', transparent: true, toneMapped: false })
    const bore = ink.clone()
    return { u, coat, backing, cut, cover, steel, plate: plate.material, strain: plate.uFlex, ferrule, bore, roving, fibre, thread, ink }
  }, [])

  // the window's clipping: a box carved out of the two coats (only their intersection is clipped), kept in place on the element as it moves
  const cut = useMemo(() => {
    const c = CUTAWAY
    const face = BACK + c.u
    const local = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), c.x0),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -c.x1),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), c.v0),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -c.v1),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), face - c.depth),
    ]
    return { local, world: local.map((p) => p.clone()) }
  }, [])

  const lat = useMemo(() => (lattice ? latticeMatrices(0.03, ends) : null), [lattice, ends])
  const unit = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useLayoutEffect(() => {
    api.lattice = lat
    if (!lat) return
    for (const [im, list] of [
      [api.rovings, lat.rovings],
      [api.fibres, lat.fibres],
    ] as const) {
      if (!im) continue
      list.forEach((m, i) => im.setMatrixAt(i, m))
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    }
  }, [api, lat])

  // the scene's handle on all of it
  useMemo(() => {
    if (cutaway) {
      for (const m of [mats.coat, mats.backing]) {
        m.clippingPlanes = cut.world
        m.clipIntersection = true
      }
    } else {
      mats.coat.clippingPlanes = [api.planes.coat]
      mats.backing.clippingPlanes = [api.planes.back]
      // (concrete not yet sprayed casts no shadow either)
      mats.coat.clipShadows = true
      mats.backing.clipShadows = true
    }
    api.mats = { coat: mats.coat, backing: mats.backing, steel: mats.steel, plate: mats.plate, ferrule: mats.ferrule, bore: mats.bore, roving: mats.roving, fibre: mats.fibre, thread: mats.thread, ink: mats.ink, cut: mats.cut, cover: mats.cover }
    api.strain = mats.strain
  }, [api, mats, cut, cutaway])

  useFrame(() => {
    const r = api.root
    if (!cutaway || !r) return
    r.updateWorldMatrix(true, false)
    cut.local.forEach((p, i) => cut.world[i].copy(p).applyMatrix4(r.matrixWorld))
  }, -1)

  useEffect(
    () => () => {
      for (const g of [geo.ferrules, geo.bores, geo.holes, geo.plates, geo.cutFaces, geo.cover, geo.coat, geo.backing, unit]) g.dispose()
      geo.members.forEach((m) => m.geo.dispose())
      geo.stitches.forEach((g) => g.dispose())
      disposeUnitMaterials(mats.u)
      for (const m of [mats.coat, mats.backing, mats.cut, mats.cover, mats.steel, mats.plate, mats.ferrule, mats.bore, mats.roving, mats.fibre, mats.thread, mats.ink]) m.dispose()
    },
    [geo, mats, unit],
  )

  return (
    <group ref={(el) => void (api.root = el)}>
      <group ref={(el) => void (api.skin = el)}>
        <mesh ref={(el) => void (api.coat = el)} geometry={geo.coat} material={mats.coat} castShadow={shadows} receiveShadow={shadows} />
        <mesh ref={(el) => void (api.backing = el)} geometry={geo.backing} material={mats.backing} castShadow={shadows} receiveShadow={shadows} />
        {cutaway && (
          <>
            <mesh geometry={geo.cutFaces} material={mats.cut} receiveShadow={shadows} />
            <mesh ref={(el) => void (api.cover = el)} geometry={geo.cover} material={mats.cover} castShadow={shadows} receiveShadow={shadows} />
          </>
        )}
        <group ref={(el) => void (api.mesh = el)}>
          {lat && (
            <>
              <instancedMesh ref={(el) => void (api.rovings = el)} args={[unit, mats.roving, lat.rovings.length]} frustumCulled={false} />
              <instancedMesh ref={(el) => void (api.fibres = el)} args={[unit, mats.fibre, lat.fibres.length]} frustumCulled={false} />
            </>
          )}
          {geo.stitches.map((g, i) => (
            <mesh key={i} ref={(el) => void (api.stitches[i] = el)} geometry={g} material={mats.thread} />
          ))}
          <mesh geometry={geo.ferrules} material={mats.ferrule} castShadow={shadows} />
          <mesh geometry={geo.bores} material={mats.bore} />
        </group>
      </group>
      <group ref={(el) => void (api.frame = el)}>
        {geo.members.map((m, i) => (
          <mesh
            key={i}
            ref={(el) => void (api.members[i] = el)}
            geometry={m.geo}
            material={mats.steel}
            position={m.from}
            quaternion={m.turn}
            castShadow={shadows}
            receiveShadow={shadows}
          />
        ))}
        <mesh ref={(el) => void (api.holes = el)} geometry={geo.holes} material={mats.ink} />
        <mesh ref={(el) => void (api.plates = el)} geometry={geo.plates} material={mats.plate} castShadow={shadows} />
      </group>
    </group>
  )
}
