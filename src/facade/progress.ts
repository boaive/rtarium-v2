import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { stepScreens } from '../lib/scroll'

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

/**
 * A section that plays on one scroll: once it is well on screen, `value` runs from 0 to 1 over `seconds`,
 * on its own clock, and holds there; the page itself is never held. `seek` takes it to a point at a
 * quicker pace and leaves it there (a step chosen by the visitor). Under reduced motion it is simply at
 * its end. The same `Progress` as a scrolled run, so a scene does not know the difference.
 */
export function usePlay(ref: RefObject<HTMLElement | null>, seconds: number, share = 0.55) {
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const run = useRef({ goal: 0, rate: 1 / seconds, raf: 0, last: 0 })
  const tick = useRef<(now: number) => void>(() => {})
  tick.current = (now: number) => {
    const r = run.current
    r.raf = 0
    const dt = Math.min(0.1, Math.max(0, (now - r.last) / 1000))
    r.last = now
    const v = progress.value
    const step = r.rate * dt
    const next = Math.abs(r.goal - v) <= step ? r.goal : v + Math.sign(r.goal - v) * step
    if (next !== v) {
      progress.value = next
      progress.listeners.forEach((f) => f())
    }
    if (next !== r.goal) r.raf = requestAnimationFrame((t) => tick.current(t))
  }
  const go = (goal: number, rate: number) => {
    const r = run.current
    r.goal = goal
    r.rate = rate
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      progress.value = goal
      progress.listeners.forEach((f) => f())
      return
    }
    if (!r.raf) {
      r.last = performance.now()
      r.raf = requestAnimationFrame((t) => tick.current(t))
    }
  }
  const started = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || started.current) return
        started.current = true
        go(1, 1 / seconds)
      },
      { threshold: share },
    )
    io.observe(el)
    const r = run.current
    return () => {
      io.disconnect()
      cancelAnimationFrame(r.raf)
      r.raf = 0
    }
    // (`go` only reaches refs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, seconds, share])
  /** to a point of the play, there and no further */
  const seek = (v: number) => {
    started.current = true
    go(v, 1 / Math.max(0.9, seconds * 0.16))
  }
  return [progress, seek] as const
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

/** seconds a step takes to play out, by its length in screens: a short step about 2 s, a long one up to 3.6 s */
export const playTime = (screens: number) => Math.min(3.6, Math.max(1.8, 1.4 + 0.55 * screens))

/**
 * One scroll, one step, for a pinned section that plays out in steps (the install and build sequences): a scroll
 * glides the page on to where the next step has played out, and the scene plays it on the way; it waits there for
 * the next scroll. `ends` are those points, as points of the section's run (0..1), in order. Above and below the
 * section the page scrolls freely.
 */
export function usePlaySteps(section: RefObject<HTMLElement | null>, ends: readonly number[]) {
  const at = useRef(ends)
  at.current = ends
  useEffect(
    () =>
      stepScreens(
        () => {
          const el = section.current
          return el ? at.current.map((p) => Math.round(sectionY(el, p))) : []
        },
        { time: playTime },
      ),
    [section],
  )
}

export const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
