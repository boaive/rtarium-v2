import { useEffect, useState } from 'react'

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** frame-rate independent exponential damping */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt))

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
/** phones, narrow windows and portrait screens: copy sits under the 3D instead of beside it */
/**
 * a phone, a portrait screen, or a tablet: any touch screen up to 1180 px wide (laid out at a phone's height and scaled up
 * by index.html, held either way); never a computer with a mouse or trackpad alone. vite.config.ts gives the stylesheets'
 * phone rules the same clause
 */
export const TABLET_CLAUSE = '(any-pointer: coarse) and (max-width: 1180px)'
export const COMPACT_QUERY = `(max-width: 860px), (max-aspect-ratio: 4/5), ${TABLET_CLAUSE}`
export const useReducedMotion = () => useMediaQuery(REDUCED_QUERY)
export const useIsCompact = () => useMediaQuery(COMPACT_QUERY)
export const useCoarsePointer = () => useMediaQuery('(pointer: coarse)')
/**
 * A phone or a portrait tablet scrolls the browser's own way, as veedo.space does (C:\DOWNLOADS\vee.build-main): no
 * smooth-scroll library, no swipe pager, no stepper, nothing that ever moves the page under the finger or its fling.
 * Pinned parts are sticky and play by where the page is, their pictures easing towards it. A wide screen is unchanged.
 */
export const nativeScroll = () => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia(REDUCED_QUERY).matches
