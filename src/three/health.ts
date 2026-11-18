import type * as THREE from 'three'
import { setShared } from './stageStore'
import { builds } from '../lib/builds'
import { track } from '../lib/analytics'

/**
 * The stage's own check that its 3D can be seen, for a browser that offers WebGL 2 and then draws nothing with it.
 *
 * An older Safari on an older Mac (Nov 2026: a client's iMac) gave the page its context and every frame ran, yet the
 * screen stayed the bare ground: no mesh, and no still in its place either, since nothing had failed that the page could
 * see. A program the browser cannot compile, a context taken back and never returned, or a canvas that stays clear
 * where the opening's mesh stands all now count as a failure: the stage steps aside and the stills stand in, as they
 * do without WebGL.
 */
let done = false
export function failStage(reason: 'shader' | 'context' | 'blank', detail = '') {
  if (done) return
  done = true
  console.warn(`[RTARIUM] 3D stage unavailable (${reason}), showing still images instead.`, detail)
  track('stage_fallback', { reason, detail: detail.replace(/\s+/g, ' ').trim().slice(0, 100), page_path: window.location.pathname })
  // (nothing is left priming for the opening to wait on)
  builds.stage = 0
  setShared({ failed: true })
}

/** a program the browser would not compile or link, and a context lost and not given back within a few seconds */
export function watchRenderer(gl: THREE.WebGLRenderer) {
  gl.debug.onShaderError = (ctx, program, vs, fs) => {
    const log = [ctx.getProgramInfoLog(program), ctx.getShaderInfoLog(vs), ctx.getShaderInfoLog(fs)]
      .map((s) => (s ?? '').trim())
      .filter(Boolean)
      .join(' | ')
    console.error('[RTARIUM] WebGL program failed', log)
    failStage('shader', log)
  }
  const canvas = gl.domElement
  let timer = 0
  let losses = 0
  canvas.addEventListener('webglcontextlost', () => {
    window.clearTimeout(timer)
    if (++losses > 2) failStage('context', 'lost repeatedly')
    else timer = window.setTimeout(() => failStage('context', 'lost, not restored'), 3000)
  })
  canvas.addEventListener('webglcontextrestored', () => window.clearTimeout(timer))
}

/**
 * Whether anything was drawn in the rows of the canvas from `s0` to `s1` (canvas pixels, from the top), read straight
 * after the draw (the drawing buffer is still whole until the frame is shown). The canvas is transparent, so a pixel
 * with any coverage at all, mesh or its shadow, is enough. A few rows across the band, every fourth pixel.
 */
export function drewSomething(gl: THREE.WebGLRenderer, s0: number, s1: number) {
  const ctx = gl.getContext()
  const w = gl.domElement.width
  const ch = gl.domElement.height
  const row = new Uint8Array(w * 4)
  for (const f of [0.3, 0.45, 0.6, 0.75, 0.9]) {
    const y = Math.round(ch - s1 + (s1 - s0) * f)
    if (y < 0 || y >= ch) continue
    ctx.readPixels(0, y, w, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, row)
    for (let i = 3; i < row.length; i += 16) if (row[i] > 0) return true
  }
  return false
}
