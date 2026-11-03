import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Anchor } from '../../facade/three/Stage3D'
import type { LabelBus } from '../../facade/three/kit'
import { smooth } from '../../facade/progress'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { Lines } from '../../flooring/data/three/dc'
import { useDrawing, useInkResolution } from '../../flooring/data/three/draw'
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
  ROD_LINE,
  ROD_LINES,
  ROD_OVER,
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
 *   stage    0     the 30 mm panel
 *            0..1  it divides down its middle into two 15 mm leaves (its tongue and recess go into the core's)
 *            1..2  the EPS/SPS core slides in between them
 *            2..3  the leaves close onto the core: 3 is the 100 mm panel
 *   burst    0..1  its layers stand apart through its thickness, all at once, as the Unitized unit's do
 *   open     0..1  the concrete round the RTARIUM goes, so the mesh, its GRP rods and the ferrules on it show
 *   marking  0..1  its parts are being marked one by one: the one marked (`lit`, by the list's ids) stays whole, the
 *                  others fade back (owner, 3 Nov 2026)
 *
 * What each mark brings out: the GRP rods (the mesh fades round them, the rods darken and thicken so they read on the
 * yellow, those along and those across alike); the GI tie-clips (the EPS core fades round them, the two meshes they join
 * stay half seen, the clips widen and darken so they read, and from each clip's lug holes a fine dashed line, as an
 * exploded drawing has, runs to the point on each mesh's rod where that lug hooks it, marked by a dot); the ferrules
 * (both, each on the mesh, the covers faded). The ferrules are drawn wider than they are
 * (`FER`), their length true; their mouths are flush with the inner face, no cut round them (owner).
 *
 * Every layer is the panel's own cast concrete (the photographs' face, and their rougher edge on the edges and
 * cuts); the core is EPS/SPS; the steel and the GRP are theirs.
 */

export interface PiecePose {
  stage: number
  burst: number
  open: number
  /** how lit each part is while they are marked, by the list's ids (1: the one marked now) */
  lit: Record<string, number>
  marking: number
}

/** how far apart the layers stand when opened (m, through the panel's thickness): at the burst's angle, far enough that
 *  each one is seen whole, clear of the next (as an exploded product shot's parts are) */
const GAP30 = 0.25
const GAP100 = 0.25
/** the ferrules, drawn off the mesh towards the cover, so they read as a part of their own (30 mm; the SIP's) */
const FERRULE_OUT = 0.11
const FERRULE_OUT100 = 0.1
/** how far each half stands from the middle while the core goes in */
const OPEN = 0.09
/** how far back a part that is not being marked fades (a little: the rest stays in view); and further, what hides the
 *  part marked (the mesh round the GRP rods, the core round the tie-clips) */
const FLOOR = 0.32
const DEEP = 0.08
/** the ferrules drawn this much wider than they are (an M8 insert is a few pixels at this size), their length true */
const FER = 2.2
/** a tie-clip, while it is marked, drawn this much wider and thicker so it reads (it is seen nearly edge on); its 86 mm true */
const CLIP_W = 3.2
const CLIP_T = 4
/** the GRP rods drawn this much thicker while they are marked (their length true) */
const ROD_LIT = 1.9
/** where a clip's lug hooks a rod, as the dot marks it on the mesh (m) */
const HOOK_R = 0.012
/** the GRP's own pale colour, and the deeper one it takes while marked, so it reads on the yellow */
const GRP_BASE = new THREE.Color('#e6d6a4')
const GRP_LIT = new THREE.Color('#7d5c22')
/** the clips' galvanised steel, and the darker one they take while marked, so they read against the EPS */
const GALV = new THREE.Color('#b4b9bd')
const GALV_LIT = new THREE.Color('#3f464d')
/** the ferrules' zinc, and the darker steel they take while marked */
const ZINC = new THREE.Color('#c3c6c4')
const ZINC_LIT = new THREE.Color('#545b62')
/** where a ferrule's mark points: the rim of its washer plate, below its mouth, so the dot never hides it */
const FER_MARK = 0.017 * FER * 0.85

const Q = new THREE.Quaternion()

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** the layers part one after another, the outermost first (k: how far out it is, 0..1 of the stack's half); `b` comes in
 *  linear, so each layer is eased once (an ease on an ease starts slow and then lurches) */
const stagger = (b: number, k: number) => {
  const x = Math.min(1, Math.max(0, (b - 0.18 * (1 - k)) / (1 - 0.18 * (1 - k))))
  return x * x * (3 - 2 * x)
}

type Trio = THREE.MeshStandardMaterial[]

/** gathers RTARIUM's yarn materials as the mesh models make them: made see-through-able, so they can fade with their layer */
const collect = (set: Set<THREE.Material>) => (mat: THREE.Material) => {
  mat.transparent = true
  mat.needsUpdate = true
  set.add(mat)
}

export function PanelPiece({
  len,
  pose,
  bus,
  meshes = true,
  wide = 1,
}: {
  len: number
  pose: { current: PiecePose }
  bus?: LabelBus
  meshes?: boolean
  /** drawn this many times its 600 mm width (owner: wider in the burst, as the reference); every position across it scales with it */
  wide?: number
}) {
  const tex = useWallTextures()
  const m = useMemo(() => {
    const k = wallKit(tex)
    // each part its own materials, so the one being marked can stand out while the others fade back
    const set = (): Trio => [k.concrete.clone(), k.edge.clone(), k.outer.clone()]
    return {
      ...k,
      /** the inner cover: the 30 mm panel's 7.5 mm, the SIP's 7 mm */
      a: set(),
      /** the outer cover: the 30 mm panel's; the SIP's outer leaf (its 7 and 2 mm covers) */
      b: set(),
      /** the SIP's inner 2 mm cover */
      c: set(),
      /** the RTARIUM zone's concrete: `zone` the 30 mm panel's and the SIP's inner leaf's, `zoneB` the outer leaf's */
      zoneB: k.zone.clone(),
      /** a tie hole's sleeve through a layer, and its mouth (`bore`); the ferrules' mouths in the inner cover */
      sleeve: new THREE.MeshStandardMaterial({ color: '#2c2c2b', roughness: 0.6, transparent: true }),
      boreF: k.bore.clone(),
    }
  }, [tex])
  const w = PW * wide
  const along = useMemo(() => GRP_ALONG.map((x) => x * wide), [wide])
  const rodLines = useMemo(() => ROD_LINES.map((x) => x * wide), [wide])
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
      mouthF: mouthGeometry(5.2 * MM * FER),
      // a tie hole, 20 mm, through
      mouthT: mouthGeometry(10 * MM),
      sleeve30c: sleeveGeometry(T30.cover),
      sleeve30z: sleeveGeometry(T30.zone),
      sleeve100: [sleeveGeometry(outer), sleeveGeometry(mesh), sleeveGeometry(inner), sleeveGeometry(core)],
    }
  }, [w, L, h, c1])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => (Array.isArray(x) ? x.forEach((y) => y.dispose()) : x.dispose()))
      disposeWallKit(m)
    },
    [g, m],
  )

  const ferrules = useMemo(() => FERRULES(L).map(([x, y]) => [x * wide, y] as [number, number]), [L, wide])
  const holes = useMemo(() => TIE_HOLES(L).map(([x, y]) => [x * wide, y] as [number, number]), [L, wide])
  const across = useMemo(() => GRP_ACROSS(L), [L])
  const clipLines = useMemo(() => CLIPS(L), [L])
  const clips = useMemo(() => clipLines.flatMap((y) => rodLines.map((x) => [x, y] as [number, number])), [clipLines, rodLines])
  /** a layer turned about (scale z −1) shows its geometry's back as its front: its faces swap materials */
  const turn = (t: Trio): Trio => [t[2], t[1], t[0]]

  /** RTARIUM's own materials (the mesh model's yarn), gathered as they are made, so they can fade with their layer */
  const yarnA = useRef(new Set<THREE.Material>())
  const yarnB = useRef(new Set<THREE.Material>())
  const onYarnA = useMemo(() => collect(yarnA.current), [])
  const onYarnB = useMemo(() => collect(yarnB.current), [])

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
    linesIn: useRef<THREE.Group>(null),
    linesOut: useRef<THREE.Group>(null),
  }

  // the tie-clips' lines: from each clip's lug hole to the rod it hooks on the mesh, a unit long, stretched at run time; fine
  // and dashed, as an exploded drawing's (solid black ones read as bars across the gap)
  const tieInk = useMemo(() => new LineMaterial({ color: 0x1b1b1a, linewidth: 1, transparent: true, opacity: 0.6, depthWrite: false, dashed: true, dashSize: 0.028, gapSize: 0.022 }), [])
  useInkResolution(useMemo(() => [tieInk], [tieInk]))
  const lines = useMemo(() => {
    const ties = new Lines()
    const tiesBack = new Lines()
    for (const y of CLIPS(L))
      for (const x of rodLines) {
        ties.seg([x, y, 0], [x, y, 1])
        tiesBack.seg([x, y, 0], [x, y, -1])
      }
    return { ties, tiesBack }
  }, [L])
  const clipMesh = useRef<THREE.InstancedMesh>(null)
  const tiesIn = useDrawing(lines.ties, tieInk)
  const tiesOut = useDrawing(lines.tiesBack, tieInk)
  useEffect(() => {
    tiesIn.obj.computeLineDistances()
    tiesOut.obj.computeLineDistances()
  }, [tiesIn, tiesOut])
  /** the rods of the SIP's meshes, thickened while marked; and the dots where the clips' lugs hook them */
  const rods100 = useRef<(THREE.Mesh | null)[]>([])
  const hooks = useRef<(THREE.InstancedMesh | null)[]>([])
  const hookGeo = useMemo(() => new THREE.SphereGeometry(HOOK_R, 14, 10), [])
  useEffect(() => () => hookGeo.dispose(), [hookGeo])

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

    // the marking: the part marked now stays whole, the others fade back (some stay half seen: what a tie-clip joins)
    const mark = Math.min(1, Math.max(0, p.marking))
    const lit = (...ids: string[]) => Math.max(0, ...ids.map((id) => p.lit[id] ?? 0))
    const dim = (x: number, floor = FLOOR) => 1 - mark * (1 - floor) * (1 - Math.min(1, x))
    const clip = lit('pp-clip')
    const grp = lit('pp-grp', 'pp-rod')
    const tongue = lit('pp-tongue')
    const wA = dim(lit('pp-cover', 'pp-inner7'))
    const wB = dim(lit('pp-back', 'pp-outer'))
    // (the mesh goes further back while the GRP rods in it are marked)
    const meshFloor = FLOOR - (FLOOR - DEEP) * grp
    const wMeshA = dim(Math.max(lit('pp-zone', 'pp-tongue', 'pp-mesh6i'), 0.55 * clip), meshFloor)
    const wMeshB = dim(Math.max(lit('pp-outer'), 0.55 * clip), meshFloor)
    for (const x of m.a) fade(x, wA)
    for (const x of m.b) fade(x, wB)
    for (const x of m.c) fade(x, dim(lit('pp-cover2')))
    fade(m.boreF, wA)
    fade(m.sleeve, dim(lit('pp-tie')))
    fade(m.bore, dim(lit('pp-tie')))
    const fer = lit('pp-ferrule', 'pp-ferrule100')
    fade(m.zinc, dim(fer))
    m.zinc.color.lerpColors(ZINC, ZINC_LIT, fer)
    fade(m.grp, dim(Math.max(grp, 0.55 * clip)))
    m.grp.color.lerpColors(GRP_BASE, GRP_LIT, grp)
    fade(m.core, dim(lit('pp-core', 'pp-recess'), FLOOR - (FLOOR - DEEP) * clip))
    fade(m.galv, dim(clip))
    m.galv.color.lerpColors(GALV, GALV_LIT, clip)
    // the clips widen while they are marked, so they read (their length through the core stays true)
    const cl = clipMesh.current
    if (cl && Math.abs(cl.userData.k - clip) > 1e-3) {
      cl.userData.k = clip
      const mx = new THREE.Matrix4()
      const sc = new THREE.Vector3(1 + (CLIP_W - 1) * clip, 1 + (CLIP_T - 1) * clip, 1)
      const at = new THREE.Vector3()
      clips.forEach(([x, y], i) => cl.setMatrixAt(i, mx.compose(at.set(x, y, 0), Q, sc)))
      cl.instanceMatrix.needsUpdate = true
    }
    // the concrete round the meshes: a ghost once opened, so its joint still reads (more of it while the joint is marked)
    fade(m.zone, (1 - 0.88 * open * (1 - 0.8 * tongue)) * wMeshA)
    fade(m.zoneB, (1 - 0.88 * open) * wMeshB)
    if (open > 0.02) m.zone.depthWrite = m.zoneB.depthWrite = false
    for (const y of yarnA.current) fade(y, wMeshA)
    for (const y of yarnB.current) fade(y, wMeshB)

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
        // it slides in from beside the panel, coming into sight as it starts (no jump: it fades in over its first part)
        const ci = stage < 1 ? 0 : ease(Math.min(1, stage - 1))
        c.visible = stage > 1
        c.position.x = (1 - ci) * w * 0.9
        fade(m.core, smooth(1, 1.45, stage))
      }
    }

    if (is100) {
      // seven layers from the outer face to the inner, the core in the middle
      r.layers.current.forEach((el, i) => {
        if (!el) return
        const k = i - 3
        el.position.set(0, 0, GAP100 * k * stagger(raw, Math.abs(k) / 3))
      })
      r.ferrules100.current?.position.set(0, 0, FERRULE_OUT100 * stagger(raw, 0.5))
      for (const el of r.meshes100.current) if (el) el.visible = open > 0.01
      // each clip's lines run from its lug holes to the rods it hooks, wherever the burst has taken their meshes
      const reach = 2 * GAP100 * stagger(raw, 2 / 3)
      for (const [el, sgn] of [
        [r.linesIn.current, 1],
        [r.linesOut.current, -1],
      ] as const) {
        if (!el) continue
        el.visible = clip > 0.01 && reach > 0.01
        el.position.z = sgn * ROD_LINE
        el.scale.z = Math.max(1e-3, reach)
      }
      fade(tieInk, 0.6 * clip)
      tiesIn.show(clip)
      tiesOut.show(clip)
      // (the dots share the clips' steel, which darkens as they are marked)
      for (const hk of hooks.current) if (hk) hk.visible = clip > 0.15
      // the rods thicken while they are marked (along and across alike)
      const kr = 1 + (ROD_LIT - 1) * grp
      for (const rod of rods100.current) if (rod && rod.scale.x !== kr) rod.scale.x = rod.scale.z = kr
    }
  }, -2)

  /** a set of instances, each a translation (and, given `k`, widened by it across the face) */
  const place = (list: [number, number][], z: number, k = 1) => (el: THREE.InstancedMesh | null) => {
    if (!el) return
    const mx = new THREE.Matrix4()
    const sc = new THREE.Vector3(k, k, 1)
    const at = new THREE.Vector3()
    list.forEach(([x, y], i) => el.setMatrixAt(i, mx.compose(at.set(x, y, z), Q, sc)))
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
  const fA = ferrules[ferrules.length - 1]

  return (
    <group>
      {/* ---- 30 mm solid ---- */}
      <group ref={r.g30}>
        <group ref={r.front30}>
          <mesh geometry={g.cover30} material={m.a} castShadow receiveShadow />
          {/* the ferrules' threaded mouths and the tie holes, in the inner face */}
          <instancedMesh args={[g.mouthF, m.boreF, ferrules.length]} ref={place(ferrules, c1 + 0.25 * MM)} />
          <instancedMesh args={[g.mouthT, m.bore, holes.length]} ref={place(holes, c1 + 0.25 * MM)} />
          <instancedMesh args={[g.sleeve30c, m.sleeve, holes.length]} ref={place(holes, h + T30.cover / 2)} />
          {bus && (
            <>
              <group position={[w * 0.72, L * 0.86, c1]}>{id('pp-cover')}</group>
              <group position={[holes[0]?.[0] ?? 0.15, holes[0]?.[1] ?? 0.2, c1]}>{id('pp-tie')}</group>
            </>
          )}
        </group>
        <group ref={r.zone30}>
          <mesh geometry={g.zone30} material={m.zone} castShadow receiveShadow />
          <group ref={r.mesh30} position={[w / 2, (L + J) / 2, 0]} visible={false}>
            {meshes && (
              <Suspense fallback={null}>
                <Rtarium t={15} nx={nx} ny={ny} onMaterial={onYarnA} />
              </Suspense>
            )}
          </group>
          {/* the GRP grid at the mesh's mid-plane (the 30 mm plan): four rods along, 120 mm apart, and one across every 600 mm */}
          {rodsAlong(along, -GRP_R)}
          {rodsAcross(GRP_R)}
          {/* the ferrules, fixed on the mesh, their mouths at the inner face (drawn off it as the panel opens) */}
          <group ref={r.ferrules30}>
            <instancedMesh args={[g.ferrule30, m.zinc, ferrules.length]} ref={place(ferrules, c1, FER)} castShadow />
            {bus && fA && <group position={[fA[0], fA[1] - FER_MARK, c1]}>{id('pp-ferrule')}</group>}
          </group>
          <instancedMesh args={[g.sleeve30z, m.sleeve, holes.length]} ref={place(holes, 0)} />
          {bus && (
            <>
              <group position={[w * 0.5, L * 0.42, h]}>{id('pp-zone')}</group>
              <group position={[along[3], L * 0.3, 0]}>{id('pp-grp')}</group>
              <group position={[w + J, L * 0.62, 0]}>{id('pp-tongue')}</group>
            </>
          )}
        </group>
        <group ref={r.back30}>
          <mesh geometry={g.cover30} material={m.b} position={[0, 0, -(h + c1)]} castShadow receiveShadow />
          <instancedMesh args={[g.sleeve30c, m.sleeve, holes.length]} ref={place(holes, -(h + T30.cover / 2))} />
          {bus && <group position={[w, L * 0.2, -c1]}>{id('pp-back')}</group>}
        </group>
      </group>

      {/* ---- on its way: two halves, then the core between them ---- */}
      <group ref={r.split} visible={false}>
        {[0, 1].map((k) => {
          const set = k === 0 ? m.a : m.b
          return (
            <group key={k} ref={k === 0 ? r.leafF : r.leafB}>
              <group scale={[1, 1, k === 0 ? 1 : -1]}>
                <mesh geometry={g.cover30} material={k === 0 ? set : turn(set)} castShadow receiveShadow />
                <mesh geometry={g.half} material={set} castShadow receiveShadow />
                <mesh ref={(el) => void (r.fills.current[k * 2 + 1] = el)} geometry={g.foot} material={set} castShadow receiveShadow />
                <mesh ref={(el) => void (r.tongues.current[k] = el)} geometry={g.tongue} material={set} castShadow receiveShadow />
                <mesh ref={(el) => void (r.fills.current[k * 2] = el)} geometry={g.fill} material={set} castShadow receiveShadow />
                {k === 0 && (
                  <>
                    <instancedMesh args={[g.mouthF, m.boreF, ferrules.length]} ref={place(ferrules, c1 + 0.25 * MM)} />
                    <instancedMesh args={[g.mouthT, m.bore, holes.length]} ref={place(holes, c1 + 0.25 * MM)} />
                  </>
                )}
              </group>
            </group>
          )
        })}
        <mesh ref={r.coreS} geometry={g.core} material={m.core} castShadow receiveShadow visible={false} />
      </group>

      {/* ---- 100 mm SIP: outer cover, RTARIUM, cover | core | cover, RTARIUM, inner cover ---- */}
      <group ref={r.g100} visible={false}>
        {[
          { key: 'o7', geo: g.outer, z: -1, set: turn(m.b) },
          { key: 'o6', geo: g.zone, z: -1, set: [m.zoneB, m.zoneB, m.zoneB] },
          { key: 'o2', geo: g.inner, z: -1, set: turn(m.b) },
          { key: 'core', geo: g.core, z: 1, set: [] },
          { key: 'i2', geo: g.inner, z: 1, set: m.c },
          { key: 'i6', geo: g.zone, z: 1, set: [m.zone, m.zone, m.zone] },
          { key: 'i7', geo: g.outer, z: 1, set: m.a },
        ].map((l, i) => (
          <group key={l.key} ref={(el) => void (r.layers.current[i] = el)}>
            {l.key === 'core' ? (
              <>
                <mesh geometry={l.geo} material={m.core} castShadow receiveShadow />
                {/* the GI tie-clips through the core, on the rod lines, their lugs in the meshes either side */}
                <instancedMesh
                  args={[g.clip, m.galv, clips.length]}
                  ref={(el) => {
                    clipMesh.current = el
                    if (el) el.userData.k = -1
                    place(clips, 0)(el)
                  }}
                  castShadow
                />
                {/* and, while they are marked, a line from each clip's lugs to the mesh it hooks */}
                <group ref={r.linesIn} visible={false}>
                  <primitive object={tiesIn.obj} />
                </group>
                <group ref={r.linesOut} visible={false}>
                  <primitive object={tiesOut.obj} />
                </group>
                <instancedMesh args={[g.sleeve100[3], m.sleeve, holes.length]} ref={place(holes, 0)} />
                {bus && (
                  <>
                    <group position={[w * 0.55, L, 0]}>{id('pp-core')}</group>
                    <group position={[clips[clips.length - 1]?.[0] ?? 0.5, clips[clips.length - 1]?.[1] ?? 1.1, 0]}>{id('pp-clip')}</group>
                    <group position={[T100.recess, L * 0.35, 0]}>{id('pp-recess')}</group>
                  </>
                )}
              </>
            ) : (
              <group scale={[1, 1, l.z]}>
                <mesh geometry={l.geo} material={l.set} castShadow receiveShadow />
                <instancedMesh
                  args={[l.key.endsWith('7') ? g.sleeve100[0] : l.key.endsWith('6') ? g.sleeve100[1] : g.sleeve100[2], m.sleeve, holes.length]}
                  ref={place(holes, l.key.endsWith('7') ? (k2 + k3) / 2 : l.key.endsWith('6') ? zm : (k0 + k1) / 2)}
                />
                {l.key.endsWith('6') && (
                  <>
                    <group ref={(el) => void (r.meshes100.current[l.z > 0 ? 1 : 0] = el)} position={[w / 2, L / 2, zm]} visible={false}>
                      {meshes && (
                        <Suspense fallback={null}>
                          <Rtarium t={6} nx={nx} ny={Math.round(L / 0.012)} onMaterial={l.z > 0 ? onYarnA : onYarnB} />
                        </Suspense>
                      )}
                    </group>
                    {/* 3 mm GRP rods along the length, 100 mm in from each long edge, through the clips' lug holes (the 100 mm plan's dashed lines along) */}
                    {rodLines.map((x, k) => (
                      <mesh key={x} ref={(el) => void (rods100.current[(l.z > 0 ? 0 : 50) + k] = el)} geometry={g.rod} material={m.grp} position={[x, 0, ROD_LINE]} scale={[1, L, 1]} />
                    ))}
                    {/* and one across at each tie-clip line (the plan's dashed lines across), over the rods along, beside the clips' plates: locking them */}
                    {clipLines.map((y, k) => (
                      <mesh
                        key={`c${y}`}
                        ref={(el) => void (rods100.current[(l.z > 0 ? 0 : 50) + 2 + k] = el)}
                        geometry={g.rod}
                        material={m.grp}
                        position={[0, y + 2.6 * MM, ROD_OVER]}
                        rotation={[0, 0, -Math.PI / 2]}
                        scale={[1, w, 1]}
                      />
                    ))}
                    {/* where the clips' lugs hook the rods along: shown while the clips are marked */}
                    <instancedMesh
                      ref={(el) => {
                        hooks.current[l.z > 0 ? 0 : 1] = el
                        place(clips, ROD_LINE)(el)
                      }}
                      args={[hookGeo, m.galv, clips.length]}
                      visible={false}
                    />
                  </>
                )}
                {l.key === 'i6' && (
                  <>
                    <group ref={r.ferrules100}>
                      <instancedMesh args={[g.ferrule100, m.zinc, ferrules.length]} ref={place(ferrules, k3, FER)} castShadow />
                      {bus && fA && <group position={[fA[0], fA[1] - FER_MARK, k3]}>{id('pp-ferrule100')}</group>}
                    </group>
                  </>
                )}
                {l.key === 'i7' && (
                  <>
                    <instancedMesh args={[g.mouthF, m.boreF, ferrules.length]} ref={place(ferrules, k3 + 0.25 * MM)} />
                    <instancedMesh args={[g.mouthT, m.bore, holes.length]} ref={place(holes, k3 + 0.25 * MM)} />
                  </>
                )}
                {bus && l.key === 'o7' && <group position={[w, L * 0.25, k3]}>{id('pp-outer')}</group>}
                {bus && l.key === 'i6' && <group position={[rodLines[1], L * 0.18, ROD_LINE]}>{id('pp-rod')}</group>}
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
