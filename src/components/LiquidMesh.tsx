import { useEffect, useRef, type RefObject } from 'react'
import { hasWebGL2 } from '../three/Stage'
import { damp, prefersReducedMotion } from '../lib/motion'
import type { FooterMeshState } from '../three/footerMesh'

/**
 * The footer's liquid. Where it flows the yellow turns black: a pool of black liquid held to the
 * cursor by a spring (it overshoots and settles), stretching along its way, its edge rippling with
 * every change of pace, three droplets running behind and merging back. Inside the pool the footer
 * reads yellow (`reveal`: a second copy of the footer, clipped to the pool's outline, so the
 * colours are exact, not blended). On the pool rides a piece of the real mesh in 3D
 * (three/footerMesh), cut to a ragged outline: while it moves it bends as a whole (a saddle opening
 * along its way, a cup, a twist when it turns, a ripple at speed) and stretches along its way; at
 * rest it lies flat and true.
 *
 * When the cursor leaves, the pool comes to rest on the open ground of the footer, smaller, and the
 * piece turns slowly over it; on a narrow screen there is no open ground, so it shows only while
 * touched. It runs only while the footer is on screen.
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
uniform vec3 uAmp;
uniform vec3 uPhase;
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
  float wob = uAmp.x * cos(2.0 * a + uPhase.x) + uAmp.y * cos(3.0 * a + uPhase.y) + uAmp.z * cos(5.0 * a + uPhase.z);
  float d = (length(q) - uSize * (1.0 + wob)) * min(uStretch.x, uStretch.y);
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
  float rim = 1.0 - smoothstep(0.0, 10.0 * uDpr, -d);
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

/** the pool's radius and the piece's radius at full size (CSS px) */
const POOL = 128
const PIECE = 118
/** the spring that holds it to the cursor: stiffness, damping (a little under critical: it overshoots) */
const HOLD = { k: 150, c: 15 }
/** the droplets behind it: their springs and sizes (fractions of the pool) */
const TRAIL = [
  { k: 210, c: 22, r: 0.5 },
  { k: 170, c: 19, r: 0.34 },
  { k: 140, c: 17, r: 0.2 },
]
/** how far a droplet may fall behind the one before it (fractions of the pool): the tail never breaks */
const LINK = 0.7
/** the edge's ripple modes (2, 3 and 5 lobes): angular frequency (rad/s) and damping ratio */
const MODES = [
  { w: 9, z: 0.14 },
  { w: 12, z: 0.16 },
  { w: 16, z: 0.18 },
]
/** points on the outline the yellow copy is clipped to */
const OUTLINE = 72

interface Piece {
  resize: (w: number, h: number, dpr: number) => void
  render: (s: FooterMeshState) => void
  dispose: () => void
}

export function LiquidMesh({ reveal }: { reveal: RefObject<HTMLElement | null> }) {
  const pool = useRef<HTMLCanvasElement>(null)
  const piece = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = pool.current
    const cv3 = piece.current
    const host = cv?.parentElement
    if (!cv || !cv3 || !host || !hasWebGL2()) return
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
    const U = Object.fromEntries(['uRes', 'uHead', 'uAngle', 'uStretch', 'uSize', 'uAmp', 'uPhase', 'uDrops', 'uDpr'].map((n) => [n, gl.getUniformLocation(prog, n)]))

    const reduced = prefersReducedMotion()
    let narrow = false
    let dpr = 1
    let W = 1
    let H = 1
    /** where it rests when the cursor is away: on the open ground between the site map and the line above */
    const rest = { x: 0, y: 0 }

    // the piece of mesh loads with three.js once the footer is first on screen
    let mesh: Piece | null = null
    let loading = false
    let disposed = false
    const loadMesh = () => {
      if (loading) return
      loading = true
      import('../three/footerMesh')
        .then(({ createFooterMesh }) => {
          if (disposed) return
          mesh = createFooterMesh(cv3)
          mesh.resize(W, H, dpr)
          kick()
        })
        .catch((e) => console.warn('[RTARIUM] footer mesh unavailable', e))
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const r = host.getBoundingClientRect()
      W = r.width
      H = r.height
      narrow = W < 700
      cv.width = Math.max(1, Math.round(W * dpr))
      cv.height = Math.max(1, Math.round(H * dpr))
      gl.viewport(0, 0, cv.width, cv.height)
      mesh?.resize(W, H, dpr)
      const map = host.querySelector('.footer__map')?.getBoundingClientRect()
      const top = host.querySelector('.footer__top')?.getBoundingClientRect()
      rest.x = W * 0.56
      rest.y = map && top ? (top.bottom + map.top) / 2 - r.top : H * 0.42
    }
    resize()

    const head = { x: rest.x, y: rest.y, vx: 0, vy: 0 }
    const target = { x: rest.x, y: rest.y }
    const drops = TRAIL.map(() => ({ x: rest.x, y: rest.y, vx: 0, vy: 0 }))
    const amp = [0, 0, 0]
    const ampV = [0, 0, 0]
    let angle = 0
    let dirX = 1
    let dirY = 0
    let spin = 0
    let turnRate = 0
    let twist = 0
    let twistV = 0
    let saddle = 0
    let cup = 0
    let pull = 1
    let ripple = 0
    let sx = 1
    let sy = 1
    let size = 0
    let sizeV = 0
    let present = false
    let visible = false
    let raf = 0
    let last = performance.now()
    const t0 = last
    const dropData = new Float32Array(9)

    /** the pool's outline, the same field as the shader's (head and droplets), for the yellow copy */
    const field = (x: number, y: number, s: number, t: number) => {
      const rx = x - head.x
      const ry = y - head.y
      const c = Math.cos(angle)
      const sn = Math.sin(angle)
      const qx = (c * rx + sn * ry) / sx
      const qy = (-sn * rx + c * ry) / sy
      const a = Math.atan2(qy, qx)
      const wob = amp[0] * Math.cos(2 * a + angle * 2 + t * 0.4) + amp[1] * Math.cos(3 * a + angle * 3 - t * 0.3) + amp[2] * Math.cos(5 * a + angle * 5 + t * 0.2)
      let d = (Math.hypot(qx, qy) - s * (1 + wob)) * Math.min(sx, sy)
      TRAIL.forEach((tr, i) => {
        const r = reduced ? 0 : POOL * size * tr.r
        if (r < 0.5) return
        const b = Math.hypot(x - drops[i].x, y - drops[i].y) - r
        const k = s * 0.6
        const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - d)) / k))
        d = b + (d - b) * h - k * h * (1 - h)
      })
      return d
    }
    const clip = (s: number, t: number) => {
      const el = reveal.current
      if (!el) return
      if (s < 8) {
        el.style.clipPath = 'inset(50%)'
        el.style.visibility = 'hidden'
        return
      }
      el.style.visibility = 'visible'
      // along each ray from the middle, the farthest point still inside, a few pixels in from the edge
      const far = s * 3.2
      const pts: string[] = []
      for (let i = 0; i < OUTLINE; i++) {
        const a = (i / OUTLINE) * Math.PI * 2
        const ux = Math.cos(a)
        const uy = Math.sin(a)
        let r = far
        while (r > 0 && field(head.x + ux * r, head.y + uy * r, s, t) > -4) r -= 6
        let lo = Math.max(0, r)
        let hi = r + 6
        for (let k = 0; k < 4; k++) {
          const m = (lo + hi) / 2
          if (field(head.x + ux * m, head.y + uy * m, s, t) > -4) hi = m
          else lo = m
        }
        pts.push(`${(head.x + ux * lo).toFixed(1)}px ${(head.y + uy * lo).toFixed(1)}px`)
      }
      el.style.clipPath = `polygon(${pts.join(',')})`
    }

    const step = (dt: number) => {
      const tx = present ? target.x : rest.x
      const ty = present ? target.y : rest.y
      const vx0 = head.vx
      const vy0 = head.vy
      if (reduced) {
        head.x = damp(head.x, tx, 12, dt)
        head.y = damp(head.y, ty, 12, dt)
        head.vx = head.vy = 0
      } else {
        head.vx += (HOLD.k * (tx - head.x) - HOLD.c * head.vx) * dt
        head.vy += (HOLD.k * (ty - head.y) - HOLD.c * head.vy) * dt
        head.x += head.vx * dt
        head.y += head.vy * dt
      }
      const speed = Math.hypot(head.vx, head.vy)
      // a change of pace sets the edge ringing
      const jolt = Math.hypot(head.vx - vx0, head.vy - vy0) / Math.max(dt, 1e-3)
      MODES.forEach((m, i) => {
        if (reduced) return
        ampV[i] += (-m.w * m.w * amp[i] - 2 * m.z * m.w * ampV[i]) * dt + jolt * 0.0000065 * (i === 1 ? -1 : 1) * dt * 60
        amp[i] = Math.max(-0.2, Math.min(0.2, amp[i] + ampV[i] * dt))
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
      // the pool turns to its way and stretches along it, keeping its area
      let turned = 0
      if (speed > 30 && !reduced) {
        const want = Math.atan2(head.vy, head.vx)
        const diff = ((((want - angle) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
        turned = diff * (1 - Math.exp(-dt * 8 * Math.min(1, speed / 400)))
        angle += turned
        dirX = damp(dirX, head.vx / speed, 8, dt)
        dirY = damp(dirY, head.vy / speed, 8, dt)
      }
      const stretch = reduced ? 1 : 1 + Math.min(0.45, speed * 0.0006)
      sx = damp(sx, stretch, 14, dt)
      sy = damp(sy, 1 / Math.sqrt(stretch), 14, dt)
      // the piece: it bends with the motion, twists when it turns and unwinds, ripples at speed
      turnRate = damp(turnRate, turned / Math.max(dt, 1e-3), 10, dt)
      if (!reduced) {
        twistV += (-55 * twist - 6 * twistV) * dt + turnRate * 1.4 * dt
        twist = Math.max(-1.4, Math.min(1.4, twist + twistV * dt))
        spin += dt * (present ? 0.12 : 0.22)
      }
      // with nothing moving it lies flat and true: every bend comes from the motion and eases back out
      saddle = damp(saddle, reduced ? 0 : Math.min(0.42, speed * 0.0007), 5, dt)
      cup = damp(cup, reduced ? 0 : Math.min(0.22, speed * 0.0004), 4, dt)
      pull = damp(pull, reduced ? 1 : 1 + Math.min(0.28, speed * 0.00042), 7, dt)
      ripple = damp(ripple, reduced ? 0 : Math.min(0.1, speed * 0.00014), 5, dt)
      // it forms with a little pop, and settles smaller at rest
      const want = present ? 1 : narrow ? 0 : 0.7
      if (reduced) size = damp(size, visible ? want : 0, 8, dt)
      else {
        sizeV += (120 * ((visible ? want : 0) - size) - 13 * sizeV) * dt
        size = Math.max(0, size + sizeV * dt)
      }
    }

    const frame = (now: number) => {
      raf = 0
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const n = Math.max(1, Math.ceil(dt / (1 / 120)))
      for (let i = 0; i < n; i++) step(dt / n)
      const t = (now - t0) / 1000
      const breathe = reduced || present ? 0 : 0.03 * Math.sin(t * 1.6)
      const s = POOL * size * (1 + breathe)
      TRAIL.forEach((tr, i) => {
        dropData[i * 3] = drops[i].x * dpr
        dropData[i * 3 + 1] = drops[i].y * dpr
        dropData[i * 3 + 2] = reduced ? 0 : POOL * size * tr.r * dpr
      })
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(U.uRes, cv.width, cv.height)
      gl.uniform2f(U.uHead, head.x * dpr, head.y * dpr)
      gl.uniform1f(U.uAngle, angle)
      gl.uniform2f(U.uStretch, sx, sy)
      gl.uniform1f(U.uSize, s * dpr)
      gl.uniform3f(U.uAmp, amp[0], amp[1], amp[2])
      gl.uniform3f(U.uPhase, angle * 2 + t * 0.4, angle * 3 - t * 0.3, angle * 5 + t * 0.2)
      gl.uniform3fv(U.uDrops, dropData)
      gl.uniform1f(U.uDpr, dpr)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      clip(s, t)
      mesh?.render({
        x: head.x,
        y: head.y,
        radius: PIECE * size * (1 + breathe),
        dirX,
        dirY,
        spin,
        saddle,
        cup,
        twist,
        ripple,
        stretch: pull,
        time: t,
      })
      const moving = Math.hypot(head.vx, head.vy) > 0.5 || Math.hypot(head.x - (present ? target.x : rest.x), head.y - (present ? target.y : rest.y)) > 0.3
      const ringing = Math.abs(amp[0]) + Math.abs(amp[1]) + Math.abs(amp[2]) + Math.abs(twist) > 0.0005 || Math.abs(sizeV) > 0.001
      // it keeps turning and breathing while on screen; reduced motion stops once it is still
      if (visible && (moving || ringing || !reduced)) raf = requestAnimationFrame(frame)
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
      at(e)
      present = true
      kick()
    }
    const leave = () => {
      present = false
      kick()
    }
    // a press splashes: it squashes, its edge rings, the piece kicks
    const press = (e: PointerEvent) => {
      move(e)
      if (reduced) return
      sizeV -= 2.2
      ampV[0] += 1.6
      ampV[2] -= 1.1
      twistV += 4
    }
    host.addEventListener('pointerenter', move)
    host.addEventListener('pointerdown', press)
    host.addEventListener('pointermove', move, { passive: true })
    host.addEventListener('pointerleave', leave)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) {
        loadMesh()
        resize()
        if (!present && size < 0.05) for (const p of [head, ...drops]) Object.assign(p, { x: rest.x, y: rest.y, vx: 0, vy: 0 })
      }
      kick()
    })
    io.observe(host)
    const ro = new ResizeObserver(() => {
      resize()
      kick()
    })
    ro.observe(host)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      host.removeEventListener('pointerenter', move)
      host.removeEventListener('pointerdown', press)
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
      mesh?.dispose()
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [reveal])

  return (
    <>
      <canvas ref={pool} className="liquid" aria-hidden="true" />
      <canvas ref={piece} className="liquid liquid--piece" aria-hidden="true" />
    </>
  )
}
