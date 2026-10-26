import { useEffect, useRef, type RefObject } from 'react'
import { hasWebGL2 } from '../three/Stage'
import { damp, prefersReducedMotion, smoothstep } from '../lib/motion'

/**
 * The footer's liquid. Where it flows the yellow turns black: a small drop of black liquid on the
 * cursor, there whenever the cursor is over the footer, moving or at rest, held to it by a stiff
 * spring (it overshoots a little and settles). Moving, it swells a little, leans into its way and
 * stretches along it; at rest it keeps living, its lobe wandering slowly round it. It is never
 * round: one side swells into that lobe, its edge carries slow uneven ripples that ring harder with
 * every change of pace, and three droplets run behind and merge back. Inside the drop the footer
 * reads yellow (`reveal`: a second copy of the footer, clipped to the drop's outline, so the colours
 * are exact, not blended). When the cursor leaves the footer the drop drains away.
 *
 * It draws only where it is (scissored to it), and only while it is there: once it has drained,
 * nothing runs.
 */

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uHead;
uniform float uAngle;
uniform vec2 uStretch;
uniform float uSize;
uniform float uLean;
uniform vec3 uAmp;
uniform vec3 uPhase;
uniform vec3 uLobe;
uniform vec3 uDrops[3];
uniform float uDpr;
out vec4 outColor;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float field(vec2 p) {
  vec2 r = p - uHead;
  float c = cos(uAngle);
  float s = sin(uAngle);
  vec2 q = vec2(c * r.x + s * r.y, -s * r.x + c * r.y) / uStretch;
  float a = atan(q.y, q.x);
  float wob = uLean * cos(a) + uAmp.x * cos(2.0 * a + uPhase.x) + uAmp.y * cos(3.0 * a + uPhase.y) + uAmp.z * cos(5.0 * a + uPhase.z);
  float d = (length(q) - uSize * (1.0 + wob)) * min(uStretch.x, uStretch.y);
  if (uLobe.z > 0.5) d = smin(d, length(p - uLobe.xy) - uLobe.z, uSize * 0.5);
  for (int i = 0; i < 3; i++) {
    vec3 dr = uDrops[i];
    if (dr.z > 0.5) d = smin(d, length(p - dr.xy) - dr.z, uSize * 0.6);
  }
  return d;
}

void main() {
  if (uSize < 0.5) {
    outColor = vec4(0.0);
    return;
  }
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float d = field(p);
  vec2 n = normalize(vec2(dFdx(d), -dFdy(d)) + 1e-5);
  float aa = uDpr;
  float inside = 1.0 - smoothstep(-aa, aa, d);
  if (inside <= 0.0) {
    outColor = vec4(0.0);
    return;
  }
  // black liquid, with a wet light caught along the edge facing the upper left
  float rim = 1.0 - smoothstep(0.0, 5.0 * uDpr, -d);
  float lit = pow(max(dot(n, normalize(vec2(-0.55, -0.83))), 0.0), 3.0);
  vec3 col = vec3(0.031) + vec3(0.32, 0.27, 0.12) * lit * rim;
  outColor = vec4(col * inside, inside);
}
`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader')
  return sh
}

/** the drop's radius at full size (CSS px): small, it sits on the cursor */
const POOL = 46
/** the spring that holds it to the cursor: stiffness, damping (a little under critical: it overshoots) */
const HOLD = { k: 420, c: 30 }
/** the droplets behind it: their springs and sizes (fractions of the drop) */
const TRAIL = [
  { k: 300, c: 26, r: 0.5 },
  { k: 240, c: 23, r: 0.34 },
  { k: 190, c: 20, r: 0.2 },
]
/** how far a droplet may fall behind the one before it (fractions of the pool): the tail never breaks */
const LINK = 0.7
/** the edge's ripple modes (2, 3 and 5 lobes): angular frequency (rad/s), damping ratio, and the unevenness it always keeps */
const MODES = [
  { w: 9, z: 0.14, base: 0.085 },
  { w: 12, z: 0.16, base: 0.06 },
  { w: 16, z: 0.18, base: 0.03 },
]
/** the lobe on one side: how far out it sits and how big it is (fractions of the pool) */
const LOBE = { out: 0.6, r: 0.46 }
/** its size at rest (fraction of full); how fast the cursor must go to swell it (px/s), and how fast for full size */
const REST_SIZE = 0.78
const PACE = { from: 40, full: 520 }
/** how long after its last move the cursor counts as resting (ms) */
const REST_MS = 90
/** points on the outline the yellow copy is clipped to */
const OUTLINE = 72

export function Liquid({ reveal }: { reveal: RefObject<HTMLElement | null> }) {
  const pool = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = pool.current
    const host = cv?.parentElement
    if (!cv || !host || !hasWebGL2()) return
    const gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true })
    if (!gl) return
    let prog: WebGLProgram
    try {
      prog = gl.createProgram()!
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
    } catch (e) {
      console.warn('[RTARIUM] footer liquid unavailable', e)
      return
    }
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    gl.useProgram(prog)
    const U = Object.fromEntries(
      ['uRes', 'uHead', 'uAngle', 'uStretch', 'uSize', 'uLean', 'uAmp', 'uPhase', 'uLobe', 'uDrops', 'uDpr'].map((n) => [n, gl.getUniformLocation(prog, n)]),
    )

    const reduced = prefersReducedMotion()
    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const r = host.getBoundingClientRect()
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      gl.viewport(0, 0, cv.width, cv.height)
    }
    resize()

    const head = { x: 0, y: 0, vx: 0, vy: 0 }
    const target = { x: 0, y: 0 }
    const drops = TRAIL.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 }))
    const lobe = { x: 0, y: 0, r: 0 }
    const amp = MODES.map((m) => m.base)
    const ampV = [0, 0, 0]
    let angle = 0
    let lean = 0
    let sx = 1
    let sy = 1
    let size = 0
    let sizeV = 0
    /** the cursor's own pace (px/s), and when it last moved */
    let pace = 0
    let lastPace = 0
    let movedAt = -1e9
    let present = false
    /** the size it is heading for */
    let goal = 0
    let visible = false
    let raf = 0
    let last = performance.now()
    const t0 = last
    const dropData = new Float32Array(9)

    /** the pool's outline, the same field as the shader's (head, lobe and droplets), for the yellow copy */
    const field = (x: number, y: number, s: number, t: number) => {
      const rx = x - head.x
      const ry = y - head.y
      const c = Math.cos(angle)
      const sn = Math.sin(angle)
      const qx = (c * rx + sn * ry) / sx
      const qy = (-sn * rx + c * ry) / sy
      const a = Math.atan2(qy, qx)
      const wob = lean * Math.cos(a) + amp[0] * Math.cos(2 * a + angle * 2 + t * 0.4) + amp[1] * Math.cos(3 * a + angle * 3 - t * 0.3) + amp[2] * Math.cos(5 * a + angle * 5 + t * 0.2)
      let d = (Math.hypot(qx, qy) - s * (1 + wob)) * Math.min(sx, sy)
      const blend = (b: number, k: number) => {
        const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - d)) / k))
        d = b + (d - b) * h - k * h * (1 - h)
      }
      if (lobe.r > 0.5) blend(Math.hypot(x - lobe.x, y - lobe.y) - lobe.r, s * 0.5)
      TRAIL.forEach((tr, i) => {
        const r = reduced ? 0 : POOL * size * tr.r
        if (r >= 0.5) blend(Math.hypot(x - drops[i].x, y - drops[i].y) - r, s * 0.6)
      })
      return d
    }
    const clip = (s: number, t: number) => {
      const el = reveal.current
      if (!el) return
      if (s < 4) {
        if (el.style.visibility !== 'hidden') {
          el.style.clipPath = 'inset(50%)'
          el.style.visibility = 'hidden'
        }
        return
      }
      el.style.visibility = 'visible'
      // along each ray from the middle, the farthest point still inside, a pixel or two in from the edge
      const far = s * 3.2
      const pts: string[] = []
      for (let i = 0; i < OUTLINE; i++) {
        const a = (i / OUTLINE) * Math.PI * 2
        const ux = Math.cos(a)
        const uy = Math.sin(a)
        let r = far
        while (r > 0 && field(head.x + ux * r, head.y + uy * r, s, t) > -2) r -= 3
        let lo = Math.max(0, r)
        let hi = r + 3
        for (let k = 0; k < 4; k++) {
          const m = (lo + hi) / 2
          if (field(head.x + ux * m, head.y + uy * m, s, t) > -2) hi = m
          else lo = m
        }
        pts.push(`${(head.x + ux * lo).toFixed(1)}px ${(head.y + uy * lo).toFixed(1)}px`)
      }
      el.style.clipPath = `polygon(${pts.join(',')})`
    }

    const step = (dt: number, now: number) => {
      const vx0 = head.vx
      const vy0 = head.vy
      if (reduced) {
        head.x = damp(head.x, target.x, 12, dt)
        head.y = damp(head.y, target.y, 12, dt)
        head.vx = head.vy = 0
      } else {
        head.vx += (HOLD.k * (target.x - head.x) - HOLD.c * head.vx) * dt
        head.vy += (HOLD.k * (target.y - head.y) - HOLD.c * head.vy) * dt
        head.x += head.vx * dt
        head.y += head.vy * dt
      }
      const speed = Math.hypot(head.vx, head.vy)
      // a change of pace sets the edge ringing round its own unevenness
      const jolt = Math.hypot(head.vx - vx0, head.vy - vy0) / Math.max(dt, 1e-3)
      MODES.forEach((m, i) => {
        if (reduced) return
        ampV[i] += (-m.w * m.w * (amp[i] - m.base) - 2 * m.z * m.w * ampV[i]) * dt + jolt * 0.0000065 * (i === 1 ? -1 : 1) * dt * 60
        amp[i] = Math.max(-0.22, Math.min(0.26, amp[i] + ampV[i] * dt))
      })
      // the droplets chase it on short links
      TRAIL.forEach((tr, i) => {
        const lead = i === 0 ? head : drops[i - 1]
        const dr = drops[i]
        if (reduced) {
          Object.assign(dr, { x: head.x, y: head.y })
          return
        }
        dr.vx += (tr.k * (lead.x - dr.x) - tr.c * dr.vx) * dt
        dr.vy += (tr.k * (lead.y - dr.y) - tr.c * dr.vy) * dt
        dr.x += dr.vx * dt
        dr.y += dr.vy * dt
        const gap = Math.hypot(dr.x - lead.x, dr.y - lead.y)
        const most = POOL * Math.max(size, 0.3) * LINK
        if (gap > most) {
          dr.x = lead.x + ((dr.x - lead.x) / gap) * most
          dr.y = lead.y + ((dr.y - lead.y) / gap) * most
        }
      })
      // the pool turns to its way, leans into it and stretches along it, keeping its area
      if (speed > 30 && !reduced) {
        const want = Math.atan2(head.vy, head.vx)
        const diff = ((((want - angle) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
        angle += diff * (1 - Math.exp(-dt * 8 * Math.min(1, speed / 400)))
      }
      lean = damp(lean, reduced ? 0 : Math.min(0.16, speed * 0.00022), 6, dt)
      const stretch = reduced ? 1 : 1 + Math.min(0.45, speed * 0.0006)
      sx = damp(sx, stretch, 14, dt)
      sy = damp(sy, 1 / Math.sqrt(stretch), 14, dt)
      // it is there while the cursor is over the footer: it forms with a little pop, swells a little in motion, and drains once the cursor leaves
      pace = damp(pace, now - movedAt < REST_MS ? lastPace : 0, 10, dt)
      goal = present ? REST_SIZE + (1 - REST_SIZE) * smoothstep(PACE.from, PACE.full, pace) : 0
      if (reduced) size = damp(size, goal, 8, dt)
      else {
        sizeV += (120 * (goal - size) - 13 * sizeV) * dt
        size += sizeV * dt
        if (size < 0) size = sizeV = 0
      }
    }

    const frame = (now: number) => {
      raf = 0
      // a frame's timestamp can be a little earlier than the moment it was asked for
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = Math.max(last, now)
      const n = Math.max(1, Math.ceil(dt / (1 / 120)))
      // the cursor's moves are stamped by the same clock
      const clock = performance.now()
      for (let i = 0; i < n; i++) step(dt / n, clock)
      const t = (now - t0) / 1000
      const s = POOL * size
      // the lobe wanders round one side, never quite behind (the droplets are there)
      const la = angle + 1.9 + 0.7 * Math.sin(t * 0.53)
      lobe.x = head.x + Math.cos(la) * s * LOBE.out * sx
      lobe.y = head.y + Math.sin(la) * s * LOBE.out * sx
      lobe.r = s * LOBE.r
      TRAIL.forEach((tr, i) => {
        dropData[i * 3] = drops[i].x * dpr
        dropData[i * 3 + 1] = drops[i].y * dpr
        dropData[i * 3 + 2] = reduced ? 0 : POOL * size * tr.r * dpr
      })
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      // shade only the drop's own box: the head, its lobe and its droplets, with room for the blend between them
      let x0 = head.x - s * 1.7 * sx
      let x1 = head.x + s * 1.7 * sx
      let y0 = head.y - s * 1.7 * sx
      let y1 = head.y + s * 1.7 * sx
      for (const c of [{ x: lobe.x, y: lobe.y, r: lobe.r }, ...drops.map((d, i) => ({ x: d.x, y: d.y, r: POOL * size * TRAIL[i].r }))]) {
        const r = c.r + s * 0.7
        x0 = Math.min(x0, c.x - r)
        x1 = Math.max(x1, c.x + r)
        y0 = Math.min(y0, c.y - r)
        y1 = Math.max(y1, c.y + r)
      }
      const bx = Math.max(0, Math.floor((x0 - 4) * dpr))
      const by = Math.max(0, Math.floor(cv.height - (y1 + 4) * dpr))
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(bx, by, Math.max(0, Math.ceil((x1 + 4) * dpr) - bx), Math.max(0, Math.ceil(cv.height - (y0 - 4) * dpr) - by))
      gl.uniform2f(U.uRes, cv.width, cv.height)
      gl.uniform2f(U.uHead, head.x * dpr, head.y * dpr)
      gl.uniform1f(U.uAngle, angle)
      gl.uniform2f(U.uStretch, sx, sy)
      gl.uniform1f(U.uSize, s * dpr)
      gl.uniform1f(U.uLean, lean)
      gl.uniform3f(U.uAmp, amp[0], amp[1], amp[2])
      gl.uniform3f(U.uPhase, angle * 2 + t * 0.4, angle * 3 - t * 0.3, angle * 5 + t * 0.2)
      gl.uniform3f(U.uLobe, lobe.x * dpr, lobe.y * dpr, lobe.r * dpr)
      gl.uniform3fv(U.uDrops, dropData)
      gl.uniform1f(U.uDpr, dpr)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.disable(gl.SCISSOR_TEST)
      clip(s, t)
      // it keeps living while the cursor is over the footer; otherwise it runs until it has settled (drained, or still under reduced motion)
      const settled = Math.abs(size - goal) < 0.001 && Math.abs(sizeV) < 0.001 && pace < 1 && clock - movedAt > REST_MS * 2
      if (visible && (!settled || (present && !reduced))) raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (!raf && visible) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    const at = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      target.x = e.clientX - r.left
      target.y = e.clientY - r.top
    }
    const move = (e: PointerEvent) => {
      const px = target.x
      const py = target.y
      const now = performance.now()
      at(e)
      const since = (now - movedAt) / 1000
      lastPace = since > 0.25 ? 0 : Math.hypot(target.x - px, target.y - py) / Math.max(0.004, since)
      movedAt = now
      // a drop that has drained forms again where the cursor is, not where it last was
      if (size < 0.02) for (const p of [head, ...drops]) Object.assign(p, { x: target.x, y: target.y, vx: 0, vy: 0 })
      present = true
      kick()
    }
    const enter = (e: PointerEvent) => {
      at(e)
      if (size < 0.02) for (const p of [head, ...drops]) Object.assign(p, { x: target.x, y: target.y, vx: 0, vy: 0 })
      present = true
      kick()
    }
    const leave = () => {
      present = false
      kick()
    }
    // a press splashes: it squashes and its edge rings
    const press = () => {
      if (reduced || size < 0.05) return
      sizeV -= 2.2
      ampV[0] += 1.6
      ampV[2] -= 1.1
      kick()
    }
    host.addEventListener('pointerenter', enter)
    host.addEventListener('pointerdown', press)
    host.addEventListener('pointermove', move, { passive: true })
    host.addEventListener('pointerleave', leave)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) resize()
      kick()
    })
    io.observe(host)
    const ro = new ResizeObserver(() => {
      resize()
      kick()
    })
    ro.observe(host)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      host.removeEventListener('pointerenter', enter)
      host.removeEventListener('pointerdown', press)
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [reveal])

  return <canvas ref={pool} className="liquid" aria-hidden="true" />
}
