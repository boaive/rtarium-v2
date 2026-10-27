import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshInset } from '../MeshInset'
import { Anchor } from '../Stage3D'
import { PITCH_M, setOpacity, type LabelBus, type Shot } from '../kit'
import { smooth, type Progress } from '../../progress'
import { prefersReducedMotion } from '../../../lib/motion'
import { BUILD, GLASS_RECT, LAYERS, U, Z, gasketGeometry, latticeGeometry, type Layer } from './parts'
import { useUnitGeometries, useUnitMaterials } from './useUnit'

/**
 * The unit, put together layer by layer as the page scrolls (Unitized page, "Six layers").
 *
 * The frame stands first. Each layer after it is lowered in and set down in front of the last,
 * held apart from it (the burst), so every layer is seen whole. The thin panel comes as RTARIUM
 * first: the textile in the panel's shape, drawn as an X-ray inside the panel's outline; then the
 * concrete is cast round it, a scan running down the panel and leaving it solid, and the skin is
 * marked 20 mm. When all six are in, they close up into the finished unit.
 *
 * Where everything is follows the scroll alone. On their own clock, while on screen: the layers
 * held apart float a little; a light crosses the glass; the membrane ripples; the gasket is drawn
 * round the window as it arrives; a layer's edges flash yellow as it lands.
 */

/** when each layer is lowered in (fractions of the section's run); the panel's is RTARIUM alone */
export const ARRIVE: (readonly [number, number])[] = [
  [0.02, 0.1],
  [0.13, 0.21],
  [0.24, 0.32],
  [0.35, 0.43],
  [0.46, 0.54],
  [0.57, 0.65],
]
/** the concrete cast round the textile, then the stack closes */
export const CAST = [0.67, 0.77] as const
export const CLOSE = [0.83, 0.94] as const
/** how far apart they are held (m, along z) */
const GAP = 0.8
const DROP = 4.4
/** the client's numbering: 1 is the face of the building */
export const NUMBER = Object.fromEntries(LAYERS.map((l, i) => [l, i + 1])) as Record<Layer, number>
const PANEL_CUT: [number, number, number, number] = [0.1, 0.24, 0.42, 0.76]

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
/** a graphite rubber with a soft sheen: the building's near-black gasket is lost against the studio's dark */
const rubber = (m: THREE.MeshStandardMaterial) => {
  m.color.set('#62666a')
  m.roughness = 0.4
  return m
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** how far each layer has come in (0..1), how far the concrete is cast, how far the stack has closed */
export function burstAt(p: number) {
  const arrive = ARRIVE.map(([a, b]) => clamp01((p - a) / (b - a)))
  return { arrive, cast: smooth(CAST[0], CAST[1], p), close: smooth(CLOSE[0], CLOSE[1], p) }
}

/** the camera, by the run: it keeps the stack framed as it grows, then comes round to the closed unit */
export function burstShot(p: number, compact: boolean): Shot {
  const { arrive, close } = burstAt(p)
  let depth = 0
  arrive.forEach((a, k) => (depth = Math.max(depth, k * GAP * easeOut(a))))
  depth *= 1 - close
  const after = smooth(CLOSE[1], 1, p)
  const k = compact ? 1.32 : 1
  return {
    target: [U.w / 2 + depth * 0.06, U.h / 2 - 0.12, Z.panel[1] / 2 + depth / 2],
    dist: (8.9 + depth * 1.3 - close * 0.4) * k,
    azim: 54 - close * 20 - after * 6,
    elev: 13 - close * 4,
    frame: [0.5, 0.52],
  }
}

/** a soft band of light, for the reflection that crosses the glass */
function sheenTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 4
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 256, 0)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.42, 'rgba(255,255,255,0)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.58, 'rgba(255,255,255,0)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 4)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.ClampToEdgeWrapping
  return t
}

export function BurstUnit({ progress, focus, bus, live }: { progress: Progress; focus: Layer | null; bus: LabelBus; live: { current: boolean } }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])
  const geo = useUnitGeometries(PANEL_CUT)
  const base = useUnitMaterials()
  // a fuller loop than the building's, so it reads at the burst's distance
  const gasketGeo = useMemo(() => gasketGeometry(0.019), [])
  useEffect(() => () => gasketGeo.dispose(), [gasketGeo])
  // the cast: concrete is kept above the scan line, the scan's band just above it
  const cast = useMemo(() => ({ solid: new THREE.Plane(new THREE.Vector3(0, 1, 0), -1e3), band: new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e3) }), [])
  // each layer its own copies, so one can be dimmed apart from the rest
  const mats = useMemo(() => {
    const c = <T extends THREE.Material>(x: T) => {
      const y = x.clone() as T
      y.userData = { ...x.userData }
      return y
    }
    const concrete = c(base.concrete)
    const anchors = c(base.darkSteel)
    concrete.clippingPlanes = [cast.solid]
    anchors.clippingPlanes = [cast.solid]
    return {
      frame: [c(base.steel)],
      window: [c(base.alu), c(base.glass)],
      // the gasket's rubber lighter than on the building, so it reads against the studio's dark
      gasket: [rubber(c(base.gasket))],
      vapour: [c(base.vapour)],
      insulation: [c(base.insulation)],
      panel: [concrete, anchors],
    } satisfies Record<Layer, THREE.Material[]>
  }, [base, cast])
  const lattice = useMemo(latticeGeometry, [])
  const x = useMemo(
    () => ({
      // the textile, warm against the studio's dark; the panel's outline as a drawing
      lattice: new THREE.LineBasicMaterial({ color: '#d9a066', transparent: true, opacity: 0, toneMapped: false }),
      outline: new THREE.LineBasicMaterial({ color: '#f2f0e9', transparent: true, opacity: 0, toneMapped: false }),
      scan: new THREE.MeshBasicMaterial({ color: '#fdd001', toneMapped: false, side: THREE.DoubleSide, clippingPlanes: [cast.solid, cast.band], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    }),
    [cast],
  )
  const edges = useMemo(() => {
    const out = {} as Record<Layer, THREE.EdgesGeometry | null>
    for (const l of BUILD) out[l] = l === 'gasket' ? null : new THREE.EdgesGeometry(l === 'window' ? geo.window : l === 'panel' ? geo.panel : geo[l], 25)
    return out
  }, [geo])
  const edgeMats = useMemo(() => Object.fromEntries(BUILD.map((l) => [l, new THREE.LineBasicMaterial({ color: '#fdd001', transparent: true, opacity: 0, toneMapped: false })])) as Record<Layer, THREE.LineBasicMaterial>, [])
  const sheen = useMemo(() => {
    const map = sheenTexture()
    map.repeat.set(0.5, 1)
    return new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  }, [])
  const vapourBase = useMemo(() => Float32Array.from(geo.vapour.getAttribute('position').array as Float32Array), [geo])
  useEffect(
    () => () => {
      Object.values(mats).flat().forEach((m) => m.dispose())
      Object.values(edges).forEach((e) => e?.dispose())
      Object.values(edgeMats).forEach((m) => m.dispose())
      Object.values(x).forEach((m) => m.dispose())
      lattice.dispose()
      sheen.map?.dispose()
      sheen.dispose()
    },
    [mats, edges, edgeMats, x, lattice, sheen],
  )

  const groups = useRef<Partial<Record<Layer, THREE.Group | null>>>({})
  const textile = useRef<THREE.Group>(null)
  const sheenMesh = useRef<THREE.Mesh>(null)
  const scan = useRef<THREE.Mesh>(null)
  const st = useRef<Record<string, number>>({})
  const landed = useRef<Record<string, number>>({})
  const last = useRef(-1)

  useEffect(() => {
    const f = () => invalidate()
    progress.listeners.add(f)
    return () => void progress.listeners.delete(f)
  }, [progress, invalidate])
  useEffect(() => invalidate(), [focus, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const now = performance.now()
    const t = now / 1000
    const p = progress.value
    const { arrive, cast: cs, close } = burstAt(p)
    const idle = !reduced && live.current
    const s = st.current
    let moving = false
    const open = 1 - close

    BUILD.forEach((layer, k) => {
      const g = groups.current[layer]
      if (!g) return
      const a = easeOut(arrive[k])
      g.visible = arrive[k] > 0.001
      const float = idle ? 0.016 * Math.sin(t * 0.85 + k * 1.3) * open * a : 0
      g.position.set(0, (1 - a) * DROP + float, k * GAP * open)
      g.rotation.y = (1 - a) * 0.18
      // pointing at a name in the list singles its layer out
      const want = focus && focus !== layer ? 0.14 : 1
      s[`o${layer}`] ??= 1
      const o = s[`o${layer}`]
      const next = o + (want - o) * (1 - Math.exp(-(reduced ? 1e3 : 7) * dt))
      s[`o${layer}`] = Math.abs(next - want) < 1e-3 ? want : next
      if (s[`o${layer}`] !== want) moving = true
      setOpacity(mats[layer], s[`o${layer}`])
      // a layer's edges flash as it lands (the panel's once its concrete is cast)
      const done = layer === 'panel' ? cs >= 1 : arrive[k] >= 1
      if (done && !landed.current[layer]) landed.current[layer] = now
      if (!done) landed.current[layer] = 0
      const since = landed.current[layer] ? (now - landed.current[layer]) / 1000 : 9
      const fl = reduced || close > 0.02 ? 0 : Math.max(0, 1 - since / 0.9) * 0.9
      edgeMats[layer].opacity = fl
      edgeMats[layer].visible = fl > 0.003
      if (fl > 0) moving = true
    })

    // the panel: RTARIUM as a drawing first, then the concrete cast round it, top to bottom
    const pk = BUILD.indexOf('panel')
    const pg = groups.current.panel
    const py = pg ? pg.position.y : 0
    const top = py + U.h + 0.002
    const c = cs >= 1 ? -1e3 : cs <= 0 ? 1e3 : top - (U.h + 0.004) * cs
    cast.solid.constant = -c
    cast.band.constant = c + 0.05
    if (scan.current) scan.current.visible = cs > 0.001 && cs < 0.999
    const dim = (s.opanel ?? 1) * easeOut(arrive[pk])
    x.lattice.opacity = 0.95 * dim * (1 - cs * 0.6)
    x.lattice.visible = x.lattice.opacity > 0.003 && close < 0.999
    x.outline.opacity = 0.55 * dim * (1 - smooth(0.6, 1, cs))
    x.outline.visible = x.outline.opacity > 0.003
    if (textile.current) textile.current.visible = (s.opanel ?? 1) > 0.5 && cs > 0.92

    // the gasket is drawn round the window as it arrives, with the scroll
    const draw = smooth(0.3, 1, arrive[BUILD.indexOf('gasket')])
    const total = gasketGeo.index ? gasketGeo.index.count : 0
    gasketGeo.setDrawRange(0, Math.floor((total * Math.max(0.0001, draw)) / 60) * 60)

    // a light crosses the glass, slowly, again and again
    if (sheenMesh.current) {
      const ph = ((t / 7) % 1) * 1.6 - 0.3
      ;(sheen.map as THREE.Texture).offset.x = idle ? 0.75 - ph : 2
      sheenMesh.current.visible = idle && arrive[BUILD.indexOf('window')] > 0.99 && (s.owindow ?? 1) > 0.5
    }

    // the membrane ripples while it is held apart; closed up, it lies flat
    const amp = idle ? 0.024 * open * easeOut(arrive[BUILD.indexOf('vapour')]) : 0
    if (amp > 0 || last.current !== 0) {
      const pos = geo.vapour.getAttribute('position') as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 2] = vapourBase[i + 2] + amp * Math.sin(vapourBase[i] * 2.6 + t * 1.2) * Math.cos(vapourBase[i + 1] * 1.9 - t * 0.8)
      }
      pos.needsUpdate = true
      geo.vapour.computeVertexNormals()
      last.current = amp
    }

    // balloons while the stack is held apart; once the skin is cast, its 20 mm and the RTARIUM in it
    for (const l of BUILD) {
      const on = arrive[BUILD.indexOf(l)] > 0.98 && close < 0.2 && !focus
      if (on) bus.shown.add(`n-${l}`)
      else bus.shown.delete(`n-${l}`)
    }
    for (const id of ['mark', 'rtarium']) {
      if (cs > 0.98 && !focus) bus.shown.add(id)
      else bus.shown.delete(id)
    }

    if (moving || idle) invalidate()
  }, -2)

  const g = (l: Layer) => (el: THREE.Group | null) => void (groups.current[l] = el)
  const line = (l: Layer) => edges[l] && <lineSegments geometry={edges[l]!} material={edgeMats[l]} />
  const zm = (Z.panel[0] + Z.panel[1]) / 2
  return (
    <group>
      <group ref={g('frame')} visible={false}>
        <mesh geometry={geo.frame} material={mats.frame[0]} castShadow receiveShadow />
        {line('frame')}
        <Anchor bus={bus} id="b-frame" position={[0.035, U.h - 0.035, Z.frame[1]]} />
      </group>
      <group ref={g('window')} visible={false}>
        <mesh geometry={geo.window} material={mats.window[0]} castShadow />
        <mesh geometry={geo.glass} material={mats.window[1]} renderOrder={2} />
        <mesh ref={sheenMesh} position={[(GLASS_RECT.x0 + GLASS_RECT.x1) / 2, (GLASS_RECT.y0 + GLASS_RECT.y1) / 2, GLASS_RECT.z + 0.002]} material={sheen} renderOrder={3}>
          <planeGeometry args={[GLASS_RECT.x1 - GLASS_RECT.x0, GLASS_RECT.y1 - GLASS_RECT.y0]} />
        </mesh>
        {line('window')}
        <Anchor bus={bus} id="b-window" position={[U.x0 + 0.06, U.y1 - 0.06, Z.window[1]]} />
      </group>
      <group ref={g('gasket')} visible={false}>
        <mesh geometry={gasketGeo} material={mats.gasket[0]} />
        <Anchor bus={bus} id="b-gasket" position={[U.x0 + 0.03, U.y0 + 0.5, Z.gasket]} />
      </group>
      <group ref={g('vapour')} visible={false}>
        <mesh geometry={geo.vapour} material={mats.vapour[0]} />
        {line('vapour')}
        <Anchor bus={bus} id="b-vapour" position={[0.06, U.h - 0.06, Z.vapour]} />
      </group>
      <group ref={g('insulation')} visible={false}>
        <mesh geometry={geo.insulation} material={mats.insulation[0]} castShadow receiveShadow />
        {line('insulation')}
        <Anchor bus={bus} id="b-insulation" position={[0.06, U.h - 0.06, Z.insulation[1]]} />
      </group>
      <group ref={g('panel')} visible={false}>
        <lineSegments geometry={lattice} material={x.lattice} />
        <lineSegments geometry={edges.panel!} material={x.outline} />
        <mesh geometry={geo.panel} material={mats.panel[0]} castShadow receiveShadow />
        <mesh geometry={geo.anchors} material={mats.panel[1]} />
        <mesh ref={scan} geometry={geo.panel} material={x.scan} visible={false} />
        <group ref={textile} position={[(PANEL_CUT[0] + PANEL_CUT[2]) / 2, (PANEL_CUT[1] + PANEL_CUT[3]) / 2, zm - 0.003]} visible={false}>
          <Suspense fallback={null}>
            <MeshInset nx={Math.floor((PANEL_CUT[2] - PANEL_CUT[0]) / PITCH_M)} ny={Math.floor((PANEL_CUT[3] - PANEL_CUT[1]) / PITCH_M)} lod={1.2} />
          </Suspense>
        </group>
        {line('panel')}
        <Anchor bus={bus} id="b-panel" position={[0.04, U.h - 0.04, Z.panel[1]]} />
        <Anchor bus={bus} id="b-thick" position={[U.w - 0.002, U.h * 0.62, zm]} />
        {/* the textile where the skin is cut back to it */}
        <Anchor bus={bus} id="b-mesh" position={[(PANEL_CUT[0] + PANEL_CUT[2]) / 2, PANEL_CUT[1] + (PANEL_CUT[3] - PANEL_CUT[1]) * 0.62, zm]} />
      </group>
      <StudioFog />
      {/* the studio floor: a fine grid that goes into the dark, and the shadows on it */}
      <gridHelper args={[18, 36, '#2e2e2e', '#232323']} position={[U.w / 2, -0.012, 1.4]} />
      <mesh position={[U.w / 2, -0.01, 1.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 18]} />
        <shadowMaterial color="#000000" opacity={0.42} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

/** the studio's air: what is far off goes into the container's own dark */
export function StudioFog({ color = '#121212', near = 13, far = 30 }: { color?: string; near?: number; far?: number }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.fog = new THREE.Fog(color, near, far)
    return () => void (scene.fog = null)
  }, [scene, color, near, far])
  return null
}
