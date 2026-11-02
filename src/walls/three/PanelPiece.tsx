import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Anchor } from '../../facade/three/Stage3D'
import type { LabelBus } from '../../facade/three/kit'
import { smooth } from '../../facade/progress'
import { Rtarium } from './Panel'
import { disposeWallKit, faceEdge, fade, MM, slab, slabs, useWallTextures, wallKit } from './kit'
import {
  CLIPS,
  clipGeometry,
  FERRULES,
  ferruleGeometry,
  GRP_ACROSS,
  GRP_ALONG,
  GRP_R,
  J,
  layer,
  mouthGeometry,
  PW,
  rodGeometry,
  ROD_LINES,
  sleeveGeometry,
  T100,
  T30,
  TIE_HOLES,
  tongueHalfGeometry,
  zoneGeometry,
} from './piece'

/**
 * One piece of panel, upright (see piece.ts), that is the 30 mm solid panel, can open up, and divides into the
 * 100 mm SIP panel, which can open up too. Read every frame from `pose`:
 *
 *   stage  0     the 30 mm panel
 *          0..1  it divides down its middle into two 15 mm leaves (its tongue and recess go into the core's)
 *          1..2  the EPS/SPS core slides in between them
 *          2..3  the leaves close onto the core: 3 is the 100 mm panel
 *   burst  0..1  its layers stand apart through its thickness, all at once, as the Unitized unit's do
 *   open   0..1  the concrete round the RTARIUM goes, so the mesh, its GRP rods and the ferrules on it show
 *
 * Every layer is the panel's own cast concrete (the photographs' face, and their rougher edge on the edges and
 * cuts); the core is EPS/SPS; the steel and the GRP are theirs.
 */

export interface PiecePose {
  stage: number
  burst: number
  open: number
}

/** how far apart the layers stand when opened (m, through the panel's thickness): seen from the side, each one whole;
 *  the SIP's seven a little further apart than they need, so its thin covers read as layers of their own */
const GAP30 = 0.32
const GAP100 = 0.27
/** the 30 mm panel's ferrules, drawn off the mesh between it and the cover, so they read as a part of their own */
const FERRULE_OUT = 0.13
/** how far each half stands from the middle while the core goes in */
const OPEN = 0.15

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** the layers part one after another, the outermost first (k: how far out it is, 0..1 of the stack's half) */
const stagger = (b: number, k: number) => ease(Math.min(1, Math.max(0, (b - 0.22 * (1 - k)) / (1 - 0.22 * (1 - k)))))

export function PanelPiece({ len, pose, bus, meshes = true }: { len: number; pose: { current: PiecePose }; bus?: LabelBus; meshes?: boolean }) {
  const tex = useWallTextures()
  const m = useMemo(() => {
    const k = wallKit(tex)
    // a cut or an opened layer shows its inside as cast concrete, both sides
    const sleeve = new THREE.MeshStandardMaterial({ color: '#2c2c2b', roughness: 0.6, transparent: true })
    const ghost = k.zone
    ghost.userData.base = 1
    return { ...k, sleeve, ghost }
  }, [tex])
  const w = PW
  const L = len
  const h = T30.zone / 2
  const c1 = h + T30.cover

  const g = useMemo(() => {
    const { outer, mesh, inner, core, recess } = T100
    const k0 = core / 2
    const k1 = k0 + inner
    const k2 = k1 + mesh
    const k3 = k2 + outer
    return {
      // 30 mm: its covers, its RTARIUM zone with the joint (the zone starts 15 mm up: the recess at the foot)
      cover30: layer(0, w, 0, L, h, c1),
      zone30: zoneGeometry(w, J, L),
      // the halves while it divides: a cover each, and half the zone, whose tongue and recess go
      half: faceEdge(zoneGeometry(w, J, L, 'front')),
      tongue: faceEdge(tongueHalfGeometry(w, J, L)),
      fill: slabs([slab(0, J, 0, L, 0, h)]),
      foot: slabs([slab(0, w, 0, J, 0, h)]),
      // 100 mm: layer by layer from the core out, and the core: 20 mm proud on the right, 20 mm short on the left and at the foot
      outer: layer(0, w, 0, L, k2, k3),
      zone: layer(0, w, 0, L, k1, k2),
      inner: layer(0, w, 0, L, k0, k1),
      core: slab(recess, w + recess, recess, L, -k0, k0),
      // the parts
      // (the 3 mm rods drawn a little heavier than they are, so they read at this size)
      rod: rodGeometry(3.2 * MM),
      clip: clipGeometry(),
      ferrule30: ferruleGeometry(0.02),
      ferrule100: ferruleGeometry(0.013),
      mouthF: mouthGeometry(4 * MM),
      mouthT: mouthGeometry(7 * MM),
      sleeve30c: sleeveGeometry(T30.cover),
      sleeve30z: sleeveGeometry(T30.zone),
      sleeve100: [sleeveGeometry(outer), sleeveGeometry(mesh), sleeveGeometry(inner), sleeveGeometry(core)],
    }
  }, [w, L, h, c1])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => (Array.isArray(x) ? x.forEach((y) => y.dispose()) : x.dispose()))
      m.sleeve.dispose()
      disposeWallKit(m)
    },
    [g, m],
  )

  const ferrules = useMemo(() => FERRULES(L), [L])
  const ties = useMemo(() => TIE_HOLES(L), [L])
  const across = useMemo(() => GRP_ACROSS(L), [L])
  const clipLines = useMemo(() => CLIPS(L), [L])
  const clips = useMemo(() => clipLines.flatMap((y) => ROD_LINES.map((x) => [x, y] as [number, number])), [clipLines])
  const conc = [m.concrete, m.edge, m.outer]
  /** a layer turned about (scale z −1) shows its geometry's back as its front: its faces swap materials */
  const turned = [m.outer, m.edge, m.concrete]

  const r = {
    g30: useRef<THREE.Group>(null),
    front30: useRef<THREE.Group>(null),
    zone30: useRef<THREE.Group>(null),
    back30: useRef<THREE.Group>(null),
    mesh30: useRef<THREE.Group>(null),
    ferrules30: useRef<THREE.Group>(null),
    ferrules100: useRef<THREE.Group>(null),
    split: useRef<THREE.Group>(null),
    leafF: useRef<THREE.Group>(null),
    leafB: useRef<THREE.Group>(null),
    coreS: useRef<THREE.Mesh>(null),
    g100: useRef<THREE.Group>(null),
    layers: useRef<(THREE.Group | null)[]>([]),
    meshes100: useRef<(THREE.Group | null)[]>([]),
    tongues: useRef<(THREE.Mesh | null)[]>([]),
    fills: useRef<(THREE.Mesh | null)[]>([]),
  }

  useFrame(() => {
    const p = pose.current
    const stage = Math.min(3, Math.max(0, p.stage))
    const raw = Math.min(1, Math.max(0, p.burst))
    const open = Math.min(1, Math.max(0, p.open))
    const is30 = stage <= 0
    const is100 = stage >= 3
    const between = !is30 && !is100
    if (r.g30.current) r.g30.current.visible = is30
    if (r.split.current) r.split.current.visible = between
    if (r.g100.current) r.g100.current.visible = is100
    // the concrete round the meshes: a ghost once opened, so its joint still reads
    fade(m.ghost, 1 - 0.88 * open)
    m.ghost.depthWrite = open < 0.02

    if (is30) {
      r.front30.current?.position.set(0, 0, GAP30 * stagger(raw, 1))
      r.back30.current?.position.set(0, 0, -GAP30 * stagger(raw, 1))
      r.ferrules30.current?.position.set(0, 0, FERRULE_OUT * stagger(raw, 0.5))
      if (r.mesh30.current) r.mesh30.current.visible = open > 0.01
    }

    if (between) {
      // the halves part; the core comes in from the right; the halves close onto it
      const d = stage < 1 ? OPEN * ease(stage) : stage < 2 ? OPEN : OPEN + (T100.core / 2 - OPEN) * ease(stage - 2)
      r.leafF.current?.position.set(0, 0, d)
      r.leafB.current?.position.set(0, 0, -d)
      // the 30 mm panel's joint goes as it divides: the tongue draws in, the recess fills
      const flat = smooth(0.15, 0.85, stage)
      for (const t of r.tongues.current) {
        if (!t) continue
        t.scale.x = Math.max(1e-3, 1 - flat)
        t.position.x = w * flat
        t.visible = flat < 0.995
      }
      // (the recess down the left edge, and the one across the foot)
      for (const f of r.fills.current) {
        if (!f) continue
        f.scale.z = Math.max(1e-3, flat)
        f.position.z = h * (1 - flat)
      }
      const c = r.coreS.current
      if (c) {
        // it slides in from the right, whole (it starts just past the panel's edge, inside the camera's frame)
        const ci = stage < 1 ? 0 : ease(Math.min(1, stage - 1))
        c.visible = stage > 1
        c.position.x = (1 - ci) * 0.24
      }
    }

    if (is100) {
      // seven layers from the outer face to the inner, the core in the middle
      r.layers.current.forEach((el, i) => {
        if (!el) return
        const k = i - 3
        el.position.set(0, 0, GAP100 * k * stagger(raw, Math.abs(k) / 3))
      })
      r.ferrules100.current?.position.set(0, 0, 0.09 * stagger(raw, 0.5))
      for (const el of r.meshes100.current) if (el) el.visible = open > 0.01
    }
  }, -2)

  /** a set of instances, each a translation */
  const place = (list: [number, number][], z: number) => (el: THREE.InstancedMesh | null) => {
    if (!el) return
    const mx = new THREE.Matrix4()
    list.forEach(([x, y], i) => el.setMatrixAt(i, mx.makeTranslation(x, y, z)))
    el.instanceMatrix.needsUpdate = true
    el.computeBoundingSphere()
  }
  const nx = Math.round(w / 0.012)
  const ny = Math.round((L - J) / 0.012)
  const { core, inner, mesh, outer } = T100
  const k0 = core / 2
  const k1 = k0 + inner
  const k2 = k1 + mesh
  const k3 = k2 + outer
  const zm = (k1 + k2) / 2
  /** the rods along the length on the given lines, at depth z, and the 30 mm panel's rods across */
  const rodsAlong = (xs: number[], z: number) =>
    xs.map((x) => <mesh key={`a${x}${z}`} geometry={g.rod} material={m.grp} position={[x, J, z]} scale={[1, L - J, 1]} />)
  const rodsAcross = (z: number) =>
    across.map((y) => <mesh key={`c${y}`} geometry={g.rod} material={m.grp} position={[0, y, z]} rotation={[0, 0, -Math.PI / 2]} scale={[1, w + J * 0.6, 1]} />)
  const id = (k: string) => (bus ? <Anchor bus={bus} id={k} position={[0, 0, 0]} /> : null)

  return (
    <group>
      {/* ---- 30 mm solid ---- */}
      <group ref={r.g30}>
        <group ref={r.front30}>
          <mesh geometry={g.cover30} material={conc} castShadow receiveShadow />
          {/* the ferrules' threaded mouths and the tie holes, in the inner face */}
          <instancedMesh args={[g.mouthF, m.bore, ferrules.length]} ref={place(ferrules, c1 + 0.25 * MM)} />
          <instancedMesh args={[g.mouthT, m.bore, ties.length]} ref={place(ties, c1 + 0.25 * MM)} />
          <instancedMesh args={[g.sleeve30c, m.sleeve, ties.length]} ref={place(ties, h + T30.cover / 2)} />
          {bus && (
            <>
              <group position={[w * 0.72, L * 0.86, c1]}>{id('pp-cover')}</group>
              <group position={[ties[0]?.[0] ?? 0.15, ties[0]?.[1] ?? 0.2, c1]}>{id('pp-tie')}</group>
            </>
          )}
        </group>
        <group ref={r.zone30}>
          <mesh geometry={g.zone30} material={m.ghost} castShadow receiveShadow />
          <group ref={r.mesh30} position={[w / 2, (L + J) / 2, 0]} visible={false}>
            {meshes && (
              <Suspense fallback={null}>
                <Rtarium t={15} nx={nx} ny={ny} />
              </Suspense>
            )}
          </group>
          {/* the GRP grid at the mesh's mid-plane: along the length, and across over it */}
          {rodsAlong(GRP_ALONG, -GRP_R)}
          {rodsAcross(GRP_R)}
          {/* the ferrules, fixed on the mesh, their mouths at the inner face (drawn off it as the panel opens) */}
          <group ref={r.ferrules30}>
            <instancedMesh args={[g.ferrule30, m.zinc, ferrules.length]} ref={place(ferrules, c1)} castShadow />
            {bus && <group position={[ferrules[ferrules.length - 1]?.[0] ?? 0.5, ferrules[ferrules.length - 1]?.[1] ?? 1, c1]}>{id('pp-ferrule')}</group>}
          </group>
          <instancedMesh args={[g.sleeve30z, m.sleeve, ties.length]} ref={place(ties, 0)} />
          {bus && (
            <>
              <group position={[w * 0.5, L * 0.42, h]}>{id('pp-zone')}</group>
              <group position={[GRP_ALONG[3], L * 0.3, 0]}>{id('pp-grp')}</group>
              <group position={[w + J, L * 0.62, 0]}>{id('pp-tongue')}</group>
            </>
          )}
        </group>
        <group ref={r.back30}>
          <mesh geometry={g.cover30} material={conc} position={[0, 0, -(h + c1)]} castShadow receiveShadow />
          <instancedMesh args={[g.sleeve30c, m.sleeve, ties.length]} ref={place(ties, -(h + T30.cover / 2))} />
          {bus && <group position={[w, L * 0.2, -c1]}>{id('pp-back')}</group>}
        </group>
      </group>

      {/* ---- on its way: two halves, then the core between them ---- */}
      <group ref={r.split} visible={false}>
        {[0, 1].map((k) => (
          <group key={k} ref={k === 0 ? r.leafF : r.leafB}>
            <group scale={[1, 1, k === 0 ? 1 : -1]}>
              <mesh geometry={g.cover30} material={k === 0 ? conc : turned} castShadow receiveShadow />
              <mesh geometry={g.half} material={conc} castShadow receiveShadow />
              <mesh ref={(el) => void (r.fills.current[k * 2 + 1] = el)} geometry={g.foot} material={conc} castShadow receiveShadow />
              <mesh ref={(el) => void (r.tongues.current[k] = el)} geometry={g.tongue} material={conc} castShadow receiveShadow />
              <mesh ref={(el) => void (r.fills.current[k * 2] = el)} geometry={g.fill} material={conc} castShadow receiveShadow />
              {k === 0 && (
                <>
                  <instancedMesh args={[g.mouthF, m.bore, ferrules.length]} ref={place(ferrules, c1 + 0.25 * MM)} />
                  <instancedMesh args={[g.mouthT, m.bore, ties.length]} ref={place(ties, c1 + 0.25 * MM)} />
                </>
              )}
            </group>
          </group>
        ))}
        <mesh ref={r.coreS} geometry={g.core} material={m.core} castShadow receiveShadow visible={false} />
      </group>

      {/* ---- 100 mm SIP: outer cover, RTARIUM, cover | core | cover, RTARIUM, inner cover ---- */}
      <group ref={r.g100} visible={false}>
        {[
          { key: 'o7', geo: g.outer, z: -1, ghost: false },
          { key: 'o6', geo: g.zone, z: -1, ghost: true },
          { key: 'o2', geo: g.inner, z: -1, ghost: false },
          { key: 'core', geo: g.core, z: 1, ghost: false },
          { key: 'i2', geo: g.inner, z: 1, ghost: false },
          { key: 'i6', geo: g.zone, z: 1, ghost: true },
          { key: 'i7', geo: g.outer, z: 1, ghost: false },
        ].map((l, i) => (
          <group key={l.key} ref={(el) => void (r.layers.current[i] = el)}>
            {l.key === 'core' ? (
              <>
                <mesh geometry={l.geo} material={m.core} castShadow receiveShadow />
                {/* the GI tie-clips through the core, on the rod lines */}
                <instancedMesh args={[g.clip, m.galv, clips.length]} ref={place(clips, 0)} castShadow />
                <instancedMesh args={[g.sleeve100[3], m.sleeve, ties.length]} ref={place(ties, 0)} />
                {bus && (
                  <>
                    <group position={[w * 0.55, L, 0]}>{id('pp-core')}</group>
                    <group position={[clips[clips.length - 1]?.[0] ?? 0.5, clips[clips.length - 1]?.[1] ?? 1.1, k0]}>{id('pp-clip')}</group>
                    <group position={[T100.recess, L * 0.35, 0]}>{id('pp-recess')}</group>
                  </>
                )}
              </>
            ) : (
              <group scale={[1, 1, l.z]}>
                <mesh geometry={l.geo} material={l.ghost ? [m.ghost, m.ghost, m.ghost] : l.z < 0 ? turned : conc} castShadow receiveShadow />
                <instancedMesh
                  args={[l.key.endsWith('7') ? g.sleeve100[0] : l.key.endsWith('6') ? g.sleeve100[1] : g.sleeve100[2], m.sleeve, ties.length]}
                  ref={place(ties, l.key.endsWith('7') ? (k2 + k3) / 2 : l.key.endsWith('6') ? zm : (k0 + k1) / 2)}
                />
                {l.ghost && (
                  <>
                    <group ref={(el) => void (r.meshes100.current[l.z > 0 ? 1 : 0] = el)} position={[w / 2, L / 2, zm]} visible={false}>
                      {meshes && (
                        <Suspense fallback={null}>
                          <Rtarium t={6} nx={nx} ny={Math.round(L / 0.012)} />
                        </Suspense>
                      )}
                    </group>
                    {ROD_LINES.map((x) => (
                      <mesh key={x} geometry={g.rod} material={m.grp} position={[x, 0, zm]} scale={[1, L, 1]} />
                    ))}
                    {/* and one across at each tie-clip line, through the clips' lugs, locking them */}
                    {clipLines.map((y) => (
                      <mesh key={`c${y}`} geometry={g.rod} material={m.grp} position={[0, y, zm]} rotation={[0, 0, -Math.PI / 2]} scale={[1, w, 1]} />
                    ))}
                  </>
                )}
                {l.key === 'i6' && (
                  <group ref={r.ferrules100}>
                    <instancedMesh args={[g.ferrule100, m.zinc, ferrules.length]} ref={place(ferrules, k3)} castShadow />
                    {bus && <group position={[ferrules[1]?.[0] ?? 0.5, ferrules[1]?.[1] ?? 1, k3]}>{id('pp-ferrule100')}</group>}
                  </group>
                )}
                {l.key === 'i7' && (
                  <>
                    <instancedMesh args={[g.mouthF, m.bore, ferrules.length]} ref={place(ferrules, k3 + 0.25 * MM)} />
                    <instancedMesh args={[g.mouthT, m.bore, ties.length]} ref={place(ties, k3 + 0.25 * MM)} />
                  </>
                )}
                {bus && l.key === 'o7' && <group position={[w, L * 0.25, k3]}>{id('pp-outer')}</group>}
                {bus && l.key === 'o6' && <group position={[w, L * 0.5, zm]}>{id('pp-mesh6')}</group>}
                {bus && l.key === 'i6' && <group position={[ROD_LINES[1], L * 0.18, zm]}>{id('pp-rod')}</group>}
                {bus && l.key === 'i7' && <group position={[ties[1]?.[0] ?? 0.45, ties[1]?.[1] ?? 0.2, k3]}>{id('pp-tie100')}</group>}
                {bus && l.key === 'i7' && <group position={[w * 0.7, L * 0.82, k3]}>{id('pp-inner7')}</group>}
                {bus && l.key === 'i6' && <group position={[w * 0.82, L * 0.55, zm]}>{id('pp-mesh6i')}</group>}
                {bus && l.key === 'i2' && <group position={[w, L * 0.7, (k0 + k1) / 2]}>{id('pp-cover2')}</group>}
              </group>
            )}
          </group>
        ))}
      </group>
    </group>
  )
}
