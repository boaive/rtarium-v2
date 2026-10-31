import * as THREE from 'three'
import { MOD, WAF } from './fab'

/**
 * Micro-vibration, drawn on a cut face of the waffle slab: red wave fronts running up through the
 * concrete, kept to the section's outline (the deck and what lies on it, the ribs under it). Where a
 * damping layer is (`uDampY0`..`uDampY1`, scaled by `uDamp` 0..1) the fronts die out, and nothing
 * passes above it. A plane over the face carries it; `axis` 'z' for a face of constant z (the ribs
 * running along z are cut there), 'x' for one of constant x; `plain`, a plane with no section to keep to.
 * Everything is read in the plane's own coordinates (the slab's, where it is drawn in the slab's group),
 * so the fronts stay on the section however the piece is moved or turned.
 */

export const RED = '#f43a2b'

export interface Vibe {
  material: THREE.ShaderMaterial
  u: {
    uTime: { value: number }
    uDamp: { value: number }
    uDampY0: { value: number }
    uDampY1: { value: number }
    uTop: { value: number }
    uShow: { value: number }
  }
}

export function vibeMaterial(
  axis: 'x' | 'z',
  top: number,
  {
    speed = 0.16,
    wave = 0.07,
    color = RED,
    plain = false,
    thick = 0.07,
    fade = [0, 0, 0, 0] as [number, number, number, number],
    ceil = 0,
  }: { speed?: number; wave?: number; color?: string; plain?: boolean; thick?: number; fade?: [number, number, number, number]; ceil?: number } = {},
): Vibe {
  const u = {
    uTime: { value: 0 },
    uDamp: { value: 0 },
    uDampY0: { value: 10 },
    uDampY1: { value: 11 },
    uTop: { value: top },
    uShow: { value: 1 },
  }
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      ...u,
      uColor: { value: new THREE.Color(color) },
      uSpeed: { value: speed },
      uWave: { value: wave },
      uAxis: { value: axis === 'z' ? 0 : 1 },
      uPlain: { value: plain ? 1 : 0 },
      uThick: { value: thick },
      // a plain plane's field fades in from its sides and its foot: (left, right, foot, how far);
      // with a ceiling, it fades out from its foot up to it instead (the fronts leaving a floor)
      uFade: { value: new THREE.Vector4(...fade) },
      uCeil: { value: ceil },
      uMod: { value: MOD },
      uFoot: { value: WAF.foot },
      uHead: { value: WAF.head },
      uYb: { value: WAF.depth - WAF.deck },
    },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() {
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpeed, uWave, uDamp, uDampY0, uDampY1, uTop, uShow, uAxis, uPlain, uThick, uCeil, uMod, uFoot, uHead, uYb;
      uniform vec4 uFade;
      uniform vec3 uColor;
      varying vec3 vP;
      void main() {
        float u = uAxis < 0.5 ? vP.x : vP.z;
        float off = uAxis < 0.5 ? 0.0 : 0.5;
        float y = vP.y;
        // the section: the deck and what lies on it; under it, the ribs cut on this face
        float dx = abs(u - uMod * (floor(u / uMod - off + 0.5) + off));
        float hw = mix(uFoot, uHead, clamp(y / uYb, 0.0, 1.0)) * 0.5;
        bool inside = uPlain > 0.5 || (y > uYb && y < uTop) || (y >= 0.0 && y <= uYb && dx <= hw);
        if (!inside) discard;
        // the fronts ripple a little across the face, in proportion to their spacing
        float wob = sin(u * 3.4 / uWave + uTime * 2.4) * uWave * 0.085;
        float ph = (y + wob - uTime * uSpeed) / uWave;
        float d = abs(fract(ph) - 0.5);
        float w = fwidth(ph);
        float line = 1.0 - smoothstep(uThick, uThick + 1.5 * w, d);
        float a = 1.0 - uDamp * smoothstep(uDampY0, uDampY1, y);
        if (uPlain > 0.5 && uFade.w > 0.0) {
          a *= smoothstep(uFade.x, uFade.x + uFade.w, u) * smoothstep(uFade.y, uFade.y - uFade.w, u);
          a *= uCeil > 0.0 ? 1.0 - smoothstep(uFade.z, uCeil, y) : smoothstep(uFade.z, uFade.z + uFade.w * 2.0, y);
        }
        float alpha = (line * 0.92 + 0.07) * a * uShow;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }`,
  })
  return { material, u }
}
