import { Component, Suspense, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { StageScene } from './StageScene'
import { setShared, stage, useStageValue, type Blend, type PoseId, type Region } from './stageStore'
import { useIsCompact, useReducedMotion } from '../lib/motion'

let webgl: boolean | null = null
export function hasWebGL2() {
  if (webgl !== null) return webgl
  try {
    webgl = Boolean(document.createElement('canvas').getContext('webgl2'))
  } catch {
    webgl = false
  }
  return webgl
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[RTARIUM] 3D stage unavailable, showing still images instead.', error)
    setShared({ failed: true })
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** asks the ground to read the screens again (a track moved its slides without a scroll) */
let groundRead: (() => void) | null = null
export const refreshGround = () => groundRead?.()

/**
 * The coloured ground every full-screen step stands on, under the 3D. It never fades: the next
 * screen's colour comes in along that screen's own edge as it arrives, from below for a screen
 * scrolling up, from the right for a slide of a chapter that runs sideways, and goes back the same
 * way (`[data-screen]` marks each screen). The current screen is the last one, in page order, that
 * holds the top-left corner of the viewport; the incoming one is the next one already on screen.
 * The opening tour's white light (`--wash`, set by the tour, 0 everywhere else) lies over both.
 */
export function Ground() {
  const ground = useStageValue('ground')
  const base = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.documentElement.dataset.ground = ground
  }, [ground])
  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const vw = window.innerWidth
      const vh = window.innerHeight
      const screens = Array.from(document.querySelectorAll<HTMLElement>('[data-screen]'))
      const rects = screens.map((el) => el.getBoundingClientRect())
      let ci = -1
      rects.forEach((r, i) => {
        if (r.width > 1 && r.top <= 0.5 && r.bottom > 0.5 && r.left <= 0.5 && r.right > 0.5) ci = i
      })
      if (ci < 0) ci = 0
      let ni = -1
      for (let i = ci + 1; i < rects.length; i++) {
        const r = rects[i]
        if (r.width > 1 && r.bottom > 0.5 && r.top < vh - 0.5 && r.right > 0.5 && r.left < vw - 0.5) {
          ni = i
          break
        }
      }
      const current = screens[ci]
      if (base.current && current) base.current.dataset.g = current.dataset.screen
      if (next.current) {
        const r = ni >= 0 ? rects[ni] : null
        next.current.dataset.g = r ? (screens[ni].dataset.screen ?? '') : ''
        next.current.style.clipPath = r
          ? `inset(${Math.max(0, r.top).toFixed(1)}px ${Math.max(0, vw - r.right).toFixed(1)}px ${Math.max(0, vh - r.bottom).toFixed(1)}px ${Math.max(0, r.left).toFixed(1)}px)`
          : 'inset(100% 0 0 0)'
      }
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    groundRead = read
    read()
    // the screens mount after this: read again once they are in
    const late = window.setTimeout(read, 60)
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      groundRead = null
      window.clearTimeout(late)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div className="ground" aria-hidden="true">
      <div ref={base} className="ground__layer" data-g="yellow" />
      <div className="ground__wash" />
      <div ref={next} className="ground__layer ground__layer--next" />
    </div>
  )
}

/**
 * The fixed, transparent canvas between the ground and the copy. One WebGL context for the whole
 * page: steps borrow it through `useStageRegion`.
 *
 * It renders at the screen's own pixel density (up to 1.75, 1.5 on phones). Only when a device
 * cannot keep up (under two thirds of its refresh rate for most of 2.5 s, watched once the opening
 * has been woven and its programs compiled, so loading never counts) does the density step down,
 * to no less than 1; it steps back up once there is room again, and after six steps it stays where
 * it is.
 */
export function Stage() {
  const compact = useIsCompact()
  const reduced = useReducedMotion()
  const ready = useStageValue('ready')
  const failed = useStageValue('failed')
  const supported = hasWebGL2()
  const [quality, setQuality] = useState(1)
  const [watch, setWatch] = useState(false)
  useEffect(() => {
    if (!ready) return
    const id = window.setTimeout(() => setWatch(true), 4000)
    return () => window.clearTimeout(id)
  }, [ready])
  const top = Math.max(1, Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 1.75))
  const dpr = Math.round((1 + (top - 1) * quality) * 100) / 100

  useEffect(() => {
    if (!supported) setShared({ failed: true })
  }, [supported])

  if (!supported || failed) return null
  return (
    <div className={`stage ${ready ? 'is-ready' : ''}`} aria-hidden="true">
      <SceneBoundary>
        <Canvas
          dpr={dpr}
          shadows={!compact}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false }}
          camera={{ fov: 30, near: 0.002, far: 8, position: [0.2, 0.3, 0.4] }}
        >
          {watch && <PerformanceMonitor factor={1} step={0.25} flipflops={6} bounds={(hz) => [hz * 0.66, hz * 0.92]} onChange={({ factor }) => setQuality(factor)} />}
          <Suspense fallback={null}>
            <StageScene compact={compact} reduced={reduced} />
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  )
}

/**
 * Lends the stage to an element: while it holds the middle of the screen the stage shows `pose()`,
 * or, for a chapter scrubbed sideways, the mesh between two of its steps (`blend()`).
 */
export function useStageRegion(ref: RefObject<HTMLElement | null>, pose: () => PoseId, blend?: () => Blend) {
  const getter = useRef(pose)
  getter.current = pose
  const blender = useRef(blend)
  blender.current = blend
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const region: Region = { el, pose: () => getter.current(), blend: blender.current ? () => blender.current!() : undefined }
    stage.regions.add(region)
    return () => {
      stage.regions.delete(region)
    }
  }, [ref])
}

/**
 * A label pinned to a point of the 3D model; the stage positions it and shows it in the poses that
 * name it. `callout`: a leader line out to a label on clear ground, at a fixed offset. `column`: a
 * leader level with the point, out to a label standing in a column at that fraction of the width
 * (labels of one view line up, like the notes on a drawing), or `columnAt` an element of the page:
 * the words start on its left edge, so they share its line; `note` sets them as numbered notes on
 * the ground rather than chips). `span`: a dimension line from this
 * point to another anchor, with its value beside it.
 */
export function StageLabel({ anchor, children, side = 'right', callout, column, columnAt, span, note = false, wideOnly = false }: { anchor: string; children: ReactNode; side?: 'right' | 'left'; callout?: [number, number]; column?: number; columnAt?: string; span?: string; note?: boolean; wideOnly?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    stage.labels.set(anchor, el)
    return () => {
      stage.labels.delete(anchor)
    }
  }, [anchor])
  if (span) {
    return (
      <span ref={ref} className={`pin pin--span ${wideOnly ? 'pin--wide-only' : ''}`} style={{ opacity: 0 }} data-span={span} aria-hidden="true">
        <span className="pin__dim" />
        <span className="pin__dim-text">{children}</span>
      </span>
    )
  }
  if (callout || column !== undefined || columnAt) {
    // a callout: a leader line from the point on the mesh out to the label, which sits on the ground
    const [dx, dy] = callout ?? [column !== undefined && column < 0.5 ? -200 : 200, 0]
    const length = Math.hypot(dx, dy)
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    return (
      <span
        ref={ref}
        className={`pin pin--callout ${column !== undefined || columnAt ? 'pin--column' : ''} ${note ? 'pin--note' : ''} ${wideOnly ? 'pin--wide-only' : ''}`}
        style={{ opacity: 0 }}
        data-dx={dx}
        data-dy={dy}
        data-col={column ?? (columnAt ? 'at' : undefined)}
        data-col-at={columnAt}
        aria-hidden="true"
      >
        <span className="pin__arm">
          <span className="pin__lead" style={{ width: length, transform: `rotate(${angle}deg)` }} />
          <span className={`pin__tag ${dx < 0 ? 'pin__tag--left' : ''}`} style={{ left: dx, top: dy }}>
            <span className="pin__words">{children}</span>
          </span>
        </span>
      </span>
    )
  }
  return (
    <span ref={ref} className={`pin pin--${side}`} style={{ opacity: 0 }} aria-hidden="true">
      <span className="pin__text">{children}</span>
    </span>
  )
}

/** The cursor position for the press, over the whole window. */
export function usePointerTracking() {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      stage.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      stage.pointer.y = (e.clientY / window.innerHeight) * 2 - 1
      stage.pointer.at = performance.now()
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [])
}

/** Drag-to-turn on an element. Touch: horizontal drags turn the mesh, vertical ones scroll the page. */
export function useOrbitDrag(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const pr = { id: -1, x: 0, y: 0 }
    const interactive = (t: EventTarget | null) => Boolean((t as HTMLElement | null)?.closest?.('a, button, input, select'))
    const down = (e: PointerEvent) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || interactive(e.target)) return
      pr.id = e.pointerId
      pr.x = e.clientX
      pr.y = e.clientY
      stage.orbit.dragging = true
      el.classList.add('is-dragging')
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pr.id) return
      const dx = e.clientX - pr.x
      const dy = e.clientY - pr.y
      pr.x = e.clientX
      pr.y = e.clientY
      stage.orbit.yaw -= dx * 0.006
      if (e.pointerType !== 'touch') stage.orbit.pitch = Math.min(0.7, Math.max(-0.4, stage.orbit.pitch + (dy / window.innerHeight) * 1.8))
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pr.id) return
      pr.id = -1
      stage.orbit.dragging = false
      el.classList.remove('is-dragging')
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [ref])
}
