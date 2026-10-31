import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../../../facade/three/MeshInset'
import { block, merge } from '../../../facade/three/unit/parts'
import { Wake } from '../../../facade/three/rain/lines'
import { prefersReducedMotion } from '../../../lib/motion'
import { PITCH, uvBox } from '../../data/three/dc'
import { ProblemSample } from '../../data/three/ProblemSample'
import { disposeKit, fabKit, LAY, SLAB, waffle } from './fab'
import { vibeMaterial } from './vibe'

/**
 * A problem's sample, for its card (the Data & AI Centres deck's samples, for a fab): a small piece
 * turning a little in its own time, seen first as the problem and then, as the card is answered
 * (`solved` 0..1, read every frame), as RTARIUM makes it.
 *
 *   vibration  a slice of the waffle slab, two ribs under it, a 50 mm brittle topping on it, seen on
 *              its cut: red fronts of micro-vibration run up through ribs, deck and topping and on into
 *              the room over it; the topping gives way to 20 mm of RTARIUM (its mesh a line in the cut),
 *              the fronts die out in it, and the room above is still
 *   dust       a topping cut back at a corner, its surface delaminating in flakes, cement dust lifting
 *              off it; it closes dense, RTARIUM shows in the cut, and the dust settles and is gone
 *   esd        the Data & AI Centres' coat, its path to ground broken by a crack and blisters
 */

export type CardKind = 'vibration' | 'dust' | 'esd'

let seed = 31
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

/** the vibration sample's slice: two ribs under it, cut through the coffers either side; centred on its middle */
const VX: [number, number] = [-0.4, 1.3]
const VZ: [number, number] = [-0.28, 0.28]
const VMID = (VX[0] + VX[1]) / 2
/** how high the fronts are seen to carry on into the room above an undamped floor */
const AIR = 0.3

function Vibration({ solved, live }: { solved: { current: number }; live: { current: boolean } }) {
  const m = useMemo(fabKit, [])
  const g = useMemo(() => {
    const w = waffle(VX, VZ)
    return {
      ...w,
      // a topping of unit height, set to its thickness by the scene
      top: uvBox(block([VX[0], 0, VZ[0]], [VX[1], 1, VZ[1]]), 2),
      // RTARIUM's line on the cut faces, once the topping is RTARIUM's
      yarn: merge([block([VX[0], -0.005, VZ[1]], [VX[1], 0.005, VZ[1] + 0.0008]), block([VX[1], -0.005, VZ[0]], [VX[1] + 0.0008, 0.005, VZ[1]])]),
      face: new THREE.PlaneGeometry(VX[1] - VX[0], 0.6).translate(VMID, 0.3, VZ[1] + 0.0015),
      side: new THREE.PlaneGeometry(VZ[1] - VZ[0], 0.6).rotateY(Math.PI / 2).translate(VX[1] + 0.0015, 0.3, 0),
      air: new THREE.PlaneGeometry(VX[1] - VX[0], AIR).translate(VMID, AIR / 2, 0),
    }
  }, [])
  const front = useMemo(() => vibeMaterial('z', SLAB + LAY.old, { speed: 0.14, wave: 0.09, thick: 0.05 }), [])
  const side = useMemo(() => vibeMaterial('x', SLAB + LAY.old, { speed: 0.14, wave: 0.09, thick: 0.05 }), [])
  const air = useMemo(() => vibeMaterial('z', 10, { speed: 0.14, wave: 0.09, plain: true, thick: 0.04, fade: [VX[0], VX[1], 0, 0.2], ceil: AIR }), [])
  const mat = useMemo(() => m.old.clone(), [m])
  const yarn = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a07a55', roughness: 0.7, transparent: true, opacity: 0 }), [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      for (const x of [front.material, side.material, air.material, mat, yarn]) x.dispose()
      disposeKit(m)
    },
    [g, m, front, side, air, mat, yarn],
  )
  const top = useRef<THREE.Mesh>(null)
  const airMesh = useRef<THREE.Mesh>(null)
  const yarnMesh = useRef<THREE.Mesh>(null)
  const colours = useMemo(() => ({ old: m.old.color.clone(), slc: m.slc.color.clone() }), [m])
  useFrame(() => {
    const s = solved.current
    const k = THREE.MathUtils.smoothstep(s, 0.1, 0.7)
    const thick = LAY.old - (LAY.old - LAY.slc) * k
    if (top.current) {
      top.current.position.y = SLAB
      top.current.scale.y = thick
    }
    mat.color.copy(colours.old).lerp(colours.slc, k)
    yarn.opacity = THREE.MathUtils.smoothstep(s, 0.5, 0.8)
    if (yarnMesh.current) yarnMesh.current.visible = yarn.opacity > 0.01
    const t = live.current ? performance.now() / 1000 : 0
    const damp = THREE.MathUtils.smoothstep(s, 0.35, 0.9)
    for (const v of [front, side]) {
      v.u.uTime.value = t
      v.u.uTop.value = SLAB + thick
      // RTARIUM damps the fronts within its 20 mm: none pass above it
      v.u.uDamp.value = damp
      v.u.uDampY0.value = SLAB - 0.004
      v.u.uDampY1.value = SLAB + LAY.slc * 0.7
    }
    // over the floor, the fronts carry on into the cleanroom; once damped, nothing does
    air.u.uTime.value = t
    air.u.uShow.value = 1 - damp
    if (airMesh.current) {
      airMesh.current.position.y = SLAB + thick
      airMesh.current.visible = damp < 0.995
    }
  })
  return (
    <group position={[-VMID, -0.27, 0]}>
      <mesh geometry={g.ribs} material={m.waffle} />
      <mesh geometry={g.deck} material={m.waffle} />
      <mesh ref={top} geometry={g.top} material={mat} />
      <mesh ref={yarnMesh} geometry={g.yarn} material={yarn} position={[0, SLAB + LAY.cover + LAY.mesh / 2, 0]} visible={false} />
      <mesh geometry={g.face} material={front.material} renderOrder={2} />
      <mesh geometry={g.side} material={side.material} renderOrder={2} />
      <mesh ref={airMesh} geometry={g.air} material={air.material} renderOrder={2} />
    </group>
  )
}

/** a piece of topping with its front right corner cut back; flakes lifting off its face, dust over it */
function Dust({ solved, live }: { solved: { current: number }; live: { current: boolean } }) {
  const S = 0.34
  const T = LAY.old
  const C = 0.15
  const m = useMemo(fabKit, [])
  const top = useMemo(() => m.old.clone(), [m])
  const colours = useMemo(() => ({ old: m.old.color.clone(), slc: m.slc.color.clone() }), [m])
  const dust = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d9d4c9', transparent: true, toneMapped: false, depthWrite: false }), [])
  const g = useMemo(() => {
    const body = merge([block([-S / 2, 0, -S / 2], [S / 2, T, S / 2 - C]), block([-S / 2, 0, S / 2 - C], [S / 2 - C, T, S / 2]), block([S / 2 - C, 0, S / 2 - C], [S / 2, T / 2 - 0.006, S / 2])])
    uvBox(body, 3)
    return { body, flake: new THREE.BoxGeometry(0.022, 0.0016, 0.017), mote: new THREE.BoxGeometry(0.0018, 0.0018, 0.0018) }
  }, [T])
  // the flakes: where they lie on the face (clear of the cut corner), how far each has lifted
  const N = 46
  const M = 110
  const flakes = useRef<THREE.InstancedMesh>(null)
  const motes = useRef<THREE.InstancedMesh>(null)
  const lie = useMemo(
    () =>
      Array.from({ length: N }, () => {
        let x = 0
        let z = 0
        do {
          x = rnd() * (S - 0.04) - S / 2 + 0.02
          z = rnd() * (S - 0.04) - S / 2 + 0.02
        } while (x > S / 2 - C - 0.015 && z > S / 2 - C - 0.015)
        return { x, z, turn: rnd() * Math.PI, tilt: 0.12 + rnd() * 0.35, lift: 0.002 + rnd() * 0.006 }
      }),
    [],
  )
  const seeds = useMemo(() => Array.from({ length: M }, () => [rnd() * S - S / 2, rnd() * S - S / 2, rnd(), 0.6 + rnd() * 0.8]), [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      top.dispose()
      dust.dispose()
      disposeKit(m)
    },
    [g, m, top, dust],
  )
  const inset = useRef<THREE.Group>(null)
  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const last = useRef(-1)
  useFrame(() => {
    const s = solved.current
    const k = THREE.MathUtils.smoothstep(s, 0.1, 0.6)
    top.color.copy(colours.old).lerp(colours.slc, k)
    if (inset.current) inset.current.visible = s > 0.45
    // the flakes settle flat and close into the face as it is answered
    const f = flakes.current
    if (f && s !== last.current) {
      last.current = s
      lie.forEach((l, i) => {
        e.set(l.tilt * (1 - k), l.turn, 0)
        q.setFromEuler(e)
        p.set(l.x, T + 0.0008 + l.lift * (1 - k), l.z)
        one.setScalar(Math.max(0.001, 1 - k))
        f.setMatrixAt(i, mtx.compose(p, q, one))
      })
      f.instanceMatrix.needsUpdate = true
      f.visible = k < 0.999
    }
    // the dust lifts off the face in time; it settles out as the card is answered
    dust.opacity = 0.85 * (1 - THREE.MathUtils.smoothstep(s, 0.05, 0.4))
    const mo = motes.current
    if (!mo) return
    mo.visible = dust.opacity > 0.01
    if (!mo.visible) return
    const t = live.current ? performance.now() / 1000 : 0
    seeds.forEach(([x, z, ph, sp], i) => {
      const u = (t * 0.1 * sp + ph) % 1
      mtx.makeTranslation(x + Math.sin(t * 0.7 + ph * 9) * 0.012, T + u * 0.22, z + Math.cos(t * 0.6 + ph * 7) * 0.012)
      mo.setMatrixAt(i, mtx)
    })
    mo.instanceMatrix.needsUpdate = true
  })
  const n = Math.floor((C - 0.01) / PITCH)
  return (
    <group position={[0, -0.03, 0]}>
      <mesh geometry={g.body} material={top} />
      <instancedMesh ref={flakes} args={[g.flake, top, N]} />
      <group ref={inset} position={[S / 2 - C / 2, T / 2 - 0.006 + 0.005, S / 2 - C / 2]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <Suspense fallback={null}>
          <MeshInset nx={n} ny={n} lod={2} />
        </Suspense>
      </group>
      <instancedMesh ref={motes} args={[g.mote, dust, M]} />
    </group>
  )
}

const VIEW: Record<Exclude<CardKind, 'esd'>, { dist: number; elev: number; y: number; turn: number }> = {
  vibration: { dist: 4.3, elev: 13, y: 0.1, turn: -0.42 },
  dust: { dist: 1.45, elev: 28, y: 0.02, turn: -0.62 },
}

export function CardSample({ kind, solved, live }: { kind: CardKind; solved: { current: number }; live: { current: boolean } }) {
  if (kind === 'esd') return <ProblemSample kind="esd" solved={solved} live={live} />
  return <Turning kind={kind} solved={solved} live={live} />
}

function Turning({ kind, solved, live }: { kind: Exclude<CardKind, 'esd'>; solved: { current: number }; live: { current: boolean } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const turn = useRef<THREE.Group>(null)
  const last = useRef(-1)
  useFrame(() => {
    const v = VIEW[kind]
    const e = (v.elev * Math.PI) / 180
    camera.fov = 26
    camera.position.set(0, v.y + v.dist * Math.sin(e), v.dist * Math.cos(e))
    camera.lookAt(0, v.y, 0)
    camera.updateProjectionMatrix()
    const t = performance.now() / 1000
    if (turn.current) turn.current.rotation.y = v.turn + (reduced ? 0 : 0.18 * Math.sin((t * Math.PI * 2) / 11))
    const s = solved.current
    if ((live.current && !reduced) || s !== last.current) invalidate()
    last.current = s
  }, -1)
  return (
    <>
      <Wake live={live} />
      <group ref={turn}>
        {kind === 'vibration' && <Vibration solved={solved} live={live} />}
        {kind === 'dust' && <Dust solved={solved} live={live} />}
      </group>
    </>
  )
}
