/**
 * A budget phone or tablet (`lite`), told once a visit before anything is drawn, after veedo.space's tier (film/tier.ts):
 * by its graphics chip's name where the browser gives it, else by the memory it reports. A lite device's 3D is drawn at
 * one pixel to the CSS pixel; everything else about it is the same picture. Desktop is never lite. `?lite=1` forces it,
 * `?lite=0` rules it out (for checking).
 */

/** what the chip's name says: 'high' (an iPhone's or a recent phone's), 'low' (a known budget part), or null (not known) */
export function gpuClass(name: string): 'high' | 'low' | null {
  const n = name.toLowerCase()
  if (/apple|nvidia|geforce|radeon|amd|intel|xclipse|immortalis/.test(n)) return 'high'
  const adreno = /adreno[^0-9]*(\d{3})/.exec(n)
  if (adreno) return +adreno[1] >= 640 ? 'high' : 'low'
  const mali = /mali-?([gt])(\d+)/.exec(n)
  if (mali) {
    if (mali[1] === 't') return 'low'
    const v = +mali[2]
    if ((v >= 71 && v <= 78) || v >= 610) return 'high'
    return v === 68 ? null : 'low'
  }
  if (/powervr|sgx|ge8\d{3}|videocore|vivante/.test(n)) return 'low'
  return null
}

function gpuName() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch {
    return ''
  }
}

let lite: boolean | null = null

export function isLite(): boolean {
  if (lite !== null) return lite
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search).get('lite')
  if (q === '1' || q === '0') return (lite = q === '1')
  if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return (lite = false)
  try {
    const kept = sessionStorage.getItem('rtarium:lite')
    if (kept === '1' || kept === '0') return (lite = kept === '1')
  } catch {
    /* (no storage: decided again on each load) */
  }
  const named = gpuClass(gpuName())
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  lite = named ? named === 'low' : memory !== undefined && memory <= 2
  try {
    sessionStorage.setItem('rtarium:lite', lite ? '1' : '0')
  } catch {
    /* (as above) */
  }
  return lite
}
