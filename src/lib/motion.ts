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
export const COMPACT_QUERY = '(max-width: 860px), (max-aspect-ratio: 4/5)'
export const useReducedMotion = () => useMediaQuery(REDUCED_QUERY)
export const useIsCompact = () => useMediaQuery(COMPACT_QUERY)
export const useCoarsePointer = () => useMediaQuery('(pointer: coarse)')
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia(REDUCED_QUERY).matches
