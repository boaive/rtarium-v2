import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshField, useCell, useYarnMaterial } from '../../three/mesh/MeshField'
import { Anchor } from '../../facade/three/Stage3D'
import type { LabelBus } from '../../facade/three/kit'
import { merge } from '../../facade/three/unit/parts'
import { smooth } from '../../facade/progress'
import {
  disposeWallKit,
  fade,
  ferruleBody,
  ferruleBore,
  ferruleRim,
  GRID_Y,
  gridX,
  MM,
  PIECE,
  ROD_R,
  ROD_Z,
  S100,
  S30,
  slab,
  tieGeometry,
  useWallTextures,
  W,
  wallKit,
} from './kit'

/**
 * One wall panel, in its own materials, that can be the 30 mm solid panel, the 100 mm SIP panel, or on
 * its way from one to the other, and can be opened up. Its first metre (`PIECE`) is the piece it is
 * opened on; the rest of its length can fade away so the piece stands as a section model, cut where
 * the rest was.
 *
 * What it shows is read every frame from `pose`:
 *   morph    0..1  the 30 mm panel swells to the 100 mm one, closed all the way (no inside shown): its
 *                  two halves move apart only as fast as the core grows between them
 *   build    0..3  the same, opened: the halves part (0..1), the EPS/SPS core slides in between (1..2)
 *                  and the halves close onto it (2..3)
 *   burst    0..1  the layers stand apart, the ferrules drawn out of their face
 *   inside   0..1  the concrete round the meshes goes, so RTARIUM shows
 *   rest     0..1  how much of the panel beyond the piece is seen
 *   grow     0..1  how far the rest reaches from the piece (0: the piece alone, 1: the whole length)
 *   ties     0..1  the tie-clips go into the core and the GRP rods run through them (100 mm, opened)
 */
export interface PanelPose {
  morph: number
  build: number
  burst: number
  inside: number
  rest: number
  grow: number
  ties: number
}

export const restPose = (): PanelPose => ({ morph: 0, build: 0, burst: 0, inside: 0, rest: 1, grow: 1, ties: 1 })

/** how far the halves stand apart while the core goes in (m from the middle to each half's inner face) */
const OPEN = 0.16
/** the steps the layers stand apart in an opened panel (m) */
const GAP30 = 0.085
const GAP100 = 0.06

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** RTARIUM as the homepage models it, `t` mm thick, `nx` × `ny` cells, centred, its face looking out along +z */
export function Rtarium({ t, nx, ny }: { t: 6 | 15; nx: number; ny: number }) {
  const cell = useCell(t)
  const yarn = useYarnMaterial({ lite: true })
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate(), [invalidate, cell, yarn])
  useEffect(() => {
    const u = yarn.uniforms
    u.uFaceColor.value.set('#a07a55')
    u.uPileColor.value.set('#4a3322')
    u.uWin.value.set(4096, 4096)
    u.uAoStrength.value = 0.9
  }, [yarn])
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <MeshField cell={cell} nx={nx} nz={ny} material={yarn.material} chunk={10} lodDistance={0.5} farDistance={1.5} culling={false} />
    </group>
  )
}

export interface PanelIds {
  /** anchors for the labels, by what they mark */
  [k: string]: string
}

export function Panel({
  len,
  piece = PIECE,
  pose,
  bus,
  meshes = true,
  ids = {},
}: {
  len: number
  /** the piece the panel is opened on (its whole length when it is never opened) */
  piece?: number
  pose: { current: PanelPose }
  bus?: LabelBus
  /** whether RTARIUM is modelled inside (only a panel that is opened needs it) */
  meshes?: boolean
  ids?: PanelIds
}) {
  const tex = useWallTextures()
  const m = useMemo(() => wallKit(tex), [tex])
  const P = Math.min(piece, len)
  const hasRest = len - P > 0.01
  const g = useMemo(() => {
    const { cover, zone, key, tongue } = S30
    const c0 = zone / 2
    const c1 = c0 + cover
    const { outer, mesh, inner, core, recess } = S100
    const k0 = core / 2
    const k1 = k0 + inner
    const k2 = k1 + mesh
    const k3 = k2 + outer
    const o = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => slab(x0, x1, y0, y1, z0, z1)
    return {
      // the 30 mm panel: its covers, and the zone between them (two skins and the 10 mm key that stands proud)
      c30In: o(0, P, 0, W, c0, c1),
      c30Out: o(0, P, 0, W, -c1, -c0),
      // the 15 mm RTARIUM zone stands 15 mm proud on two sides (the tongue) and 15 mm short on the other two
      // (the recess); a piece cut from a longer panel ends flush where it was cut, a whole panel has its far end's
      z30: o(tongue, hasRest ? P : P + tongue, tongue, W + tongue, -key / 2, key / 2),
      rest30: hasRest ? merge([o(P, len, 0, W, -c1, -c0), o(P, len + tongue, tongue, W + tongue, -key / 2, key / 2), o(P, len, 0, W, c0, c1)]) : null,
      // the 100 mm panel, layer by layer from the core out; its core 20 mm proud along the top and the far end
      k100: o(recess, hasRest ? P : P + recess, recess, W + recess, -k0, k0),
      i100In: o(0, P, 0, W, k0, k1),
      i100Out: o(0, P, 0, W, -k1, -k0),
      m100In: o(0, P, 0, W, k1, k2),
      m100Out: o(0, P, 0, W, -k2, -k1),
      o100In: o(0, P, 0, W, k2, k3),
      o100Out: o(0, P, 0, W, -k3, -k2),
      rest100: hasRest ? merge([o(P, len, 0, W, -k3, -k0), o(P, len, 0, W, k0, k3)]) : null,
      restCore: hasRest ? o(P, len + recess, recess, W + recess, -k0, k0) : null,
      // the halves on their way: a 7.5 mm cover and its half of the zone (7.5 mm) each; the core one unit (70 mm) thick
      leaf: o(0, P, 0, W, 0, 7.5 * MM),
      keyHalf: o(0, P, 0, W, 0, 7.5 * MM),
      coreUnit: o(0, P, 0, W, -k0, k0),
      tie: tieGeometry(),
      rod: new THREE.CylinderGeometry(ROD_R, ROD_R, 1, 10).rotateZ(Math.PI / 2).translate(0.5, 0, 0),
      rim: ferruleRim(),
      bore: ferruleBore(),
      sleeve30: ferruleBody(18 * MM),
      sleeve100: ferruleBody(12 * MM),
    }
  }, [P, len, hasRest])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x?.dispose())
      disposeWallKit(m)
    },
    [g, m],
  )

  /** the ferrules and tie-clips on their grid: in the piece, and along the rest */
  const spots = useMemo(() => {
    const xs = gridX(len)
    const all = xs.flatMap((x) => GRID_Y.map((y) => [x, y] as [number, number]))
    return { piece: all.filter(([x]) => x < P), rest: all.filter(([x]) => x >= P), ties: all.filter(([x]) => x < P) }
  }, [len, P])
  const place = (list: [number, number][], z = 0) => (el: THREE.InstancedMesh | null) => {
    if (!el) return
    const mx = new THREE.Matrix4()
    list.forEach(([x, y], i) => el.setMatrixAt(i, mx.makeTranslation(x, y, z)))
    el.instanceMatrix.needsUpdate = true
    el.computeBoundingSphere()
  }

  const r = {
    s30: useRef<THREE.Group>(null),
    c30In: useRef<THREE.Group>(null),
    c30Out: useRef<THREE.Group>(null),
    z30: useRef<THREE.Group>(null),
    f30: useRef<THREE.Group>(null),
    mesh30: useRef<THREE.Group>(null),
    rest30: useRef<THREE.Mesh>(null),
    split: useRef<THREE.Group>(null),
    leafIn: useRef<THREE.Group>(null),
    leafOut: useRef<THREE.Group>(null),
    keyIn: useRef<THREE.Mesh>(null),
    keyOut: useRef<THREE.Mesh>(null),
    core: useRef<THREE.Mesh>(null),
    fSplit: useRef<THREE.Group>(null),
    s100: useRef<THREE.Group>(null),
    i100In: useRef<THREE.Group>(null),
    i100Out: useRef<THREE.Group>(null),
    m100In: useRef<THREE.Group>(null),
    mesh100In: useRef<THREE.Group>(null),
    mesh100Out: useRef<THREE.Group>(null),
    m100Out: useRef<THREE.Group>(null),
    o100In: useRef<THREE.Group>(null),
    o100Out: useRef<THREE.Group>(null),
    f100: useRef<THREE.Group>(null),
    ties: useRef<THREE.Group>(null),
    rods: useRef<THREE.Group>(null),
    rest100: useRef<THREE.Group>(null),
    restF: useRef<THREE.Group>(null),
  }

  useFrame(() => {
    const p = pose.current
    const morph = Math.min(1, Math.max(0, p.morph))
    const build = Math.min(3, Math.max(0, p.build))
    const b = ease(Math.min(1, Math.max(0, p.burst)))
    const inside = Math.min(1, Math.max(0, p.inside))
    const is30 = morph <= 0 && build <= 0
    const is100 = morph >= 1 || build >= 3
    const between = !is30 && !is100
    const set = (o: THREE.Object3D | null, v: boolean) => o && (o.visible = v)
    set(r.s30.current, is30)
    set(r.split.current, between)
    set(r.s100.current, is100)

    // the rest of the panel, beyond the piece
    const rest = Math.min(1, Math.max(0, p.rest))
    fade(m.rest, rest)
    fade(m.restCore, rest)
    // the rest grows out of the piece's cut end: scaled along its length about that end
    const gw = Math.min(1, Math.max(0, p.grow))
    set(r.rest30.current, hasRest && is30 && gw > 0.002)
    set(r.rest100.current, hasRest && is100 && gw > 0.002)
    for (const o of [r.rest30.current, r.rest100.current]) {
      if (!o) continue
      o.position.x = P * (1 - gw)
      o.scale.x = Math.max(1e-3, gw)
    }
    set(r.restF.current, hasRest && rest > 0.98 && gw > 0.995 && !between)
    // the concrete round the meshes, a ghost once the panel is open
    fade(m.zone, 1 - inside)

    if (is30) {
      const d = GAP30 * 1.25 * b
      r.c30In.current?.position.set(0, 0, d)
      r.c30Out.current?.position.set(0, 0, -d)
      r.f30.current?.position.set(0, 0, d + GAP30 * 1.15 * b)
      set(r.mesh30.current, inside > 0.01)
      if (r.restF.current) r.restF.current.position.z = S30.cover + S30.zone / 2
    }

    if (between) {
      // how far each half stands from the middle, how thick the core is, and how far the keys still stand proud
      let d: number
      let coreT: number
      let coreX = 0
      let key: number
      if (morph > 0) {
        d = morph * (S100.core / 2)
        coreT = 2 * d
        key = 1 - morph
      } else {
        const a = smooth(0, 1, build)
        d = build < 1 ? OPEN * ease(a) : build < 2 ? OPEN : OPEN + (S100.core / 2 - OPEN) * ease(build - 2)
        coreT = build < 1 ? 0 : S100.core
        // it slides in from just off the piece's cut end, coming into sight as it starts
        coreX = build < 1 ? 0 : (1 - ease(Math.min(1, build - 1))) * Math.min(0.45, P * 0.5)
        key = 1 - smooth(0.15, 0.85, build)
      }
      const off = S30.tongue * key
      r.leafIn.current?.position.set(0, 0, d)
      r.leafOut.current?.position.set(0, 0, -d)
      // each half's half of the key: against its leaf's inner face, standing proud by `off`
      // (a cut piece's keys keep flush with the cut: they shorten as they stand proud)
      const kx = hasRest ? (P - off) / P : 1
      for (const k of [r.keyIn.current, r.keyOut.current]) {
        k?.position.set(off, off, 0)
        k?.scale.set(kx, 1, 1)
      }
      fade(m.core, morph > 0 ? 1 : smooth(1, 1.2, build))
      const c = r.core.current
      if (c) {
        c.visible = coreT > 0.0005
        c.scale.z = Math.max(1e-3, coreT / S100.core)
        const pr = S100.recess * (morph > 0 ? morph : 1)
        c.position.set(pr + coreX, pr, 0)
        c.scale.x = hasRest ? (P - pr) / P : 1
      }
      r.fSplit.current?.position.set(0, 0, d + 15 * MM)
      if (r.restF.current) r.restF.current.position.z = d + 15 * MM
    }

    if (is100) {
      fade(m.core, 1)
      const s = GAP100 * b
      r.i100In.current?.position.set(0, 0, s)
      r.i100Out.current?.position.set(0, 0, -s)
      r.m100In.current?.position.set(0, 0, 2 * s)
      r.m100Out.current?.position.set(0, 0, -2 * s)
      r.o100In.current?.position.set(0, 0, 3 * s)
      r.o100Out.current?.position.set(0, 0, -3 * s)
      set(r.mesh100In.current, inside > 0.01)
      set(r.mesh100Out.current, inside > 0.01)
      r.f100.current?.position.set(0, 0, S100.core / 2 + S100.leaf + 3 * s + GAP100 * 1.2 * b)
      // the tie-clips come down into the core, then the rods run through their lugs
      const t = Math.min(1, Math.max(0, p.ties))
      const drop = 1 - ease(smooth(0, 0.55, t))
      if (r.ties.current) {
        r.ties.current.visible = t > 0.01
        r.ties.current.position.y = drop * 0.32
      }
      if (r.rods.current) {
        const run = ease(smooth(0.5, 1, t))
        r.rods.current.visible = run > 0.01
        r.rods.current.scale.x = Math.max(1e-3, run)
      }
      if (r.restF.current) r.restF.current.position.z = S100.core / 2 + S100.leaf
    }
  }, -2)

  const bodyZ30 = S30.cover + S30.zone / 2
  const bodyZ100 = S100.core / 2 + S100.leaf
  const nx = Math.round(P / 0.012)
  const ny = Math.round(W / 0.012)
  const at = (k: string) => ids[k]

  return (
    <group>
      {/* ---- 30 mm solid ---- */}
      <group ref={r.s30}>
        <group ref={r.c30In}>
          <mesh geometry={g.c30In} material={m.concrete} castShadow receiveShadow />
          {bus && at('cover') && <Anchor bus={bus} id={at('cover')} position={[P * 0.62, W * 0.78, bodyZ30]} />}
          {bus && at('thick') && <Anchor bus={bus} id={at('thick')} position={[P, W * 0.08, S30.cover]} />}
        </group>
        <group ref={r.c30Out}>
          <mesh geometry={g.c30Out} material={m.concrete} castShadow receiveShadow />
          {bus && at('back') && <Anchor bus={bus} id={at('back')} position={[P, W * 0.9, -bodyZ30]} />}
        </group>
        <group ref={r.z30}>
          <mesh geometry={g.z30} material={m.zone} castShadow receiveShadow />
          <group ref={r.mesh30} position={[P / 2, W / 2, 0]} visible={false}>
            {meshes && (
              <Suspense fallback={null}>
                <Rtarium t={15} nx={nx} ny={ny} />
              </Suspense>
            )}
          </group>
          {bus && at('mesh') && <Anchor bus={bus} id={at('mesh')} position={[P * 0.82, W * 0.3, 0]} />}
          {bus && at('joint') && <Anchor bus={bus} id={at('joint')} position={[P * 0.4, W + S30.tongue, 0]} />}
        </group>
        <group ref={r.f30}>
          <instancedMesh args={[g.rim, m.zinc, spots.piece.length]} ref={place(spots.piece, bodyZ30 + 0.0003)} />
          <instancedMesh args={[g.bore, m.bore, spots.piece.length]} ref={place(spots.piece, bodyZ30 + 0.0007)} />
          <instancedMesh args={[g.sleeve30, m.zinc, spots.piece.length]} ref={place(spots.piece, bodyZ30)} />
          {bus && at('ferrule') && <Anchor bus={bus} id={at('ferrule')} position={[spots.piece[1]?.[0] ?? 0.1, spots.piece[1]?.[1] ?? 0.5, bodyZ30]} />}
        </group>
        {g.rest30 && <mesh ref={r.rest30} geometry={g.rest30} material={m.rest} castShadow receiveShadow />}
      </group>

      {/* ---- on the way: two halves, their keys, the core between ---- */}
      <group ref={r.split} visible={false}>
        <group ref={r.leafIn}>
          <mesh geometry={g.leaf} material={m.concrete} position={[0, 0, 7.5 * MM]} castShadow receiveShadow />
          <mesh ref={r.keyIn} geometry={g.keyHalf} material={m.concrete} castShadow receiveShadow />
        </group>
        <group ref={r.leafOut} scale={[1, 1, -1]}>
          <mesh geometry={g.leaf} material={m.concrete} position={[0, 0, 7.5 * MM]} castShadow receiveShadow />
          <mesh ref={r.keyOut} geometry={g.keyHalf} material={m.concrete} castShadow receiveShadow />
        </group>
        <mesh ref={r.core} geometry={g.coreUnit} material={m.core} castShadow receiveShadow />
        <group ref={r.fSplit}>
          <instancedMesh args={[g.rim, m.zinc, spots.piece.length]} ref={place(spots.piece, 0.0003)} />
          <instancedMesh args={[g.bore, m.bore, spots.piece.length]} ref={place(spots.piece, 0.0007)} />
        </group>
      </group>

      {/* ---- 100 mm SIP ---- */}
      <group ref={r.s100} visible={false}>
        <mesh geometry={g.k100} material={m.core} castShadow receiveShadow />
        {bus && at('core') && <Anchor bus={bus} id={at('core')} position={[P * 0.55, W + S100.recess, 0]} />}
        {bus && at('recess') && <Anchor bus={bus} id={at('recess')} position={[S100.recess, W * 0.3, S100.core / 2]} />}
        <group ref={r.i100In}>
          <mesh geometry={g.i100In} material={m.concrete} castShadow receiveShadow />
        </group>
        <group ref={r.i100Out}>
          <mesh geometry={g.i100Out} material={m.concrete} castShadow receiveShadow />
        </group>
        <group ref={r.m100In}>
          <mesh geometry={g.m100In} material={m.zone} castShadow receiveShadow />
          <group ref={r.mesh100In} position={[P / 2, W / 2, S100.core / 2 + S100.inner + S100.mesh / 2]} visible={false}>
            {meshes && (
              <Suspense fallback={null}>
                <Rtarium t={6} nx={nx} ny={ny} />
              </Suspense>
            )}
          </group>
          {bus && at('mesh100') && <Anchor bus={bus} id={at('mesh100')} position={[P * 0.86, W * 0.62, S100.core / 2 + S100.inner + S100.mesh / 2]} />}
        </group>
        <group ref={r.m100Out}>
          <mesh geometry={g.m100Out} material={m.zone} castShadow receiveShadow />
          <group ref={r.mesh100Out} position={[P / 2, W / 2, -(S100.core / 2 + S100.inner + S100.mesh / 2)]} visible={false}>
            {meshes && (
              <Suspense fallback={null}>
                <Rtarium t={6} nx={nx} ny={ny} />
              </Suspense>
            )}
          </group>
        </group>
        <group ref={r.o100In}>
          <mesh geometry={g.o100In} material={m.concrete} castShadow receiveShadow />
          {bus && at('cover100') && <Anchor bus={bus} id={at('cover100')} position={[P * 0.62, W * 0.8, bodyZ100]} />}
        </group>
        <group ref={r.o100Out}>
          <mesh geometry={g.o100Out} material={m.concrete} castShadow receiveShadow />
        </group>
        <group ref={r.f100}>
          <instancedMesh args={[g.rim, m.zinc, spots.piece.length]} ref={place(spots.piece, 0.0003)} />
          <instancedMesh args={[g.bore, m.bore, spots.piece.length]} ref={place(spots.piece, 0.0007)} />
          <instancedMesh args={[g.sleeve100, m.zinc, spots.piece.length]} ref={place(spots.piece, 0)} />
          {bus && at('ferrule100') && <Anchor bus={bus} id={at('ferrule100')} position={[spots.piece[1]?.[0] ?? 0.1, spots.piece[1]?.[1] ?? 0.5, 0]} />}
        </group>
        <group ref={r.ties} visible={false}>
          <instancedMesh args={[g.tie, m.galv, spots.ties.length]} ref={place(spots.ties)} castShadow />
          {bus && at('tie') && <Anchor bus={bus} id={at('tie')} position={[spots.ties[0]?.[0] ?? 0.1, (spots.ties[0]?.[1] ?? 0.1) + 0.01, S100.core / 2]} />}
        </group>
        <group ref={r.rods} visible={false}>
          {GRID_Y.flatMap((y) =>
            [ROD_Z, -ROD_Z].map((z) => <mesh key={`${y}${z}`} geometry={g.rod} material={m.grp} position={[0, y, z]} scale={[P, 1, 1]} />),
          )}
          {bus && at('rod') && <Anchor bus={bus} id={at('rod')} position={[P * 0.7, GRID_Y[0], ROD_Z]} />}
        </group>
        {g.rest100 && (
          <group ref={r.rest100}>
            <mesh geometry={g.rest100} material={m.rest} castShadow receiveShadow />
            {g.restCore && <mesh geometry={g.restCore} material={m.restCore} castShadow receiveShadow />}
          </group>
        )}
      </group>
      {/* the ferrules along the rest of the panel */}
      {spots.rest.length > 0 && (
        <group ref={r.restF}>
          <instancedMesh args={[g.rim, m.zinc, spots.rest.length]} ref={place(spots.rest, 0.0003)} />
          <instancedMesh args={[g.bore, m.bore, spots.rest.length]} ref={place(spots.rest, 0.0007)} />
        </group>
      )}
    </group>
  )
}
