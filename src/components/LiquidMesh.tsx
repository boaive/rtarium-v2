import { useEffect, useRef, type RefObject } from 'react'
import { hasWebGL2 } from '../three/Stage'
import { stage } from '../three/stageStore'
import { damp, prefersReducedMotion } from '../lib/motion'

/**
 * The footer's liquid: a small, soft-cornered square of black that follows the cursor like a drop
 * of liquid (it lags, stretches the way it moves, its edge wobbles, two smaller drops trail and
 * merge back), with the real mesh inside it: the stage renders a tileable top-down swatch of the
 * same mesh once (`stage.swatch`), and the drop carries it, slightly magnified at its middle.
 *
 * Nothing is inverted by blending. The type inside the drop is a second copy of the footer set in
 * yellow (`reveal`), clipped to the drop's square, so the colours are exactly black and yellow.
 * Only the footer has it; it runs only while the footer is on screen and the drop is there.
 */

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uHead;
uniform vec2 uTail0;
uniform vec2 uTail1;
uniform float uSize;
uniform vec2 uStretch;
uniform float uTime;
uniform float uWobble;
uniform sampler2D uMesh;
uniform float uHasMesh;
uniform float uCell;
out vec4 outColor;

const vec3 BLACK = vec3(0.031);
const vec3 UPPER = vec3(0.63, 0.48, 0.33);
const vec3 PILE = vec3(0.29, 0.2, 0.13);

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float lineMask(float d, float w) {
  float aa = fwidth(d) * 1.2;
  return 1.0 - smoothstep(w - aa, w + aa, d);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  if (uSize < 0.5) { outColor = vec4(0.0); return; }

  // the head: a soft square, stretched along the way it moves, its edge wobbling like liquid
  vec2 q = (p - uHead) / uStretch;
  float a = atan(q.y, q.x);
  float wob = uWobble * (sin(a * 4.0 + uTime * 2.1) * 2.4 + sin(a * 7.0 - uTime * 2.9) * 1.3);
  float d = sdBox(q, vec2(uSize), uSize * 0.34) * min(uStretch.x, uStretch.y) + wob;
  // two trailing drops, merged into the head with a soft union
  d = smin(d, sdBox(p - uTail0, vec2(uSize * 0.5), uSize * 0.22), uSize * 0.42);
  d = smin(d, sdBox(p - uTail1, vec2(uSize * 0.28), uSize * 0.14), uSize * 0.3);
  float inside = 1.0 - smoothstep(-0.8, 0.8, d);
  if (inside <= 0.0) { outColor = vec4(0.0); return; }

  // the mesh travels with the drop, a little magnified towards its middle
  vec2 rel = p - uHead;
  float lens = 1.0 - 0.16 * smoothstep(0.0, uSize, -d);
  vec2 uv = rel * lens / uCell;
  uv += uWobble * 0.012 * vec2(sin(uTime * 1.4 + uv.y * 6.0), cos(uTime * 1.2 + uv.x * 6.0));

  vec3 col = BLACK;
  if (uHasMesh > 0.5) {
    vec4 m = texture(uMesh, uv);
    col = mix(col, m.rgb, m.a);
  } else {
    // until the stage's swatch is there (or without the stage): the same weave, drawn
    vec2 g = abs(fract(uv * 8.0 + 0.5) - 0.5);
    float face = lineMask(min(g.x, g.y), 0.06);
    vec2 c = fract(uv * 8.0);
    float pile = lineMask(min(abs(c.x - c.y), abs(c.x + c.y - 1.0)) * 0.7071, 0.03);
    col = mix(col, PILE, pile);
    col = mix(col, UPPER, face);
  }
  // a faint wet edge
  col += vec3(0.05, 0.04, 0.0) * smoothstep(-5.0, -0.5, d);
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

/** half the drop's side (CSS px) and one tile of the mesh swatch (8 cells, CSS px) */
const SIZE = 78
const TILE = 176

export function LiquidMesh({ reveal }: { reveal: RefObject<HTMLElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvas.current
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
      ['uRes', 'uHead', 'uTail0', 'uTail1', 'uSize', 'uStretch', 'uTime', 'uWobble', 'uMesh', 'uHasMesh', 'uCell'].map((n) => [n, gl.getUniformLocation(prog, n)]),
    )
    const tex = gl.createTexture()
    let hasMesh = false
    const takeSwatch = () => {
      const sw = stage.swatch
      if (hasMesh || !sw) return
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sw)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.uniform1i(U.uMesh, 0)
      hasMesh = true
    }

    const reduced = prefersReducedMotion()
    let dpr = 1
    let W = 1
    let H = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const r = host.getBoundingClientRect()
      W = r.width
      H = r.height
      cv.width = Math.max(1, Math.round(W * dpr))
      cv.height = Math.max(1, Math.round(H * dpr))
      gl.viewport(0, 0, cv.width, cv.height)
    }
    resize()

    // the drop: a head that chases the pointer, two trailing drops that chase it
    const head = { x: 0, y: 0 }
    const tail = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]
    const target = { x: 0, y: 0 }
    const vel = { x: 0, y: 0 }
    let size = 0
    let present = false
    let visible = false
    let raf = 0
    let last = performance.now()

    const clip = (sx: number, sy: number) => {
      const el = reveal.current
      if (!el) return
      const s = SIZE * size
      if (s < 4) {
        el.style.clipPath = 'inset(50%)'
        el.style.visibility = 'hidden'
        return
      }
      el.style.visibility = 'visible'
      // the head's square, a few pixels inside the liquid edge, so yellow type never shows past it
      const hw = s * sx - 5
      const hh = s * sy - 5
      const r = s * 0.34
      el.style.clipPath = `inset(${(head.y - hh).toFixed(1)}px ${(W - head.x - hw).toFixed(1)}px ${(H - head.y - hh).toFixed(1)}px ${(head.x - hw).toFixed(1)}px round ${r.toFixed(1)}px)`
    }

    const frame = (now: number) => {
      raf = 0
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      takeSwatch()
      size = damp(size, present ? 1 : 0, present ? 8 : 5, dt)
      const hx = head.x
      const hy = head.y
      head.x = damp(head.x, target.x, 11, dt)
      head.y = damp(head.y, target.y, 11, dt)
      vel.x = damp(vel.x, (head.x - hx) / Math.max(dt, 1e-3), 10, dt)
      vel.y = damp(vel.y, (head.y - hy) / Math.max(dt, 1e-3), 10, dt)
      tail[0].x = damp(tail[0].x, head.x, 7, dt)
      tail[0].y = damp(tail[0].y, head.y, 7, dt)
      tail[1].x = damp(tail[1].x, tail[0].x, 6, dt)
      tail[1].y = damp(tail[1].y, tail[0].y, 6, dt)
      // stretch along the way it moves, squeeze across it (axis-aligned, so the type's clip can follow)
      const ax = reduced ? 0 : Math.min(0.28, Math.abs(vel.x) * 0.00032)
      const ay = reduced ? 0 : Math.min(0.28, Math.abs(vel.y) * 0.00032)
      const sx = 1 + ax - ay * 0.5
      const sy = 1 + ay - ax * 0.5
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(U.uRes, cv.width, cv.height)
      gl.uniform2f(U.uHead, head.x * dpr, head.y * dpr)
      gl.uniform2f(U.uTail0, tail[0].x * dpr, tail[0].y * dpr)
      gl.uniform2f(U.uTail1, tail[1].x * dpr, tail[1].y * dpr)
      gl.uniform1f(U.uSize, SIZE * size * dpr)
      gl.uniform2f(U.uStretch, sx, sy)
      gl.uniform1f(U.uTime, now / 1000)
      gl.uniform1f(U.uWobble, reduced ? 0 : 1)
      gl.uniform1f(U.uHasMesh, hasMesh ? 1 : 0)
      gl.uniform1f(U.uCell, TILE * dpr)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      clip(sx, sy)
      const settling = Math.abs(size - (present ? 1 : 0)) > 0.002
      const moving = Math.abs(vel.x) + Math.abs(vel.y) > 1 || Math.abs(tail[1].x - head.x) + Math.abs(tail[1].y - head.y) > 0.5
      // the edge keeps moving while the drop is there; reduced motion stops once it is still
      if (visible && (settling || moving || (present && !reduced))) raf = requestAnimationFrame(frame)
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
    const enter = (e: PointerEvent) => {
      at(e)
      // the drop forms where the pointer came in, not at the last place it left
      if (!present && size < 0.05) for (const p of [head, ...tail]) Object.assign(p, target)
      present = true
      kick()
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
    host.addEventListener('pointerenter', enter)
    host.addEventListener('pointerdown', enter)
    host.addEventListener('pointermove', move, { passive: true })
    host.addEventListener('pointerleave', leave)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) {
        resize()
        kick()
      }
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
      host.removeEventListener('pointerdown', enter)
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [reveal])

  return <canvas ref={canvas} className="liquid" aria-hidden="true" />
}
