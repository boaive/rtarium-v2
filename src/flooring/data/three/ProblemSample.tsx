import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../../../facade/three/MeshInset'
import { block, merge } from '../../../facade/three/unit/parts'
import { Wake } from '../../../facade/three/rain/lines'
import { prefersReducedMotion } from '../../../lib/motion'
import { disposeFloorKit, floorKit, hollowCore, layer, PITCH, PLANK, uvBox } from './dc'

/**
 * A problem's sample, for its card: a small piece turning a little in its own time, seen first as the
 * problem and then, as the card is answered (`solved` 0..1, read every frame), as RTARIUM makes it.
 *
 *   deflect  a hollow-core plank under a 45 mm topping, sagging (drawn many times what it is), seen
 *            from its side; the topping thins to 20 mm of RTARIUM screed and the plank comes level
 *   dust     a screed cut back at a corner to its steel fibres, fine metal dust lifting off it; the
 *            fibres give way to RTARIUM in the cut, and the dust settles and is gone
 *   esd      an ESD-coated floor, its path to ground (yellow) broken where a crack and blisters run
 *            through the coat; the coat closes smooth and the path runs on unbroken
 */

export type ProblemKind = 'deflect' | 'dust' | 'esd'

let seed = 23
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

/**
 * lets a material bend down along z by `uSag` at the middle of a span of `len` (a vertex shader
 * change); with `thick`, a layer of unit height is first set to `uThick`, so it can thin as it bends
 */
function bendable(mat: THREE.MeshStandardMaterial, u: { uSag: { value: number }; uThick: { value: number } }, len: number, thick = false) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSag = u.uSag
    sh.uniforms.uThick = u.uThick
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSag;\nuniform float uThick;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${thick ? 'transformed.y *= uThick;' : ''}\nfloat sz = position.z / ${(len / 2).toFixed(4)};\ntransformed.y -= uSag * (1.0 - sz * sz);`,
      )
  }
  mat.customProgramCacheKey = () => `bend${len}${thick ? 't' : ''}`
}

function Deflect({ solved }: { solved: { current: number } }) {
  const L = 1.6
  const u = useMemo(() => ({ uSag: { value: 0 }, uThick: { value: 0.045 } }), [])
  const m = useMemo(() => {
    const k = floorKit()
    bendable(k.plank, u, L)
    bendable(k.screed, u, L, true)
    return k
  }, [u])
  const g = useMemo(() => {
    const hc = hollowCore([0], [-0.6, 0.6], [-L / 2, L / 2])
    return { plank: hc.planks, top: uvBox(block([-0.6, 0, -L / 2], [0.6, 1, L / 2]), 2) }
  }, [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      disposeFloorKit(m)
    },
    [g, m],
  )
  const heavy = useMemo(() => new THREE.Color('#8f8a82'), [])
  const light = useMemo(() => m.screed.color.clone(), [m])
  useFrame(() => {
    const s = solved.current
    // a 45 mm topping (a heavier, darker concrete) on a sagging plank, to RTARIUM's 20 mm on a level one
    u.uSag.value = 0.11 * (1 - s)
    u.uThick.value = 0.045 - 0.025 * s
    m.screed.color.copy(heavy).lerp(light, s)
  })
  return (
    <group position={[0, -0.06, 0]}>
      <mesh geometry={g.plank} material={m.plank} />
      <mesh geometry={g.top} material={m.screed} position={[0, PLANK.t, 0]} />
    </group>
  )
}

/** a piece of screed with its front right corner cut back, so what reinforces it shows */
function Dust({ solved, live }: { solved: { current: number }; live: { current: boolean } }) {
  const S = 0.34
  const T = 0.04
  const C = 0.15
  const m = useMemo(floorKit, [])
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7d8287', metalness: 0.75, roughness: 0.35, transparent: true }), [])
  const dust = useMemo(() => new THREE.MeshBasicMaterial({ color: '#b8bcc0', transparent: true, toneMapped: false, depthWrite: false }), [])
  const g = useMemo(() => {
    // the screed less its corner, cut down to the middle of its depth
    const body = merge([block([-S / 2, 0, -S / 2], [S / 2, T, S / 2 - C]), block([-S / 2, 0, S / 2 - C], [S / 2 - C, T, S / 2]), block([S / 2 - C, 0, S / 2 - C], [S / 2, T / 2 - 0.006, S / 2])])
    uvBox(body, 3)
    const fibre = new THREE.CylinderGeometry(0.0006, 0.0006, 1, 5)
    return { body, fibre, mote: new THREE.BoxGeometry(0.0016, 0.0016, 0.0016) }
  }, [])
  // the steel fibres lying every way in the cut, and the motes of dust over the face
  const fibres = useRef<THREE.InstancedMesh>(null)
  const motes = useRef<THREE.InstancedMesh>(null)
  const N = 140
  const M = 90
  const dustSeeds = useMemo(() => Array.from({ length: M }, () => [rnd() * S - S / 2, rnd() * S - S / 2, rnd(), 0.6 + rnd() * 0.8]), [])
  useEffect(() => {
    const f = fibres.current
    if (!f) return
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const dir = new THREE.Vector3()
    const mat = new THREE.Matrix4()
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2
      dir.set(Math.cos(a), (rnd() - 0.5) * 0.5, Math.sin(a)).normalize()
      q.setFromUnitVectors(up, dir)
      const len = 0.025 + rnd() * 0.012
      mat.compose(new THREE.Vector3(S / 2 - C + 0.01 + rnd() * (C - 0.02), T / 2 - 0.006 + rnd() * 0.004, S / 2 - C + 0.01 + rnd() * (C - 0.02)), q, new THREE.Vector3(1, len, 1))
      f.setMatrixAt(i, mat)
    }
    f.instanceMatrix.needsUpdate = true
  }, [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      steel.dispose()
      dust.dispose()
      disposeFloorKit(m)
    },
    [g, m, steel, dust],
  )
  const inset = useRef<THREE.Group>(null)
  const mat = useMemo(() => new THREE.Matrix4(), [])
  useFrame(() => {
    const s = solved.current
    steel.opacity = 1 - THREE.MathUtils.smoothstep(s, 0.2, 0.5)
    if (fibres.current) fibres.current.visible = steel.opacity > 0.01
    if (inset.current) inset.current.visible = s > 0.45
    // the dust lifts off the face and drifts up, in time; it settles out as the card is answered
    dust.opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(s, 0.05, 0.4))
    const mo = motes.current
    if (!mo) return
    mo.visible = dust.opacity > 0.01
    if (!mo.visible) return
    const t = live.current ? performance.now() / 1000 : 0
    dustSeeds.forEach(([x, z, ph, sp], i) => {
      const k = (t * 0.11 * sp + ph) % 1
      mat.makeTranslation(x + Math.sin(t * 0.7 + ph * 9) * 0.01, T + k * 0.2, z + Math.cos(t * 0.6 + ph * 7) * 0.01)
      mo.setMatrixAt(i, mat)
    })
    mo.instanceMatrix.needsUpdate = true
  })
  const n = Math.floor((C - 0.01) / PITCH)
  return (
    <group position={[0, -0.03, 0]}>
      <mesh geometry={g.body} material={m.screed} />
      <instancedMesh ref={fibres} args={[g.fibre, steel, N]} />
      <group ref={inset} position={[S / 2 - C / 2, T / 2 - 0.006 + 0.005, S / 2 - C / 2]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <Suspense fallback={null}>
          <MeshInset nx={n} ny={n} lod={2} />
        </Suspense>
      </group>
      <instancedMesh ref={motes} args={[g.mote, dust, M]} />
    </group>
  )
}

/** an ESD floor seen from above at an angle: the coat, a crack and blisters, the path to ground */
function Esd({ solved }: { solved: { current: number } }) {
  const S = 0.4
  const m = useMemo(floorKit, [])
  const path = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fdd001', transparent: true, toneMapped: false }), [])
  const g = useMemo(() => {
    const crack: THREE.BufferGeometry[] = []
    // the crack: a ragged line across the coat
    let x = -S / 2
    let z = -0.06
    while (x < S / 2) {
      const nx = Math.min(S / 2, x + 0.018 + rnd() * 0.02)
      const nz = z + (rnd() - 0.45) * 0.03
      const len = Math.hypot(nx - x, nz - z)
      crack.push(new THREE.BoxGeometry(len, 0.0014, 0.0016).rotateY(-Math.atan2(nz - z, nx - x)).translate((x + nx) / 2, 0.0237, (z + nz) / 2))
      x = nx
      z = nz
    }
    const blisters = merge(
      Array.from({ length: 9 }, () => {
        const r = 0.006 + rnd() * 0.008
        return new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(rnd() * 0.3 - 0.15, 0.023, rnd() * 0.16 - 0.14).toNonIndexed()
      }),
    )
    return {
      screed: layer([-S / 2, S / 2], [-S / 2, S / 2], 0, 0.02, 3),
      coat: layer([-S / 2, S / 2], [-S / 2, S / 2], 0.02, 0.003, 3),
      crack: merge(crack.map((c) => c.toNonIndexed())),
      blisters,
      // the path to ground across the coat, to a grounding point at its edge; the gap where the crack cuts it
      pathA: block([-S / 2, 0.0232, 0.07], [-0.03, 0.0236, 0.078]),
      pathB: block([0.005, 0.0232, 0.07], [S / 2, 0.0236, 0.078]),
      pathGap: block([-0.03, 0.0232, 0.07], [0.005, 0.0236, 0.078]),
      ground: block([S / 2 - 0.03, 0.0232, 0.058], [S / 2, 0.0242, 0.09]),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      path.dispose()
      disposeFloorKit(m)
    },
    [g, m, path],
  )
  const flaws = useRef<THREE.Group>(null)
  const gap = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const s = solved.current
    const k = THREE.MathUtils.smoothstep(s, 0.15, 0.6)
    if (flaws.current) {
      flaws.current.scale.y = Math.max(0.001, 1 - k)
      flaws.current.visible = k < 0.999
    }
    if (gap.current) gap.current.visible = s > 0.55
  })
  return (
    <group position={[0, -0.01, 0]}>
      <mesh geometry={g.screed} material={m.screed} />
      <mesh geometry={g.coat} material={m.esd} />
      <group ref={flaws}>
        <mesh geometry={g.crack} material={m.ink} />
        <mesh geometry={g.blisters} material={m.esd} />
      </group>
      <mesh geometry={g.pathA} material={path} />
      <mesh geometry={g.pathB} material={path} />
      <mesh ref={gap} geometry={g.pathGap} material={path} visible={false} />
      <mesh geometry={g.ground} material={m.steel} />
    </group>
  )
}

/** each sample's own view: how far, how high, and its size, so all three fill their frame alike */
const VIEW: Record<ProblemKind, { dist: number; elev: number; y: number; turn: number }> = {
  deflect: { dist: 5.2, elev: 9, y: -0.02, turn: -1.2 },
  dust: { dist: 1.45, elev: 26, y: 0.02, turn: -0.62 },
  esd: { dist: 1.5, elev: 40, y: 0, turn: -0.62 },
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
    // keep drawing while it turns on screen, or while its answer is still coming in
    const s = solved.current
    if ((live.current && !reduced) || s !== last.current) invalidate()
    last.current = s
  }, -1)
  return (
    <>
      <Wake live={live} />
      <group ref={turn}>
        {kind === 'deflect' && <Deflect solved={solved} />}
        {kind === 'dust' && <Dust solved={solved} live={live} />}
        {kind === 'esd' && <Esd solved={solved} />}
      </group>
    </>
  )
}
