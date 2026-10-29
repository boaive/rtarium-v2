import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../../lib/motion'
import { smooth, type Progress } from '../../progress'
import { setOpacity, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { StudioFog } from '../unit/BurstUnit'
import { Element, createElementApi } from './Element'
import { Sun } from './Sun'
import { FRAME, LEN, block, merge } from './cornice'
import { CAST, RIM, gunGeometry, modelMaterials, mouldGeometry, palletGeometry, sprayGeometry } from './models'
import { SEATED, WET, drape, wrapGeometry } from './handling'

/**
 * Cast in five steps (the client's), in a black box over the studio's grid (the two components'
 * studio): the casting bench in the middle of the box with room round it, one steady view (it leans
 * in a little only while RTARIUM is laid in). Concrete and RTARIUM are two different things done two
 * different ways: the concrete is sprayed, a pass of the gun at a time; RTARIUM is cut into flat strips
 * and stitched together at the folds, then laid in.
 *
 *   1  stud frame       the frame made member by member on its trestles behind the mould, drilled at the
 *                       ferrules' intervals, its flexible L plates bolted on
 *   2  mould            the CNC-routed timber mould set on the bench, the cornice's face as its cavity
 *   3  spray-up         the face coat sprayed in one pass; RTARIUM's strips cut and set out over the
 *                       mould one after another, stitched along every fold, the ferrules on it, then
 *                       pressed into the face coat; the backing sprayed over it in a second pass
 *   4  frame onto skin  the frame brought over (the crane's arc) and set on the ferrule inserts
 *   5  cure and pack    the concrete cures from its wet grey to its white; out of the mould, onto its
 *                       pallet, wrapped
 *
 * Everything follows the scroll. Sizes illustrate the system; they are not a product drawing.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** when each step happens (fractions of the section's run) */
export const CASTING = {
  frame: [0.03, 0.15],
  plates: [0.15, 0.19],
  mould: [0.2, 0.27],
  face: [0.29, 0.37],
  strips: [0.39, 0.46],
  stitch: [0.46, 0.54],
  lay: [0.54, 0.59],
  back: [0.61, 0.69],
  lock: [0.71, 0.82],
  cure: [0.84, 0.89],
  pack: [0.89, 0.98],
} as const
type Mark = keyof typeof CASTING
const at = (p: number, k: Mark, a = 0, b = 1) => smooth(lerp(CASTING[k][0], CASTING[k][1], a), lerp(CASTING[k][0], CASTING[k][1], b), p)

/** where the frame is made: on trestles well behind the mould (in the element's frame, the element face down) */
const BEHIND = -2.1
const MADE = { y: BEHIND + CAST.z - (FRAME.y0 + FRAME.y1) / 2, z: CAST.y - FRAME.z1 - 0.045 }
/** the gun's height over the mould's rim, and how far its spray reaches down into the cavity */
const GUN_Y = RIM + 0.42
const SPRAY_H = GUN_Y - (RIM - 0.24)

const FOCUS: [number, number, number] = [0, 0.3, -0.8]
export const CAST_FOCUS = FOCUS

export function castShot(p: number, compact: boolean): Shot {
  // (a narrow screen is already stood back from by the rig, for its shape)
  const k = compact ? 0.82 : 1
  const base: Shot = { target: FOCUS, dist: 7.0 * k, azim: 24, elev: 30, frame: [0.5, 0.53] }
  // RTARIUM: a little closer while it is cut, stitched and laid in, and back
  const look: Shot = { target: [-0.15, 0.42, -0.08], dist: 5.0 * k, azim: 26, elev: 34, frame: [0.5, 0.53] }
  return mixShot(base, look, smooth(CASTING.strips[0] - 0.02, CASTING.strips[0] + 0.04, p) * (1 - smooth(CASTING.lay[1], CASTING.lay[1] + 0.04, p)))
}

export function CastScene({ progress, live }: { progress: Progress; live: { current: boolean } }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])
  useEffect(() => {
    const f = () => invalidate()
    progress.listeners.add(f)
    return () => void progress.listeners.delete(f)
  }, [progress, invalidate])

  const api = useMemo(createElementApi, [])
  const sunAt = useRef(new THREE.Vector3(...FOCUS))
  const reach = useRef(2.8)

  const m = useMemo(() => {
    const base = modelMaterials()
    const mould = base.white.clone()
    const pallet = base.white.clone()
    const spray = new THREE.MeshStandardMaterial({ color: '#cfcbc2', roughness: 1, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    const wrap = new THREE.MeshStandardMaterial({ color: '#f7f6f2', roughness: 0.3, transparent: true, opacity: 0.94, side: THREE.DoubleSide })
    wrap.userData.base = 0.94
    const catcher = new THREE.ShadowMaterial({ color: '#000000', transparent: true, opacity: 0.42, depthWrite: false })
    return { base, mould, pallet, spray, wrap, catcher }
  }, [])
  const geo = useMemo(() => {
    const w = wrapGeometry()
    return {
      mould: mouldGeometry(),
      gun: gunGeometry(),
      spray: sprayGeometry(SPRAY_H, 0.62),
      pallet: palletGeometry(),
      trestles: merge([-0.8, 0.8].flatMap((x) => [block([x - 0.05, 0, BEHIND - 0.25], [x + 0.05, 0.045, BEHIND + 0.25])])),
      wrap: w.geo,
      wrapBase: w.base,
    }
  }, [])
  useEffect(
    () => () => {
      for (const g of [geo.mould, geo.gun, geo.spray, geo.pallet, geo.trestles, geo.wrap]) g.dispose()
      for (const x of [...Object.values(m.base), m.mould, m.pallet, m.spray, m.wrap, m.catcher]) x.dispose()
    },
    [geo, m],
  )

  const mould = useRef<THREE.Group>(null)
  const gun = useRef<THREE.Group>(null)
  const wrap = useRef<THREE.Mesh>(null)
  const wrapAt = useRef(-1)
  const trestles = useRef<THREE.Mesh>(null)
  const cured = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const p = progress.value
    const e = api
    if (!e.root || !e.frame || !e.mesh || !e.mats) return

    // the element: face down in its mould; lifted onto its pallet as the mould goes
    e.root.rotation.x = Math.PI / 2
    e.root.position.set(0, lerp(CAST.y, SEATED.y, at(p, 'pack', 0.2, 0.45)), -CAST.z)

    // 1. the frame: made member by member on its trestles, drilled, its plates bolted on
    const fab = at(p, 'frame')
    const n = e.members.length
    e.members.forEach((mm, i) => {
      if (!mm) return
      const g = smooth((i / n) * 0.8, (i / n) * 0.8 + 0.2, fab)
      mm.scale.y = Math.max(1e-3, g)
      mm.visible = g > 0.002
    })
    if (e.holes) e.holes.visible = fab > 0.9
    setOpacity([e.mats.plate], at(p, 'plates'))
    // 4. brought over onto the skin: hoisted clear, across, down onto the ferrules (the crane's arc)
    const lc = at(p, 'lock', 0, 0.85)
    const up = smooth(0, 0.45, lc)
    const across = smooth(0.38, 0.8, lc)
    const down = smooth(0.76, 1, lc)
    e.frame.position.set(0, MADE.y * (1 - across), MADE.z + (-0.5 - MADE.z) * up + 0.5 * down)

    // 3. the concrete: sprayed, the face coat one way, the backing back the other; wet, then cured
    const gunFace = lerp(-LEN / 2 - 0.25, LEN / 2 + 0.25, at(p, 'face'))
    const gunBack = lerp(LEN / 2 + 0.25, -LEN / 2 - 0.25, at(p, 'back'))
    e.planes.coat.constant = p < CASTING.face[0] ? -1e3 : p < CASTING.face[1] ? gunFace : 1e3
    e.planes.back.constant = p < CASTING.back[0] ? -1e3 : p < CASTING.back[1] ? -gunBack : 1e3
    cured.copy(WET).lerp(e.mats.cut.color, at(p, 'cure'))
    e.mats.coat.color.copy(cured)
    e.mats.backing.color.copy(cured)
    if (gun.current) gun.current.position.set(p < CASTING.back[0] ? gunFace : gunBack, GUN_Y, 0)
    const pass = (k: Mark) => smooth(CASTING[k][0] - 0.015, CASTING[k][0] + 0.005, p) * (1 - smooth(CASTING[k][1] - 0.005, CASTING[k][1] + 0.015, p))
    const gunO = Math.max(pass('face'), pass('back'))
    setOpacity([m.base.white], gunO)
    m.spray.opacity = 0.3 * Math.max(at(p, 'face', 0, 0.04) * (1 - at(p, 'face', 0.96, 1)), at(p, 'back', 0, 0.04) * (1 - at(p, 'back', 0.96, 1)))
    m.spray.visible = m.spray.opacity > 0.004

    // RTARIUM: the cut strips set out over the mould one after another, stitched at every fold, the
    // ferrules set on it, then pressed into the face coat; hidden by the backing
    const shown = p >= CASTING.strips[0] && p < CASTING.back[1] + 0.03 ? 1 : 0
    setOpacity([e.mats.roving, e.mats.fibre, e.mats.thread], shown)
    e.lay(at(p, 'strips'), at(p, 'stitch'))
    e.mesh.position.z = -0.32 * (1 - at(p, 'lay'))
    setOpacity([e.mats.ferrule, e.mats.bore], p > CASTING.back[1] ? 1 : at(p, 'stitch', 0.75, 1))

    // 2. the mould set on its bench; 5. taken away as the element comes out, the pallet under it, the wrap over it
    const mouldO = at(p, 'mould', 0, 0.6) * (1 - at(p, 'pack', 0, 0.3))
    setOpacity([m.mould], mouldO)
    if (mould.current) mould.current.position.y = 0.12 * (1 - at(p, 'mould', 0, 0.8))
    setOpacity([m.pallet], at(p, 'pack', 0.15, 0.4))
    const wr = at(p, 'pack', 0.5, 1)
    setOpacity([m.wrap], wr > 0.001 ? 1 : 0)
    if (wrap.current && Math.abs(wr - wrapAt.current) > 1e-4) {
      wrapAt.current = wr
      drape(geo.wrap, geo.wrapBase, wr)
    }

    // the trestles go once the frame has been taken off them
    if (trestles.current) trestles.current.visible = p < CASTING.lock[1]

    if (live.current && !reduced) invalidate()
  }, -2)

  return (
    <>
      <Sun focus={sunAt} reach={reach} offset={[-5, 11, 7]} intensity={3} />
      <StudioFog color="#080808" near={9} far={22} />
      <gridHelper args={[16, 64, '#2e2e2e', '#232323']} position={[0, -0.022, -0.8]} />
      <mesh position={[0, -0.02, -0.6]} rotation={[-Math.PI / 2, 0, 0]} material={m.catcher} receiveShadow renderOrder={-1}>
        <planeGeometry args={[14, 12]} />
      </mesh>
      <mesh ref={trestles} geometry={geo.trestles} material={m.base.road} castShadow receiveShadow />
      <group ref={mould}>
        <mesh geometry={geo.mould} material={m.mould} castShadow receiveShadow />
      </group>
      <Element api={api} />
      <mesh geometry={geo.pallet} material={m.pallet} castShadow receiveShadow />
      <mesh ref={wrap} geometry={geo.wrap} material={m.wrap} castShadow receiveShadow />
      <group ref={gun}>
        <mesh geometry={geo.gun} material={m.base.white} castShadow />
        <mesh geometry={geo.spray} material={m.spray} renderOrder={4} />
      </group>
    </>
  )
}
