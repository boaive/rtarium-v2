import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, useGLTF } from '@react-three/drei'
import { MeshField, PITCH, cellUrl, useCell, useYarnMaterial } from './mesh/MeshField'
import { PressField } from './mesh/flex'
import { ANCHORS, FIELD, HALF, POSES, POUR_OUT, TILE, anchorAt, blendPose, tourPose, type Pose } from './poses'
import { setShared, stage, useStageValue, type PoseId, type Region } from './stageStore'
import { THICKNESS_OPTIONS } from '../content/technical'
import { clamp01, damp, lerp, smoothstep } from '../lib/motion'

/**
 * The one 3D stage of the homepage: a fixed, transparent canvas between the coloured ground and
 * the copy. Every screen in the viewport draws its own view of the mesh inside its own panel
 * (scissored to the panel's visible part), so the 3D rises with its panel exactly as the ground
 * does, and two screens in transition each show their own. A view eases in as its panel arrives
 * and turns a little as it passes, the same both ways; its sequences play once it is reached.
 *
 * The opening is a scrolled sequence: the piece lies beside the name, and as the visitor scrolls
 * the mesh is built out past the edges of the screen, the camera slips between its two faces and on
 * into white light, and out of the white comes a tile half cast in concrete (`stage.tour`, damped).
 * Chapters that run sideways are scrubbed the same way: their one view travels continuously from
 * one step's pose to the next (`Region.blend`). Time introduces the piece: it is woven out from its
 * middle to its edges while it settles onto its shadow. Wherever a view's sheet grows, its new cells
 * are woven on; where it is trimmed back, they lift away (see yarnMaterial, uWeave).
 * The cursor presses the face and it springs back (V1's press field); a click does not move it.
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
/** the shadow on each ground: warm on yellow, a neutral warm grey on white */
const SHADOW = { yellow: new THREE.Color('#4a3000'), black: new THREE.Color('#000000'), light: new THREE.Color('#3b3328') }
/** how fast a view settles on its pose (1/s); a scrubbed view follows its (already damped) scroll closely */
const GLIDE = 2.4
const SCRUB = 8
/** a view's motion with its panel: farther (fraction), lower (deg) and turned (deg) at one screen away */
const PARALLAX = { dist: 0.14, elev: 5, azim: 12 }
const SWAY_PERIOD = 16
/** the settle as it is woven: starting height (m), spring stiffness and damping (a small bounce, then still) */
const DROP = { height: 0.05, k: 70, c: 7.5, tilt: 0.3 }
/** the opening piece is woven out from its middle: when it starts and how long it takes (s) */
const INTRO = { delay: 0.2, duration: 2.1 }
/** the cursor as a load: footprint radius (m) and depth (m) */
const CURSOR = { radius: 0.022, depth: 0.0068, restMs: 1400 }
/**
 * The concrete it is cast in: a slim panel, the cover beyond each face of the mesh (m). With the 10 mm
 * mesh the panel is 20 mm, the thin end of what RTARIUM makes possible (20 to 30 mm).
 */
const COVER = 0.005
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
const blendScratch: Pose = { ...POSES.hero }
const pourScratch: Pose = { ...POSES.hero }
const fogTarget = new THREE.Color()
const anchorPt: [number, number, number] = [0, 0, 0]
/** where each screen is this frame: read once, used by the choice of the active screen and by the views */
const rects = new Map<Region, DOMRect>()

/** the region across the middle of the screen, else the most visible one */
function activeRegion(vh: number) {
  let best: Region | null = null
  let bestScore = 0
  for (const [r, b] of rects) {
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
    /** across the warp and the weft: 1 while the sheet grows that way (new cells are woven on), 0 while it is trimmed back (they lift away) */
    weaveX: number
    weaveZ: number
    weaveToX: number
    weaveToZ: number
    stand: number
    stretch: number
    widthDim: number
    xray: number
    explode: number
    shadow: number
    knockAt: number
    /** 1: only the slab underneath, its top at the mid-plane */
    bottomOnly: number
    /** how far mortar has flowed across the sheet (0..1, below 0 while it waits) */
    pour: number
    /** the piece above its shadow (m) and its tilt (rad) */
    lift: number
    tiltX: number
    tiltZ: number
  }
  dim: THREE.Vector3
  vis: THREE.Vector3
  glow: THREE.Vector3
  face: THREE.Color
  pile: THREE.Color
  fog: [number, number]
  fogColor: THREE.Color
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
      gap: pose.slabs ? pose.slabs.gap + 0.08 : 0.12,
      slabs: 0,
      slabOpacity: pose.slabs?.opacity ?? 1,
      flex: pose.press ? 1 : 0,
      winX: pose.win[0],
      winZ: pose.win[1],
      band: 0.5,
      weaveX: 1,
      weaveZ: 1,
      weaveToX: 1,
      weaveToZ: 1,
      stand: pose.stand,
      stretch: 1,
      widthDim: 0,
      xray: pose.xray,
      explode: pose.explode,
      shadow: pose.shadow ?? 0,
      knockAt: 0,
      bottomOnly: pose.slabs?.bottom ? 1 : 0,
      pour: -0.25,
      lift: pose.lift ?? 0,
      tiltX: (pose.tilt?.[0] ?? 0) * DEG,
      tiltZ: (pose.tilt?.[1] ?? 0) * DEG,
    },
    dim: new THREE.Vector3(...pose.dim),
    vis: new THREE.Vector3(...pose.vis),
    glow: new THREE.Vector3(...pose.glow),
    face: LOOK[pose.look].face.clone(),
    pile: LOOK[pose.look].pile.clone(),
    fog: [pose.fog[0], pose.fog[1]],
    fogColor: GROUND.yellow.clone(),
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
  const mortar = useRef<THREE.Mesh>(null)
  const slabBottom = useRef<THREE.Mesh>(null)
  const catcher = useRef<THREE.Mesh>(null)

  /** the views of the screens on screen, by screen */
  const views = useRef(new Map<Region, View>())
  const started = useRef(0)
  /** the deferred compile of hidden programs: its timer, then true once it is done (for the shadow pass) */
  const warmup = useRef(0)
  const warm = useRef(false)
  useEffect(() => () => window.clearTimeout(warmup.current), [])
  const orbit = useRef({ yaw: 0, pitch: 0 })
  const drop = useRef({ y: DROP.height, v: 0, tilt: DROP.tilt, vt: 0 })
  const cleared = useRef(false)

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

  useEffect(() => {
    gl.setClearColor(0x000000, 0)
    gl.autoClear = false
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__stage = { views, stage, scene, drop, POSES, POUR_OUT, ANCHORS }
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
  /**
   * Wet mortar flowing in across the sheet: a slab through the cavity, up to just under the upper
   * face, cut off at a front (`uFront`, along z) that wavers as it advances and is still glossy.
   */
  const mortarU = useMemo(() => ({ uFront: { value: -1 }, uTime: { value: 0 } }), [])
  const mortarMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: concrete.map, color: '#c9c3b8', roughness: 0.82, metalness: 0, side: THREE.DoubleSide })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mortarU)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMortar;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMortar = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMortar;\nuniform float uFront;\nuniform float uTime;')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          float rtEdge = uFront + 0.007 * sin(vMortar.x * 48.0 + uTime * 1.6) + 0.004 * sin(vMortar.x * 131.0 - uTime * 2.2);
          if (vMortar.z > rtEdge) discard;
          float rtWet = 1.0 - smoothstep(0.0, 0.035, rtEdge - vMortar.z);`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, rtWet);')
    }
    m.customProgramCacheKey = () => 'rtarium-mortar'
    return m
  }, [concrete, mortarU])
  useEffect(
    () => () => {
      for (const m of [lineMat, inkLineMat, planeMat, edgeMat, concrete, catcherMat, mortarMat]) m.dispose()
      concrete.map?.dispose()
      planeEdges.dispose()
    },
    [lineMat, inkLineMat, planeMat, edgeMat, concrete, catcherMat, mortarMat, planeEdges],
  )

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const vw = state.size.width
    const vh = state.size.height
    const camera = state.camera as THREE.PerspectiveCamera
    const now = performance.now()

    rects.clear()
    for (const r of stage.regions) rects.set(r, r.el.getBoundingClientRect())
    const primary = activeRegion(vh)

    // the screens in the viewport that have something to draw, each with where it is. Leaving the
    // cast, the opening holds the whole screen until its camera has come out as About's first
    // view; only then does About draw its own, from the same pose, so the two meet without a cut
    const handing = !reduced && stage.tour > 3.002 && stage.tour < 3.995
    const drawn: { r: Region; id: PoseId; top: number; bottom: number }[] = []
    for (const r of stage.regions) {
      const id = r.pose()
      if (POSES[id].empty) continue
      if (handing) {
        if (id === 'hero') drawn.push({ r, id, top: 0, bottom: vh })
        continue
      }
      const b = rects.get(r)
      if (!b || b.bottom <= 0 || b.top >= vh || b.width < 2) continue
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
      // once the opening is under way, the programs of everything still hidden (concrete, mortar,
      // the drawing lines) compile in parallel, so nothing stalls the first time it appears
      warmup.current = window.setTimeout(() => {
        gl.compileAsync(scene, camera)
          .then(() => void (warm.current = true))
          .catch(() => {})
      }, (INTRO.delay + INTRO.duration) * 1000)
    }
    const since = (now - started.current) / 1000
    gl.clear()
    const rv = reduced ? 1 : clamp01(since / 1.6)
    // the opening piece is woven out from its middle
    const intro = reduced ? 1 : smoothstep(INTRO.delay, INTRO.delay + INTRO.duration, since)
    // the casts' shadow pass compiles too: drawn once, hidden, into one pixel
    if (warm.current === true && slabTop.current && slabBottom.current && mortar.current) {
      warm.current = false
      const hidden = [slabTop.current, slabBottom.current, mortar.current].filter((m) => !m.visible)
      for (const m of hidden) m.visible = true
      gl.setScissorTest(true)
      gl.setScissor(0, 0, 1, 1)
      gl.render(scene, camera)
      gl.setScissorTest(false)
      for (const m of hidden) m.visible = false
      gl.clear()
    }

    // ---- shared: the drag on the opening and the settle as it is woven ----------------------
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
    // the opening's copy, which its callouts keep clear of (read before any label is written)
    const heroCopy = stage.tour < 0.2 && drawn.some((d) => d.id === 'hero') ? [...document.querySelectorAll('.hero__title, .hero__sub')].map((e) => e.getBoundingClientRect()) : []
    let flexing = false

    for (const view of drawn) {
      const { r, id } = view
      const hero = id === 'hero'
      const bl = hero ? undefined : r.blend?.()
      let pose: Pose = hero ? tourPose(reduced ? (stage.tour > 2.5 ? 3 : Math.min(stage.tour, 1)) : stage.tour, tourScratch) : bl ? blendPose(POSES[bl.a], POSES[bl.b], bl.t, blendScratch) : POSES[id]
      // where the panel is: -1 entering from below, 0 in place, 1 leaving above (the opening runs its own tour)
      const o = hero || reduced ? 0 : THREE.MathUtils.clamp(-view.top / vh, -1, 1)
      let v = views.current.get(r)
      if (!v) {
        v = newView(pose, compact, o)
        if (hero && intro < 1) v.fx.winX = v.fx.winZ = 0
        views.current.set(r, v)
      }
      const active = r === primary
      const f = v.fx
      const c = v.cam

      // "In concrete" plays in time once reached: the mortar runs in, then the camera stands back
      if (pose.pour) {
        if (active) f.pour = reduced ? 1.6 : Math.min(1.6, f.pour + dt / 2.8)
        if (f.pour > 1.02) pose = blendPose(pose, POUR_OUT, smoothstep(1.02, 1.6, f.pour), pourScratch)
      } else f.pour = -0.25

      // ---- camera: the view travels with its panel and turns a little as the panel passes -------
      const k = reduced ? 1e4 : hero ? 9 : bl ? SCRUB : GLIDE
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
      c.spin = reduced ? 0 : pose.spin ? (c.spin + pose.spin * dt) % 360 : dampAngle(c.spin, 0, 1.6, dt)
      const sway = reduced ? 0 : pose.sway * Math.sin((since * Math.PI * 2) / SWAY_PERIOD)
      const azim = (c.azim + sway + c.spin) * DEG + (hero ? orbit.current.yaw : 0)
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
      const wk = reduced ? 1e4 : hero ? 10 : bl ? 6 : 2.6
      const wx0 = f.winX
      const wz0 = f.winZ
      const grow = hero ? intro : 1
      f.winX = damp(f.winX, pose.win[0] * grow, wk, dt)
      f.winZ = damp(f.winZ, winZ * grow, wk, dt)
      // growing, the new cells are woven on; trimmed back, they lift away (each way across the sheet on its own)
      if (f.winX - wx0 > 1e-4) f.weaveToX = 1
      else if (f.winX - wx0 < -1e-4) f.weaveToX = 0
      if (f.winZ - wz0 > 1e-4) f.weaveToZ = 1
      else if (f.winZ - wz0 < -1e-4) f.weaveToZ = 0
      f.weaveX = reduced ? f.weaveToX : damp(f.weaveX, f.weaveToX, 12, dt)
      f.weaveZ = reduced ? f.weaveToZ : damp(f.weaveZ, f.weaveToZ, 12, dt)
      // the faster the sheet changes, the more rings of cells are still lifting away; a weave keeps a tighter front
      const growth = (Math.abs(f.winX - wx0) + Math.abs(f.winZ - wz0)) / Math.max(dt, 1e-3)
      const front = lerp(0.16, 0.085, (f.weaveX + f.weaveZ) / 2)
      f.band = reduced ? 0.5 : damp(f.band, 0.5 + Math.min(5, growth * front), 6, dt)
      f.stand = damp(f.stand, pose.stand, reduced ? 1e4 : hero ? 9 : 2.6, dt)
      f.stretch = damp(f.stretch, stretch, reduced ? 1e4 : 4, dt)
      f.lift = damp(f.lift, pose.lift ?? 0, k, dt)
      f.tiltX = damp(f.tiltX, (pose.tilt?.[0] ?? 0) * DEG, k, dt)
      f.tiltZ = damp(f.tiltZ, (pose.tilt?.[1] ?? 0) * DEG, k, dt)
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
      } else f.axes = bl ? damp(f.axes, 0, ek * 2, dt) : 0
      f.shear = pose.shearPlane ? (active ? damp(f.shear, 1, ek, dt) : f.shear) : bl ? damp(f.shear, 0, ek * 2, dt) : 0
      f.dim = damp(f.dim, pose.dimension ? 1 : 0, ek, dt)
      // concrete arrives and closes in once the screen is reached; leaving, it opens and fades
      f.slabs = pose.slabs ? (f.slabs > 0.001 || active ? damp(f.slabs, 1, reduced ? 1e4 : 2.6, dt) : 0) : damp(f.slabs, 0, reduced ? 1e4 : 5, dt)
      if (pose.slabs) {
        if (active) f.gap = damp(f.gap, pose.slabs.gap, reduced ? 1e4 : 1.8, dt)
        f.slabOpacity = damp(f.slabOpacity, pose.slabs.opacity, ek, dt)
        f.bottomOnly = pose.slabs.bottom ? 1 : 0
      } else if (f.slabs > 0.001) f.gap = damp(f.gap, 0.12, reduced ? 1e4 : 3, dt)
      else f.gap = 0.12
      f.shadow = damp(f.shadow, pose.shadow ?? 0, reduced ? 1e4 : hero ? 9 : 3, dt)
      const pressing = pose.press || (id === 'spec' && stage.inspect === 'modulus')
      f.flex = damp(f.flex, pressing ? 1 : 0, 4, dt)
      if (f.flex > 0.001) flexing = true

      // ---- apply this view to the one scene -------------------------------------------------------
      u.uWin.value.set(f.winX, f.winZ)
      u.uBand.value = f.band
      u.uWeave.value.set(f.weaveX, f.weaveZ)
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
      // the opening's press reads as a hollow in the mesh, not a light
      u.uPressGlow.value = hero ? 0.12 : 0.5
      if (tile.current) {
        tile.current.position.y = (hero ? d.y : 0) + f.lift
        tile.current.rotation.x = f.stand * Math.PI * 0.5 + (hero ? d.tilt * 0.6 : 0) + f.tiltX
        tile.current.rotation.z = (hero ? d.tilt * 0.25 : 0) + f.tiltZ
        tile.current.scale.x = f.stretch
        tile.current.updateMatrixWorld()
      }
      // each chunk's detail for this view's camera (two views in a transition each get their own)
      ;(field.current?.userData.lod as ((cam: THREE.Camera) => void) | undefined)?.(camera)
      if (axes.current) {
        axes.current.visible = f.axes > 0.01
        // X, then Y, then Z grow one after the other
        const settle = pose.settle ?? 1
        axes.current.visible = f.axes * settle > 0.01
        axes.current.children.forEach((a, i) => a.scale.setScalar(0.001 + clamp01(f.axes * settle * 3 - i)))
      }
      if (shear.current) {
        shear.current.visible = f.shear > 0.01
        planeMat.opacity = 0.62 * f.shear * (pose.settle ?? 1)
        edgeMat.opacity = f.shear * (pose.settle ?? 1)
        // a flat mesh is the plane itself; RTARIUM's plane lies between its faces, crossed by the fibres
        shear.current.position.y = lerp(0, thickness / 2000 - 0.0006, f.flat)
      }
      if (dimension.current) {
        dimension.current.visible = f.dim > 0.5 && (pose.settle ?? 1) > 0.5
        dimension.current.scale.y = thickness / 10
      }
      if (widthDim.current) {
        widthDim.current.visible = f.widthDim > 0.02
        widthDim.current.scale.x = Math.max(0.001, f.widthDim) / f.stretch
      }
      // each slab runs from the mid-plane out past its face by the cover: closed, they are one slim panel
      const slabT = thickness / 2000 + COVER
      // the concrete is cut to the piece of mesh it holds, with a margin of a cell
      const slabX = Math.min(f.winX, TILE) * PITCH + 0.012
      const slabZ = Math.min(f.winZ, TILE) * PITCH + 0.012
      for (const [m, sign] of [
        [slabTop.current, 1],
        [slabBottom.current, -1],
      ] as const) {
        if (!m) continue
        m.visible = f.slabs > 0.01 && !(sign > 0 && f.bottomOnly > 0.5)
        m.scale.set(slabX, slabT, slabZ)
        m.position.y = sign * (slabT / 2 + f.gap)
      }
      // on a chapter scrubbed sideways the concrete belongs to its step alone: it is gone a third of the way to the next
      concrete.opacity = f.slabOpacity * f.slabs * (bl ? (pose.settle ?? 1) : 1)
      concrete.depthWrite = concrete.opacity > 0.95
      for (const m of [slabTop.current, slabBottom.current]) if (m && concrete.opacity < 0.01) m.visible = false
      // the mortar: a front running from the far side to the near one (see "In concrete" above)
      if (mortar.current) {
        const flow = clamp01(f.pour)
        mortar.current.visible = pose.pour === true && flow > 0
        const hx = (Math.min(f.winX, TILE) * PITCH) / 2 - 0.002
        const hz = (Math.min(f.winZ, TILE) * PITCH) / 2 - 0.002
        const top = thickness / 2000 - 0.0012
        // the panel goes on below the mesh by the cover, so standing back it reads as a slim cast slab
        const bottom = -thickness / 2000 - COVER
        mortar.current.scale.set(hx * 2, top - bottom, hz * 2)
        mortar.current.position.set(0, (top + bottom) / 2, 0)
        const ease = flow * flow * (3 - 2 * flow)
        mortarU.uFront.value = lerp(-hz - 0.012, hz + 0.012, ease)
        mortarU.uTime.value = since
      }
      const screenGround = hero ? (stage.wash > 0.5 ? 'light' : 'yellow') : bl ? (c.fx > 1 - bl.t ? bl.gb : bl.ga) : ((r.el.dataset.screen as keyof typeof GROUND) ?? 'yellow')
      if (catcher.current) {
        catcher.current.visible = f.shadow > 0.01
        // the shadow falls on the ground under whatever is lowest: the mesh, or the concrete it is cast in
        const floor = slabBottom.current?.visible ? -(slabT + f.gap) : mortar.current?.visible ? -thickness / 2000 - COVER : -thickness / 2000
        catcher.current.position.y = floor - 0.0006
        // only the ground the shadow can reach: the sheet, and as far again as its height above the floor can throw it
        const rise = Math.max(0, (tile.current?.position.y ?? 0) - floor)
        const margin = 0.06 + rise * 1.6
        catcher.current.scale.set(Math.min(f.winX, FIELD) * PITCH * f.stretch + margin * 2, Math.min(f.winZ, FIELD) * PITCH + margin * 2, 1)
        catcherMat.color.copy(SHADOW[screenGround] ?? SHADOW.yellow)
        catcherMat.opacity = (screenGround === 'light' ? 0.3 : 0.42) * f.shadow
      }

      // the fall-off into the ground under the mesh, never another screen's
      const fog = scene.fog as THREE.Fog | null
      if (fog) {
        if (hero) v.fogColor.copy(GROUND.yellow).lerp(GROUND.light, stage.wash)
        else {
          fogTarget.copy(GROUND[screenGround] ?? GROUND.yellow)
          if (bl) dampColor(v.fogColor, fogTarget, reduced ? 1e4 : 7, dt)
          else v.fogColor.copy(fogTarget)
        }
        fog.color.copy(v.fogColor)
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
          // over the built mesh the hollow is wider: the cursor sinks a patch of the face, which springs back as it moves on
          const radius = hero && stage.tour > 0.6 ? CURSOR.radius * 1.5 : CURSOR.radius
          press.press(hit.x / SHEET + 0.5, hit.z / SHEET + 0.5, CURSOR.depth, (radius / SHEET) * press.cols)
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
      // the opening's callouts wait until the piece has been woven
      const settled = (Math.abs(c.dist - dist) < dist * 0.08 || reduced) && (!hero || intro > 0.96)
      if (!settled) continue
      const zone = compact ? pose.labelZoneCompact : pose.labelZone
      const shown = inspect === 'width' ? [...pose.labels, 'dim-width'] : inspect === 'elongation' ? [...pose.labels, 'strain'] : pose.labels
      for (const anchor of shown) {
        const el = stage.labels.get(anchor)
        const p = ANCHORS[anchor]
        if (!el || !p || !tile.current) continue
        // anchors are points of the sheet: they stand, drop and stretch with it
        vB.fromArray(anchorAt(p, thickness, anchorPt)).applyMatrix4(tile.current.matrixWorld).project(camera)
        const x = (vB.x * 0.5 + 0.5) * vw
        const y = (-vB.y * 0.5 + 0.5) * vh
        const inZone = x > zone[0] * vw && x < zone[2] * vw && y > panelTop + zone[1] * vh && y < panelTop + zone[3] * vh
        if (vB.z >= 1 || !inZone || y < y0 + 12 || y > y1 - 12) continue
        // a callout whose label stands in a column, its leader level with the point
        if (el.dataset.col) {
          // on a narrow screen the column moves in, so the labels keep inside it
          // the column is a fraction of the width, or the line of an element on the page: the words start on its
          // left edge, and the leader leaves them on the side the point is on
          const at = el.dataset.colAt ? document.querySelector(el.dataset.colAt)?.getBoundingClientRect() : undefined
          const words = at ? (el.querySelector<HTMLElement>('.pin__tag')?.offsetWidth ?? 0) : 0
          const colX = at ? (x > at.left + words ? at.left + words + 18 : at.left - 18) : (compact ? Math.min(Number(el.dataset.col), 0.5) + 0.22 : Number(el.dataset.col)) * vw
          const dx = colX - x
          const lead = el.querySelector<HTMLElement>('.pin__lead')
          const tag = el.querySelector<HTMLElement>('.pin__tag')
          if (lead && tag) {
            lead.style.width = `${Math.abs(dx).toFixed(1)}px`
            lead.style.transform = dx < 0 ? 'rotate(180deg)' : 'none'
            tag.style.left = `${dx.toFixed(1)}px`
            tag.classList.toggle('pin__tag--left', dx < 0)
          }
        }
        // a dimension from this point to another one of the sheet
        const to = el.dataset.span ? ANCHORS[el.dataset.span] : undefined
        if (to) {
          vA.fromArray(anchorAt(to, thickness, anchorPt)).applyMatrix4(tile.current.matrixWorld).project(camera)
          const yb = (-vA.y * 0.5 + 0.5) * vh
          el.style.setProperty('--span', `${(yb - y).toFixed(1)}px`)
          // near the right edge its value stands on the other side of the line
          el.classList.toggle('pin--flip', x > vw - 120)
        }
        const tagY = y + Number(el.dataset.dy ?? 0)
        if (el.classList.contains('pin--callout') && (tagY < y0 + 84 || tagY > y1 - 24)) continue
        // a callout reaches out on its own side, else mirrors its arm; where neither side has clear
        // ground (the screen's edge, the opening's headline and lede) it is not shown
        if (el.classList.contains('pin--callout') && !el.dataset.col) {
          const dx = Number(el.dataset.dx ?? 0)
          const w = (el.querySelector('.pin__tag') as HTMLElement | null)?.offsetWidth ?? 160
          const clear = (side: number) => {
            const end = x + side * Math.abs(dx)
            const a = side > 0 ? end : end - w
            const b = side > 0 ? end + w : end
            if (a < 8 || b > vw - 8) return false
            return !(hero ? heroCopy : []).some((r) => a < r.right + 16 && b > r.left - 16 && tagY > r.top - 16 && tagY < r.bottom + 16)
          }
          const own = dx > 0 ? 1 : -1
          const side = clear(own) ? own : clear(-own) ? -own : 0
          if (!side) continue
          el.classList.toggle('pin--flip', side !== own)
        } else el.classList.toggle('pin--swap', el.classList.contains('pin--left') ? x < 200 : x > vw - 200)
        placed.add(anchor)
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
          chunk={6}
          lodDistance={compact ? 0.16 : 0.3}
          farDistance={0.9}
          shadows={!compact}
          reach={0.04}
          autoLod={false}
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
        <planeGeometry />
      </mesh>

      {/* mortar flowing in through the cavity */}
      <mesh ref={mortar} material={mortarMat} visible={false} castShadow receiveShadow>
        <boxGeometry />
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

