import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../../lib/motion'
import { block, merge, planarUV, unitMaterials } from '../unit/parts'
import { Wake } from './lines'

/**
 * A sample of a cladding material, for the trade-offs' cards: a square piece standing up, turning a
 * little in its own time, one corner of its face cut back so its make-up shows.
 *
 *   precast  architectural precast concrete: a thick grey slab, steel bars in its core
 *   stone    natural stone: a granite slab, solid through
 *   grc      glass fibre reinforced concrete: off-white, glass strands lying in the core
 *   uhpc     ultra-high performance concrete: a denser grey, short steel fibres every way in the core
 *   acp      aluminium composite: two thin aluminium skins on a black core, the face skin cut back
 *
 * Thicknesses are in proportion on a 300 mm piece (150, 25, 15, 18 and 4 mm); fibres and bars are
 * drawn a little thicker than they are so they read.
 */

export type SampleKind = 'precast' | 'stone' | 'grc' | 'uhpc' | 'acp'

const S = 0.3
const T: Record<SampleKind, number> = { precast: 0.15, stone: 0.025, grc: 0.015, uhpc: 0.018, acp: 0.004 }
/** the cut: the face's upper right quarter, down to the core */
const C = 0.02

let seed = 41
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

/** granite: a warm grey ground, flecks of black mica, pale feldspar and a little rose */
function graniteMap() {
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#b9aea5'
  g.fillRect(0, 0, size, size)
  const fleck = (n: number, colour: () => string, r: [number, number]) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colour()
      g.beginPath()
      g.ellipse(rnd() * size, rnd() * size, r[0] + rnd() * r[1], r[0] + rnd() * r[1] * 0.7, rnd() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
  }
  fleck(900, () => `rgba(${200 + rnd() * 30},${150 + rnd() * 30},${140 + rnd() * 30},0.55)`, [2, 7])
  fleck(1400, () => `rgba(235,232,226,${0.4 + rnd() * 0.4})`, [1.5, 5])
  fleck(1800, () => `rgba(30,28,28,${0.55 + rnd() * 0.4})`, [0.8, 3.2])
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** the pieces in the cut: glass strands lying flat, steel fibres every way, or two steel bars */
function inserts(kind: SampleKind, t: number) {
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3()
  const mats: THREE.Matrix4[] = []
  if (kind === 'precast') {
    const g = new THREE.CylinderGeometry(0.006, 0.006, 1, 10)
    const len = S / 2 - C
    // one bar each way across the cut quarter, at mid-depth
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(C + len / 2, S / 4 + 0.01, 0), q.setFromUnitVectors(up, dir.set(1, 0, 0)).clone(), new THREE.Vector3(1, len, 1)))
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(S / 4 - 0.01, C + len / 2, 0.012), new THREE.Quaternion(), new THREE.Vector3(1, len, 1)))
    return { g, mats }
  }
  const n = kind === 'grc' ? 300 : 320
  const r = kind === 'grc' ? 0.0007 : 0.00055
  const g = new THREE.CylinderGeometry(r, r, 1, 5, 1, false)
  for (let i = 0; i < n; i++) {
    const len = kind === 'grc' ? 0.014 + rnd() * 0.016 : 0.009 + rnd() * 0.005
    const x = C + rnd() * (S / 2 - C - 0.006)
    const y = C + rnd() * (S / 2 - C - 0.006)
    const z = (rnd() - 0.5) * t * 0.25
    const a = rnd() * Math.PI * 2
    if (kind === 'grc') dir.set(Math.cos(a), Math.sin(a), (rnd() - 0.5) * 0.08)
    else dir.set(Math.cos(a), Math.sin(a), (rnd() - 0.5) * 1.6)
    dir.normalize()
    q.setFromUnitVectors(up, dir)
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.clone(), new THREE.Vector3(1, len, 1)))
  }
  return { g, mats }
}

export function Sample({ kind, live }: { kind: SampleKind; live: { current: boolean } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const t = T[kind]
  const h = S / 2

  const mats = useMemo(() => {
    const u = unitMaterials()
    const face = u.concrete
    if (kind === 'precast') face.color.set('#c9c6bf')
    if (kind === 'grc') face.color.set('#fbf7ef')
    if (kind === 'uhpc') face.color.set('#a9a8a4')
    if (kind === 'stone') {
      face.map?.dispose()
      face.map = graniteMap()
      face.bumpScale = 0.12
      face.roughness = 0.55
      face.color.set('#ffffff')
    }
    // the core where the face is cut back: a shade darker than the face (black for the composite)
    const core = kind === 'acp' ? new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.55 }) : face.clone()
    if (kind !== 'acp') core.color.multiplyScalar(0.8)
    const skin = new THREE.MeshStandardMaterial({ color: '#cdc8bd', metalness: 0.85, roughness: 0.28, envMapIntensity: 1.3 })
    const insert =
      kind === 'grc'
        ? new THREE.MeshPhysicalMaterial({ color: '#f4f7f6', roughness: 0.25, clearcoat: 0.6, sheen: 0.4 })
        : kind === 'precast'
          ? new THREE.MeshStandardMaterial({ color: '#7a5a46', metalness: 0.6, roughness: 0.55 })
          : new THREE.MeshStandardMaterial({ color: '#a7abb0', metalness: 0.9, roughness: 0.32 })
    for (const [k, v] of Object.entries(u)) if (k !== 'concrete') (v as THREE.Material).dispose()
    return { face, core, skin, insert }
  }, [kind])

  const geo = useMemo(() => {
    if (kind === 'acp') {
      const sk = 0.0005
      return {
        body: block([-h, -h, -t / 2], [h, h, -t / 2 + sk]),
        core: block([-h, -h, -t / 2 + sk], [h, h, t / 2 - sk]),
        face: merge([block([-h, -h, t / 2 - sk], [h, C, t / 2]), block([-h, C, t / 2 - sk], [C, h, t / 2])]),
      }
    }
    // the back half whole, the face half round the cut quarter, the core of the cut a touch below the face
    const back = merge([block([-h, -h, -t / 2], [h, h, -0.001]), block([-h, -h, -0.001], [h, C, 0]), block([-h, C, -0.001], [C, h, 0])])
    const core = block([C, C, -0.001], [h, h, 0])
    const face = merge([block([-h, -h, 0], [h, C, t / 2]), block([-h, C, 0], [C, h, t / 2])])
    return { body: planarUV(back, 3), core: planarUV(core, 3), face: planarUV(face, 3) }
  }, [kind, h, t])
  const ins = useMemo(() => (kind === 'acp' || kind === 'stone' ? null : inserts(kind, t)), [kind, t])

  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose()
      ins?.g.dispose()
      const seen = new Set<THREE.Material>()
      for (const m of Object.values(mats)) {
        if (seen.has(m)) continue
        seen.add(m)
        ;(m as THREE.MeshStandardMaterial).map?.dispose()
        ;(m as THREE.MeshStandardMaterial).bumpMap?.dispose()
        m.dispose()
      }
    },
    [geo, ins, mats],
  )

  const inst = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const im = inst.current
    if (!im || !ins) return
    ins.mats.forEach((m, i) => im.setMatrixAt(i, m))
    im.instanceMatrix.needsUpdate = true
    im.computeBoundingSphere()
    invalidate()
  }, [ins, invalidate])

  const piece = useRef<THREE.Group>(null)
  const t0 = useRef(performance.now() + Math.random() * 6000)
  useFrame(() => {
    const now = (performance.now() - t0.current) / 1000
    const k = reduced ? 0 : now
    if (piece.current) {
      piece.current.rotation.y = -0.62 + 0.3 * Math.sin((k * Math.PI * 2) / 14)
      piece.current.rotation.x = -0.36 + 0.06 * Math.sin((k * Math.PI * 2) / 19)
    }
    camera.position.set(0, 0.02, 1.45)
    camera.lookAt(0, 0, 0)
    camera.fov = 26
    camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height)
    camera.updateProjectionMatrix()
    if (live.current && !reduced) invalidate()
  }, -1)

  const faceMat = kind === 'acp' ? mats.skin : mats.face
  return (
    <group ref={piece}>
      <Wake live={live} />
      <mesh geometry={geo.body} material={faceMat} />
      <mesh geometry={geo.core} material={mats.core} />
      <mesh geometry={geo.face} material={faceMat} />
      {ins && <instancedMesh ref={inst} args={[ins.g, mats.insert, ins.mats.length]} frustumCulled={false} />}
    </group>
  )
}
