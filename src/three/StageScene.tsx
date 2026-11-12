import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, useGLTF } from '@react-three/drei'
import { MeshField, PITCH, cellUrl, useCell, useYarnMaterial } from './mesh/MeshField'
import { PressField } from './mesh/flex'
import { ANCHORS, FIELD, HALF, POSES, PHONE_POINTS, TOUR_DIVE, POUR_OUT, TILE, anchorAt, blendPose, tourPose, type Pose } from './poses'
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
 * into white light, and out of the white comes the mesh, close, on the way into About (`stage.tour`, damped).
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
/** how fast a view in a box turns, steadily, in degrees a second (once round in a minute) */
const BOX_TURN = 6
/** a phone's card most in view turns slowly, on and on (deg/s); the rest hold where they are */
const CARD_TURN = 2.5
/** a phone's opening piece turns slowly while the page rests on it (deg/s); as the tour sets off it eases back to its pose */
const OPEN_TURN = 4
/** a finger on a phone's card: a small, gentle dent (a share of the cursor's depth, and of its reach) */
const FINGER = { depth: 0.35, radius: 0.5 }
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
/** seconds the "In concrete" copy's move has played, or null where it has none (a phone, no motion) */
function pourClock(): number | null {
  const copy = document.querySelector<HTMLElement>('.scene--flow.is-active .copy--pour')
  const move = copy?.getAnimations().find((a) => (a as CSSAnimation).animationName === 'pour-copy')
  const t = move?.currentTime
  // once it has arrived, the stand-back plays on by itself to its end
  return move && move.playState !== 'finished' && typeof t === 'number' ? t / 1000 : null
}
/** whether an element the notes stand in line with is still on its way: they wait for it to arrive */
const moving = (el: Element | null) => !!el && el.getAnimations().some((a) => a.playState === 'running' && (a as CSSAnimation).animationName === 'pour-copy')
const fogTarget = new THREE.Color()
/** where a view in a box stands in it: the middle */
const CENTRE: [number, number] = [0.5, 0.5]
const anchorPt: [number, number, number] = [0, 0, 0]
/** where each screen is this frame: read once, used by the choice of the active screen and by the views */
const rects = new Map<Region, DOMRect>()
/** what each phone card's own canvas holds (its view's figures, as the idle check takes them) */
const cardSigs = new WeakMap<Region, number[]>()
/** a phone's idle check: the drag, as text; and what this frame drew, view after view */
const ob0 = (o: { yaw: number; pitch: number; dragging: boolean }) => `${o.yaw.toFixed(4)},${o.pitch.toFixed(4)},${o.dragging}`
const sigNow: number[] = []
/**
 * The screen a card's view is framed against: the tallest it has been at this width. A phone's address bar slides in
 * and out as the page goes back and forth, changing the screen's height each time; framed against that, a card's mesh
 * zoomed and shifted in its frame with every move. A new width (the phone turned) starts it over.
 */
const steady = { w: 0, h: 0 }

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
  // (a phone: less texture filtering, see useYarnMaterial)
  const yarn = useYarnMaterial({ lite: compact, anisotropy: compact ? 2 : 8 })
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const cameraNow = useThree((s) => s.camera)

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
  /** a phone's idle check: what the last frame was made from, what it drew, and how many frames in a row drew the same */
  const sigIn = useRef('')
  const sigLast = useRef<number[]>([])
  const still = useRef(0)
  /** the press field still moving (a card pressed, springing back): no frame is skipped */
  const pressLive = useRef(false)
  /** when the page last moved (ms): a phone's card turns only with the page at rest */
  const movedAt = useRef(-1e9)
  useEffect(() => {
    const on = () => void (movedAt.current = performance.now())
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

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
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__stage = { views, stage, scene, drop, POSES, POUR_OUT, ANCHORS, gl, yarn, camera: cameraNow, press }
  }, [gl, scene, yarn, cameraNow, press])

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
    // (on a phone About is rows of framed figures, not a screen the opening can turn into: there the opening keeps to
    // its own section and leaves with its last screen, never drawn over the rows)
    const handing = !reduced && !compact && stage.tour > 3.002 && stage.tour < 3.995
    const drawn: { r: Region; id: PoseId; top: number; bottom: number }[] = []
    for (const r of stage.regions) {
      const id = r.pose()
      if (POSES[id].empty) continue
      if (handing) {
        if (id === 'hero') drawn.push({ r, id, top: 0, bottom: vh })
        continue
      }
      const b = rects.get(r)
      // (a phone's card is drawn into its own canvas, so it is drawn a little before it reaches the screen: ready on arrival)
      const ahead = compact && r.box ? vh * 0.5 : 0
      if (!b || b.bottom <= -ahead || b.top >= vh + ahead || b.width < 2) continue
      drawn.push({ r, id, top: b.top, bottom: b.bottom })
    }
    // (a phone's cards first: each borrows the corner of the canvas to draw in, and gives it back clear before the rest)
    if (compact) drawn.sort((a, b) => Number(!!b.r.box) - Number(!!a.r.box))
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
      // a phone's solid yarn (no discards) compiles with the rest before the first frame, never mid-scroll the first time
      // a chunk takes it (a moment in the scene, out of sight, so it is built for the scene's own fog and light)
      if (compact) {
        // (an instanced one, as the sheet's parts are: a plain mesh compiled another program, and the sheet's own was still
        // compiled the first time a part took the solid yarn, mid-swipe, a frame of a tenth of a second)
        const probe = new THREE.InstancedMesh(cell.lo, yarn.getSolid(), 1)
        probe.setMatrixAt(0, new THREE.Matrix4())
        probe.frustumCulled = false
        probe.position.y = -100
        scene.add(probe)
        gl.compile(scene, camera)
        // and every part of the sheet is sent to the phone's GPU now, in each of its three cell details, drawn once out of
        // sight: the first time a part came into view as the mesh was built out, its upload stalled a frame or two, and
        // the mesh seemed to jump from a gap to the whole sheet
        if (field.current) {
          const chunks = field.current.children as THREE.InstancedMesh[]
          const kept = chunks.map((m) => ({ visible: m.visible, geometry: m.geometry, culled: m.frustumCulled }))
          gl.setScissorTest(true)
          gl.setScissor(0, 0, 1, 1)
          for (const geo of [cell.hi, cell.lo, cell.far]) {
            for (const m of chunks) {
              m.visible = true
              m.frustumCulled = false
              m.geometry = geo
            }
            gl.render(scene, camera)
          }
          // (and once in the solid yarn: a driver may only finish a program the first time it draws with it, and the
          // first draw of the solid yarn came mid-swipe, as the mesh was built out, a frame of a tenth of a second)
          const solid = yarn.getSolid()
          const cut = chunks.map((m) => m.material)
          for (const m of chunks) m.material = solid
          gl.render(scene, camera)
          chunks.forEach((m, i) => {
            m.material = cut[i]
            m.visible = kept[i].visible
            m.geometry = kept[i].geometry
            m.frustumCulled = kept[i].culled
          })
          gl.setScissorTest(false)
          gl.clear()
        }
        scene.remove(probe)
        // and with the key light casting (the opening's shadow): the yarn's program with a shadow and its depth pass, made
        // now, not the first time the opening is come back to
        const key = keyLight.current
        if (key) {
          key.castShadow = true
          gl.compile(scene, camera)
          gl.setScissorTest(true)
          gl.setScissor(0, 0, 1, 1)
          gl.render(scene, camera)
          gl.setScissorTest(false)
          gl.clear()
          key.castShadow = false
        }
      }
      // once the opening is under way, the programs of everything still hidden (concrete, mortar,
      // the drawing lines) compile in parallel, so nothing stalls the first time it appears
      warmup.current = window.setTimeout(() => {
        gl.compileAsync(scene, camera)
          .then(() => void (warm.current = true))
          .catch(() => {})
      }, (INTRO.delay + INTRO.duration) * 1000)
    }
    const since = (now - started.current) / 1000
    // a phone's cards: only the one most in view turns (slowly, CARD_TURN); the rest hold where they are
    let turning: Region | null = null
    if (compact) {
      let most = 0
      for (const d of drawn) {
        if (!d.r.box) continue
        const seen = Math.min(d.bottom, vh) - Math.max(d.top, 0)
        if (seen > most) {
          most = seen
          turning = d.r
        }
      }
    }
    // ---- a phone: a frame that would show the same picture as the last one is not drawn --------
    // What the picture is made from (where each screen is, the tour, the drag) is compared with the last frame; once it
    // has not changed and the last frames drew the same thing (every movement settled), the canvas keeps its picture
    // and the phone's GPU rests until the visitor moves the page again
    if (compact) {
      // (the page coming to rest lets a card set off turning again)
      let key = `${now - movedAt.current < 220},${vw},${vh},${gl.getPixelRatio()},${stage.tour},${stage.tourDive},${stage.tourPoints},${stage.flat},${thickness},${stage.inspect},${ob0(stage.orbit)}`
      for (const d of drawn) {
        const b = rects.get(d.r)
        const bl = d.r.blend?.()
        // (a card's picture does not change as it scrolls, only with its size: it scrolls with the page in its own canvas)
        const place = d.r.box ? `${(b?.height ?? 0).toFixed(1)}` : `${d.top.toFixed(1)},${d.bottom.toFixed(1)}`
        // (a card in the hand changes with it)
        const held = d.r.turn ? `${d.r.turn.yaw.toFixed(4)}${d.r.turn.dragging ? 'h' : ''}${d.r.turn.touch?.down ? `t${d.r.turn.touch.x.toFixed(3)},${d.r.turn.touch.y.toFixed(3)}` : ''}` : ''
        key += `|${d.id},${held},${place},${b ? `${b.left.toFixed(1)},${b.width.toFixed(1)}` : ''},${bl ? `${bl.a},${bl.b},${bl.t.toFixed(4)}` : ''}`
      }
      const idle = key === sigIn.current && still.current >= 2 && since > INTRO.delay + INTRO.duration + 1.5 && !stage.inspect && !pressLive.current
      if (key !== sigIn.current) still.current = 0
      sigIn.current = key
      if (idle) return
    }
    sigNow.length = 0
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
      // on a phone the opening names only the faces in the cavity; the close of the tour (About's first view on a wide
      // screen) carries no labels, which would stand over the rows below it
      if (hero && compact && stage.tour > 2.5) pose.labels = []
      // and in the cavity it names its points one at a time, a screen each (Hero counts them): never with the words
      // and in the cavity it names its points one at a time, a screen each (Hero counts them), each alone, the camera a
      // step further along the cavity for each: never with the words
      else if (hero && compact) {
        pose.labels = stage.tourPoints ? [PHONE_POINTS[stage.tourPoints - 1]] : []
        // (until the white has taken the screen, where the camera is brought out to the mesh)
        if (stage.tourDive && stage.tour < 2.56) pose.tgt = [pose.tgt[0], pose.tgt[1], pose.tgt[2] - stage.tourDive * TOUR_DIVE]
      }
      // where the panel is: -1 entering from below, 0 in place, 1 leaving above (the opening runs its own tour)
      // (a view in a box holds still as its box scrolls: it turns on its own, steadily, as a looping film does)
      const o = hero || reduced || r.box ? 0 : THREE.MathUtils.clamp(-view.top / vh, -1, 1)
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
        // on the clock of the copy's own move to the left (it starts with the slide's `is-active`, and starts
        // over with it), so the notes, on the copy's line, never come in while the copy still stands on the right
        const played = active && !reduced ? pourClock() : null
        if (active) f.pour = reduced ? 1.6 : played !== null ? Math.min(1.6, -0.25 + played / 1.85) : Math.min(1.6, f.pour + dt / 1.85)
        if (f.pour > 1.02) pose = blendPose(pose, POUR_OUT, smoothstep(1.02, 1.6, f.pour), pourScratch)
      } else f.pour = -0.25

      // ---- camera: the view travels with its panel and turns a little as the panel passes -------
      // (a phone's opening follows the finger's native scroll closely: the tour value is already smoothed in Hero)
      // (a phone's card is set in its framing at once: it once glided there from the screen's framing each time it came
      // on screen, and slid in its frame as the page went back and forth)
      const k = reduced || (compact && r.box) ? 1e4 : hero ? (compact ? 26 : 9) : bl ? SCRUB : GLIDE
      // narrower landscape windows: stand back so the mesh keeps clear of the copy beside it;
      // stacked layout on a screen that is not tall: smaller, and up into the space above the copy
      const squat = compact ? clamp01((vw / vh - 0.6) / 0.45) : 0
      // a phone that is short for its width (16:9, or its browser bars showing) has less height between the copy
      // above and below the model: the model stands a little further back
      const short = compact ? clamp01((vw / vh - 0.5) / 0.08) : 0
      const fit = r.box ? 1 : compact ? (1 + squat * 0.85) * (1 + short * 0.2) : Math.max(1, 1.5 / (vw / vh))
      const dist = (compact ? (pose.distCompact ?? pose.dist) : pose.dist) * fit * (1 + Math.abs(o) * PARALLAX.dist)
      dampVec(c.tgt, pose.tgt[0], pose.tgt[1], pose.tgt[2], k, dt)
      c.elev = damp(c.elev, pose.elev - o * PARALLAX.elev, k, dt)
      c.azim = dampAngle(c.azim, pose.azim + o * PARALLAX.azim, k, dt)
      c.dist = damp(c.dist, dist, k, dt)
      c.fov = damp(c.fov, pose.fov, k, dt)
      // a view in a box is centred in it
      const frame = r.box ? CENTRE : compact ? pose.frameCompact : pose.frame
      c.fx = damp(c.fx, frame[0], k, dt)
      c.fy = damp(c.fy, lerp(frame[1], Math.min(frame[1], 0.27), squat), k, dt)
      // a view in a box never sways back and forth: it turns round one way at an even pace, on and on
      // (in development a recording of a box's loop may turn it faster: window.__boxTurn)
      const turn = pose.spin || (r.box ? (import.meta.env.DEV && (window as unknown as { __boxTurn?: number }).__boxTurn) || BOX_TURN : 0)
      // a phone's figure stands still in its pose: no turn, no rock (it read as a wobble in the hand); it moves only with
      // the page, and the phone draws nothing while the page is still
      // (and only while the page is at rest: turning, it is drawn and copied into its card every frame, a weight on a
      // phone's frames that showed as a hitch while the page glided, and as it came to rest on About)
      if (compact && r.box && !pose.spin) c.spin = reduced || r !== turning || now - movedAt.current < 220 ? c.spin : (c.spin + CARD_TURN * dt) % 360
      // a phone's opening piece turns slowly while the page rests on it, and eases back to its pose as the tour sets off
      else if (compact && hero) c.spin = reduced ? 0 : stage.tour < 0.08 ? (c.spin + OPEN_TURN * dt) % 360 : dampAngle(c.spin, 0, 2.4, dt)
      else c.spin = reduced ? 0 : turn ? (c.spin + turn * dt) % 360 : dampAngle(c.spin, 0, 1.6, dt)
      // (a phone's views never sway on their own: the mesh moves only when the visitor scrolls or turns it)
      const sway = reduced || r.box || compact ? 0 : pose.sway * Math.sin((since * Math.PI * 2) / SWAY_PERIOD)
      // a card turned by hand: it follows the finger, and once let go it eases back to its pose
      const hand = r.turn
      if (hand && !hand.dragging && hand.yaw !== 0) hand.yaw = Math.abs(hand.yaw) < 1e-4 ? 0 : damp(hand.yaw, 0, 2.2, dt)
      const azim = (c.azim + sway + c.spin) * DEG + (hero ? orbit.current.yaw : 0) + (hand?.yaw ?? 0)
      // the opening's tour goes down to eye level between the faces; elsewhere the camera stays above
      const elev = THREE.MathUtils.clamp(c.elev * DEG + (hero ? orbit.current.pitch : 0), hero ? -0.3 : 0.05, 1.45)
      vPos.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), Math.cos(elev) * Math.cos(azim)).multiplyScalar(c.dist).add(c.tgt)
      camera.position.copy(vPos)
      camera.up.set(0, 1, 0)
      camera.lookAt(c.tgt)
      // a view in a box: the camera sees the box as its whole screen, its field widened or narrowed so the mesh
      // takes the same share of the box's width as it would of the screen's
      const bx = r.box ? rects.get(r) : undefined
      const panelTop = hero ? Math.min(0, view.bottom - vh) : view.top
      if (bx) {
        camera.aspect = bx.width / bx.height
        if (steady.w !== vw) steady.h = 0
        steady.w = vw
        steady.h = Math.max(steady.h, vh)
        const screenH = compact ? steady.h : vh
        camera.fov = (2 * Math.atan(Math.tan((c.fov * DEG) / 2) * (vw / screenH) * (bx.height / bx.width))) / DEG
        camera.setViewOffset(bx.width, bx.height, bx.width / 2 - c.fx * bx.width, bx.height / 2 - c.fy * bx.height, bx.width, bx.height)
      } else {
        camera.aspect = vw / vh
        camera.fov = c.fov
        // the frame is measured from the panel's top, so the mesh moves with the panel; the opening
        // stays put through its tour and leaves with its last screen
        camera.setViewOffset(vw, vh, vw / 2 - c.fx * vw, vh / 2 - c.fy * vh - panelTop, vw, vh)
      }
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
      // a phone stands further back than a wide screen (`distCompact`, and `fit` on a short phone): the fall-off into the
      // ground moves back with the camera, so the mesh keeps the depth of colour it has on a wide screen rather than fading
      const fogFit = compact ? fit * ((pose.distCompact ?? pose.dist) / pose.dist) : 1
      v.fog[0] = damp(v.fog[0], pose.fog[0] * fogFit, k, dt)
      v.fog[1] = damp(v.fog[1], pose.fog[1] * fogFit, k, dt)

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
        // a phone: a chunk wholly built, with every part of the mesh shown, takes the yarn that never discards (the GPU
        // then skips the yarns hidden behind others); one still being woven on, or trimmed, keeps the one that can
        if (compact) {
          const whole = v.vis.x >= 0.999 && v.vis.y * (1 - f.flat) >= 0.999 && v.vis.z * (1 - f.flat) >= 0.999
          const solid = yarn.getSolid()
          for (const m of field.current.children) {
            const far = m.userData.far as [number, number] | undefined
            const mesh = m as THREE.InstancedMesh
            // (built far enough in that none of its cells is still dissolving or being laid: the build's 0.9)
            const built = whole && !!far && far[0] <= f.winX / 2 - f.band * 0.9 && far[1] <= f.winZ / 2 - f.band * 0.9
            const want = built ? solid : (m.userData.cut as THREE.Material)
            if (want && mesh.material !== want) mesh.material = want
          }
        }
      }
      u.uPartDim.value.copy(v.dim)
      u.uPartVis.value.set(v.vis.x, v.vis.y * (1 - f.flat), v.vis.z * (1 - f.flat))
      u.uPartGlow.value.copy(v.glow)
      u.uExplode.value = f.explode
      u.uXray.value = f.xray
      u.uFaceColor.value.copy(v.face)
      u.uPileColor.value.copy(v.pile)
      // (a phone has no cursor to press the sheet: its vertices skip the press field's three reads)
      u.uFlex.value = compact && !r.box ? 0 : f.flex
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
      // (a phone's cards keep their full cells: a card is drawn only when its picture changes, so it costs little; the
      // opening piece keeps them too, the first thing seen, and gives them up gradually as the mesh is built out, far
      // parts first, never all at once)
      ;(field.current?.userData.lod as ((cam: THREE.Camera, farMul?: number) => void) | undefined)?.(camera, compact && r.box ? 4 : compact && hero ? lerp(4, 1, smoothstep(0.15, 1, stage.tour)) : 1)
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
      // a phone: the piece casts its shadow on the opening alone, where it lies still and turns slowly; as the tour sets
      // off the light stops casting, so the swipes never draw the sheet twice a frame
      if (compact && key) key.castShadow = hero && stage.tour < 0.3 && f.shadow > 0.01
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
      // a finger on a phone's card presses its sheet there (the card's own ray, across the card), and it springs back
      const touch = bx && r.turn?.touch?.down ? r.turn.touch : null
      if (touch && pose.press && !reduced && f.flex > 0.001 && tile.current) {
        ray.setFromCamera(ndc.set(touch.x, -touch.y), camera)
        ray.ray.applyMatrix4(toLocal.copy(tile.current.matrixWorld).invert())
        if (ray.ray.intersectPlane(plane, hit) && Math.abs(hit.x) < (f.winX / 2) * PITCH && Math.abs(hit.z) < (f.winZ / 2) * PITCH)
          press.press(hit.x / SHEET + 0.5, hit.z / SHEET + 0.5, CURSOR.depth * FINGER.depth, ((CURSOR.radius * FINGER.radius) / SHEET) * press.cols)
      }
      // "Elastic modulus" under the cursor: the sheet is struck in the middle and springs straight back
      if (inspect === 'modulus' && now - f.knockAt > 1300) {
        f.knockAt = now
        press.press(0.5, 0.5, 0.009, (0.05 / SHEET) * press.cols)
      }

      // ---- a phone: the chunks wholly inside the fog are not drawn -------------------------------
      // past the fog's far end the mesh is the ground's own colour, so they cannot be seen; between the faces most of the
      // sheet is that far, and in the white all of it is (measured as the fog is, by depth in front of the camera)
      if (compact && field.current) {
        const fogFar = v.fog[1]
        for (const m of field.current.children) {
          const sphere = (m as THREE.InstancedMesh).boundingSphere
          if (!m.visible || !sphere) continue
          vA.copy(sphere.center).applyMatrix4(m.matrixWorld).applyMatrix4(camera.matrixWorldInverse)
          if (-vA.z - sphere.radius * f.stretch > fogFar) m.visible = false
        }
      }

      // (what this view draws, for a phone's comparison with the next frame)
      const sig = (a: number, b: number) => {
        sigNow.push(...camera.matrixWorld.elements, ...camera.projectionMatrix.elements, a, b, f.winX, f.winZ, f.band, f.weaveX, f.weaveZ, f.explode, f.xray, f.flex, f.axes, f.shear, f.dim, f.widthDim, f.slabs, f.gap, f.pour, f.shadow)
        sigNow.push(...v.dim.toArray(), ...v.vis.toArray(), ...v.glow.toArray(), ...v.face.toArray(), ...v.pile.toArray(), ...v.fogColor.toArray(), v.fog[0], v.fog[1])
        sigNow.push(mortar.current?.visible ? since : 0, concrete.opacity, mortarU.uFront.value, catcherMat.opacity, gl.toneMappingExposure, scene.environmentIntensity, keyLight.current?.intensity ?? 0)
        if (tile.current) sigNow.push(tile.current.position.y, tile.current.rotation.x, tile.current.rotation.z, tile.current.scale.x)
      }

      // ---- a phone's card: drawn into its own canvas, which scrolls with the card ----------------
      // The fixed canvas is drawn a frame behind a finger's native scroll, so a card's mesh drawn on it trails its frame
      // and wobbles against it. Instead the card is drawn in the canvas's lower corner, copied into the card's own canvas
      // and the corner cleared: the picture then moves with the page as an image does, and is drawn again only when it
      // changes (nothing to draw while the page only scrolls)
      const own = compact && bx ? r.el.querySelector<HTMLCanvasElement>('canvas.eb-fig__canvas') : null
      if (own && bx) {
        const pr = gl.getPixelRatio()
        const w = Math.min(vw, bx.width)
        const h = Math.min(vh, bx.height)
        const pw = Math.round(w * pr)
        const ph = Math.round(h * pr)
        // a card whose picture is the one it already holds is not drawn again (another card turning, say)
        const from = sigNow.length
        sig(-1, w * 1e4 + h)
        const mine = sigNow.slice(from)
        const had = cardSigs.get(r)
        if (had && own.width === pw && own.height === ph && had.length === mine.length && mine.every((x, i) => Math.abs(x - had[i]) <= 1e-6 + Math.abs(x) * 1e-5)) {
          gl.setViewport(0, 0, vw, vh)
          camera.aspect = vw / vh
          continue
        }
        cardSigs.set(r, mine)
        gl.setScissorTest(true)
        gl.setViewport(0, 0, w, h)
        gl.setScissor(0, 0, w, h)
        gl.clear()
        gl.render(scene, camera)
        if (own.width !== pw || own.height !== ph) {
          own.width = pw
          own.height = ph
        }
        const ctx = own.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, pw, ph)
          ctx.drawImage(gl.domElement, 0, gl.domElement.height - ph, pw, ph, 0, 0, pw, ph)
        }
        gl.clear()
        gl.setViewport(0, 0, vw, vh)
        camera.aspect = vw / vh
        continue
      }

      // ---- draw this view inside its own panel ------------------------------------------------
      // an edge inside the screen meets the next panel: it is pulled in to whole canvas pixels and one more, or the
      // canvas, drawn at a density other than the screen's (fractional display scaling, or stepped down to keep up),
      // is resampled and a row of this view's mesh bleeds past the edge onto the panel beside it
      const pr = gl.getPixelRatio()
      const ch = gl.domElement.height
      const s0 = y0 > 0 ? Math.min(ch, Math.ceil(y0 * pr) + 1) : 0
      const s1 = y1 < vh ? Math.max(0, Math.floor(y1 * pr) - 1) : ch
      if (s1 <= s0) continue
      gl.setScissorTest(true)
      if (bx) {
        // only inside the box, and only the part of it on the screen
        const x0 = Math.max(0, bx.left)
        const x1 = Math.min(vw, bx.right)
        if (x1 <= x0) continue
        gl.setViewport(bx.left, vh - bx.bottom, bx.width, bx.height)
        gl.setScissor(x0, (ch - s1) / pr, x1 - x0, (s1 - s0) / pr)
      } else gl.setScissor(0, (ch - s1) / pr, vw, (s1 - s0) / pr)
      // (in development, recording a box's loop: the box painted in its ground, as the page under it would show)
      const recBg = import.meta.env.DEV && bx ? (window as unknown as { __recBg?: string }).__recBg : undefined
      if (recBg) {
        gl.setClearColor(recBg, 1)
        gl.clearColor()
        gl.setClearColor(0x000000, 0)
      }
      gl.clearDepth()
      if (compact) sig(s0, s1)
      gl.render(scene, camera)
      if (bx) {
        gl.setViewport(0, 0, vw, vh)
        camera.aspect = vw / vh
        // a framed figure carries no labels: the copy beside it says what it shows
        continue
      }

      // ---- labels pinned to this view's sheet -------------------------------------------------
      // the opening's callouts wait until the piece has been woven
      // (and a phone's point in the cavity once the camera has come to it: never sliding in with the camera)
      const settled = (Math.abs(c.dist - dist) < dist * 0.08 || reduced) && (!hero || intro > 0.96) && (!hero || !compact || !stage.tourPoints || (Math.abs(c.tgt.z - pose.tgt[2]) < 0.004 && Math.abs(c.elev - pose.elev) < 1.5))
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
          const line = el.dataset.colAt ? document.querySelector(el.dataset.colAt) : null
          if (moving(line)) continue
          const at = line?.getBoundingClientRect()
          const words = at ? (el.querySelector<HTMLElement>('.pin__tag')?.offsetWidth ?? 0) : 0
          let colX = at ? (x > at.left + words ? at.left + words + 18 : at.left - 18) : Number(el.dataset.col) * vw
          // a phone: no column; the label goes to whichever side of its point has the room for it, a short leader off
          // the point, and never past the screen's edge (to a set column, the wider capitals ran off the left edge)
          if (!at && compact) {
            const w = el.querySelector<HTMLElement>('.pin__tag')?.offsetWidth ?? 0
            const off = 16
            const edge = 8
            const roomRight = vw - edge - (x + off)
            const roomLeft = x - off - edge
            // (to the right: the tag starts at the column; to the left: it ends there)
            const toRight = roomRight >= w || (roomLeft < w && roomRight >= roomLeft)
            colX = toRight ? Math.max(x + 1, Math.min(x + off, vw - edge - w)) : Math.min(x - 1, Math.max(x - off, edge + w))
          }
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
        } else if (compact) {
          // on a phone the label goes to whichever side its words fit on, not by a desktop margin
          // (its words are measured once: read every frame, the width would force a layout each time)
          const w = Number((el.dataset.w ??= String((el.querySelector('.pin__text') as HTMLElement | null)?.offsetWidth ?? 0)))
          el.classList.toggle('pin--swap', el.classList.contains('pin--left') ? x - 12 - w < 8 : x + 12 + w > vw - 8)
        } else el.classList.toggle('pin--swap', el.classList.contains('pin--left') ? x < 200 : x > vw - 200)
        placed.add(anchor)
        el.style.opacity = '1'
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      }
    }
    gl.setScissorTest(false)
    for (const [anchor, el] of stage.labels) if (!placed.has(anchor) && el.style.opacity !== '0') el.style.opacity = '0'
    // a phone: the same picture as the frame before (to well under a pixel)? one more frame alike and the next ones rest
    if (compact) {
      const prev = sigLast.current
      const same = prev.length === sigNow.length && sigNow.every((x, i) => Math.abs(x - prev[i]) <= 1e-6 + Math.abs(x) * 1e-5)
      still.current = same ? still.current + 1 : 0
      sigLast.current = sigNow.slice()
    }

    // the press field is shared: advance it once a frame while any view is pressing
    pressLive.current = flexing && press.step(dt)
    if (pressLive.current) press.upload()
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
          // a phone: the cells farther off (most of the sheet once it is built out, and the cavity beyond the first few
          // rows) take the light cell; on a phone's screen a cell that far is a few pixels across, and the light cell has
          // a third of the triangles (a sheet of 1600 cells goes from over a million to about half that)
          farDistance={compact ? 0.5 : 0.9}
          shadows={!compact}
          castShadow={compact}
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
        shadow-mapSize={compact ? [1024, 1024] : [2048, 2048]}
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

