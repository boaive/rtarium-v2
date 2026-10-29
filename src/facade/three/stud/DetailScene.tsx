import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { prefersReducedMotion } from '../../../lib/motion'
import { smooth, type Progress } from '../../progress'
import { setOpacity, type Shot } from '../kit'
import { mixShot } from '../ScrubRig'
import { disposeUnitMaterials, unitMaterials } from '../unit/parts'
import { Element, createElementApi } from './Element'
import { Sun } from './Sun'
import { BACK, JOINT, LEN, PROFILE, SKIN, bandGeometry, block, merge, offsetPath, type P2 } from './cornice'
import { BLOCK, bandY, hookGeometry, modelMaterials, sealantGunGeometry } from './models'
import { BAND, BLOCK_AT, INSTALL, LOW, PITCH, SEATS, SITE, at, bump, hoistAt, hoistTurn, levelAt } from './site'

/**
 * On site, the joint in close: what the block's whole view cannot show, in its own box beside it, a
 * window onto the same façade (the band, the glazing above and below it, the black between), its own
 * frame being the box. In the element's frame on the building (its root at the origin):
 *
 *   lifted on             it comes down the last of the crane's arc onto its two L frames, set a little low
 *   locked from the top   the angles come down over its frame; then it is seen through for a moment, to
 *                         RTARIUM inside it
 *   levelled              the levelling bolts turn in three small steps until its faces run on from the
 *                         next element's
 *   sealed                a backing rod pressed into the joint, the sealant traced along it, slowly
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
/** the joint sealed: between it and the element before it */
const JX = -LEN / 2 - JOINT / 2
/** the façade piece the box looks onto: its glazing's mullions where the block has them */
const HALF = 4.4

function jointPath(d: number) {
  const pts = offsetPath(PROFILE, d).map(([u, v]: P2) => V(JX, v, BACK + u))
  const path = new THREE.CurvePath<THREE.Vector3>()
  for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]))
  return path
}

export function detailShot(p: number): Shot {
  const sh = (target: [number, number, number], dist: number, azim: number, elev: number): Shot => ({ target, dist, azim, elev, frame: [0.5, 0.52] })
  const lifted = sh([0, 0.45, 0.3], 6.4, 22, 12)
  let s = mixShot(lifted, { ...lifted, dist: 5.4 }, smooth(SITE.hoist[1], SITE.lockTop[0] + 0.02, p))
  // RTARIUM, seen through: a little closer, and back
  s = mixShot(s, { ...s, dist: 4.6, azim: 20 }, bump(p, 'look', 0, 0.35, 0.7, 1))
  s = mixShot(s, sh([JX + 0.32, 0.16, 0.24], 2.6, 20, -4), smooth(SITE.level[0] - 0.035, SITE.level[0], p))
  return mixShot(s, sh([JX, 0.28, 0.42], 2.2, 28, 4), smooth(SITE.rod[0] - 0.03, SITE.rod[0], p))
}

export function DetailScene({ progress, live }: { progress: Progress; live: { current: boolean } }) {
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    const f = () => invalidate()
    progress.listeners.add(f)
    return () => void progress.listeners.delete(f)
  }, [progress, invalidate])

  const api = useMemo(createElementApi, [])
  const sunAt = useRef(V(0, 0.3, 0.3))
  const reach = useRef(3)

  const m = useMemo(() => {
    const base = modelMaterials()
    const u = unitMaterials()
    return {
      base,
      u,
      steel: new THREE.MeshStandardMaterial({ color: '#5d6268', metalness: 0.62, roughness: 0.42, transparent: true }),
      lock: new THREE.MeshStandardMaterial({ color: '#5d6268', metalness: 0.62, roughness: 0.42, transparent: true }),
      sealant: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.32 }),
      rod: new THREE.MeshStandardMaterial({ color: '#efede6', roughness: 1 }),
      gun: base.white.clone(),
      rope: new THREE.LineBasicMaterial({ color: '#080808', transparent: true, opacity: 0.85 }),
    }
  }, [])
  const geo = useMemo(() => {
    // the façade about the gap, as the block has it: the black wall, the glazing ribbons over and under the band, their mullions
    const y0 = -bandY(BAND)
    const fh = BLOCK.fh
    const wall = block([-HALF, -2.6, -0.4], [HALF, 2.6, -0.02])
    const glass: THREE.BufferGeometry[] = []
    const mullions: THREE.BufferGeometry[] = []
    const blockX = INSTALL.x - BLOCK_AT.x
    for (const k of [BAND, BAND + 1]) {
      const a = y0 + k * fh + 0.35
      const b = y0 + k * fh + 2.45
      glass.push(block([-HALF, a, -0.02], [HALF, b, 0.01]))
      for (let x = 0.5; x <= BLOCK.w - 0.49; x += 1.6) {
        const lx = x - blockX
        if (Math.abs(lx) < HALF) mullions.push(block([lx - 0.05, a, 0.01], [lx + 0.05, b, 0.06]))
      }
    }
    // the fixings at the gap: an L frame under each end (its seat and its leg on the wall), the angles that lock its top
    const seats = merge(SEATS.flatMap((x) => [block([x - 0.06, -0.004, 0], [x + 0.06, 0.006, 0.1]), block([x - 0.06, -0.16, 0], [x + 0.06, 0.006, 0.008])]))
    const locks = merge(SEATS.flatMap((x) => [block([x - 0.05, 0.5, 0], [x + 0.05, 0.507, 0.086]), block([x - 0.05, 0.468, 0.079], [x + 0.05, 0.507, 0.086]), block([x - 0.05, 0.4, 0], [x + 0.05, 0.507, 0.008])]))
    // the levelling bolt: its head under the frame's chord, its shank through the seat, a nut under the seat
    const bolt = merge([
      new THREE.CylinderGeometry(0.013, 0.013, 0.008, 6).translate(0, 0.004, 0),
      new THREE.CylinderGeometry(0.006, 0.006, 0.07, 10).translate(0, -0.035, 0),
      new THREE.CylinderGeometry(0.014, 0.014, 0.01, 6).translate(0, -0.016, 0),
    ])
    const beadPath = jointPath(-0.003)
    return {
      wall,
      glass: merge(glass),
      mullions: merge(mullions),
      skin: bandGeometry(0, SKIN),
      seats,
      locks,
      bolt,
      hook: hookGeometry(),
      rod: new THREE.TubeGeometry(jointPath(0.007), 300, 0.005, 8, false),
      bead: new THREE.TubeGeometry(beadPath, 300, 0.0068, 10, false),
      beadPath,
      gun: sealantGunGeometry(),
    }
  }, [])
  useEffect(
    () => () => {
      for (const g of [geo.wall, geo.glass, geo.mullions, geo.skin, geo.seats, geo.locks, geo.bolt, geo.hook, geo.rod, geo.bead, geo.gun]) g.dispose()
      Object.values(m.base).forEach((x) => x.dispose())
      disposeUnitMaterials(m.u)
      for (const x of [m.steel, m.lock, m.sealant, m.rod, m.gun, m.rope]) x.dispose()
    },
    [geo, m],
  )

  const rig = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 3), 3))
    return g
  }, [])
  useEffect(() => () => rig.dispose(), [rig])

  const hook = useRef<THREE.Mesh>(null)
  const bolts = useRef<(THREE.Group | null)[]>([])
  const locks = useRef<THREE.Mesh>(null)
  const rod = useRef<THREE.Mesh>(null)
  const bead = useRef<THREE.Mesh>(null)
  const sgun = useRef<THREE.Group>(null)
  const up = useMemo(() => V(0, 1, 0), [])

  useFrame(() => {
    const p = progress.value
    const e = api
    if (!e.root || !e.mats) return
    const s = detailShot(p)
    sunAt.current.set(...s.target)
    reach.current = Math.max(1.4, Math.min(4, s.dist * 0.6))

    // the element: the last of its lift, set low on its L frames, levelled (as on the block, in its own frame)
    e.root.position.copy(hoistAt(Math.max(p, SITE.hoist[0] + 0.001), V(0, 0, 0))).sub(INSTALL)
    e.root.rotation.x = hoistTurn(p)
    const level = levelAt(p)
    bolts.current.forEach((b) => {
      if (!b) return
      b.position.y = -LOW * (1 - level)
      b.rotation.y = level * Math.PI * 2
    })
    // the locks come down once it is set
    if (locks.current) locks.current.position.y = 0.25 * (1 - at(p, 'lockTop'))
    setOpacity([m.lock], at(p, 'lockTop', 0, 0.3))
    // seen through for a moment, to RTARIUM inside it
    const xr = bump(p, 'look', 0, 0.3, 0.72, 1)
    setOpacity([e.mats.coat, e.mats.backing], 1 - xr * 0.8)
    setOpacity([e.mats.roving, e.mats.fibre, e.mats.thread], xr)

    // the hook and its slings, while it is still on the crane; then up and away
    e.root.updateWorldMatrix(true, false)
    const lp = e.root.localToWorld(V(0, 0.48, 0.055))
    const away = smooth(SITE.hoist[1], SITE.lockTop[0], p)
    const h = V(lp.x + away * 1.5, lp.y + 0.8 + away * 6, lp.z + away * 1.5)
    if (hook.current) hook.current.position.copy(h)
    const arr = (rig.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    let n = 0
    const seg = (a: THREE.Vector3, b: THREE.Vector3) => {
      arr.set([a.x, a.y, a.z, b.x, b.y, b.z], n * 6)
      n++
    }
    seg(V(h.x, h.y + 0.32, h.z), V(h.x, h.y + 12, h.z))
    if (p < SITE.hoist[1]) for (const sx of [-0.8, 0.8]) seg(h, e.root.localToWorld(V(sx, 0.48, 0.055)))
    rig.getAttribute('position').needsUpdate = true
    rig.setDrawRange(0, n * 2)

    // the seal: the backing rod pressed in, then the sealant traced along the joint, slowly
    const rodF = at(p, 'rod')
    const beadF = at(p, 'bead')
    if (rod.current) {
      rod.current.geometry.setDrawRange(0, Math.floor(rodF * 300) * 8 * 6)
      rod.current.visible = rodF > 0.001
    }
    if (bead.current) {
      bead.current.geometry.setDrawRange(0, Math.floor(beadF * 300) * 10 * 6)
      bead.current.visible = beadF > 0.001
    }
    const working = Math.max(bump(p, 'rod', 0, 0.1, 0.9, 1), bump(p, 'bead', 0, 0.06, 0.96, 1))
    setOpacity([m.gun], working)
    const g = sgun.current
    if (g && working > 0.004) {
      const u = Math.min(0.999, p < SITE.bead[0] ? rodF : beadF)
      const pt = geo.beadPath.getPointAt(u)
      const tg = geo.beadPath.getTangentAt(u)
      // the profile's outward normal there; the gun leans back along the way it has come
      const nrm = V(0, -tg.z, tg.y).normalize()
      g.position.copy(pt).addScaledVector(nrm, 0.004)
      g.quaternion.setFromUnitVectors(up, nrm.clone().addScaledVector(tg, -0.7).normalize())
    }

    if (live.current && !reduced) invalidate()
  }, -2)

  return (
    <>
      <Sun focus={sunAt} reach={reach} offset={[-5, 11, 7]} intensity={3} />
      {/* the façade about the gap */}
      <mesh geometry={geo.wall} material={m.base.ink} receiveShadow />
      <mesh geometry={geo.glass} material={m.base.yellow} receiveShadow />
      <mesh geometry={geo.mullions} material={m.base.ink} castShadow receiveShadow />
      {[-1, 1].map((k) => (
        <mesh key={k} geometry={geo.skin} material={m.u.concrete} position={[k * PITCH, 0, 0]} castShadow receiveShadow />
      ))}
      {/* the element, its fixings */}
      <Element api={api} />
      <mesh geometry={geo.seats} material={m.steel} castShadow receiveShadow />
      <mesh ref={locks} geometry={geo.locks} material={m.lock} castShadow />
      {SEATS.map((x, i) => (
        <group key={x} ref={(el) => void (bolts.current[i] = el)} position={[x, 0, 0]}>
          <mesh geometry={geo.bolt} material={m.steel} position={[0, 0.006, 0.055]} castShadow />
        </group>
      ))}
      <mesh ref={hook} geometry={geo.hook} material={m.base.yellow} castShadow />
      <lineSegments geometry={rig} material={m.rope} frustumCulled={false} />
      <mesh ref={rod} geometry={geo.rod} material={m.rod} visible={false} />
      <mesh ref={bead} geometry={geo.bead} material={m.sealant} visible={false} castShadow />
      <group ref={sgun}>
        <mesh geometry={geo.gun} material={m.gun} castShadow />
      </group>
    </>
  )
}
