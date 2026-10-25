import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, useGLTF } from '@react-three/drei'
import { MeshField, PITCH, cellUrl, useCell, useYarnMaterial } from './mesh/MeshField'
import { PressField } from './mesh/flex'
import { ANCHORS, FIELD, HALF, POSES, TILE, tourPose, type Pose } from './poses'
import { setShared, stage, useStageValue, type PoseId, type Region } from './stageStore'
import { THICKNESS_OPTIONS } from '../content/technical'
import { clamp01, damp, lerp } from '../lib/motion'

/**
 * The one 3D stage of the homepage: a fixed, transparent canvas between the coloured ground and
 * the copy. Every screen in the viewport draws its own view of the mesh inside its own panel
 * (scissored to the panel's visible part), so the 3D rises with its panel exactly as the ground
 * does, and two screens in transition each show their own. A view eases in as its panel arrives
 * and turns a little as it passes, the same both ways; its sequences play once it is reached.
 *
 * The opening is the one scrolled sequence: the panel stands under the name, and as the visitor
 * scrolls the mesh is built out past the edges of the screen and the camera slips between its two
 * faces (`stage.tour`, damped). Time introduces the panel: it drops in and settles with a bounce.
 * The cursor presses the face and it springs back (V1's press field); a press knocks it.
 *
 * The mesh is shown in its own colour, basalt, on every ground. In Tech Space a figure under the
 * cursor (`stage.inspect`) makes the mesh show what it means.
 */

interface Props {
  compact: boolean
  reduced: boolean
}

const GROUND = {
  yellow: new THREE.Color('#fdd001'),
  black: new THREE.Color('#080808'),
  light: new THREE.Color('#f2f0e9'),
}
/** basalt: a warm bronze-brown roving, the connecting fibres darker (as in the production shoot) */
const LOOK = {
  day: { face: new THREE.Color('#a07a55'), pile: new THREE.Color('#4a3322') },
  night: { face: new THREE.Color('#9c7650'), pile: new THREE.Color('#47301f') },
}
const KEY = { day: new THREE.Color('#fff6e8'), night: new THREE.Color('#ffd9a0') }
/** how fast a view settles on its pose (1/s) */
const GLIDE = 2.4
/** a view's motion with its panel: farther (fraction), lower (deg) and turned (deg) at one screen away */
const PARALLAX = { dist: 0.14, elev: 5, azim: 12 }
/** the footer's swatch of the mesh: cells across and size drawn (CSS px) */
const SWATCH_CELLS = 8
const SWATCH_CSS = 256
const SWAY_PERIOD = 16
/** the drop: starting height (m), spring stiffness and damping (a visible bounce, then still) */
const DROP = { height: 0.16, k: 70, c: 7.5, tilt: 0.55 }
/** the cursor as a load: footprint radius (m) and depth (m) */
const CURSOR = { radius: 0.022, depth: 0.0068, restMs: 1400 }
/** sheet lengths shown in turn while "Sheet lengths" is under the cursor (cells of the weft) */
const LENGTHS = [18, 25, 32]
const SHEET = FIELD * PITCH

const DEG = Math.PI / 180
const vA = new THREE.Vector3()
const vB = new THREE.Vector3()
const vPos = new THREE.Vector3()
const ndc = new THREE.Vector2()
const hit = new THREE.Vector3()
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const ray = new THREE.Raycaster()
const toLocal = new THREE.Matrix4()
const tourScratch: Pose = { ...POSES.hero }

/** the region across the middle of the screen, else the most visible one */
function activeRegion(vh: number) {
  let best: Region | null = null
  let bestScore = 0
  for (const r of stage.regions) {
    const b = r.el.getBoundingClientRect()
    const visible = Math.min(b.bottom, vh) - Math.max(b.top, 0)
    if (visible <= 1 || b.width < 2) continue
    const score = (b.top <= vh * 0.5 && b.bottom >= vh * 0.5 ? 1e6 : 0) + visible
    if (score > bestScore) {
      best = r
      bestScore = score
    }
  }
  return best
}

function dampVec(v: THREE.Vector3, x: number, y: number, z: number, k: number, dt: number) {
  v.set(damp(v.x, x, k, dt), damp(v.y, y, k, dt), damp(v.z, z, k, dt))
}
function dampColor(c: THREE.Color, t: THREE.Color, k: number, dt: number) {
  c.setRGB(damp(c.r, t.r, k, dt), damp(c.g, t.g, k, dt), damp(c.b, t.b, k, dt))
}
/** shortest way round for angles in degrees */
function dampAngle(a: number, b: number, k: number, dt: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return a + d * (1 - Math.exp(-k * dt))
}

/** a fine concrete texture, drawn once: speckled aggregate on a warm grey */
function concreteTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#9b978e'
  g.fillRect(0, 0, size, size)
  let s = 11
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < 5200; i++) {
    const v = 110 + rnd() * 90
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.25 + rnd() * 0.5})`
    const r = rnd() * 1.6 + 0.3
    g.beginPath()
    g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  return tex
}

/** One screen's own view of the mesh: its camera and its look, damped on their own. */
interface View {
  cam: { tgt: THREE.Vector3; elev: number; azim: number; dist: number; fov: number; fx: number; fy: number; spin: number }
  fx: {
    axes: number
    shear: number
    flat: number
    dim: number
    gap: number
    slabs: number
    slabOpacity: number
    flex: number
    winX: number
    winZ: number
    band: number
    stand: number
    stretch: number
    widthDim: number
    xray: number
    explode: number
    shadow: number
    knockAt: number
  }
  dim: THREE.Vector3
  vis: THREE.Vector3
  glow: THREE.Vector3
  face: THREE.Color
  pile: THREE.Color
  fog: [number, number]
}

/** A view starts where its screen wants it, so the panel arrives already composed. */
function newView(pose: Pose, compact: boolean, o: number): View {
  const frame = compact ? pose.frameCompact : pose.frame
  const dist = (compact ? (pose.distCompact ?? pose.dist) : pose.dist) * (1 + Math.abs(o) * PARALLAX.dist)
  return {
    cam: {
      tgt: new THREE.Vector3(...pose.tgt),
      elev: pose.elev - o * PARALLAX.elev,
      azim: pose.azim + o * PARALLAX.azim,
      dist,
      fov: pose.fov,
      fx: frame[0],
      fy: frame[1],
      spin: 0,
    },
    fx: {
      axes: 0,
      shear: 0,
      flat: 0,
      dim: pose.dimension ? 1 : 0,
      gap: pose.slabs ? pose.slabs.gap + 0.08 : 0.05,
      slabs: pose.slabs ? 1 : 0,
      slabOpacity: pose.slabs?.opacity ?? 1,
      flex: pose.press ? 1 : 0,
      winX: pose.win[0],
      winZ: pose.win[1],
      band: 0.5,
      stand: pose.stand,
      stretch: 1,
      widthDim: 0,
      xray: pose.xray,
      explode: pose.explode,
      shadow: pose.shadow ?? 0,
      knockAt: 0,
    },
    dim: new THREE.Vector3(...pose.dim),
    vis: new THREE.Vector3(...pose.vis),
    glow: new THREE.Vector3(...pose.glow),
    face: LOOK[pose.look].face.clone(),
    pile: LOOK[pose.look].pile.clone(),
    fog: [pose.fog[0], pose.fog[1]],
  }
}

export function StageScene({ compact, reduced }: Props) {
  const thickness = useStageValue('thickness')
  const cell = useCell(thickness)
  const yarn = useYarnMaterial({ lite: compact })
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const keyLight = useRef<THREE.DirectionalLight>(null)
  const rimLight = useRef<THREE.DirectionalLight>(null)
  const tile = useRef<THREE.Group>(null)
  const field = useRef<THREE.Group | null>(null)
  const setField = useMemo(() => (g: THREE.Group | null) => void (field.current = g), [])
  const widthDim = useRef<THREE.Group>(null)
  const axes = useRef<THREE.Group>(null)
  const shear = useRef<THREE.Mesh>(null)
  const dimension = useRef<THREE.Group>(null)
  const slabTop = useRef<THREE.Mesh>(null)
  const slabBottom = useRef<THREE.Mesh>(null)
  const catcher = useRef<THREE.Mesh>(null)

  /** the views of the screens on screen, by screen */
  const views = useRef(new Map<Region, View>())
  /** the pose of the screen holding the middle of the viewport */
  const primaryPose = useRef<PoseId>('hero')
  const started = useRef(0)
  const orbit = useRef({ yaw: 0, pitch: 0 })
  const drop = useRef({ y: DROP.height, v: 0, tilt: DROP.tilt, vt: 0 })
  const cleared = useRef(false)
  const swatchDone = useRef(false)
  const ortho = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 0.6), [])

  const press = useMemo(() => new PressField(96, 96), [])
  useEffect(() => {
    const u = yarn.uniforms
    u.uFlexMap.value = press.texture
    u.uFlexScale.value.set(1 / SHEET, 1 / SHEET)
    return () => press.dispose()
  }, [press, yarn])
  useEffect(() => {
    yarn.uniforms.uPressBand.value.set(-thickness / 2000, 1 / (thickness / 1000))
  }, [yarn, thickness])

  // the other thickness options load once the opening has played
  useEffect(() => {
    const id = window.setTimeout(() => {
      for (const t of THICKNESS_OPTIONS) useGLTF.preload(cellUrl(t), false, false)
    }, 3000)
    return () => window.clearTimeout(id)
  }, [])

  // a press on the opening screen knocks the panel
  useEffect(() => {
    const knock = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('a, button')) return
      if (primaryPose.current !== 'hero' || stage.tour > 0.5 || reduced) return
      drop.current.v -= 0.55
      drop.current.vt += 1.4
    }
    window.addEventListener('pointerdown', knock)
    return () => window.removeEventListener('pointerdown', knock)
  }, [reduced])

  useEffect(() => {
    gl.setClearColor(0x000000, 0)
    gl.autoClear = false
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__stage = { views, stage, scene, drop }
  }, [gl, scene])

  const lineMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fdd001', toneMapped: false }), [])
  const inkLineMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#080808', toneMapped: false }), [])
  const planeMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#f2f0e9', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    [],
  )
  const planeEdges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(HALF * 1.6, HALF * 1.3)), [])
  const edgeMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#f2f0e9', transparent: true, opacity: 0, toneMapped: false }), [])
  /** the shadow the sheet casts on the ground it lies on, warm like the shoot */
  const catcherMat = useMemo(() => new THREE.ShadowMaterial({ color: '#4a3000', opacity: 0, transparent: true, depthWrite: false }), [])
  const concrete = useMemo(() => {
    const map = concreteTexture()
    return new THREE.MeshStandardMaterial({ map, roughness: 0.94, metalness: 0, transparent: true, opacity: 1 })
  }, [])
  useEffect(
    () => () => {
      for (const m of [lineMat, inkLineMat, planeMat, edgeMat, concrete, catcherMat]) m.dispose()
      concrete.map?.dispose()
      planeEdges.dispose()
    },
    [lineMat, inkLineMat, planeMat, edgeMat, concrete, catcherMat, planeEdges],
  )

  /**
   * A tileable swatch of the mesh seen from straight above, read back once from this canvas, for
   * the footer's liquid drop (another WebGL context): there it shows exactly this mesh.
   */
  const renderSwatch = (vw: number, vh: number) => {
    const t = tile.current
    const key = keyLight.current
    if (!t || !field.current || !key) return
    const u = yarn.uniforms
    const half = (SWATCH_CELLS * PITCH) / 2
    ortho.left = -half
    ortho.right = half
    ortho.top = half
    ortho.bottom = -half
    ortho.position.set(0, 0.3, 0)
    ortho.up.set(0, 0, -1)
    ortho.lookAt(0, 0, 0)
    ortho.updateProjectionMatrix()
    ortho.updateMatrixWorld()
    u.uWin.value.set(FIELD, FIELD)
    u.uBand.value = 0.5
    u.uPartDim.value.set(1, 1, 1)
    u.uPartVis.value.set(1, 1, 1)
    u.uPartGlow.value.set(0, 0, 0)
    u.uExplode.value = 0
    u.uXray.value = 0
    u.uFlex.value = 0
    u.uFaceColor.value.copy(LOOK.day.face)
    u.uPileColor.value.copy(LOOK.day.pile)
    t.position.set(0, 0, 0)
    t.rotation.set(0, 0, 0)
    t.scale.set(1, 1, 1)
    t.updateMatrixWorld()
    for (const m of field.current.children) m.visible = true
    for (const o of [axes.current, shear.current, dimension.current, widthDim.current, slabTop.current, slabBottom.current, catcher.current]) if (o) o.visible = false
    const fog = scene.fog
    scene.fog = null
    key.position.set(0.25, 1, 0.35)
    key.target.position.set(0, 0, 0)
    key.target.updateMatrixWorld()
    key.intensity = 2.6
    key.color.copy(KEY.day)
    gl.toneMappingExposure = 1.05
    scene.environmentIntensity = 1.1
    const size = Math.min(SWATCH_CSS, vw, vh)
    gl.setViewport(0, 0, size, size)
    gl.setScissor(0, 0, size, size)
    gl.setScissorTest(true)
    gl.clear()
    gl.render(scene, ortho)
    const ctx = gl.getContext()
    const n = Math.floor(size * gl.getPixelRatio())
    const px = new Uint8Array(n * n * 4)
    ctx.readPixels(0, 0, n, n, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    scene.fog = fog
    gl.setViewport(0, 0, vw, vh)
    gl.setScissorTest(false)
    // flipped upright and un-premultiplied for a 2D canvas
    const cv = document.createElement('canvas')
    cv.width = cv.height = n
    const g = cv.getContext('2d')
    if (!g) return
    const img = g.createImageData(n, n)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const s = ((n - 1 - y) * n + x) * 4
        const o = (y * n + x) * 4
        const a = px[s + 3]
        const k = a ? 255 / a : 0
        img.data[o] = Math.min(255, px[s] * k)
        img.data[o + 1] = Math.min(255, px[s + 1] * k)
        img.data[o + 2] = Math.min(255, px[s + 2] * k)
        img.data[o + 3] = a
      }
    }
    g.putImageData(img, 0, 0)
    stage.swatch = cv
  }

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const vw = state.size.width
    const vh = state.size.height
    const camera = state.camera as THREE.PerspectiveCamera
    const now = performance.now()

    const primary = activeRegion(vh)
    primaryPose.current = primary ? primary.pose() : 'none'

    // the screens in the viewport that have something to draw, each with where it is
    const drawn: { r: Region; id: PoseId; top: number; bottom: number }[] = []
    for (const r of stage.regions) {
      const id = r.pose()
      if (POSES[id].empty) continue
      const b = r.el.getBoundingClientRect()
      if (b.bottom <= 0 || b.top >= vh || b.width < 2) continue
      drawn.push({ r, id, top: b.top, bottom: b.bottom })
    }
    for (const r of views.current.keys()) if (!drawn.some((d) => d.r === r)) views.current.delete(r)

    gl.setScissorTest(false)
    if (!drawn.length) {
      if (!cleared.current) {
        gl.clear()
        cleared.current = true
      }
      for (const el of stage.labels.values()) if (el.style.opacity !== '0') el.style.opacity = '0'
      return
    }
    cleared.current = false
    if (!started.current) {
      started.current = now
      setShared({ ready: true })
    }
    const since = (now - started.current) / 1000
    if (!swatchDone.current && since > 1.2) {
      swatchDone.current = true
      renderSwatch(vw, vh)
    }
    gl.clear()
    const rv = reduced ? 1 : clamp01(since / 1.6)

    // ---- shared: the drag on the opening, the drop and the knock -----------------------------
    const ob = stage.orbit
    if (!ob.dragging) {
      ob.yaw = damp(ob.yaw, 0, 0.6, dt)
      ob.pitch = damp(ob.pitch, 0, 0.6, dt)
    }
    orbit.current.yaw = damp(orbit.current.yaw, ob.yaw, 12, dt)
    orbit.current.pitch = damp(orbit.current.pitch, ob.pitch, 12, dt)
    const d = drop.current
    if (reduced) {
      d.y = 0
      d.tilt = 0
    } else if (since > 0.25) {
      const steps = Math.ceil(dt / (1 / 120))
      const h = dt / steps
      for (let i = 0; i < steps; i++) {
        d.v += (-DROP.k * d.y - DROP.c * d.v) * h
        d.y += d.v * h
        d.vt += (-DROP.k * 0.6 * d.tilt - DROP.c * 0.8 * d.vt) * h
        d.tilt += d.vt * h
      }
    }

    const u = yarn.uniforms
    const placed = new Set<string>()
    let flexing = false

    for (const view of drawn) {
      const { r, id } = view
      const hero = id === 'hero'
      const pose: Pose = hero ? tourPose(reduced ? Math.min(stage.tour, 1) : stage.tour, tourScratch) : POSES[id]
      // where the panel is: -1 entering from below, 0 in place, 1 leaving above (the opening runs its own tour)
      const o = hero || reduced ? 0 : THREE.MathUtils.clamp(-view.top / vh, -1, 1)
      let v = views.current.get(r)
      if (!v) {
        v = newView(pose, compact, o)
        views.current.set(r, v)
      }
      const active = r === primary
      const f = v.fx
      const c = v.cam

      // ---- camera: the view travels with its panel and turns a little as the panel passes -------
      const k = reduced ? 1e4 : hero ? 9 : GLIDE
      // narrower landscape windows: stand back so the mesh keeps clear of the copy beside it;
      // stacked layout on a screen that is not tall: smaller, and up into the space above the copy
      const squat = compact ? clamp01((vw / vh - 0.6) / 0.45) : 0
      const fit = compact ? 1 + squat * 0.85 : Math.max(1, 1.5 / (vw / vh))
      const dist = (compact ? (pose.distCompact ?? pose.dist) : pose.dist) * fit * (1 + Math.abs(o) * PARALLAX.dist)
      dampVec(c.tgt, pose.tgt[0], pose.tgt[1], pose.tgt[2], k, dt)
      c.elev = damp(c.elev, pose.elev - o * PARALLAX.elev, k, dt)
      c.azim = dampAngle(c.azim, pose.azim + o * PARALLAX.azim, k, dt)
      c.dist = damp(c.dist, dist, k, dt)
      c.fov = damp(c.fov, pose.fov, k, dt)
      const frame = compact ? pose.frameCompact : pose.frame
      c.fx = damp(c.fx, frame[0], k, dt)
      c.fy = damp(c.fy, lerp(frame[1], Math.min(frame[1], 0.27), squat), k, dt)
      c.spin = reduced ? 0 : (c.spin + pose.spin * dt) % 360
      const sway = reduced ? 0 : pose.sway * Math.sin((since * Math.PI * 2) / SWAY_PERIOD)
      const azim = (c.azim + sway + (pose.spin ? c.spin : 0)) * DEG + (hero ? orbit.current.yaw : 0)
      // the opening's tour goes down to eye level between the faces; elsewhere the camera stays above
      const elev = THREE.MathUtils.clamp(c.elev * DEG + (hero ? orbit.current.pitch : 0), hero ? -0.3 : 0.05, 1.45)
      vPos.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), Math.cos(elev) * Math.cos(azim)).multiplyScalar(c.dist).add(c.tgt)
      camera.position.copy(vPos)
      camera.up.set(0, 1, 0)
      camera.lookAt(c.tgt)
      camera.fov = c.fov
      // the frame is measured from the panel's top, so the mesh moves with the panel; the opening
      // stays put through its tour and leaves with its last screen
      const panelTop = hero ? Math.min(0, view.bottom - vh) : view.top
      camera.setViewOffset(vw, vh, vw / 2 - c.fx * vw, vh / 2 - c.fy * vh - panelTop, vw, vh)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      scene.environmentRotation.y = azim

      // ---- what the visitor is inspecting in Tech Space ----------------------------------------
      const inspect = id === 'spec' ? stage.inspect : null
      const winZ = inspect === 'length' ? LENGTHS[Math.floor(now / 1100) % LENGTHS.length] : pose.win[1]
      const stretch = inspect === 'elongation' ? 1.034 : inspect === 'tensile' ? 1.012 : 1
      const glow = inspect === 'tensile' ? 0.32 : inspect === 'elongation' ? 0.18 : 0

      // ---- the build, the stand, the look -------------------------------------------------------
      const wk = reduced ? 1e4 : hero ? 10 : 2.6
      const wx0 = f.winX
      const wz0 = f.winZ
      f.winX = damp(f.winX, pose.win[0], wk, dt)
      f.winZ = damp(f.winZ, winZ, wk, dt)
      // the faster the sheet grows, the more rings of cells are still dropping into place
      const growth = (Math.abs(f.winX - wx0) + Math.abs(f.winZ - wz0)) / Math.max(dt, 1e-3)
      f.band = reduced ? 0.5 : damp(f.band, 0.5 + Math.min(5, growth * 0.16), 6, dt)
      f.stand = damp(f.stand, pose.stand, reduced ? 1e4 : hero ? 9 : 2.6, dt)
      f.stretch = damp(f.stretch, stretch, reduced ? 1e4 : 4, dt)
      f.widthDim = damp(f.widthDim, inspect === 'width' ? 1 : 0, reduced ? 1e4 : 6, dt)
      const mk = reduced ? 1e4 : 3.2
      f.flat = damp(f.flat, id === 'shear' ? stage.flat : 0, reduced ? 1e4 : 3, dt)
      dampVec(v.dim, pose.dim[0], pose.dim[1], pose.dim[2], mk, dt)
      dampVec(v.vis, pose.vis[0], pose.vis[1], pose.vis[2], mk, dt)
      dampVec(v.glow, pose.glow[0] + glow, pose.glow[1] + glow, pose.glow[2], mk, dt)
      f.explode = damp(f.explode, pose.explode, mk, dt)
      f.xray = damp(f.xray, pose.xray, mk, dt)
      dampColor(v.face, LOOK[pose.look].face, mk, dt)
      dampColor(v.pile, LOOK[pose.look].pile, mk, dt)
      v.fog[0] = damp(v.fog[0], pose.fog[0], k, dt)
      v.fog[1] = damp(v.fog[1], pose.fog[1], k, dt)

      // sequences that play once the screen is reached: the axes grow, the slabs close in
      const ek = reduced ? 1e4 : 3.4
      if (pose.axes) {
        if (active) f.axes = damp(f.axes, 1, ek, dt)
      } else f.axes = 0
      f.shear = pose.shearPlane ? (active ? damp(f.shear, 1, ek, dt) : f.shear) : 0
      f.dim = damp(f.dim, pose.dimension ? 1 : 0, ek, dt)
      f.slabs = pose.slabs ? 1 : 0
      if (pose.slabs) {
        if (active) f.gap = damp(f.gap, pose.slabs.gap, reduced ? 1e4 : 1.8, dt)
        f.slabOpacity = damp(f.slabOpacity, pose.slabs.opacity, ek, dt)
      }
      f.shadow = damp(f.shadow, pose.shadow ?? 0, reduced ? 1e4 : hero ? 9 : 3, dt)
      const pressing = pose.press || (id === 'spec' && stage.inspect === 'modulus')
      f.flex = damp(f.flex, pressing ? 1 : 0, 4, dt)
      if (f.flex > 0.001) flexing = true

      // ---- apply this view to the one scene -------------------------------------------------------
      u.uWin.value.set(f.winX, f.winZ)
      u.uBand.value = f.band
      if (field.current) {
        // chunks wholly outside the window are not drawn at all
        for (const m of field.current.children) {
          const near = m.userData.near as [number, number] | undefined
          if (near) m.visible = near[0] < f.winX / 2 + 0.5 && near[1] < f.winZ / 2 + 0.5
        }
      }
      u.uPartDim.value.copy(v.dim)
      u.uPartVis.value.set(v.vis.x, v.vis.y * (1 - f.flat), v.vis.z * (1 - f.flat))
      u.uPartGlow.value.copy(v.glow)
      u.uExplode.value = f.explode
      u.uXray.value = f.xray
      u.uFaceColor.value.copy(v.face)
      u.uPileColor.value.copy(v.pile)
      u.uFlex.value = f.flex
      u.uPressGlow.value = 0.5
      if (tile.current) {
        tile.current.position.y = hero ? d.y : 0
        tile.current.rotation.x = f.stand * Math.PI * 0.5 + (hero ? d.tilt * 0.6 : 0)
        tile.current.rotation.z = hero ? d.tilt * 0.25 : 0
        tile.current.scale.x = f.stretch
        tile.current.updateMatrixWorld()
      }
      if (axes.current) {
        axes.current.visible = f.axes > 0.01
        // X, then Y, then Z grow one after the other
        axes.current.children.forEach((a, i) => a.scale.setScalar(0.001 + clamp01(f.axes * 3 - i)))
      }
      if (shear.current) {
        shear.current.visible = f.shear > 0.01
        planeMat.opacity = 0.62 * f.shear
        edgeMat.opacity = f.shear
        // a flat mesh is the plane itself; RTARIUM's plane lies between its faces, crossed by the fibres
        shear.current.position.y = lerp(0, thickness / 2000 - 0.0006, f.flat)
      }
      if (dimension.current) {
        dimension.current.visible = f.dim > 0.5
        dimension.current.scale.y = thickness / 10
      }
      if (widthDim.current) {
        widthDim.current.visible = f.widthDim > 0.02
        widthDim.current.scale.x = Math.max(0.001, f.widthDim) / f.stretch
      }
      const slabT = Math.max(thickness / 1000 + 0.006, 0.012)
      for (const [m, sign] of [
        [slabTop.current, 1],
        [slabBottom.current, -1],
      ] as const) {
        if (!m) continue
        m.visible = f.slabs > 0.01
        m.scale.y = slabT
        m.position.y = sign * (slabT / 2 + f.gap)
      }
      concrete.opacity = f.slabOpacity * f.slabs
      concrete.depthWrite = concrete.opacity > 0.95
      if (catcher.current) {
        catcher.current.visible = f.shadow > 0.01
        catcher.current.position.y = -thickness / 2000 - 0.0006
        catcherMat.opacity = 0.42 * f.shadow
      }

      // the fall-off into the screen's own ground, never another screen's
      const fog = scene.fog as THREE.Fog | null
      if (fog) {
        fog.color.copy(GROUND[(r.el.dataset.screen as keyof typeof GROUND) ?? 'yellow'] ?? GROUND.yellow)
        fog.near = v.fog[0]
        fog.far = v.fog[1]
      }

      gl.toneMappingExposure = pose.look === 'day' ? 1.05 : 1.22
      scene.environmentIntensity = (pose.look === 'day' ? 1.1 : 1.35) * rv
      const key = keyLight.current
      if (key) {
        key.color.copy(KEY[pose.look])
        key.intensity = (pose.look === 'day' ? 2.6 : 4.2) * rv
        key.target.position.copy(c.tgt)
        key.target.updateMatrixWorld()
        // from above for a sheet lying down, from the camera's upper side for one standing
        if (pose.key) vA.set(pose.key[0], pose.key[1], pose.key[2])
        else vA.set(lerp(0.32, 0.45, f.stand), lerp(1.0, 0.6, f.stand), lerp(0.42, 1.0, f.stand))
        key.position.copy(c.tgt).add(vA.applyAxisAngle(THREE.Object3D.DEFAULT_UP, azim).normalize().multiplyScalar(1.2))
        if (key.castShadow) {
          const ext = THREE.MathUtils.clamp(c.dist * 0.9, 0.04, 0.4)
          const sc = key.shadow.camera
          if (Math.abs(sc.right - ext) > ext * 0.02) {
            sc.left = -ext
            sc.right = ext
            sc.top = ext
            sc.bottom = -ext
            sc.updateProjectionMatrix()
          }
          key.shadow.normalBias = ext * 0.0009
        }
      }
      if (rimLight.current) {
        rimLight.current.intensity = (pose.look === 'day' ? 1.6 : 3) * rv
        rimLight.current.position.set(-0.6, 0.35, -0.9).applyAxisAngle(THREE.Object3D.DEFAULT_UP, azim)
      }

      // ---- the press: the cursor is a load on this screen's sheet, and it springs back ----------
      const y0 = Math.max(0, view.top)
      const y1 = Math.min(vh, view.bottom)
      const pt = stage.pointer
      const py = ((pt.y + 1) / 2) * vh
      if (pose.press && !reduced && f.flex > 0.001 && now - pt.at < CURSOR.restMs && !ob.dragging && py > y0 && py < y1 && tile.current) {
        // the cursor's ray, in the sheet's own frame (it may be standing, dropping, stretched)
        ray.setFromCamera(ndc.set(pt.x, -pt.y), camera)
        ray.ray.applyMatrix4(toLocal.copy(tile.current.matrixWorld).invert())
        const hx = (f.winX / 2) * PITCH
        const hz = (f.winZ / 2) * PITCH
        if (ray.ray.intersectPlane(plane, hit) && Math.abs(hit.x) < hx && Math.abs(hit.z) < hz) {
          press.press(hit.x / SHEET + 0.5, hit.z / SHEET + 0.5, CURSOR.depth, (CURSOR.radius / SHEET) * press.cols)
        }
      }
      // "Elastic modulus" under the cursor: the sheet is struck in the middle and springs straight back
      if (inspect === 'modulus' && now - f.knockAt > 1300) {
        f.knockAt = now
        press.press(0.5, 0.5, 0.009, (0.05 / SHEET) * press.cols)
      }

      // ---- draw this view inside its own panel ------------------------------------------------
      gl.setScissorTest(true)
      gl.setScissor(0, vh - y1, vw, y1 - y0)
      gl.clearDepth()
      gl.render(scene, camera)

      // ---- labels pinned to this view's sheet -------------------------------------------------
      const settled = Math.abs(c.dist - dist) < dist * 0.08 || reduced
      if (!settled) continue
      const zone = compact ? pose.labelZoneCompact : pose.labelZone
      const shown = inspect === 'width' ? [...pose.labels, 'dim-width'] : inspect === 'elongation' ? [...pose.labels, 'strain'] : pose.labels
      for (const anchor of shown) {
        const el = stage.labels.get(anchor)
        const p = ANCHORS[anchor]
        if (!el || !p || !tile.current) continue
        // anchors are points of the sheet: they stand, drop and stretch with it
        vB.fromArray(p).applyMatrix4(tile.current.matrixWorld).project(camera)
        const x = (vB.x * 0.5 + 0.5) * vw
        const y = (-vB.y * 0.5 + 0.5) * vh
        const inZone = x > zone[0] * vw && x < zone[2] * vw && y > panelTop + zone[1] * vh && y < panelTop + zone[3] * vh
        if (vB.z >= 1 || !inZone || y < y0 + 12 || y > y1 - 12) continue
        const tagY = y + Number(el.dataset.dy ?? 0)
        if (el.classList.contains('pin--callout') && (tagY < y0 + 84 || tagY > y1 - 24)) continue
        placed.add(anchor)
        // a label near the edge of the screen turns its text inwards; a callout mirrors its arm
        if (el.classList.contains('pin--callout')) {
          const dx = Number(el.dataset.dx ?? 0)
          const w = (el.querySelector('.pin__tag') as HTMLElement | null)?.offsetWidth ?? 160
          el.classList.toggle('pin--flip', dx > 0 ? x + dx + w > vw - 8 : x + dx - w < (hero && !compact ? vw * 0.46 : 8))
        } else el.classList.toggle('pin--swap', el.classList.contains('pin--left') ? x < 200 : x > vw - 200)
        el.style.opacity = '1'
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      }
    }
    gl.setScissorTest(false)
    for (const [anchor, el] of stage.labels) if (!placed.has(anchor) && el.style.opacity !== '0') el.style.opacity = '0'

    // the press field is shared: advance it once a frame while any view is pressing
    if (flexing && press.step(dt)) press.upload()
  }, 1)

  const half = 0.005
  const dimMat = lineMat

  return (
    <>
      <fog attach="fog" args={['#fdd001', 3, 6]} />
      <group ref={tile}>
        <MeshField
          cell={cell}
          nx={FIELD}
          nz={FIELD}
          material={yarn.material}
          depthMaterial={yarn.depthMaterial}
          chunk={8}
          lodDistance={compact ? 0.16 : 0.3}
          farDistance={0.9}
          shadows={!compact}
          culling={false}
          groupRef={setField}
        />
        {/* sheet width, along the near edge, while "Sheet width" is under the cursor */}
        <group ref={widthDim} position={[0, 0, HALF + 0.008]} visible={false}>
          <mesh material={lineMat} scale={[TILE * PITCH, 0.0005, 0.0005]}>
            <boxGeometry />
          </mesh>
          <mesh material={lineMat} position={[-HALF, 0, 0]} scale={[0.0005, 0.0005, 0.006]}>
            <boxGeometry />
          </mesh>
          <mesh material={lineMat} position={[HALF, 0, 0]} scale={[0.0005, 0.0005, 0.006]}>
            <boxGeometry />
          </mesh>
        </group>
        {/* thickness dimension at the tile's near edge, in model space so it always matches the geometry */}
        <group ref={dimension} position={[HALF + 0.006, 0, -HALF]} visible={false}>
          <mesh material={dimMat} scale={[0.00045, half * 2, 0.00045]}>
            <boxGeometry />
          </mesh>
          <mesh material={dimMat} position={[0, half, 0]} scale={[0.005, 0.00045, 0.00045]}>
            <boxGeometry />
          </mesh>
          <mesh material={dimMat} position={[0, -half, 0]} scale={[0.005, 0.00045, 0.00045]}>
            <boxGeometry />
          </mesh>
        </group>
      </group>

      {/* the ground the sheet lies on: receives its shadow, transparent everywhere else */}
      <mesh ref={catcher} material={catcherMat} rotation={[-Math.PI / 2, 0, 0]} visible={false} receiveShadow renderOrder={-1}>
        <planeGeometry args={[4, 4]} />
      </mesh>

      {/* concrete above and below: pulled apart to name the three elements, closed to cast the mesh in */}
      <mesh ref={slabTop} material={concrete} visible={false} scale={[HALF * 2 + 0.004, 0.012, HALF * 2 + 0.004]} castShadow receiveShadow>
        <boxGeometry />
      </mesh>
      <mesh ref={slabBottom} material={concrete} visible={false} scale={[HALF * 2 + 0.004, 0.012, HALF * 2 + 0.004]} castShadow receiveShadow>
        <boxGeometry />
      </mesh>

      {/* X, Y and Z: the directions the spatial grid carries load in (ink on the yellow ground) */}
      <group ref={axes} position={[0.012, 0.012, 0.02]} visible={false}>
        {(
          [
            { rot: [0, 0, -Math.PI / 2], len: 0.05 },
            { rot: [-Math.PI / 2, 0, 0], len: 0.062 },
            { rot: [0, 0, 0], len: 0.044 },
          ] as { rot: [number, number, number]; len: number }[]
        ).map((a, i) => (
          <group key={i} rotation={a.rot}>
            <mesh material={inkLineMat} position={[0, a.len / 2, 0]}>
              <cylinderGeometry args={[0.00045, 0.00045, a.len, 8]} />
            </mesh>
            <mesh material={inkLineMat} position={[0, a.len, 0]}>
              <coneGeometry args={[0.0018, 0.0055, 16]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* the plane a flat mesh leaves for thin concrete to split along */}
      <mesh ref={shear} material={planeMat} position={[0, 0, 0.01]} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={2}>
        <planeGeometry args={[HALF * 1.6, HALF * 1.3]} />
        <lineSegments geometry={planeEdges} material={edgeMat} />
      </mesh>

      <directionalLight
        ref={keyLight}
        color="#ffffff"
        intensity={0}
        castShadow={!compact}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00004}
        shadow-camera-near={0.2}
        shadow-camera-far={2.4}
      />
      <directionalLight ref={rimLight} color="#cfdcf2" intensity={0} position={[-0.6, 0.35, -0.9]} />

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

