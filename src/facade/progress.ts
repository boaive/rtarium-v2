import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { scrollToY, stepScreens } from '../lib/scroll'

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
  /**
   * to a point of the play, there and no further; `from`: a step chosen on its bar, played in full from its own start, at
   * the play's own pace
   */
  const seek = (v: number, from?: number) => {
    started.current = true
    if (from === undefined) return go(v, 1 / Math.max(0.9, seconds * 0.16))
    progress.value = from
    progress.listeners.forEach((f) => f())
    go(v, 1 / seconds)
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

/**
 * Seconds one scroll takes from a block of a box story to the next, the one closing and the next opening on the way:
 * the same for every story told in these boxes (the façade's, the wall panels', the flooring layer's)
 */
export const STORY_STEP = 1.05

/**
 * Where the page rests in a section told in listings (the rainscreen barrier's grammar), for the page's one scroll a
 * step (usePageSteps): each listing as it arrives, held `restOf(k)` from the top of the screen, its 3D at its start;
 * then, a scroll of its own, its 3D played out (`play` screens on). Written on the section as points of its run
 * (`data-stops`).
 */
export function listingStops(el: HTMLElement, blocks: readonly (HTMLElement | null)[], restOf: (k: number) => number, play: number) {
  const vh = window.innerHeight
  const top = el.getBoundingClientRect().top + window.scrollY
  const run = Math.max(1, el.offsetHeight - vh)
  const at: number[] = []
  blocks.forEach((b, k) => {
    if (!b) return
    const y = b.getBoundingClientRect().top + window.scrollY - restOf(k) - top
    at.push(y, y + play * vh)
  })
  el.dataset.stops = at.map((y) => (y / run).toFixed(5)).join(',')
}

/**
 * A pinned section whose run plays with the scroll, a step-through of five or six along a bar (the answers, a build), left
 * as the slab to slab's build is. Going down it plays with the scroll, as it always did, from its top to where its last
 * step has played out (`done`, a point of its run), where the page lands; past that the scroll runs on. It never plays
 * back: a scroll up from anywhere in it is a step back to the screen before it, the section held where it stands the
 * while (`data-held`), and the way back is one screen (the page leaps to its top first, which looks the same: its pin
 * holds still all its run); off the screen above it, it is let go to the scroll again (`run:release`). Once done it is
 * held there. A step of its bar plays the run to that step (`run:show`, { k, move }), the page still; before it is done
 * the page goes straight there too (`move`), so the scroll carries on from it. Above and below it the page scrolls freely.
 * Gone back past, it is kept as it was left, held, as the slab to slab's build keeps where it got to: back down to it, it
 * comes in as it was, and the page goes straight on to where it was left, so it carries on from there.
 */
export function useRunSection(section: RefObject<HTMLElement | null>, done: number) {
  useEffect(() => {
    const el = section.current
    if (!el) return
    const geo = () => {
      const vh = window.innerHeight
      const a = Math.round(el.getBoundingClientRect().top + window.scrollY)
      const h = el.offsetHeight
      return { vh, a, b: a + Math.round(Math.max(0, h - vh) * done), h }
    }
    let played = false
    let leaving = false
    /** where the page went back past it from, and whether it was done then */
    let left: { y: number; played: boolean } | null = null
    /** the same, once the page is above it: kept, and it held as it was, for the way back down */
    let parked: { y: number; played: boolean } | null = null
    const leave = (from: number, again = false) => {
      if (again || !leaving) left = { y: from, played }
      leaving = true
    }
    const hold = (on: boolean) => {
      if (el.hasAttribute('data-held') === on) return
      el.toggleAttribute('data-held', on)
      if (!on) el.dispatchEvent(new Event('run:release'))
    }
    let lastY = window.scrollY
    const watch = () => {
      const y = window.scrollY
      const dy = y - lastY
      const prev = lastY
      lastY = y
      const { a, b, h } = geo()
      const was = played
      // back down to it: it has come in as it was left, and the page goes straight on to where it was left
      if (parked && dy > 0 && y >= a - 2) {
        const back = parked
        parked = null
        left = null
        leaving = false
        // the page taken straight past it (a link, a jump): let go, never pulled back up to it
        if (y > a + h) {
          played = false
          hold(false)
          return
        }
        played = back.played
        scrollToY(back.played ? b : back.y, true)
        hold(played)
        return
      }
      if (y < a - 4) {
        // above it: gone back past it, it is kept as it was left
        if (leaving && left) parked = left
        leaving = false
        left = null
        played = false
      } else {
        if (y >= b - 4) played = true
        if (dy < 0 && y > a + 4 && y < a + h + 4) leave(prev)
        else if (dy > 0) {
          leaving = false
          left = null
        }
      }
      hold(played || leaving || !!parked)
      // done: shown at its last step played out (its run may still be easing up to it)
      if (!was && played) el.dispatchEvent(new CustomEvent('run:show', { detail: { k: el.querySelectorAll('.fu-bar__cell').length - 1 } }))
    }
    const pick = (e: MouseEvent) => {
      const btn = (e.target as Element | null)?.closest?.<HTMLElement>('.fu-bar__btn')
      if (!btn || !el.contains(btn)) return
      // the section's own handler would glide the page back through the steps between, playing them back
      e.preventDefault()
      e.stopPropagation()
      const cell = btn.closest('li')
      const k = cell?.parentElement ? [...cell.parentElement.children].indexOf(cell) : -1
      if (k >= 0) el.dispatchEvent(new CustomEvent('run:show', { detail: { k, move: !played } }))
    }
    window.addEventListener('scroll', watch, { passive: true })
    document.addEventListener('click', pick, true)
    const stop = stepScreens(
      () => {
        const { a, b } = geo()
        return [a, b]
      },
      {
        free: (dir) => {
          if (dir < 0) return []
          const { a, b } = geo()
          return [[a, b]]
        },
        back: () => {
          const { vh, a } = geo()
          return [a - vh]
        },
        leap: (from, to) => {
          const { a, b } = geo()
          if (to < a && from > a + 4 && from <= b + 4) {
            leave(from, true)
            hold(true)
            return a
          }
          return null
        },
        time: (screens) => Math.min(1.9, STORY_STEP + 0.35 * Math.max(0, screens - 1)),
      },
    )
    return () => {
      stop()
      window.removeEventListener('scroll', watch)
      document.removeEventListener('click', pick, true)
      el.removeAttribute('data-held')
    }
  }, [section, done])
}
