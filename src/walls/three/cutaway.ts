import * as THREE from 'three'

/**
 * A plate between two corners (x, y), `t` thick from z = 0, with round holes ([x, y, r]) and square cuts ([x, y, side])
 * through it; a tile of texture to the metre, as the slabs. Its faces are not yet grouped (merge it, or group it with
 * `faceEdge`).
 */
export function plate(x0: number, y0: number, x1: number, y1: number, t: number, round: [number, number, number][] = [], square: [number, number, number][] = []) {
  const s = new THREE.Shape()
  s.moveTo(x0, y0)
  s.lineTo(x1, y0)
  s.lineTo(x1, y1)
  s.lineTo(x0, y1)
  s.closePath()
  for (const [x, y, r] of round) {
    const h = new THREE.Path()
    h.absarc(x, y, r, 0, Math.PI * 2, true)
    s.holes.push(h)
  }
  for (const [x, y, a] of square) {
    const h = new THREE.Path()
    h.moveTo(x - a / 2, y - a / 2)
    h.lineTo(x - a / 2, y + a / 2)
    h.lineTo(x + a / 2, y + a / 2)
    h.lineTo(x + a / 2, y - a / 2)
    h.closePath()
    s.holes.push(h)
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 18 })
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const [u, v] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}
