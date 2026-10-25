import { useSyncExternalStore } from 'react'
import type { Thickness } from '../content/technical'

/**
 * Shared state between the page (DOM) and the one WebGL stage behind it.
 *
 * The homepage has a single fixed, transparent canvas between the coloured ground and the copy.
 * Each full-screen step names the pose it wants; the stage frames whichever region holds the
 * middle of the screen and glides to its pose in time. Mutable values read every frame live in
 * `stage`; the few that React renders from live in a small store.
 */

export type PoseId =
  | 'hero'
  | 'structure'
  | 'material'
  | 'depth'
  | 'shear'
  | 'mineral'
  | 'stack'
  | 'spec'
  | 'roving'
  | 'xray'
  | 'none'

export interface Region {
  el: HTMLElement
  pose: () => PoseId
}

/** a Tech Space figure under the cursor: the mesh shows what that figure means */
export type Inspect = 'thickness' | 'width' | 'length' | 'tensile' | 'modulus' | 'elongation'

export const stage = {
  regions: new Set<Region>(),
  /** 0 = RTARIUM, 1 = a flat (single-face) mesh, for the shear-plane comparison */
  flat: 0,
  /** drag rotation, written by the pointer handlers */
  orbit: { yaw: 0, pitch: 0, dragging: false },
  /** cursor, -1..1 over the window, and when it last moved (ms) */
  pointer: { x: 0, y: 0, at: -1e9 },
  /** DOM labels pinned to points of the model, keyed by anchor id */
  labels: new Map<string, HTMLElement>(),
  /** how far the opening tour has gone: 0 at the top, 1 mesh built, 2 inside the cavity (damped) */
  tour: 0,
  /** the Tech Space figure under the cursor or focused, if any */
  inspect: null as Inspect | null,
  /** a tileable top-down picture of the mesh, rendered once by the stage, for the footer's drop */
  swatch: null as HTMLCanvasElement | null,
}

/* ---- the few values React renders from ------------------------------------------------------ */

export type Ground = 'yellow' | 'black' | 'light'

interface Shared {
  thickness: Thickness
  ready: boolean
  /** WebGL unavailable or the scene failed: the page shows still images instead */
  failed: boolean
  /** the chapter and step holding the middle of the screen */
  chapter: string
  step: number
  ground: Ground
}

let shared: Shared = { thickness: 10, ready: false, failed: false, chapter: 'hero', step: 0, ground: 'yellow' }
const listeners = new Set<() => void>()

export function setShared(patch: Partial<Shared>) {
  let changed = false
  for (const k in patch) {
    const key = k as keyof Shared
    if (shared[key] !== patch[key]) changed = true
  }
  if (!changed) return
  shared = { ...shared, ...patch }
  listeners.forEach((l) => l())
}

export function getShared() {
  return shared
}

export function useStageValue<K extends keyof Shared>(key: K): Shared[K] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => shared[key],
  )
}
