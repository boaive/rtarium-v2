/**
 * `?gldebug` in the address: a panel over the page saying what the device's 3D is doing, for finding out on a real
 * phone or tablet why its pictures fell back to stills (the user's Redmi tablet, 18 Nov 2026): the graphics chip and its
 * limits, the tier, the screen, and every WebGL context made, lost or failed, with each error's message. Nothing runs
 * without the parameter.
 */
import { isLite } from '../lib/tier'

export function startGlDebug() {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('gldebug')) return
  const log: string[] = []
  const t0 = performance.now()
  const at = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`
  const add = (s: string) => {
    log.push(`${at()} ${s}`)
    if (log.length > 40) log.shift()
  }

  // every context asked for, and whether it was given
  const proto = HTMLCanvasElement.prototype
  const get = proto.getContext
  let made = 0
  let refused = 0
  proto.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (get as any).call(this, type, ...rest)
    if (/webgl/.test(type) && this.isConnected) {
      if (ctx) made++
      else {
        refused++
        add(`REFUSED ${type} ${this.width}x${this.height}`)
      }
    }
    return ctx
  } as typeof proto.getContext
  let lost = 0
  document.addEventListener('webglcontextlost', (e) => {
    lost++
    const c = e.target as HTMLCanvasElement
    add(`LOST ${c.width}x${c.height} in ${c.closest('section[id]')?.id ?? c.closest('.stage') ? 'stage' : '?'}`)
  }, true)
  document.addEventListener('webglcontextcreationerror', (e) => add(`CREATION ERROR ${(e as WebGLContextEvent).statusMessage}`), true)
  window.addEventListener('error', (e) => add(`ERROR ${e.message}`))
  window.addEventListener('unhandledrejection', (e) => add(`REJECTED ${String((e as PromiseRejectionEvent).reason).slice(0, 160)}`))
  const warn = console.warn
  const error = console.error
  console.warn = (...a: unknown[]) => {
    add(`warn ${a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ').slice(0, 200)}`)
    warn.apply(console, a)
  }
  console.error = (...a: unknown[]) => {
    add(`error ${a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ').slice(0, 200)}`)
    error.apply(console, a)
  }

  // the chip and its limits, read once
  let chip = '?'
  let limits = ''
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (!gl) chip = 'NO WEBGL2'
    else {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      chip = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
      limits = `tex ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} rb ${gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)} samples ${gl.getParameter(gl.MAX_SAMPLES)} vtxU ${gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)} frgU ${gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)} varyings ${gl.getParameter(gl.MAX_VARYING_VECTORS)}`
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch (e) {
    chip = `ERROR ${String(e)}`
  }

  const panel = document.createElement('pre')
  panel.style.cssText =
    'position:fixed;left:4px;right:4px;bottom:4px;z-index:2147483647;max-height:46vh;overflow:auto;margin:0;padding:8px;font:10px/1.35 monospace;color:#fdd001;background:rgba(0,0,0,.86);white-space:pre-wrap;pointer-events:auto'
  const draw = () => {
    const live = document.querySelectorAll('canvas').length
    const nav = navigator as Navigator & { deviceMemory?: number }
    panel.textContent = [
      `chip: ${chip}`,
      limits,
      `lite: ${isLite()}  tablet: ${document.documentElement.classList.contains('is-tablet')}  dpr: ${window.devicePixelRatio.toFixed(2)}  view: ${innerWidth}x${innerHeight}  screen: ${screen.width}x${screen.height}  touch: ${navigator.maxTouchPoints}  mem: ${nav.deviceMemory ?? '?'}`,
      `contexts made: ${made}  refused: ${refused}  lost: ${lost}  canvases now: ${live}  stills shown: ${document.querySelectorAll('[data-failed], .hero__still').length}`,
      ...log,
    ].join('\n')
  }
  const show = () => {
    if (!panel.isConnected) document.body.appendChild(panel)
    draw()
  }
  window.setInterval(show, 1000)
  add(`page ${window.location.pathname}`)
}
