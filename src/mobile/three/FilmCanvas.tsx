import { Component, Suspense, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { FilmScene } from './FilmScene'
import type { FilmState, Thickness } from './film'

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

class Boundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[RTARIUM] mobile 3D unavailable, showing a still instead.', error)
    this.props.onFail()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * The film's canvas. It draws only while the film is on screen (`live`), at up to 1.5× the
 * screen's density, and steps down to 1× if the phone cannot keep up. Touches pass through it to
 * the stage (which turns the mesh and lets the page scroll).
 */
export function FilmCanvas({ film, thickness, reduced, live, onReady, onFail }: { film: FilmState; thickness: Thickness; reduced: boolean; live: boolean; onReady: () => void; onFail: () => void }) {
  const top = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.5))
  const [quality, setQuality] = useState(1)
  const dpr = Math.round((1 + (top - 1) * quality) * 100) / 100
  return (
    <Boundary onFail={onFail}>
      <Canvas
        className="m-film__canvas"
        dpr={dpr}
        frameloop={live ? 'always' : 'never'}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 30, near: 0.004, far: 8, position: [0.2, 0.3, 0.4] }}
        style={{ pointerEvents: 'none' }}
      >
        <PerformanceMonitor factor={1} step={0.5} flipflops={3} bounds={(hz) => [hz * 0.6, hz * 0.9]} onChange={({ factor }) => setQuality(factor)} />
        <Suspense fallback={null}>
          <FilmScene film={film} thickness={thickness} reduced={reduced} onReady={onReady} />
        </Suspense>
      </Canvas>
    </Boundary>
  )
}
