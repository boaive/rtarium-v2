import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import type { Thickness } from '../../content/technical'
import { createYarnMaterial, prepareYarnTextures, type YarnMaterialOptions } from './yarnMaterial'

/** Grid pitch of the exported cell in metres (visual estimate, see blender/scripts/build_mesh.py). */
export const PITCH = 0.012
const TAN_15 = Math.tan(THREE.MathUtils.degToRad(15))

export const cellUrl = (t: Thickness) => `/models/rtarium-cell-t${t}.glb`
const TEXTURE_URLS = ['/textures/yarn_basecolor.webp', '/textures/yarn_normal.webp', '/textures/yarn_roughness.webp']

export interface CellGeometry {
  hi: THREE.BufferGeometry
  lo: THREE.BufferGeometry
  /** very light version for whole-sheet views */
  far: THREE.BufferGeometry
}

/** Loads one tileable unit cell (hi, lo and far level of detail) exported from Blender. */
export function useCell(thickness: Thickness): CellGeometry {
  const gltf = useGLTF(cellUrl(thickness), false, false)
  return useMemo(() => {
    const pick = (suffix: string) => {
      let found: THREE.BufferGeometry | null = null
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh && m.name.endsWith(suffix)) found = m.geometry
      })
      if (!found) throw new Error(`RTARIUM cell "${suffix}" missing in ${cellUrl(thickness)}`)
      const g = found as THREE.BufferGeometry
      // custom glTF attributes arrive lower-cased; expose them under shader-friendly names
      if (!g.getAttribute('aAo')) {
        g.setAttribute('aAo', g.getAttribute('_ao'))
        g.setAttribute('aPart', g.getAttribute('_part'))
        g.setAttribute('aYarn', g.getAttribute('_yarn'))
      }
      return g
    }
    return { hi: pick('_hi'), lo: pick('_lo'), far: pick('_far') }
  }, [gltf, thickness])
}

/** Yarn material bound to the current WebGL context. Returns the animatable uniforms too. */
export function useYarnMaterial(opts: Omit<YarnMaterialOptions, 'textures'> = {}) {
  const gl = useThree((s) => s.gl)
  const [map, normalMap, roughnessMap] = useTexture(TEXTURE_URLS)
  const built = useMemo(() => {
    // textures are cached per URL; clone so each canvas owns its GPU copy and settings
    const textures = prepareYarnTextures(
      { map: map.clone(), normalMap: normalMap.clone(), roughnessMap: roughnessMap.clone() },
      Math.min(8, gl.capabilities.getMaxAnisotropy()),
    )
    return { ...createYarnMaterial({ ...opts, textures }), textures }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, normalMap, roughnessMap, gl, opts.lite])
  useEffect(
    () => () => {
      built.material.dispose()
      built.depthMaterial.dispose()
      built.textures.map.dispose()
      built.textures.normalMap.dispose()
      built.textures.roughnessMap.dispose()
    },
    [built],
  )
  return built
}

export interface MeshFieldProps {
  cell: CellGeometry
  /** cells along the warp (x) and the weft (z) */
  nx: number
  nz: number
  material: THREE.Material
  depthMaterial?: THREE.Material
  /** cells per chunk side; chunks are frustum-culled and LOD-switched individually */
  chunk?: number
  /** chunks nearer than this (metres) use the high-detail cell */
  lodDistance?: number
  /** chunks farther than this (metres) use the lightest cell; leave unset to never use it */
  farDistance?: number
  shadows?: boolean
  /** frustum-cull chunks (default true) */
  culling?: boolean
  /**
   * Cells to draw, as index ranges [i0, i1, j0, j1] on the lattice of the nx × nz sheet; they
   * may run past it on any side (the spread in the opening scene). Default: the sheet itself.
   */
  span?: readonly [number, number, number, number]
  /** cells inside these index ranges are left out (the spread leaves the sheet it surrounds to the sheet) */
  hole?: readonly [number, number, number, number]
  /** receives the group of chunks, so a build window can hide the chunks it leaves out */
  groupRef?: (g: THREE.Group | null) => void
}

/**
 * A rectangular piece of RTARIUM mesh: the Blender unit cell GPU-instanced nx × nz times.
 * Centred on the origin, lying in the XZ plane, thickness along Y.
 */
export function MeshField({
  cell,
  nx,
  nz,
  material,
  depthMaterial,
  chunk = 6,
  lodDistance: lodDistanceProp = 0.2,
  farDistance: farDistanceProp = Infinity,
  shadows = false,
  culling = true,
  span,
  hole,
  groupRef,
}: MeshFieldProps) {
  const [i0, i1, j0, j1] = span ?? [0, nx, 0, nz]
  const [hi0, hi1, hj0, hj1] = hole ?? [0, 0, 0, 0]
  const { group, chunks } = useMemo(() => {
    const group = new THREE.Group()
    const chunks: { mesh: THREE.InstancedMesh; center: THREE.Vector3; level: number }[] = []
    const m = new THREE.Matrix4()
    const inHole = (i: number, j: number) => i >= hi0 && i < hi1 && j >= hj0 && j < hj1
    for (let cx = i0; cx < i1; cx += chunk) {
      for (let cz = j0; cz < j1; cz += chunk) {
        const w = Math.min(chunk, i1 - cx)
        const d = Math.min(chunk, j1 - cz)
        let count = 0
        for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (!inHole(cx + i, cz + j)) count++
        if (count === 0) continue
        const mesh = new THREE.InstancedMesh(cell.lo, material, count)
        let n = 0
        for (let i = 0; i < w; i++) {
          for (let j = 0; j < d; j++) {
            if (inHole(cx + i, cz + j)) continue
            m.makeTranslation((cx + i - nx / 2) * PITCH, 0, (cz + j - (nz - 1) / 2) * PITCH)
            mesh.setMatrixAt(n++, m)
          }
        }
        mesh.instanceMatrix.needsUpdate = true
        // the chunk's cell nearest the centre, in the build window's cell units (see yarnMaterial uWin)
        const nearest = (lo: number, hi: number) => (lo <= 0 && hi >= 0 ? 0 : Math.min(Math.abs(lo), Math.abs(hi)))
        mesh.userData.near = [nearest(cx - nx / 2 + 0.5, cx + w - 1 - nx / 2 + 0.5), nearest(cz - (nz - 1) / 2, cz + d - 1 - (nz - 1) / 2)]
        mesh.computeBoundingSphere()
        mesh.computeBoundingBox()
        mesh.castShadow = shadows
        mesh.receiveShadow = shadows
        if (depthMaterial) mesh.customDepthMaterial = depthMaterial
        group.add(mesh)
        chunks.push({
          mesh,
          level: 1,
          center: new THREE.Vector3((cx + w / 2 - nx / 2) * PITCH, 0, (cz + d / 2 - nz / 2) * PITCH),
        })
      }
    }
    return { group, chunks }
  }, [cell, nx, nz, chunk, material, depthMaterial, shadows, i0, i1, j0, j1, hi0, hi1, hj0, hj1])

  useEffect(
    () => () => {
      for (const c of chunks) c.mesh.dispose()
    },
    [chunks],
  )

  useEffect(() => {
    for (const c of chunks) c.mesh.frustumCulled = culling
  }, [chunks, culling])

  useEffect(() => {
    groupRef?.(group)
    return () => groupRef?.(null)
  }, [group, groupRef])

  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    // Detail goes by size on screen. The thresholds are distances for a 30 degree lens; a wider
    // lens shows the same chunk smaller, so it brings them in (flying through the cavity at
    // 62 degrees, most of the sheet does not need the heavy cell), and a longer lens pushes them out.
    const fov = (camera as THREE.PerspectiveCamera).fov
    const lens = fov ? Math.tan(THREE.MathUtils.degToRad(fov / 2)) / TAN_15 : 1
    const lodDistance = lodDistanceProp
    const farDistance = farDistanceProp
    for (const c of chunks) {
      tmp.copy(c.center).applyMatrix4(group.matrixWorld)
      const d = tmp.distanceTo(camera.position) * lens
      // 0 = hi, 1 = lo, 2 = far; hysteresis so chunks do not flicker at a threshold
      if (c.level === 0) {
        if (d > lodDistance * 1.15) c.level = 1
      } else if (c.level === 1) {
        if (d < lodDistance) c.level = 0
        else if (d > farDistance * 1.1) c.level = 2
      } else if (d < farDistance) c.level = 1
      const geo = c.level === 0 ? cell.hi : c.level === 1 ? cell.lo : cell.far
      if (c.mesh.geometry !== geo) c.mesh.geometry = geo
    }
  })

  return <primitive object={group} />
}

useGLTF.preload(cellUrl(10), false, false)
