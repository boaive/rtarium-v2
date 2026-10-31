import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../../../facade/three/MeshInset'
import { Wake } from '../../../facade/three/rain/lines'
import { block, merge } from '../../../facade/three/unit/parts'
import { prefersReducedMotion } from '../../../lib/motion'
import { disposeFloorKit, floorKit, Lines, PITCH, uvBox } from '../../data/three/dc'
import { ink, useDrawing, useInkResolution } from '../../data/three/draw'
import { crackPaths, jointSeam, jointSurface, screedBody } from './joint'
import { POD, podLines } from './parts'

/**
 * A problem's sample, for its card: a small piece turning a little in its own time, seen first as the
 * problem and then, as the card is answered (`solved` 0..1, read every frame), as RTARIUM makes it.
 *
 *   spall   a screed with its saw-cut joint spalled and pitted; the joint closes, one flat floor
 *   crack   a floor cut back at a corner, micro-cracks running from the joint; RTARIUM in the cut, and
 *           the cracks draw back to nothing
 *   agv     an AGV on a cracked joint, its scanner's fan thrown off line; the joint closes, the body
 *           levels and the fan runs true
 *   dust    a worn surface shedding dust; it goes glass-smooth under its coat, and the dust settles
 */

export type ProblemKind = 'spall' | 'crack' | 'agv' | 'dust'

const X: [number, number] = [-0.45, 0.45]
const Z: [number, number] = [-0.45, 0.45]
const T = 0.09

function useBlock(focusX = 0, pits = 90) {
  return useMemo(() => {
    const s = jointSurface(X, Z, { nx: 130, nz: 110, focusX, pits, k: 3 })
    return { ...s, body: screedBody(X, Z, T, 3), seam: jointSeam(X) }
  }, [focusX, pits])
}

const seamMat = new THREE.MeshBasicMaterial({ color: '#0a0a0a', toneMapped: false })

function Floor({ s, surface, solved }: { s: ReturnType<typeof useBlock>; surface: THREE.Material; solved: { current: number } }) {
  const top = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const m = top.current
    if (!m) return
    if (!m.morphTargetInfluences) m.updateMorphTargets()
    const k = solved.current
    if (m.morphTargetInfluences) {
      m.morphTargetInfluences[0] = 1 - k
      m.morphTargetInfluences[1] = k
    }
  })
  return (
    <>
      <mesh geometry={s.body} material={surface} />
      <mesh geometry={s.seam} material={seamMat} />
      <mesh ref={top} geometry={s.top} material={surface} />
    </>
  )
}

function Spall({ solved }: { solved: { current: number } }) {
  const m = useMemo(floorKit, [])
  const s = useBlock(0, 130)
  useEffect(
    () => () => {
      s.top.dispose()
      s.body.dispose()
      s.seam.dispose()
      disposeFloorKit(m)
    },
    [m, s],
  )
  return <Floor s={s} surface={m.screed} solved={solved} />
}

function Crack({ solved }: { solved: { current: number } }) {
  const m = useMemo(floorKit, [])
  const S = 0.45
  const C = 0.2
  const g = useMemo(() => {
    const body = merge([block([-S, 0, -S], [S, T, S - C]), block([-S, 0, S - C], [S - C, T, S]), block([S - C, 0, S - C], [S, T * 0.42, S])])
    return uvBox(body, 3)
  }, [])
  const mat = useMemo(() => ink(1.1), [])
  useInkResolution(useMemo(() => [mat], [mat]))
  const lines = useMemo(() => {
    const L = new Lines()
    const c = crackPaths([-S, S], { count: 18, reach: 0.5, lift: 0.0015, spread: 0.92 })
    for (const p of c) {
      if (p.a[0] > S - C && p.a[2] > S - C) continue
      if (p.b[0] > S - C && p.b[2] > S - C) continue
      L.seg([p.a[0], T + 0.0015, p.a[2]], [p.b[0], T + 0.0015, p.b[2]])
    }
    return L
  }, [])
  const d = useDrawing(lines, mat)
  const inset = useRef<THREE.Group>(null)
  useFrame(() => {
    const s = solved.current
    d.show(1 - s)
    if (inset.current) inset.current.visible = s > 0.35
  })
  useEffect(
    () => () => {
      g.dispose()
      disposeFloorKit(m)
    },
    [g, m],
  )
  const n = Math.floor((C - 0.01) / PITCH)
  return (
    <group position={[0, -T / 2, 0]}>
      <mesh geometry={g} material={m.screed} />
      <primitive object={d.obj} />
      <group ref={inset} position={[S - C / 2, T * 0.42 + 0.006, S - C / 2]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <Suspense fallback={null}>
          <MeshInset nx={n} ny={n} lod={2} />
        </Suspense>
      </group>
    </group>
  )
}

function Agv({ solved }: { solved: { current: number } }) {
  const m = useMemo(floorKit, [])
  const s = useBlock(0.1, 60)
  const mats = useMemo(() => ({ body: ink(1.25, '#080808', 1), fan: ink(1, '#080808', 0.8) }), [])
  useInkResolution(useMemo(() => Object.values(mats), [mats]))
  const lines = useMemo(() => {
    const P = new Lines()
    podLines(P)
    const F = new Lines()
    const n = 11
    let last: number[] | null = null
    for (let i = 0; i < n; i++) {
      const a = -0.6 + (1.2 * i) / (n - 1)
      const e = [Math.sin(a) * 1.1, -0.34, Math.cos(a) * 1.1]
      F.seg([0, 0, 0], e)
      if (last) F.seg(last, e)
      last = e
    }
    return { pod: P, fan: F }
  }, [])
  const pod = useDrawing(lines.pod, mats.body)
  const fan = useDrawing(lines.fan, mats.fan)
  const body = useRef<THREE.Group>(null)
  const beam = useRef<THREE.Group>(null)
  useFrame(() => {
    const k = 1 - solved.current
    if (body.current) body.current.rotation.x = (6 * k * Math.PI) / 180
    if (beam.current) beam.current.rotation.set((-12 * k * Math.PI) / 180, (24 * k * Math.PI) / 180, (9 * k * Math.PI) / 180)
  })
  useEffect(
    () => () => {
      s.top.dispose()
      s.body.dispose()
      s.seam.dispose()
      disposeFloorKit(m)
    },
    [m, s],
  )
  return (
    <group>
      <Floor s={s} surface={m.screed} solved={solved} />
      <group ref={body} position={[0.06, 0.003, -0.12]} scale={0.33}>
        <primitive object={pod.obj} />
        <group position={POD.lidar}>
          <group ref={beam}>
            <primitive object={fan.obj} />
          </group>
        </group>
      </group>
    </group>
  )
}

function Dust({ solved, live }: { solved: { current: number }; live: { current: boolean } }) {
  const S = 0.45
  const m = useMemo(floorKit, [])
  const dust = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d7d3c9', transparent: true, toneMapped: false, depthWrite: false }), [])
  const coat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b5b9b6', roughness: 0.14, transparent: true, envMapIntensity: 1.1 }), [])
  // the surface scoured by traffic: wheel tracks and open grain, from a canvas
  const worn = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const x = c.getContext('2d')!
    x.fillStyle = '#aaa59b'
    x.fillRect(0, 0, 512, 512)
    let s = 37
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 9000; i++) {
      const v = 90 + rnd() * 95
      x.fillStyle = `rgba(${v},${v - 3},${v - 9},${0.2 + rnd() * 0.5})`
      x.beginPath()
      x.arc(rnd() * 512, rnd() * 512, rnd() * 2.6 + 0.4, 0, Math.PI * 2)
      x.fill()
    }
    for (const tx of [130, 170, 340, 380]) {
      x.fillStyle = 'rgba(70,67,62,0.3)'
      x.fillRect(tx, 0, 26, 512)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.96, transparent: true })
  }, [])
  const g = useMemo(() => {
    const face = new THREE.PlaneGeometry(2 * S, 2 * S).rotateX(-Math.PI / 2).translate(0, T + 0.0005, 0)
    return { body: uvBox(block([-S, 0, -S], [S, T, S]), 3), face, coat: block([-S, T, -S], [S, T + 0.005, S]), mote: new THREE.BoxGeometry(0.004, 0.004, 0.004) }
  }, [])
  const seeds = useMemo(() => {
    let s = 53
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    return Array.from({ length: 110 }, () => [rnd() * 2 * S - S, rnd() * 2 * S - S, rnd(), 0.6 + rnd() * 0.8])
  }, [])
  const motes = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => new THREE.Matrix4(), [])
  const top = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const k = solved.current
    dust.opacity = 0.95 * (1 - THREE.MathUtils.smoothstep(k, 0.05, 0.4))
    coat.opacity = THREE.MathUtils.smoothstep(k, 0.2, 0.75)
    if (top.current) top.current.visible = coat.opacity > 0.01
    const mo = motes.current
    if (!mo) return
    mo.visible = dust.opacity > 0.01
    if (!mo.visible) return
    const t = live.current ? performance.now() / 1000 : 0
    seeds.forEach(([x, z, ph, sp], i) => {
      const a = (t * 0.13 * sp + ph) % 1
      mat.makeTranslation(x + Math.sin(t * 0.7 + ph * 9) * 0.02, T + a * 0.34, z + Math.cos(t * 0.6 + ph * 7) * 0.02)
      mo.setMatrixAt(i, mat)
    })
    mo.instanceMatrix.needsUpdate = true
  })
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      worn.map?.dispose()
      worn.dispose()
      coat.dispose()
      dust.dispose()
      disposeFloorKit(m)
    },
    [g, m, worn, coat, dust],
  )
  return (
    <group position={[0, -T / 2, 0]}>
      <mesh geometry={g.body} material={m.screed} />
      <mesh geometry={g.face} material={worn} />
      <mesh ref={top} geometry={g.coat} material={coat} visible={false} />
      <instancedMesh ref={motes} args={[g.mote, dust, seeds.length]} />
    </group>
  )
}

const VIEW: Record<ProblemKind, { dist: number; elev: number; y: number; turn: number }> = {
  spall: { dist: 3.1, elev: 30, y: -0.03, turn: -0.62 },
  crack: { dist: 3.1, elev: 31, y: 0, turn: -0.6 },
  agv: { dist: 3.5, elev: 24, y: 0.04, turn: -0.72 },
  dust: { dist: 3.1, elev: 27, y: 0.03, turn: -0.62 },
}

export function ProblemSample({ kind, solved, live }: { kind: ProblemKind; solved: { current: number }; live: { current: boolean } }) {
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
    if (turn.current) turn.current.rotation.y = v.turn + (reduced ? 0 : 0.2 * Math.sin((t * Math.PI * 2) / 11))
    const s = solved.current
    if ((live.current && !reduced) || s !== last.current) invalidate()
    last.current = s
  }, -1)
  return (
    <>
      <Wake live={live} />
      <group ref={turn}>
        {kind === 'spall' && <Spall solved={solved} />}
        {kind === 'crack' && <Crack solved={solved} />}
        {kind === 'agv' && <Agv solved={solved} />}
        {kind === 'dust' && <Dust solved={solved} live={live} />}
      </group>
    </>
  )
}
