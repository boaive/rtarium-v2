import { Component, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { hasWebGL2 } from '../../three/Stage'
import { prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { approach, type LabelBus, type Shot } from './kit'
import { builds, opening } from '../../lib/builds'

class Boundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[RTARIUM] a 3D scene failed; making it again.', error)
    this.props.onFail()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Canvases still to be made, in page order. Once the page has settled, on a large screen, they are
 * made one at a time while the browser is idle, so a scene is usually built and compiled before the
 * visitor reaches it; a section coming near makes its own at once.
 */
const waiting: { el: HTMLElement; make: () => void }[] = []
let pumping = false
/** openings playing now: while any is, no canvas is built ahead (each build stalls the page for a moment) */
let held = 0
/** holds the building of canvases ahead while an opening plays; returns the release (safe to call twice) */
export function holdPump() {
  held++
  let done = false
  return () => {
    if (done) return
    done = true
    held = Math.max(0, held - 1)
    if (!held) window.setTimeout(pump, 400)
  }
}
const idle = (f: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 100))
/** while the opening shows, nothing scrolls: every canvas is built then, back to back, the opening waiting for them */
const count = () => void (builds.waiting = waiting.length + (pumping ? 1 : 0))
function pump() {
  count()
  if (pumping || held || !waiting.length) return
  pumping = true
  count()
  const fast = opening()
  ;(fast ? (f: () => void) => window.setTimeout(f, 0) : idle)(() => {
    // (held since it was asked: what is playing now goes first; the release asks again)
    if (held) {
      pumping = false
      return count()
    }
    waiting.sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top)
    const next = waiting.shift()
    next?.make()
    // a breath between canvases, so building one never crowds the next or the visitor's scroll (a short one while the
    // opening shows: there is no scroll to crowd)
    window.setTimeout(
      () => {
        pumping = false
        pump()
      },
      fast ? 120 : 160,
    )
  })
}
/** a moment after the first canvas asks (not the page's load event, which its photographs and footage hold back) */
let settled = false
const pending: (() => void)[] = []
function whenSettled(f: () => void) {
  // (while the opening shows, at once)
  if (settled || opening()) return f()
  pending.push(f)
  if (pending.length === 1)
    window.setTimeout(() => {
      settled = true
      pending.splice(0).forEach((g) => g())
    }, 600)
}

/**
 * One canvas for one story. It is created when its section comes within two and a half screens of
 * the viewport, or earlier while the browser is idle (above), and then kept; once its models are in,
 * every material it will ever show is compiled at once (`Warm`), so nothing stalls when it first
 * appears. It renders only when something in it moves (`frameloop="demand"`: a scene asks for frames
 * while it is on its way to a state and stops once it has settled), and is transparent, so the
 * section's own ground is the background. A scene that fails (a texture that never came, a context
 * the browser took back) is made again, a few times; only without WebGL, or after that, does
 * `fallback` (a photograph or nothing) stand in, and the copy carries the content.
 */
export function Stage3D({
  children,
  fallback,
  className = '',
  shadows = false,
  keyLight = true,
  sharp = false,
}: {
  children: ReactNode
  fallback?: ReactNode
  className?: string
  /** cast shadows (the models that cast them, and their key light, are the scene's own) */
  shadows?: boolean
  /** the fixed key light; a scene that moves its key light with the camera brings its own */
  keyLight?: boolean
  /** always drawn at full sharpness, never at fewer pixels while it moves (a scene light enough to keep up: the panels' burst) */
  sharp?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [failed, setFailed] = useState(() => !hasWebGL2())
  /** how many times the canvas has been made again, after a failure or a lost context */
  const [life, setLife] = useState(0)
  const tries = useRef(0)
  const compact = useIsCompact()
  const again = useCallback(() => {
    if (tries.current >= 3) return setFailed(true)
    tries.current++
    window.setTimeout(() => setLife((n) => n + 1), 500 * tries.current)
  }, [])
  // a context the browser takes back (too many on the page, a driver reset) leaves a blank canvas: make a new one
  const onCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      gl.setClearColor(0x000000, 0)
      gl.domElement.addEventListener(
        'webglcontextlost',
        (e) => {
          e.preventDefault()
          again()
        },
        { once: true },
      )
    },
    [again],
  )

  useEffect(() => {
    const el = host.current
    if (!el || near) return
    const make = () => setNear(true)
    const entry = { el, make }
    let queued = false
    const queue = () => {
      if (queued) return
      queued = true
      waiting.push(entry)
      pump()
    }
    /*
     * a canvas folded away in a section that shows it later (the façade's accordion on a phone, `data-stage-ahead`):
     * hidden, it never comes near by itself, and made only as it unfolds it stalled the unfolding. It is made as its
     * section comes near instead, one at a time with the others while the browser is idle; at once if it shows first.
     * On a phone every canvas coming near is made so, in a pause and never while an opening or a fold plays (holdPump):
     * made the moment it came near, a scene ahead stalled whatever was moving on the screen then (the accordion's fold);
     * one already on the screen is made at once
     */
    const ahead = el.parentElement?.closest<HTMLElement>('[data-stage-ahead]') ?? null
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) (e.target === el && !compact ? make : queue)()
      },
      { rootMargin: '250% 0px' },
    )
    io.observe(el)
    if (ahead) io.observe(ahead)
    const seen = compact ? new IntersectionObserver(([e]) => e.isIntersecting && make()) : null
    seen?.observe(el)
    // on a large screen, made ahead while the browser is idle (a phone keeps to its sections' approach)
    if (!compact) {
      whenSettled(() => {
        if (!host.current) return
        queue()
      })
    }
    return () => {
      io.disconnect()
      seen?.disconnect()
      if (queued) {
        const i = waiting.indexOf(entry)
        if (i >= 0) waiting.splice(i, 1)
        count()
      }
    }
  }, [near, compact])

  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 1.75))
  return (
    <div ref={host} className={`fc-canvas ${className}`} aria-hidden="true" data-failed={failed ? '' : undefined}>
      {failed
        ? fallback
        : near && (
            <Boundary key={life} onFail={again}>
              <Canvas
                frameloop="demand"
                shadows={shadows}
                dpr={[1, dpr]}
                gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false }}
                camera={{ fov: 26, near: 0.02, far: 120, position: [6, 4, 10] }}
                onCreated={onCreated}
              >
                <Suspense fallback={null}>
                  <Lights keyLight={keyLight} />
                  <Settle />
                  {!sharp && <Pace full={dpr} />}
                  {children}
                  <Warm />
                </Suspense>
              </Canvas>
            </Boundary>
          )}
    </div>
  )
}

/**
 * Draws again whenever the canvas changes size, and for its first few frames: a canvas created while
 * the page is still (landed on from a link, or by a jump) would otherwise keep a first frame drawn
 * before it had its size, since nothing else asks it for one until the page moves.
 */
function Settle() {
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const left = useRef(12)
  useEffect(() => invalidate(), [size, invalidate])
  useFrame(() => {
    if (left.current > 0) {
      left.current--
      invalidate()
    }
  })
  return null
}

/**
 * The scene's sharpness kept to what the graphics card can draw in time: while it moves and its frames come too slowly
 * (a dense mesh, its shadows), it is drawn at fewer pixels, a little softer but smooth; once it has been still a moment
 * it is drawn once more at full sharpness. A scene that keeps up is never touched.
 */
const SLOW = 1 / 40
const LEAST_DPR = 0.6
function Pace({ full }: { full: number }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const dpr = useRef(full)
  const slow = useRef(0)
  /** frames in a row that kept up, at a softer resolution: enough of them, and it is sharpened a step (a scene that never
   * stands still, swaying, would else stay soft) */
  const quick = useRef(0)
  // a small canvas (a phone's figure) costs little to draw sharp, and shows every lost pixel: it never goes as soft
  const least = size.width * size.height < 700 * 700 ? Math.min(full, 1.25) : LEAST_DPR
  const timer = useRef(0)
  /** sharp again asked for: done at the start of the next frame, as it is drawn */
  const restore = useRef(false)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // (the canvas resized at the start of a frame, before it is drawn: never a frame drawn at the old size, or a blank one)
  const apply = (d: number) => {
    dpr.current = d
    gl.setPixelRatio(d)
    gl.setSize(size.width, size.height, false)
  }
  useFrame((_, delta) => {
    if (restore.current) {
      restore.current = false
      if (dpr.current < full) apply(full)
    }
    // (a frame after a pause is not a slow one: the first of a run of frames carries the pause before it)
    if (delta > 0.25) return
    slow.current = delta > SLOW ? slow.current + 1 : Math.max(0, slow.current - 1)
    quick.current = delta > SLOW ? 0 : quick.current + 1
    if (slow.current >= 4 && dpr.current > least) {
      slow.current = 0
      quick.current = 0
      apply(Math.max(least, dpr.current * 0.8))
    } else if (quick.current >= 45 && dpr.current < full) {
      quick.current = 0
      apply(Math.min(full, dpr.current * 1.15))
    }
    // still a moment: sharp again
    window.clearTimeout(timer.current)
    if (dpr.current < full)
      timer.current = window.setTimeout(() => {
        restore.current = true
        invalidate()
      }, 400)
  })
  return null
}

/**
 * Once the scene's models are in (it mounts after them, inside the same Suspense), compiles every
 * material in it, the hidden ones included, off the main thread where the browser allows, then asks
 * for a frame: a part that appears later in the story (the concrete, the ferrules) is ready for it.
 */
function Warm() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let live = true
    const id = requestAnimationFrame(() => {
      // (three compiles only what is visible: everything hidden for now is shown for the call, which gathers what it will
      // compile at once, and hidden again, so nothing compiles, and stalls, the first time it is shown)
      const hidden: THREE.Object3D[] = []
      scene.traverse((o) => {
        if (!o.visible) {
          hidden.push(o)
          o.visible = true
        }
      })
      const done = gl.compileAsync(scene, camera)
      for (const o of hidden) o.visible = false
      done.then(() => live && invalidate()).catch(() => {})
    })
    return () => {
      live = false
      cancelAnimationFrame(id)
    }
  }, [gl, scene, camera, invalidate])
  return null
}

/**
 * daylight from above and the side, and soft studio panels for the metals to reflect (the homepage's set). Drawn again
 * only if its own setting changes: drei's Environment makes its reflections over (six views and their blurs) every time it
 * is drawn, and a page that draws its stage again on each step (a part picked, a scene going on) would make them over each
 * time, a stall each.
 */
const Lights = memo(function Lights({ keyLight }: { keyLight: boolean }) {
  return (
    <>
      <ambientLight intensity={0.22} />
      {keyLight && <directionalLight position={[-6, 9, 7]} intensity={2.1} color={KEY.color} />}
      <directionalLight position={[7, 2.5, 3]} intensity={0.55} color="#e6edf7" />
      <directionalLight position={[-4, 3, -6]} intensity={0.5} color="#d7e2f2" />
      <Environment resolution={128} frames={1} background={false}>
        <color attach="background" args={['#0a0a0a']} />
        <Lightformer form="rect" intensity={3} color="#ffffff" position={[-1.6, 3, 0.6]} scale={[0.9, 6, 1]} target={[-1.6, 0, 0.6]} />
        <Lightformer form="rect" intensity={3.4} color="#fffaf2" position={[0.4, 3, 0.9]} scale={[1.1, 6, 1]} target={[0.4, 0, 0.9]} />
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[2.3, 3, 0.2]} scale={[0.8, 6, 1]} target={[2.3, 0, 0.2]} />
        <Lightformer form="rect" intensity={5} color="#dfe9ff" position={[-3, 0.5, -3]} scale={[6, 0.4, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[0, 0.8, 4]} scale={[7, 1.2, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.4} color="#ffffff" position={[0, -3, 0]} scale={[6, 6, 1]} target={[0, 0, 0]} />
      </Environment>
    </>
  )
})

/** the key light: daylight from high on the left, in front */
export const KEY = { offset: [-6, 9, 7] as [number, number, number], intensity: 2.1, color: '#fff6e8' }

/**
 * The key light as a scene's own, kept at the same angle to the point the camera is looking at, so
 * it can cast shadows wherever the story has gone (a fixed light's shadow camera covers one place).
 */
export function MovingKeyLight({ focus, reach = 8, offset = KEY.offset }: { focus: [number, number, number]; reach?: number; offset?: [number, number, number] }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const l = light.current
    if (!l) return
    scene.add(l.target)
    return () => void scene.remove(l.target)
  }, [scene])
  useEffect(() => {
    const l = light.current
    if (!l) return
    l.position.set(focus[0] + offset[0], focus[1] + offset[1], focus[2] + offset[2])
    l.target.position.set(focus[0], focus[1], focus[2])
    l.target.updateMatrixWorld()
    invalidate()
  }, [focus, offset, invalidate])
  return (
    <directionalLight
      ref={light}
      intensity={KEY.intensity}
      color={KEY.color}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.025}
      shadow-camera-left={-reach}
      shadow-camera-right={reach}
      shadow-camera-top={reach}
      shadow-camera-bottom={-reach}
      shadow-camera-near={1}
      shadow-camera-far={40}
    />
  )
}

const DEG = Math.PI / 180

/**
 * The camera. It glides to each state's shot (spherical about a target, the target placed at a
 * chosen point of the canvas so the copy has its own clear side) and settles there: no drift, no
 * spin. Under reduced motion it cuts.
 */
export function Rig({ shot }: { shot: Shot }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const cur = useRef<Record<string, number> | null>(null)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  useEffect(() => invalidate(), [shot, size, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const to = {
      tx: shot.target[0],
      ty: shot.target[1],
      tz: shot.target[2],
      dist: shot.dist,
      azim: shot.azim,
      elev: shot.elev,
      fov: shot.fov ?? 26,
      fx: shot.frame?.[0] ?? 0.5,
      fy: shot.frame?.[1] ?? 0.5,
    }
    if (!cur.current || reduced) cur.current = { ...to }
    const c = cur.current
    let moving = false
    for (const k of Object.keys(to) as (keyof typeof to)[]) {
      // the distance eases a little slower than the turn, so a move reads as one gesture
      if (approach(c, k, to[k], k === 'dist' ? 2.4 : 2.8, dt, k === 'dist' ? 1e-3 : 1e-4)) moving = true
    }
    const el = c.elev * DEG
    const az = c.azim * DEG
    camera.position.set(c.tx + c.dist * Math.cos(el) * Math.sin(az), c.ty + c.dist * Math.sin(el), c.tz + c.dist * Math.cos(el) * Math.cos(az))
    camera.lookAt(c.tx, c.ty, c.tz)
    if (camera.fov !== c.fov) camera.fov = c.fov
    const w = size.width
    const h = size.height
    camera.setViewOffset(w, h, -(c.fx - 0.5) * w, -(c.fy - 0.5) * h, w, h)
    camera.updateProjectionMatrix()
    if (moving) invalidate()
  }, -1)
  return null
}

/** places an anchor of the model where its label can find it */
export function Anchor({ bus, id, position }: { bus: LabelBus; id: string; position: [number, number, number] }) {
  const ref = useRef<THREE.Object3D>(null)
  useEffect(() => {
    const o = ref.current
    if (!o) return
    bus.anchors.set(id, o)
    return () => {
      bus.anchors.delete(id)
    }
  }, [bus, id])
  return <object3D ref={ref} position={position} />
}

const tmp = new THREE.Vector3()
/** each label's words, and their size, measured once (the words never change) */
const tags = new WeakMap<HTMLElement, { tag: HTMLElement; lead: HTMLElement | null; w: number; h: number; dx: number; dy: number; sx: number; sy: number }>()
const EDGE = 8
/** the site header and the section's sub-navigation own the top of the screen */
const TOP = 150
/** how long a label going out is still seen (its fade, --d-mid, and a little over) */
const FADE = 520
/** when each label last went out */
const gone = new WeakMap<HTMLElement, number>()

/**
 * Writes each shown label's screen position after every frame the canvas draws. A label pushed in
 * from an edge keeps its leader on it; `bottom` keeps labels clear of what owns the foot of the
 * screen (a step bar), `top` of what owns its head (the header, unless the stage is a box of its
 * own). One going out keeps to its point while it fades.
 *
 * With `rows` (numbered balloons on an exploded model) the balloons keep off the model: those set above their point
 * (`dy` < 0) stand in one row along the top, the others in one row along the foot, each over or under its point as
 * near as it can be, never closer to the next than `rows` px, its leader straight to its point.
 */
export function LabelProjector({ bus, bottom = EDGE, top: head, rows }: { bus: LabelBus; bottom?: number; top?: number; rows?: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useFrame(() => {
    // the rig has moved the camera this frame, but its world matrix (what a point is projected
    // with) is only brought up to date when the scene draws: without this a label is placed with
    // the camera's new position and last frame's turn, and jumps about while the camera swings
    camera.updateMatrixWorld()
    const now = performance.now()
    const lined: { x: number; y: number; up: boolean; t: NonNullable<ReturnType<typeof tags.get>> }[] = []
    for (const [id, el] of bus.els) {
      const a = bus.anchors.get(bus.alias.get(id) ?? id)
      const want = bus.shown.has(id)
      if (!want || !a) {
        if (el.dataset.on === '1') gone.set(el, now)
        el.dataset.on = '0'
        if (!a || now - (gone.get(el) ?? -FADE) >= FADE) continue
      }
      a.getWorldPosition(tmp)
      tmp.project(camera)
      const x = (tmp.x * 0.5 + 0.5) * size.width
      const y = (-tmp.y * 0.5 + 0.5) * size.height
      const inside = tmp.z < 1 && x > -20 && x < size.width + 20 && y > -20 && y < size.height + 20
      if (want) el.dataset.on = inside ? '1' : '0'
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      let t = tags.get(el)
      if (!t) {
        const tag = el.querySelector<HTMLElement>('.fc-pin__tag')
        if (!tag) continue
        t = { tag, lead: el.querySelector<HTMLElement>('.fc-pin__lead'), w: tag.offsetWidth, h: tag.offsetHeight, dx: parseFloat(tag.style.left) || 0, dy: parseFloat(tag.style.top) || 0, sx: 0, sy: 0 }
        if (t.w) tags.set(el, t)
      }
      if (rows) {
        // (one going out fades where it stood: the rows are laid out by those shown)
        if (want) lined.push({ x, y, up: t.dy < 0, t })
        continue
      }
      const left = t.tag.classList.contains('fc-pin__tag--left')
      const x0 = x + t.dx - (left ? t.w : 0)
      const sx = x0 < EDGE ? EDGE - x0 : x0 + t.w > size.width - EDGE ? size.width - EDGE - (x0 + t.w) : 0
      const y0 = y + t.dy - t.h / 2
      const top = head ?? Math.min(TOP, size.height * 0.2)
      const sy = y0 < top ? top - y0 : y0 + t.h > size.height - bottom ? size.height - bottom - (y0 + t.h) : 0
      el.style.setProperty('--sx', `${sx.toFixed(1)}px`)
      el.style.setProperty('--sy', `${sy.toFixed(1)}px`)
      // the leader runs to where the words actually are
      if (t.lead && (Math.abs(sx - t.sx) > 0.5 || Math.abs(sy - t.sy) > 0.5)) {
        const lx = t.dx + sx
        const ly = t.dy + sy
        t.lead.style.width = `${Math.hypot(lx, ly).toFixed(1)}px`
        t.lead.style.transform = `rotate(${((Math.atan2(ly, lx) * 180) / Math.PI).toFixed(2)}deg)`
        t.sx = sx
        t.sy = sy
      }
    }
    if (rows) {
      const top = head ?? Math.min(TOP, size.height * 0.2)
      for (const up of [true, false]) {
        const row = lined.filter((l) => l.up === up).sort((a, b) => a.x - b.x)
        if (!row.length) continue
        // each over its point, pushed apart from the left, then back in from the right edge
        const cx = row.map((l) => l.x)
        for (let k = 1; k < cx.length; k++) cx[k] = Math.max(cx[k], cx[k - 1] + rows)
        const w = row[row.length - 1].t.w
        const over = cx[cx.length - 1] + w / 2 - (size.width - EDGE)
        if (over > 0) for (let k = cx.length - 1; k >= 0; k--) cx[k] = k === cx.length - 1 ? cx[k] - over : Math.min(cx[k], cx[k + 1] - rows)
        // the row over the model a short leader above its highest point (never over the head of the box); the one under
        // it at the foot of the box
        const high = Math.min(...row.map((l) => l.y))
        row.forEach((l, k) => {
          const h = l.t.h
          const cy = up ? Math.max(top + h / 2, high - 46) : size.height - bottom - h / 2
          const lx = cx[k] - l.x
          const ly = cy - l.y
          // (a balloon stands 2 px left of its left edge, centred on its top: see .fc-pin--balloon)
          l.t.tag.style.left = `${(lx - l.t.w / 2 + 2).toFixed(1)}px`
          l.t.tag.style.top = `${ly.toFixed(1)}px`
          if (l.t.lead) {
            l.t.lead.style.width = `${Math.hypot(lx, ly).toFixed(1)}px`
            l.t.lead.style.transform = `rotate(${((Math.atan2(ly, lx) * 180) / Math.PI).toFixed(2)}deg)`
          }
        })
      }
    }
    // after the scenes (-2) and the camera (-1); a positive priority would take over rendering
  }, 0)
  return null
}

export interface LabelSpec {
  id: string
  /** the model's anchor, when it is not `id` */
  anchor?: string
  /** the words; null for a numbered balloon named elsewhere (a legend) */
  text: ReactNode | null
  /** where the words sit relative to the point (px) */
  dx: number
  dy: number
  /** a number set before the words, for the numbered component list */
  num?: number
  /** hidden on narrow screens, where the copy panel needs the room */
  wide?: boolean
  /** a wait before it appears (ms), so the labels of a state can come in one after another */
  delay?: number
}

/** The DOM labels of a stage: a point on the model, a leader, and the words on clear ground. */
export function Labels({ bus, labels, shown, focus }: { bus: LabelBus; labels: LabelSpec[]; shown: string[]; focus?: string | null }) {
  bus.shown = new Set(shown)
  for (const l of labels) if (l.anchor) bus.alias.set(l.id, l.anchor)
  return (
    <div className="fc-labels" aria-hidden="true">
      {labels.map((l) => {
        const len = Math.hypot(l.dx, l.dy)
        const angle = (Math.atan2(l.dy, l.dx) * 180) / Math.PI
        return (
          <span
            key={l.id}
            ref={(el) => {
              if (el) bus.els.set(l.id, el)
              else bus.els.delete(l.id)
            }}
            className={`fc-pin ${l.text === null ? 'fc-pin--balloon' : ''} ${l.wide ? 'fc-pin--wide' : ''} ${focus && focus === l.id ? 'is-focus' : ''} ${focus && focus !== l.id ? 'is-dim' : ''}`}
            style={l.delay ? ({ '--d': `${l.delay}ms` } as CSSProperties) : undefined}
            data-on="0"
            data-label={l.id}
          >
            <span className="fc-pin__lead" style={{ width: len, transform: `rotate(${angle}deg)` }} />
            <span className={`fc-pin__tag ${l.dx < 0 ? 'fc-pin__tag--left' : ''}`} style={{ left: l.dx, top: l.dy } as CSSProperties}>
              {l.num !== undefined && <span className="fc-pin__num num">{l.num}</span>}
              {l.text !== null && <span className="fc-pin__words">{l.text}</span>}
            </span>
          </span>
        )
      })}
    </div>
  )
}
