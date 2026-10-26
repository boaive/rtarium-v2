import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * How far the page has scrolled through a section, 0 at its top reaching the top of the window
 * and 1 when its bottom reaches the bottom: what the 3D follows as the visitor scrolls. It is a
 * mutable value with listeners (read every frame, never a React render per scroll), and only its
 * whole steps become state.
 */
export interface Progress {
  value: number
  listeners: Set<() => void>
}

export function useScrollProgress(ref: RefObject<HTMLElement | null>, steps = 1, over: 'run' | 'height' = 'run') {
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const [step, setStep] = useState(0)
  const last = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      // through its run (a tall section with a sticky stage), or out of the screen by its own height
      const span = Math.max(1, over === 'run' ? r.height - window.innerHeight : r.height)
      const v = Math.min(1, Math.max(0, -r.top / span))
      // a step changes a little before its scroll is half way through, so the copy leads the 3D
      const k = Math.min(steps - 1, Math.floor(v * steps + 0.18))
      if (k !== last.current) {
        last.current = k
        setStep(k)
      }
      if (v === progress.value) return
      progress.value = v
      progress.listeners.forEach((f) => f())
    }
    measure()
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [ref, steps, over, progress])
  return [progress, step] as const
}

/** asks its canvas for a frame whenever the section it follows has scrolled */
export function FollowScroll({ progress }: { progress: Progress }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const f = () => invalidate()
    progress.listeners.add(f)
    return () => void progress.listeners.delete(f)
  }, [progress, invalidate])
  return null
}

/** scrolls the page to a point of a section's run, `at` from 0 to 1 */
export function sectionY(el: HTMLElement, at: number) {
  const top = el.getBoundingClientRect().top + window.scrollY
  return top + Math.max(0, el.offsetHeight - window.innerHeight) * at
}

export const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
