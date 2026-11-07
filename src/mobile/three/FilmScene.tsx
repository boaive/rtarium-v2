import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, useGLTF } from '@react-three/drei'
import { MeshField, PITCH, cellUrl, useCell, useYarnMaterial } from '../../three/mesh/MeshField'
import { THICKNESS_OPTIONS, type Thickness } from '../../content/technical'
import { clamp01, damp, lerp, smoothstep } from '../../lib/motion'
import { FILM_STEPS, type FilmState } from './film'

/**
 * The phone homepage's one 3D scene: the real RTARIUM cell (V1's Blender model, instanced), the
 * site's yarn shader and lighting, shot by one camera that the scroll carries through four
 * shots, one per step of the film: the piece lying on the yellow ground and woven out from its
 * middle; the corner of the sheet, close, where its two faces and the fibres between them read;
 * a small tile with the three directions it carries load in (and, on request, the flat mesh it
 * replaces); and the camera between the faces, in the open core. Each shot is framed in the band
 * of the screen its step leaves clear (`FilmState.zones`), so the mesh never sits under copy.
 */

type V3 = [number, number, number]

interface Shot {
  tgt: V3
  /** camera elevation and azimuth (deg), distance (m), vertical field of view (deg) */
  elev: number
  azim: number
  dist: number
  fov: number
  /** the clear band (px, [width, height]) the distance is set for, on an 844 px tall screen */
  ref: [number, number]
  /** the camera is inside the sheet: it fills the band whatever its size */
  inside?: boolean
  /** cells built across the warp and the weft */
  win: [number, number]
  fog: [number, number]
  /** the piece above its shadow (m), and turned off the level (deg) */
  lift: number
  tilt: [number, number]
  /** slow turn either side (deg) */
  sway: number
  shadow: number
  dim: V3
  glow: V3
  /** where the key light comes from, before it turns with the camera */
  key: V3
}

const FIELD = 40
const TILE = 18
const H = (TILE * PITCH) / 2
const DEG = Math.PI / 180
const SWAY_PERIOD = 16
const INTRO = { delay: 0.25, duration: 2.1 }
const DROP = { height: 0.045, k: 70, c: 7.5, tilt: 0.28 }

const SHOTS: Shot[] = [
  // the opening: the piece hovering over its shadow, below the name
  { tgt: [0, 0.004, 0], elev: 32, azim: 50, dist: 0.86, fov: 30, ref: [390, 400], win: [14, 10], fog: [3, 6], lift: 0.024, tilt: [0, 9], sway: 5, shadow: 1, dim: [1, 1, 1], glow: [0, 0, 0], key: [-0.5, 0.82, 0.42] },
  // the corner of the sheet, low and close: two faces, the fibres between them, the depth
  { tgt: [H - 0.032, -0.001, H - 0.03], elev: 15, azim: 40, dist: 0.2, fov: 30, ref: [390, 400], win: [TILE, TILE], fog: [0.24, 0.8], lift: 0, tilt: [0, 0], sway: 4, shadow: 1, dim: [1, 1, 1], glow: [0, 0, 0], key: [0.32, 1, 0.42] },
  // a small tile and its three directions; the fibres lit a little
  { tgt: [0.016, 0.012, -0.004], elev: 30, azim: 38, dist: 0.6, fov: 28, ref: [390, 400], win: [12, 12], fog: [0.4, 0.9], lift: 0, tilt: [0, 0], sway: 5, shadow: 1, dim: [0.8, 0.8, 1.4], glow: [0, 0, 0.12], key: [0.32, 1, 0.42] },
  // between the faces, looking down the open core: the camera stands midway between two rows of
  // connecting fibres (they stand at 3 and 9 mm of each 12 mm cell), so they line the way like columns
  { tgt: [0.006, 0, -0.068], elev: 0, azim: 0, dist: 0.11, fov: 66, ref: [390, 400], inside: true, win: [FIELD, FIELD], fog: [0.12, 0.45], lift: 0, tilt: [0, 0], sway: 0.4, shadow: 0, dim: [1, 1, 1], glow: [0, 0, 0], key: [0.32, 1, 0.42] },
]

/** points of the sheet that labels pin to, in the sheet's frame, for the 10 mm cell (see anchorAt) */
const ANCHORS: Record<string, V3> = {
  'hero-structure': [-0.062, 0.0052, -0.046],
  // on the corner shot: a warp of the upper face, a connecting fibre at mid-depth, a weft of the lower face
  'upper-face': [0.07, 0.0052, 0.078],
  fibres: [0.093, 0, 0.099],
  'lower-face': [0.102, -0.0052, 0.1],
  dimension: [0.082, 0, H + 0.0045],
  'axis-x': [0.064, 0.012, 0.02],
  'axis-y': [0.012, 0.012, -0.044],
  'axis-z': [0.012, 0.058, 0.02],
  // inside: the upper face's warp overhead, a fibre of the left-hand row, the lower face's weft below
  'core-a': [0.006, 0.004, 0.018],
  'core-fibres': [0.003, 0, 0.027],
  'core-b': [0.006, -0.004, 0.024],
}

/** a point on a face moves out or in with the faces for another thickness */
function anchorAt(p: V3, thickness: number, out: THREE.Vector3) {
  const y = Math.abs(p[1]) <= 0.0062 ? p[1] + Math.sign(p[1]) * ((thickness - 10) / 2000) : p[1]
  return out.set(p[0], y, p[2])
}

const GROUND = new THREE.Color('#fdd001')
const LOOK = { face: new THREE.Color('#a07a55'), pile: new THREE.Color('#4a3322') }

const vA = new THREE.Vector3()
const vPos = new THREE.Vector3()

/** a soft rectangular shadow, drawn once: dense under the piece, falling off past its edges */
function shadowTexture() {
  const n = 128
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const img = g.createImageData(n, n)
  const edge = (u: number) => {
    const d = Math.abs(u - 0.5) * 2 // 0 centre .. 1 edge
    return 1 - smoothstep(0.7, 1, d)
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = edge((x + 0.5) / n) * edge((y + 0.5) / n)
      const i = (y * n + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(a * 255)
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** One thickness of the sheet; the previous one stands in while another loads. */
function Field({ t, material, onShown, groupRef }: { t: Thickness; material: THREE.Material; onShown: (t: Thickness) => void; groupRef: (g: THREE.Group | null) => void }) {
  const cell = useCell(t)
  useEffect(() => onShown(t), [t, onShown])
  return <MeshField cell={cell} nx={FIELD} nz={FIELD} material={material} chunk={6} lodDistance={0.16} farDistance={0.9} reach={0.04} groupRef={groupRef} />
}

export function FilmScene({ film, thickness, reduced, onReady }: { film: FilmState; thickness: Thickness; reduced: boolean; onReady: () => void }) {
  const yarn = useYarnMaterial({ lite: true })
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const [shown, setShown] = useState<Thickness>(thickness)

  const tile = useRef<THREE.Group>(null)
  const field = useRef<THREE.Group | null>(null)
  const setField = useMemo(() => (g: THREE.Group | null) => void (field.current = g), [])
  const keyLight = useRef<THREE.DirectionalLight>(null)
  const rimLight = useRef<THREE.DirectionalLight>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const axes = useRef<THREE.Group>(null)
  const dimension = useRef<THREE.Group>(null)

  const st = useRef({
    started: 0,
    p: -1,
    yaw: 0,
    winX: 0,
    winZ: 0,
    weaveX: 1,
    weaveZ: 1,
    weaveToX: 1,
    weaveToZ: 1,
    band: 0.5,
    flat: 0,
    axes: 0,
    dim: 0,
    drop: { y: DROP.height, v: 0, tilt: DROP.tilt, vt: 0 },
  })

  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({ map: shadowTexture(), color: '#4a3000', transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }), [])
  const inkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#080808', toneMapped: false, fog: false }), [])
  useEffect(
    () => () => {
      shadowMat.map?.dispose()
      shadowMat.dispose()
      inkMat.dispose()
    },
    [shadowMat, inkMat],
  )

  useEffect(() => {
    gl.setClearColor(0x000000, 0)
    gl.toneMappingExposure = 1.05
  }, [gl])

  // the other thicknesses load once the opening has been woven, so a tap on one swaps at once
  useEffect(() => {
    const id = window.setTimeout(() => {
      for (const t of THICKNESS_OPTIONS) useGLTF.preload(cellUrl(t), false, false)
    }, 2600)
    return () => window.clearTimeout(id)
  }, [])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const s = st.current
    const camera = state.camera as THREE.PerspectiveCamera
    const vw = state.size.width
    const vh = state.size.height
    const now = performance.now()
    if (!s.started) {
      s.started = now
      onReady()
    }
    const since = (now - s.started) / 1000
    const rv = reduced ? 1 : smoothstep(0, 1.2, since)
    const intro = reduced ? 1 : smoothstep(INTRO.delay, INTRO.delay + INTRO.duration, since)

    // ---- where the scroll has taken the film (damped) ------------------------------------------
    const last = FILM_STEPS - 1
    const stepH = film.stepH || vh
    const top = film.section ? film.section.getBoundingClientRect().top : 0
    const target = Math.min(last, Math.max(0, -top / stepH))
    if (s.p < 0 || reduced) s.p = reduced ? Math.round(target) : target
    else s.p = damp(s.p, target, 9, dt)
    if (Math.abs(s.p - target) < 1e-4) s.p = target
    const p = s.p
    const i = Math.min(last - 1, Math.floor(p))
    const t = smoothstep(0, 1, p - i)
    const A = SHOTS[i]
    const B = SHOTS[i + 1]
    /** how settled on step k the film is: 1 there, 0 a third of a step away */
    const near = (k: number) => clamp01(1 - Math.abs(p - k) * 3)

    // ---- the frame: each shot in the clear band of its own step ---------------------------------
    const zone = (k: number) => film.zones[k] ?? { top: vh * 0.1, bottom: vh * 0.55, left: 0, right: vw }
    const fit = (shot: Shot, k: number) => {
      if (shot.inside) return shot.dist
      const z = zone(k)
      const scale = Math.min((z.bottom - z.top) / shot.ref[1], (z.right - z.left) / shot.ref[0])
      return (shot.dist * (vh / 844)) / Math.max(0.3, scale)
    }
    const dist = Math.exp(lerp(Math.log(fit(A, i)), Math.log(fit(B, i + 1)), t))
    const za = zone(i)
    const zb = zone(i + 1)
    const z = { top: lerp(za.top, zb.top, t), bottom: lerp(za.bottom, zb.bottom, t), left: lerp(za.left, zb.left, t), right: lerp(za.right, zb.right, t) }
    const fx = (z.left + z.right) / 2 / vw
    const fy = (z.top + z.bottom) / 2 / vh
    const tgt = lerp3(A.tgt, B.tgt, t)
    const fov = lerp(A.fov, B.fov, t)
    const sway = reduced ? 0 : lerp(A.sway, B.sway, t) * Math.sin((since * Math.PI * 2) / SWAY_PERIOD)

    // the finger turns it; let go, it drifts back
    if (!film.dragging) film.yaw = damp(film.yaw, 0, 0.7, dt)
    s.yaw = damp(s.yaw, film.yaw, 12, dt)
    // inside the sheet a full turn would swing the camera through the fibres: only a glance there
    const reach = lerp(A.inside ? 0.12 : 1, B.inside ? 0.12 : 1, t)
    const azim = (lerp(A.azim, B.azim, t) + sway) * DEG + s.yaw * reach
    const elev = lerp(A.elev, B.elev, t) * DEG
    vPos.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), Math.cos(elev) * Math.cos(azim)).multiplyScalar(dist).add(vA.set(...tgt))
    camera.position.copy(vPos)
    camera.up.set(0, 1, 0)
    camera.lookAt(tgt[0], tgt[1], tgt[2])
    camera.fov = fov
    camera.near = lerp(A.inside ? 0.0008 : 0.004, B.inside ? 0.0008 : 0.004, t)
    camera.far = 8
    camera.setViewOffset(vw, vh, vw / 2 - fx * vw, vh / 2 - fy * vh, vw, vh)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    scene.environmentRotation.y = azim

    // ---- the build: woven out at first, then grown or trimmed to each shot ----------------------
    const wx0 = s.winX
    const wz0 = s.winZ
    const wk = reduced ? 1e4 : 9
    s.winX = damp(s.winX, lerp(A.win[0], B.win[0], t) * intro, wk, dt)
    s.winZ = damp(s.winZ, lerp(A.win[1], B.win[1], t) * intro, wk, dt)
    if (s.winX - wx0 > 1e-4) s.weaveToX = 1
    else if (s.winX - wx0 < -1e-4) s.weaveToX = 0
    if (s.winZ - wz0 > 1e-4) s.weaveToZ = 1
    else if (s.winZ - wz0 < -1e-4) s.weaveToZ = 0
    s.weaveX = reduced ? s.weaveToX : damp(s.weaveX, s.weaveToX, 12, dt)
    s.weaveZ = reduced ? s.weaveToZ : damp(s.weaveZ, s.weaveToZ, 12, dt)
    const growth = (Math.abs(s.winX - wx0) + Math.abs(s.winZ - wz0)) / Math.max(dt, 1e-3)
    s.band = reduced ? 0.5 : damp(s.band, 0.5 + Math.min(5, growth * lerp(0.16, 0.085, (s.weaveX + s.weaveZ) / 2)), 6, dt)

    // the flat mesh: only the upper face, on the Depth step and only while it is chosen
    s.flat = damp(s.flat, film.flat && p > 1.5 && p < 2.5 ? 1 : 0, reduced ? 1e4 : 3.2, dt)

    const u = yarn.uniforms
    u.uWin.value.set(s.winX, s.winZ)
    u.uBand.value = s.band
    u.uWeave.value.set(s.weaveX, s.weaveZ)
    const dim = lerp3(A.dim, B.dim, t)
    const glow = lerp3(A.glow, B.glow, t)
    u.uPartDim.value.set(dim[0], dim[1], dim[2])
    u.uPartGlow.value.set(glow[0], glow[1], glow[2])
    u.uPartVis.value.set(1, 1 - s.flat, 1 - s.flat)
    u.uFaceColor.value.copy(LOOK.face)
    u.uPileColor.value.copy(LOOK.pile)
    u.uFlex.value = 0
    u.uXray.value = 0
    u.uExplode.value = 0
    if (field.current) {
      // chunks wholly outside the build are not drawn at all
      for (const m of field.current.children) {
        const nr = m.userData.near as [number, number] | undefined
        if (nr) m.visible = nr[0] < s.winX / 2 + 0.5 && nr[1] < s.winZ / 2 + 0.5
      }
    }

    // ---- the piece: it lands as it is woven, hovers over its shadow beside the name, then lies down
    const d = s.drop
    if (reduced) {
      d.y = 0
      d.tilt = 0
    } else if (since > 0.25) {
      const n = Math.ceil(dt / (1 / 120))
      const h = dt / n
      for (let k = 0; k < n; k++) {
        d.v += (-DROP.k * d.y - DROP.c * d.v) * h
        d.y += d.v * h
        d.vt += (-DROP.k * 0.6 * d.tilt - DROP.c * 0.8 * d.vt) * h
        d.tilt += d.vt * h
      }
    }
    const opening = 1 - clamp01(p)
    const lift = lerp(A.lift, B.lift, t)
    const tilt = lerp3([A.tilt[0], A.tilt[1], 0], [B.tilt[0], B.tilt[1], 0], t)
    if (tile.current) {
      tile.current.position.y = d.y * opening + lift
      tile.current.rotation.x = tilt[0] * DEG + d.tilt * 0.6 * opening
      tile.current.rotation.z = tilt[1] * DEG + d.tilt * 0.25 * opening
      tile.current.updateMatrixWorld()
    }
    if (shadow.current) {
      const sh = lerp(A.shadow, B.shadow, t)
      shadow.current.visible = sh > 0.01
      shadow.current.position.y = -shown / 2000 - 0.0012
      shadow.current.scale.set(Math.max(1, s.winX) * PITCH * 1.16, Math.max(1, s.winZ) * PITCH * 1.2, 1)
      shadowMat.opacity = sh * 0.3 * intro * rv
    }

    // ---- what belongs to one step: the depth dimension, the three axes -------------------------
    const ek = reduced ? 1e4 : 3.4
    s.dim = damp(s.dim, near(1) > 0.5 ? 1 : 0, ek, dt)
    if (dimension.current) {
      dimension.current.visible = s.dim > 0.05
      dimension.current.scale.set(1, (shown / 10) * Math.max(0.001, s.dim), 1)
    }
    s.axes = damp(s.axes, near(2) > 0.5 ? 1 : 0, ek, dt)
    if (axes.current) {
      axes.current.visible = s.axes > 0.01
      // X, then Y, then Z grow one after the other
      axes.current.children.forEach((a, k) => a.scale.setScalar(0.001 + clamp01(s.axes * 3 - k)))
    }

    // ---- light and fog ---------------------------------------------------------------------------
    scene.environmentIntensity = 1.1 * rv
    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      fog.color.copy(GROUND)
      fog.near = lerp(A.fog[0], B.fog[0], t)
      fog.far = lerp(A.fog[1], B.fog[1], t)
    }
    const key = keyLight.current
    if (key) {
      key.intensity = 2.6 * rv
      key.target.position.set(tgt[0], tgt[1], tgt[2])
      key.target.updateMatrixWorld()
      const kv = lerp3(A.key, B.key, t)
      key.position.set(tgt[0], tgt[1], tgt[2]).add(vA.set(kv[0], kv[1], kv[2]).applyAxisAngle(THREE.Object3D.DEFAULT_UP, azim).normalize().multiplyScalar(1.2))
    }
    if (rimLight.current) {
      rimLight.current.intensity = 1.6 * rv
      rimLight.current.position.set(-0.6, 0.35, -0.9).applyAxisAngle(THREE.Object3D.DEFAULT_UP, azim)
    }

    // ---- labels: each on its own step, at its point of the mesh, inside the step's clear band ----
    for (const [anchor, el] of film.labels) {
      const step = Number(el.dataset.step)
      const a = ANCHORS[anchor]
      const shownOn = reduced ? (Math.round(p) === step ? 1 : 0) : near(step) * (anchor === 'dimension' ? s.dim : 1) * (step === 0 ? intro : 1)
      if (!a || !tile.current || shownOn < 0.02) {
        if (el.style.opacity !== '0') el.style.opacity = '0'
        continue
      }
      anchorAt(a, shown, vA).applyMatrix4(tile.current.matrixWorld).project(camera)
      const x = (vA.x * 0.5 + 0.5) * vw
      const y = (-vA.y * 0.5 + 0.5) * vh
      if (vA.z >= 1 || x < z.left + 4 || x > z.right - 4 || y < z.top || y > z.bottom) {
        if (el.style.opacity !== '0') el.style.opacity = '0'
        continue
      }
      // where the name goes: beside the point at its own offset, or level with it in a column of the
      // screen; either way it turns to the other side rather than run off the screen
      // (the name stays inside the part of the screen the mesh has, so it never runs under the copy)
      const L = Math.max(6, z.left + 4)
      const R = Math.min(vw - 6, z.right - 4)
      const w = Number(el.dataset.w) || 120
      let dy = Number(el.dataset.dy) || 0
      if (y + dy > vh - 18 || y + dy < z.top - 24) dy = -dy
      let dx: number
      let left: boolean
      if (el.dataset.col) {
        const col = Math.min(z.left + Number(el.dataset.col) * (z.right - z.left), R - w)
        left = col < x + 16
        dx = left ? -22 : col - x
      } else {
        dx = Number(el.dataset.dx) || 0
        left = dx < 0
        if (!left && x + dx + w > R) {
          dx = -dx
          left = true
        } else if (left && x + dx - w < L) {
          dx = -dx
          left = false
        }
      }
      if ((left && x + dx - w < L) || (!left && x + dx + w > R)) {
        if (el.style.opacity !== '0') el.style.opacity = '0'
        continue
      }
      el.style.setProperty('--dx', `${dx.toFixed(1)}px`)
      el.style.setProperty('--dy', `${dy.toFixed(1)}px`)
      el.style.setProperty('--len', `${Math.hypot(dx, dy).toFixed(1)}px`)
      el.style.setProperty('--ang', `${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)}deg`)
      el.classList.toggle('is-left', left)
      el.style.opacity = shownOn.toFixed(3)
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    }
  })

  // development aid: project points of the sheet and adjust the shots from the console
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__mfilm = {
      shots: SHOTS,
      anchors: ANCHORS,
      project: (p: V3) => {
        if (!tile.current) return null
        const v = new THREE.Vector3(...p).applyMatrix4(tile.current.matrixWorld).project(camera)
        return [Math.round((v.x * 0.5 + 0.5) * size.width), Math.round((-v.y * 0.5 + 0.5) * size.height)]
      },
    }
    return () => void delete w.__mfilm
  }, [camera, size])

  const half = 0.005
  return (
    <>
      <fog attach="fog" args={['#fdd001', 3, 6]} />
      <group ref={tile}>
        <Suspense fallback={<Field t={shown} material={yarn.material} onShown={setShown} groupRef={setField} />}>
          <Field t={thickness} material={yarn.material} onShown={setShown} groupRef={setField} />
        </Suspense>
        {/* the depth between the outer faces, at the near edge of the sheet */}
        <group ref={dimension} position={ANCHORS.dimension} visible={false}>
          <mesh material={inkMat} scale={[0.00045, half * 2, 0.00045]}>
            <boxGeometry />
          </mesh>
          <mesh material={inkMat} position={[0, half, 0]} scale={[0.0005, 0.00045, 0.0055]}>
            <boxGeometry />
          </mesh>
          <mesh material={inkMat} position={[0, -half, 0]} scale={[0.0005, 0.00045, 0.0055]}>
            <boxGeometry />
          </mesh>
        </group>
      </group>

      {/* the ground the piece lies on, as a soft shadow only */}
      <mesh ref={shadow} material={shadowMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry />
      </mesh>

      {/* X, Y and Z: the directions the mesh carries load in */}
      <group ref={axes} position={[0.012, 0.012, 0.02]} visible={false}>
        {(
          [
            { rot: [0, 0, -Math.PI / 2], len: 0.05 },
            { rot: [-Math.PI / 2, 0, 0], len: 0.062 },
            { rot: [0, 0, 0], len: 0.044 },
          ] as { rot: V3; len: number }[]
        ).map((a, k) => (
          <group key={k} rotation={a.rot}>
            <mesh material={inkMat} position={[0, a.len / 2, 0]}>
              <cylinderGeometry args={[0.00055, 0.00055, a.len, 8]} />
            </mesh>
            <mesh material={inkMat} position={[0, a.len, 0]}>
              <coneGeometry args={[0.002, 0.006, 16]} />
            </mesh>
          </group>
        ))}
      </group>

      <directionalLight ref={keyLight} color="#fff6e8" intensity={0} />
      <directionalLight ref={rimLight} color="#cfdcf2" intensity={0} position={[-0.6, 0.35, -0.9]} />

      {/* the same studio as the desktop stage, so the basalt reads the same on every screen */}
      <Environment resolution={256} frames={1} background={false}>
        <color attach="background" args={['#060606']} />
        <Lightformer form="rect" intensity={3.2} color="#ffffff" position={[-1.6, 3, 0.6]} scale={[0.9, 6, 1]} target={[-1.6, 0, 0.6]} />
        <Lightformer form="rect" intensity={3.6} color="#fffaf2" position={[0.4, 3, 0.9]} scale={[1.1, 6, 1]} target={[0.4, 0, 0.9]} />
        <Lightformer form="rect" intensity={2.6} color="#ffffff" position={[2.3, 3, 0.2]} scale={[0.8, 6, 1]} target={[2.3, 0, 0.2]} />
        <Lightformer form="rect" intensity={6} color="#dfe9ff" position={[-3, 0.5, -3]} scale={[6, 0.4, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2.4} color="#ffcf6a" position={[3.5, 0.5, 1.5]} scale={[1.4, 1.4, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[0, 0.8, 4]} scale={[7, 1.2, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.3} color="#ffffff" position={[0, -3, 0]} scale={[6, 6, 1]} target={[0, 0, 0]} />
      </Environment>
    </>
  )
}
