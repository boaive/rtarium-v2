import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../../lib/motion'
import { smooth, type Progress } from '../../progress'
import { setOpacity, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { disposeUnitMaterials, unitMaterials } from '../unit/parts'
import { Element, createElementApi } from './Element'
import { Sun } from './Sun'
import { SKIN, bandGeometry } from './cornice'
import { BLOCK, CRANE, PALLET, TRUCK, bandY, blockGeometry, boomGeometry, craneGeometry, hookGeometry, modelMaterials, palletGeometry, roadGeometry, truckGeometry } from './models'
import { SEATED, drape, lift, wrapGeometry } from './handling'
import { BAND, BED_MID, BLOCK_AT, FIRST, GAP, INSTALL, PER_BAND, PITCH, ROAD_Z, SITE, TRUCK_YARD, at, hoistAt, hoistTurn, truckX } from './site'

/**
 * On site, on yellow, in the room right of the words (the Unitized answers' stage): an apartment block
 * of eight storeys, a band of stud frame cornice on every floor, one element still to come in the second
 * band. The block, the crane, the truck and the road are black, yellow where a part has to read; the
 * cornice is the elements themselves. The block is always whole and always the same; the camera keeps it
 * in its room, and what has to be seen in close (the lock, the levelling, the sealant) plays in the
 * joint's own box beside it (see `DetailScene`). Every lift is the rainscreen crane's arc and timing,
 * and both cranes are the same small mobile crane.
 *
 *   to site      the yard's crane lifts the wrapped element on its pallet onto the truck; the truck
 *                drives it to the block
 *   lifted on    the wrap comes off; the block's crane lifts it by its frame, turning it upright as it
 *                rises, brings it across and lowers it into the band's gap; then swings clear
 *
 * `progress` (0..1) is the section's run, a fifth for each step (see `site.ts`).
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

const YARD_CRANE = V(5, 0, -4)
const SITE_CRANE = V(INSTALL.x + 6, 0, -0.8)
/** the block crane's hook, waiting over where the truck stops, and swung clear once the element is seated */
const PARKED = V(INSTALL.x, 9, ROAD_Z)
const CLEAR = V(SITE_CRANE.x + 4, 9, SITE_CRANE.z + 4)

/* ---- the camera --------------------------------------------------------------------------------- */

/** where the scene stands on the screen: the middle of the room right of the words (measured by the page) */
export interface SiteAxis {
  x: number
  y: number
}

export function siteShot(p: number, compact: boolean, axis: SiteAxis): Shot {
  // (a narrow screen is already stood back from by the rig, for its shape)
  const k = compact ? 0.85 : 1
  const fr: [number, number] = [axis.x, axis.y]
  const sh = (target: [number, number, number], dist: number, azim: number, elev: number): Shot => ({ target, dist: dist * k, azim, elev, frame: fr })
  // the yard: the crane, the truck, the load; then on the road with the truck
  let s = sh([1.5, 4.6, 0.4], 46, 28, 12)
  s = mixShot(s, sh([truckX(p) + 1, 2.6, 4], 40, 24, 11), smooth(SITE.drive[0] - 0.01, SITE.drive[0] + 0.03, p))
  // then the whole block, held, its scale; the lift and everything after it seen whole, the joint in its own box
  // (on a narrow screen the whole block stands above the words, so further off still)
  return mixShot(s, sh([BLOCK_AT.x + BLOCK.w / 2, 14, -4], compact ? 106 : 66, 26, 9), smooth(SITE.drive[1] - 0.03, SITE.drive[1] + 0.03, p))
}

/* ---- the scene --------------------------------------------------------------------------------- */

export function SiteScene({ progress, live, compact, axis }: { progress: Progress; live: { current: boolean }; compact: boolean; axis: { current: SiteAxis } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    camera.far = 400
    camera.updateProjectionMatrix()
  }, [camera])
  useEffect(() => {
    const f = () => invalidate()
    progress.listeners.add(f)
    return () => void progress.listeners.delete(f)
  }, [progress, invalidate])

  const api = useMemo(createElementApi, [])
  const sunAt = useRef(V(0, 0, 0))
  const reach = useRef(10)

  const m = useMemo(() => {
    const base = modelMaterials()
    const u = unitMaterials()
    return {
      base,
      u,
      wrap: new THREE.MeshStandardMaterial({ color: '#f7f6f2', roughness: 0.3, transparent: true, opacity: 0.94, side: THREE.DoubleSide }),
      rope: new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0.8 }),
      catcher: new THREE.ShadowMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }),
    }
  }, [])
  const geo = useMemo(() => {
    const w = wrapGeometry()
    return {
      wrap: w.geo,
      wrapBase: w.base,
      pallet: palletGeometry(),
      truck: truckGeometry(),
      crane: craneGeometry(),
      boom: boomGeometry(),
      hook: hookGeometry(),
      block: blockGeometry(),
      road: roadGeometry(-14, 75, ROAD_Z),
      skin: bandGeometry(0, SKIN),
    }
  }, [])
  useEffect(
    () => () => {
      const gs = [geo.wrap, geo.pallet, geo.truck.body, geo.truck.tyres, geo.truck.glass, geo.crane.body, geo.crane.tyres, geo.crane.glass, geo.boom, geo.hook, geo.block.body, geo.block.glass, geo.road.surface, geo.road.dashes, geo.skin]
      gs.forEach((g) => g.dispose())
      Object.values(m.base).forEach((x) => x.dispose())
      disposeUnitMaterials(m.u)
      for (const x of [m.wrap, m.rope, m.catcher]) x.dispose()
    },
    [geo, m],
  )

  // the cornice already on the block: a band on every floor, the gap in the second
  const bands = useRef<THREE.InstancedMesh>(null)
  const placed = useMemo(() => {
    const out: THREE.Matrix4[] = []
    for (let k = 0; k < BLOCK.floors; k++)
      for (let i = 0; i < PER_BAND; i++) if (!(k === BAND && i === GAP)) out.push(new THREE.Matrix4().makeTranslation(BLOCK_AT.x + FIRST + i * PITCH, bandY(k), BLOCK_AT.z))
    return out
  }, [])
  useLayoutEffect(() => {
    const im = bands.current
    if (!im) return
    placed.forEach((mx, i) => im.setMatrixAt(i, mx))
    im.instanceMatrix.needsUpdate = true
    im.computeBoundingSphere()
  }, [placed])

  const rig = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 10), 3))
    return g
  }, [])
  useEffect(() => () => rig.dispose(), [rig])

  const load = useRef<THREE.Group>(null)
  const wrap = useRef<THREE.Mesh>(null)
  const truck = useRef<THREE.Group>(null)
  const booms = useRef<(THREE.Group | null)[]>([])
  const cranes = useRef<(THREE.Group | null)[]>([])
  const hooks = useRef<(THREE.Mesh | null)[]>([])
  const draped = useRef(false)
  const tmp = useMemo(() => ({ hook: [V(0, 0, 0), V(0, 0, 0)] }), [])

  useFrame(() => {
    const p = progress.value
    const e = api
    if (!e.root || !e.mats) return
    const s = siteShot(p, compact, axis.current)
    sunAt.current.set(...s.target)
    reach.current = Math.max(1.5, Math.min(30, s.dist * 0.55))
    if (!draped.current) {
      drape(geo.wrap, geo.wrapBase, 1)
      draped.current = true
    }

    // the load (the pallet, the wrap, the element on them): lifted onto the truck in the yard, driven to the block
    const L = load.current
    const yardBed = V(TRUCK_YARD + BED_MID, TRUCK.bed, ROAD_Z)
    const bed = V(truckX(p) + BED_MID, TRUCK.bed, ROAD_Z)
    if (L) {
      if (p < SITE.drive[0]) lift(at(p, 'load'), V(0, 0, 0), yardBed, 1.6, L.position)
      else L.position.copy(bed)
    }
    if (truck.current) truck.current.position.x = truckX(p)
    // the yard's crane is left behind, out of the story once the camera has gone on with the truck
    const yardOn = p < SITE.drive[1] - 0.02
    if (cranes.current[0]) cranes.current[0].visible = yardOn
    if (hooks.current[0]) hooks.current[0].visible = yardOn

    // the element: on its pallet; then hoisted by its frame, turned upright as it rises, set in the gap
    if (L && p > SITE.hoist[0]) {
      e.root.position.copy(hoistAt(p, V(0, 0, 0))).sub(L.position)
      e.root.rotation.x = hoistTurn(p)
    } else {
      e.root.position.set(0, SEATED.y, SEATED.z)
      e.root.rotation.x = SEATED.rot
    }
    // the wrap off at the block
    const off = at(p, 'unwrap')
    setOpacity([m.wrap], 1 - off)
    if (wrap.current) wrap.current.position.y = off * 0.9

    // the hooks: the yard crane's on the load until it is on the truck, then up; the block crane's waits over
    // where the truck stops, comes down to the frame (over the middle of its top chord, where the slings
    // meet), lifts it, and swings clear once it is seated
    const yardHook = tmp.hook[0]
    if (L && p < SITE.load[1] + 0.005) yardHook.set(L.position.x, L.position.y + 2.4, L.position.z)
    else yardHook.set(yardBed.x, smooth(SITE.drive[0], SITE.drive[0] + 0.04, p) * 8.6 + TRUCK.bed + 2.4, yardBed.z)
    e.root.updateWorldMatrix(true, false)
    const lp = e.root.localToWorld(V(0, 0.48, 0.055))
    const onFrame = V(lp.x, lp.y + 0.8, lp.z)
    const siteHook = tmp.hook[1]
    if (p < SITE.drive[1] - 0.01) siteHook.copy(PARKED)
    else if (p < SITE.hoist[0]) siteHook.lerpVectors(PARKED, onFrame, smooth(SITE.drive[1] - 0.01, SITE.hoist[0], p))
    else if (p < SITE.hoist[1]) siteHook.copy(onFrame)
    else siteHook.lerpVectors(onFrame, CLEAR, smooth(SITE.hoist[1], SITE.lockTop[0], p))

    const arr = (rig.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    let n = 0
    const seg = (a: THREE.Vector3, b: THREE.Vector3) => {
      arr.set([a.x, a.y, a.z, b.x, b.y, b.z], n * 6)
      n++
    }
    ;[YARD_CRANE, SITE_CRANE].forEach((c, k) => {
      const hook = tmp.hook[k]
      const pv = V(c.x + CRANE.pivot[0], CRANE.pivot[1], c.z + CRANE.pivot[2])
      const dx = hook.x - pv.x
      const dz = hook.z - pv.z
      const r = Math.hypot(dx, dz)
      const luff = Math.acos(Math.min(0.98, r / CRANE.boom))
      const slew = Math.atan2(-dz, dx)
      booms.current[k]?.rotation.set(0, slew, luff, 'YZX')
      const tip = V(pv.x + Math.cos(slew) * CRANE.boom * Math.cos(luff), pv.y + CRANE.boom * Math.sin(luff), pv.z - Math.sin(slew) * CRANE.boom * Math.cos(luff))
      if (k || yardOn) seg(tip, V(hook.x, hook.y + 0.32, hook.z))
      hooks.current[k]?.position.copy(hook)
    })
    if (L && p < SITE.load[1] + 0.005)
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ])
        seg(yardHook, V(L.position.x + sx * PALLET.x, L.position.y + 0.08, L.position.z + sz * PALLET.z))
    if (p > SITE.hoist[0] && p < SITE.hoist[1]) for (const sx of [-0.8, 0.8]) seg(siteHook, e.root.localToWorld(V(sx, 0.48, 0.055)))
    rig.getAttribute('position').needsUpdate = true
    rig.setDrawRange(0, n * 2)

    if (live.current && !reduced) invalidate()
  }, -2)

  return (
    <>
      <Sun focus={sunAt} reach={reach} offset={[-5, 11, 7]} intensity={3} />
      <mesh position={[30, 0, -2]} rotation={[-Math.PI / 2, 0, 0]} material={m.catcher} receiveShadow renderOrder={-1}>
        <planeGeometry args={[130, 70]} />
      </mesh>
      <mesh geometry={geo.road.surface} material={m.base.ink} receiveShadow />
      <mesh geometry={geo.road.dashes} material={m.base.yellow} />

      {/* the load: the element, its pallet and its wrap */}
      <group ref={load}>
        <Element api={api} lattice={false} />
        <mesh geometry={geo.pallet} material={m.base.white} castShadow receiveShadow />
        <mesh ref={wrap} geometry={geo.wrap} material={m.wrap} castShadow receiveShadow />
      </group>

      <group ref={truck} position={[TRUCK_YARD, 0, ROAD_Z]}>
        <mesh geometry={geo.truck.body} material={m.base.ink} castShadow receiveShadow />
        <mesh geometry={geo.truck.tyres} material={m.base.ink} castShadow />
        <mesh geometry={geo.truck.glass} material={m.base.yellow} />
      </group>
      {[YARD_CRANE, SITE_CRANE].map((c, k) => (
        <group key={k} ref={(el) => void (cranes.current[k] = el)} position={[c.x, 0, c.z]}>
          <mesh geometry={geo.crane.body} material={m.base.ink} castShadow receiveShadow />
          <mesh geometry={geo.crane.tyres} material={m.base.ink} castShadow />
          <mesh geometry={geo.crane.glass} material={m.base.yellow} />
          <group ref={(el) => void (booms.current[k] = el)} position={CRANE.pivot}>
            <mesh geometry={geo.boom} material={m.base.ink} castShadow receiveShadow />
          </group>
        </group>
      ))}
      {[0, 1].map((k) => (
        <mesh key={k} ref={(el) => void (hooks.current[k] = el)} geometry={geo.hook} material={m.base.yellow} castShadow />
      ))}
      <lineSegments geometry={rig} material={m.rope} frustumCulled={false} />

      {/* the block and its cornice bands, whole */}
      <group position={BLOCK_AT}>
        <mesh geometry={geo.block.body} material={m.base.ink} castShadow receiveShadow />
        <mesh geometry={geo.block.glass} material={m.base.yellow} />
      </group>
      <instancedMesh ref={bands} args={[geo.skin, m.u.concrete, placed.length]} castShadow receiveShadow frustumCulled={false} />
    </>
  )
}
