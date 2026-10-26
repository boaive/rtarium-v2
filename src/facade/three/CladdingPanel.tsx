import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MeshInset } from './MeshInset'
import { Anchor } from './Stage3D'
import { grainTexture, type LabelBus } from './kit'
import { smooth } from '../progress'

/**
 * One façade panel, four versions of it: a wide cladding panel with a band window, the same return
 * along its right edge, the same corner of the spandrel cut open to its core, so what changes from
 * version to version is what holds it together and how thick that makes it.
 *
 *   0  steel bar    100 mm, a grid of ribbed bars in the cut
 *   1  GFRC / GRC    20 mm, short glass strands lying in the core
 *   2  UHPC          20 mm, steel micro-fibres in the core
 *   3  RTARIUM       20 mm, the 3D basalt textile (10 mm option) through the core
 *
 * `stage` (0..3, continuous) is the story's own clock, eased in time from one version to the next.
 * Thicknesses show the step from bars to fibre; they are not test figures, and fibre sizes are
 * slightly enlarged so they read.
 */

export const PANEL = { w: 0.9, h: 0.5, ret: 0.11, thick: 0.1, thin: 0.02 }
/** the window, through the panel: wide and low, a band across the upper half */
const WIN = { x0: -0.33, x1: 0.17, y0: 0.02, y1: 0.17 }
/** the cut: a window in the spandrel's face, down to a quarter of the thickness from the back */
const CUT = { x0: -0.36, x1: -0.1, y0: -0.2, y1: -0.05, floor: -0.25 }
const CUT_C: [number, number] = [(CUT.x0 + CUT.x1) / 2, (CUT.y0 + CUT.y1) / 2]

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** texture coordinates projected from the position, so the grain runs on across the boxes the face is made of */
function planarUV(g: THREE.BufferGeometry, k = 2.4) {
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const [u, v] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]
    uv[i * 2] = u * k
    uv[i * 2 + 1] = v * k
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** the face, drawn one unit thick (z −0.5..0.5) and scaled to the version's thickness: boxes round the window and the cut */
function faceGeometry() {
  const { w, h } = PANEL
  const xs = [...new Set([-w / 2, CUT.x0, CUT.x1, WIN.x0, WIN.x1, w / 2])].sort((a, b) => a - b)
  const ys = [...new Set([-h / 2, CUT.y0, CUT.y1, WIN.y0, WIN.y1, h / 2])].sort((a, b) => a - b)
  const inside = (r: { x0: number; x1: number; y0: number; y1: number }, x: number, y: number) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[j], ys[j + 1]]
      const cx = (x0 + x1) / 2
      const cy = (y0 + y1) / 2
      if (inside(WIN, cx, cy)) continue
      const z1 = inside(CUT, cx, cy) ? CUT.floor : 0.5
      parts.push(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 + 0.5).translate(cx, cy, (z1 - 0.5) / 2).toNonIndexed())
    }
  }
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  planarUV(g)
  return g
}

function ribbedBar(length: number, r: number) {
  const pts: THREE.Vector2[] = []
  const n = Math.round(length / 0.0015)
  for (let i = 0; i <= n; i++) {
    const y = -length / 2 + (i / n) * length
    const rib = Math.pow(Math.max(0, Math.cos((y / 0.009) * Math.PI * 2)), 6)
    pts.push(new THREE.Vector2(r * (1 + 0.14 * rib), y))
  }
  const g = new THREE.LatheGeometry(pts, 16)
  g.computeVertexNormals()
  return g
}

/** fibres lying in the core, mostly in the plane of the panel (as sprayed fibre lies), round the cut */
function coreFibres(count: number, len: number, tilt: number, seed: number) {
  const rnd = seeded(seed)
  const up = new THREE.Vector3(0, 1, 0)
  const out: THREE.Matrix4[] = []
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI
    const z = (rnd() * 2 - 1) * Math.sin(tilt)
    const d = new THREE.Vector3(Math.cos(a), Math.sin(a), z).normalize()
    const p = new THREE.Vector3(CUT.x0 - 0.01 + rnd() * (CUT.x1 - CUT.x0 + 0.02), CUT.y0 - 0.01 + rnd() * (CUT.y1 - CUT.y0 + 0.02), -0.0035 + rnd() * 0.006)
    out.push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(up, d), new THREE.Vector3(1, len, 1)))
  }
  return out
}

/** what the panel stands on in each version: black, warm white, black, then the yellow */
const SHADOW = [0, 0.16, 0, 0.26]
const SHADOW_TINT = ['#000000', '#3d3a34', '#000000', '#4a3000'].map((c) => new THREE.Color(c))
const GLASS = new THREE.Color('#f4f6f2')
const STEEL = new THREE.Color('#7f868d')

export function CladdingPanel({ stage, bus }: { stage: { value: number }; bus: LabelBus }) {
  const m = useMemo(
    () => ({
      concrete: new THREE.MeshStandardMaterial({ color: '#dcd6ca', map: grainTexture('#dcd6ca', 6500, [165, 225], 1), roughness: 0.86 }),
      core: new THREE.MeshStandardMaterial({ color: '#c9c2b4', map: grainTexture('#c9c2b4', 8000, [135, 205], 3), roughness: 0.95 }),
      frame: new THREE.MeshStandardMaterial({ color: '#2d3034', metalness: 0.55, roughness: 0.4 }),
      // tinted glazing, dense enough to read as glass on any ground (a clear pane would show the yellow through)
      pane: new THREE.MeshStandardMaterial({ color: '#33424b', metalness: 0.35, roughness: 0.08, transparent: true, opacity: 0.86, envMapIntensity: 1.8, depthWrite: false }),
      bar: new THREE.MeshStandardMaterial({ color: '#6c7278', metalness: 0.75, roughness: 0.4, transparent: true }),
      glass: new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.32, emissive: '#3a423e', transparent: true }),
      steel: new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.72, roughness: 0.34, transparent: true }),
      catcher: new THREE.ShadowMaterial({ color: '#000000', transparent: true, opacity: 0, depthWrite: false }),
    }),
    [],
  )
  const geo = useMemo(() => {
    const ww = WIN.x1 - WIN.x0
    const wh = WIN.y1 - WIN.y0
    const pr = 0.012
    const cx = (WIN.x0 + WIN.x1) / 2
    const box = (w: number, h: number, d: number, x: number, y: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, 0).toNonIndexed()
    const frame = mergeGeometries([
      box(ww, pr, 0.018, cx, WIN.y0 + pr / 2),
      box(ww, pr, 0.018, cx, WIN.y1 - pr / 2),
      box(pr, wh, 0.018, WIN.x0 + pr / 2, (WIN.y0 + WIN.y1) / 2),
      box(pr, wh, 0.018, WIN.x1 - pr / 2, (WIN.y0 + WIN.y1) / 2),
      // a mullion: two lights
      box(pr * 0.8, wh, 0.016, (WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2),
    ])!
    return {
      face: faceGeometry(),
      // the return: one unit each way, scaled to the version's thickness (x) and the return's depth (z)
      ret: new THREE.BoxGeometry(1, PANEL.h, 1).translate(-0.5, 0, -0.5),
      // the floor of the cut: its own darker, rougher core
      floor: new THREE.PlaneGeometry(CUT.x1 - CUT.x0, CUT.y1 - CUT.y0),
      frame,
      pane: new THREE.BoxGeometry(ww - pr, wh - pr, 0.004).translate(cx, (WIN.y0 + WIN.y1) / 2, 0),
      bar: ribbedBar(1, 0.006),
      strand: new THREE.BoxGeometry(0.0018, 1, 0.0006),
      wire: new THREE.CylinderGeometry(0.00065, 0.00065, 1, 6, 1),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      m.concrete.map?.dispose()
      m.core.map?.dispose()
      Object.values(m).forEach((x) => x.dispose())
    },
    [geo, m],
  )

  // a grid of bars across the spandrel, carrying on into the concrete either side of the cut and
  // stopping short of the window
  const bars = useMemo(() => {
    const out: THREE.Matrix4[] = []
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    for (const y of [-0.165, -0.085]) out.push(new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0.004), q, new THREE.Vector3(1, PANEL.w - 0.03, 1)))
    const y0 = -PANEL.h / 2 + 0.015
    const y1 = WIN.y0 - 0.025
    for (const x of [-0.31, -0.23, -0.15]) out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, (y0 + y1) / 2, -0.009), new THREE.Quaternion(), new THREE.Vector3(1, y1 - y0, 1)))
    return out
  }, [])
  const glass = useMemo(() => coreFibres(110, 0.026, 0.12, 5), [])
  const steel = useMemo(() => coreFibres(240, 0.014, 0.3, 21), [])
  const setInstances = (list: THREE.Matrix4[]) => (el: THREE.InstancedMesh | null) => {
    if (!el) return
    list.forEach((mx, i) => el.setMatrixAt(i, mx))
    el.instanceMatrix.needsUpdate = true
    el.computeBoundingSphere()
  }

  const face = useRef<THREE.Mesh>(null)
  const ret = useRef<THREE.Mesh>(null)
  const floor = useRef<THREE.Mesh>(null)
  const barG = useRef<THREE.Group>(null)
  const glassG = useRef<THREE.Group>(null)
  const steelG = useRef<THREE.Group>(null)
  const meshG = useRef<THREE.Group>(null)

  useFrame(() => {
    const st = Math.min(3, Math.max(0, stage.value))
    const t = PANEL.thick + (PANEL.thin - PANEL.thick) * smooth(0.25, 0.75, st)
    if (face.current) face.current.scale.z = t
    if (ret.current) {
      ret.current.position.set(PANEL.w / 2, 0, t / 2)
      ret.current.scale.set(t, 1, PANEL.ret + t)
    }
    if (floor.current) floor.current.position.z = t * CUT.floor + 0.0002
    const bar = 1 - smooth(0.15, 0.4, st)
    const gl = smooth(0.55, 0.8, st) * (1 - smooth(1.25, 1.5, st))
    const sf = smooth(1.5, 1.75, st) * (1 - smooth(2.25, 2.5, st))
    if (barG.current) {
      barG.current.visible = bar > 0.01
      barG.current.position.z = t / 2 - 0.03
    }
    m.bar.opacity = bar
    if (glassG.current) glassG.current.visible = gl > 0.01
    m.glass.opacity = gl
    if (steelG.current) steelG.current.visible = sf > 0.01
    m.steel.opacity = sf
    if (meshG.current) meshG.current.visible = st > 2.45
    // the shadow takes the ground the panel stands on
    const k = Math.min(2, Math.floor(st))
    const f = smooth(0.2, 0.8, st - k)
    m.catcher.opacity = SHADOW[k] + (SHADOW[k + 1] - SHADOW[k]) * f
    m.catcher.color.copy(SHADOW_TINT[k]).lerp(SHADOW_TINT[k + 1], f)
  }, -2)

  return (
    <group>
      <mesh ref={face} geometry={geo.face} material={m.concrete} castShadow receiveShadow />
      <mesh ref={ret} geometry={geo.ret} material={m.concrete} castShadow receiveShadow />
      <mesh ref={floor} geometry={geo.floor} material={m.core} position={[CUT_C[0], CUT_C[1], 0]} receiveShadow />
      <mesh geometry={geo.frame} material={m.frame} castShadow />
      <mesh geometry={geo.pane} material={m.pane} renderOrder={2} />
      <group ref={barG}>
        <instancedMesh args={[geo.bar, m.bar, bars.length]} ref={setInstances(bars)} castShadow frustumCulled={false} />
      </group>
      <group ref={glassG}>
        <instancedMesh args={[geo.strand, m.glass, glass.length]} ref={setInstances(glass)} frustumCulled={false} />
      </group>
      <group ref={steelG}>
        <instancedMesh args={[geo.wire, m.steel, steel.length]} ref={setInstances(steel)} frustumCulled={false} />
      </group>
      <group ref={meshG} position={[CUT_C[0], CUT_C[1], 0]} visible={false}>
        <MeshInset nx={24} ny={14} lod={1.6} />
      </group>
      <mesh position={[0, -PANEL.h / 2 - 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.catcher} receiveShadow>
        <planeGeometry args={[3, 3]} />
      </mesh>
      <Anchor bus={bus} id="cp-cut" position={[CUT.x0 + 0.07, CUT.y0 + 0.06, 0.004]} />
      <Anchor bus={bus} id="cp-edge" position={[PANEL.w / 2, -0.16, PANEL.thin / 2]} />
    </group>
  )
}

/** where the camera looks: the panel's middle, and the cut */
export const PANEL_TARGET: [number, number, number] = [0, -0.01, 0]
export const CUT_TARGET: [number, number, number] = [CUT_C[0] + 0.02, CUT_C[1] + 0.02, 0]
