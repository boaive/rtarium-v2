import * as THREE from 'three'

/**
 * How the sheet answers a load: it is stiff, and it springs back.
 *
 * RTARIUM does not drape or ripple like cloth. Under a heavy load (a truck tyre, in the opening
 * scene the cursor) the upper face is pressed down towards the lower one, the connecting fibres
 * give, and the sheet keeps that shape for as long as the load stays. Once the load has gone it
 * holds a moment, then returns to its full depth in one firm movement, a stiff spring with a
 * small overshoot, and is exactly as it was.
 *
 * The field is a grid of press depths over the sheet (metres, negative = pressed), written to a
 * half-float texture that the yarn shader samples. Points do not pull on their neighbours, so
 * nothing travels across the sheet: only the loaded spot moves. A tyre rolling over the sheet is
 * not in here; the shader works that out on its own (see rtTyre in yarnMaterial.ts).
 *
 * It is a visual model of "stiff, and it reforms", not a mechanical simulation of the product.
 */
export class PressField {
  readonly texture: THREE.DataTexture
  private h: Float32Array
  private v: Float32Array
  /** the deepest load applied this frame at each point (metres, negative), 0 = none */
  private load: Float32Array
  /** seconds a released point waits before it springs back */
  private hold: Float32Array
  private data: Uint16Array<ArrayBuffer>
  private acc = 0
  private loaded = false
  private moving = false
  /** natural frequency of the spring back (rad/s) and its damping ratio: firm, with a small overshoot */
  omega = 9
  zeta = 0.5
  /** how long a pressed spot stays down after the load has moved on (s) */
  holdTime = 0.14

  constructor(
    readonly cols = 64,
    readonly rows = 40,
  ) {
    const n = cols * rows
    this.h = new Float32Array(n)
    this.v = new Float32Array(n)
    this.load = new Float32Array(n)
    this.hold = new Float32Array(n)
    this.data = new Uint16Array(n)
    this.texture = new THREE.DataTexture(this.data, cols, rows, THREE.RedFormat, THREE.HalfFloatType)
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping
    this.texture.needsUpdate = true
  }

  /** Press the sheet at (u, v) in 0..1 sheet coordinates, `depth` metres at the centre, falling off over `radius` grid cells. */
  press(u: number, v: number, depth: number, radius = 3.2) {
    const cx = u * (this.cols - 1)
    const cy = v * (this.rows - 1)
    const r = Math.ceil(radius * 2.2)
    for (let j = Math.max(0, Math.floor(cy - r)); j <= Math.min(this.rows - 1, Math.ceil(cy + r)); j++) {
      for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(this.cols - 1, Math.ceil(cx + r)); i++) {
        const d2 = ((i - cx) ** 2 + (j - cy) ** 2) / (radius * radius)
        const k = j * this.cols + i
        const t = -depth * Math.exp(-d2 * d2) // flat-bottomed: a firm footprint rather than a point
        if (t < this.load[k]) this.load[k] = t
      }
    }
    this.loaded = true
  }

  /** Advance by dt seconds. Returns false once everything is back at rest (nothing to upload). */
  step(dt: number) {
    if (!this.loaded && !this.moving) return false
    const { h, v, load, hold, omega, zeta, holdTime } = this
    const fixed = 1 / 120
    const k = omega * omega
    const c = 2 * zeta * omega
    // a pressed spot follows the load quickly, but not in a single frame
    const follow = 1 - Math.exp(-28 * fixed)
    this.acc = Math.min(this.acc + dt, 0.05)
    let moving = false
    while (this.acc >= fixed) {
      this.acc -= fixed
      for (let i = 0; i < h.length; i++) {
        const l = load[i]
        if (l < 0 && h[i] > l - 1e-6) {
          h[i] += (l - h[i]) * follow
          v[i] = 0
          hold[i] = holdTime
        } else if (hold[i] > 0) {
          hold[i] -= fixed
          v[i] = 0
        } else {
          v[i] += (-k * h[i] - c * v[i]) * fixed
          h[i] += v[i] * fixed
        }
        if (h[i] > 2e-6 || h[i] < -2e-6 || v[i] > 1e-5 || v[i] < -1e-5) moving = true
        else h[i] = v[i] = 0
      }
    }
    load.fill(0)
    this.loaded = false
    const wasMoving = this.moving
    this.moving = moving
    return moving || wasMoving
  }

  upload() {
    const { h, data } = this
    for (let k = 0; k < h.length; k++) data[k] = THREE.DataUtils.toHalfFloat(h[k])
    this.texture.needsUpdate = true
  }

  dispose() {
    this.texture.dispose()
  }
}
