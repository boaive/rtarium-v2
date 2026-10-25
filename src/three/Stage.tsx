import { Component, Suspense, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { StageScene } from './StageScene'
import { setShared, stage, useStageValue, type PoseId, type Region } from './stageStore'
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

/**
 * The coloured ground every full-screen step stands on, under the 3D. It never fades: the next
 * screen's colour rises along that screen's own top edge as it scrolls in, and falls back the
 * same way, so the ground and the copy move as one panel (`[data-screen]` marks each screen).
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
      const vh = window.innerHeight
      const screens = document.querySelectorAll<HTMLElement>('[data-screen]')
      let current: HTMLElement | null = null
      let incoming: HTMLElement | null = null
      let edge = vh
      for (const el of screens) {
        const top = el.getBoundingClientRect().top
        if (top <= 0.5) current = el
        else {
          incoming = el
          edge = top
          break
        }
      }
      current ??= screens[0] ?? null
      if (base.current && current) base.current.dataset.g = current.dataset.screen
      if (next.current) {
        const show = incoming && edge < vh
        next.current.dataset.g = incoming?.dataset.screen ?? ''
        next.current.style.clipPath = show ? `inset(${edge.toFixed(1)}px 0 0 0)` : 'inset(100% 0 0 0)'
      }
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    // the screens mount after this: read again once they are in
    const late = window.setTimeout(read, 60)
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.clearTimeout(late)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div className="ground" aria-hidden="true">
      <div ref={base} className="ground__layer" data-g="yellow" />
      <div ref={next} className="ground__layer ground__layer--next" />
    </div>
  )
}

/**
 * The fixed, transparent canvas between the ground and the copy. One WebGL context for the whole
 * page: steps borrow it through `useStageRegion`.
 */
export function Stage() {
  const compact = useIsCompact()
  const reduced = useReducedMotion()
  const ready = useStageValue('ready')
  const failed = useStageValue('failed')
  const supported = hasWebGL2()

  useEffect(() => {
    if (!supported) setShared({ failed: true })
  }, [supported])

  if (!supported || failed) return null
  return (
    <div className={`stage ${ready ? 'is-ready' : ''}`} aria-hidden="true">
      <SceneBoundary>
        <Canvas
          dpr={[1, compact ? 1.5 : 1.75]}
          shadows={!compact}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false }}
          camera={{ fov: 30, near: 0.002, far: 8, position: [0.2, 0.3, 0.4] }}
        >
          <Suspense fallback={null}>
            <StageScene compact={compact} reduced={reduced} />
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  )
}

/** Lends the stage to an element: while it holds the middle of the screen the stage shows `pose()`. */
export function useStageRegion(ref: RefObject<HTMLElement | null>, pose: () => PoseId) {
  const getter = useRef(pose)
  getter.current = pose
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const region: Region = { el, pose: () => getter.current() }
    stage.regions.add(region)
    return () => {
      stage.regions.delete(region)
    }
  }, [ref])
}

/** A label pinned to a point of the 3D model; the stage positions it and shows it in the poses that name it. */
export function StageLabel({ anchor, children, side = 'right', callout, wideOnly = false }: { anchor: string; children: ReactNode; side?: 'right' | 'left'; callout?: [number, number]; wideOnly?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    stage.labels.set(anchor, el)
    return () => {
      stage.labels.delete(anchor)
    }
  }, [anchor])
  if (callout) {
    // a callout: a leader line from the point on the mesh out to the label, which sits on the ground
    const [dx, dy] = callout
    const length = Math.hypot(dx, dy)
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    return (
      <span ref={ref} className={`pin pin--callout ${wideOnly ? 'pin--wide-only' : ''}`} style={{ opacity: 0 }} data-dx={dx} data-dy={dy} aria-hidden="true">
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
