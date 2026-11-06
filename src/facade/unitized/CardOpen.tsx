import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import { smooth, type Progress } from '../progress'

/**
 * A row of cards any of which opens across the whole panel, shared by the Unitized page's four problems and the
 * flooring pages' failures: the words first, on the left, then the scene on the right, played again in the larger view,
 * with its labels, which only the larger view has, a close button and the way on to the others (Escape and the arrow
 * keys too).
 */

/** seconds a card takes to play again when it is opened */
const REPLAY = 3.2
/** ms the words have to themselves before the scene comes in and plays */
const TEXT_FIRST = 1000
/** how much further out a label stands in the larger view */
export const OPEN_REACH = 1.9

/** the loop, in seconds: a card plays out, holds, and starts straight again from the top, never leaving the screen, each a beat after the last */
const LOOP = { play: 3.4, hold: 1.8, turn: 0.4 }
/** the larger view holds longer: its labels are there to be read */
const OPEN_HOLD = 4.5

/** seconds the section has been on screen: what keeps the cards playing, and only while they can be seen */
export function useCardClock(section: RefObject<HTMLElement | null>) {
  const clock = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  useEffect(() => {
    const el = section.current
    if (!el) return
    if (prefersReducedMotion()) {
      clock.value = Infinity
      clock.listeners.forEach((f) => f())
      return
    }
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      clock.value += Math.min(0.1, (now - last) / 1000)
      last = now
      clock.listeners.forEach((f) => f())
      raf = requestAnimationFrame(tick)
    }
    const seen = new IntersectionObserver(
      ([e]) => {
        cancelAnimationFrame(raf)
        raf = 0
        if (!e.isIntersecting) return
        last = performance.now()
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.35 },
    )
    seen.observe(el)
    return () => {
      seen.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [section, clock])
  return clock
}

/** how far a loop has played (0..1), `t` seconds in */
const loopState = (t: number, play: number, hold: number) => smooth(0, play, t % (play + hold))

/** how far card `k` has played (0..1) at `time` */
export function loopAt(time: number, k: number) {
  if (!Number.isFinite(time)) return 1
  const t = time - k * LOOP.turn
  return t <= 0 ? 0 : loopState(t, LOOP.play, LOOP.hold)
}

/** which card is open, the keys that move it, and the columns that give it the panel */
export function useOpenCard(count: number, compact: boolean) {
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    if (open === null) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      else if (e.key === 'ArrowRight') setOpen((k) => (k === null ? k : (k + 1) % count))
      else if (e.key === 'ArrowLeft') setOpen((k) => (k === null ? k : (k + count - 1) % count))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, count])
  const tracks = compact ? undefined : ({ gridTemplateColumns: Array.from({ length: count }, (_, k) => (open === null || open === k ? '1fr' : '0fr')).join(' ') } as CSSProperties)
  return { open, setOpen, tracks }
}

/** opened: `show` (0..1) played from the start, once the words have been read, and looped */
export function useReplay(isOpen: boolean, show: (a: number) => void) {
  const shown = useRef(show)
  shown.current = show
  useEffect(() => {
    if (!isOpen) return
    if (prefersReducedMotion()) return shown.current(1)
    let raf = 0
    const from = performance.now() + TEXT_FIRST
    const tick = (now: number) => {
      shown.current(loopState(Math.max(0, (now - from) / 1000), REPLAY, OPEN_HOLD))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isOpen])
}

/** the card's way in and out; the keyboard stays where the eye is: on Close when it opens, on the card when it closes */
export function useCardFocus(isOpen: boolean, open: number | null) {
  const opener = useRef<HTMLButtonElement>(null)
  const closer = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (isOpen) closer.current?.focus({ preventScroll: true })
    else if (wasOpen.current && open === null) opener.current?.focus({ preventScroll: true })
    wasOpen.current = isOpen
  }, [isOpen, open])
  return { opener, closer }
}

export const cardState = (k: number, open: number | null) => (open === k ? 'is-open' : open !== null ? 'is-closed' : '')

export function CardNav({ k, total, onOpen }: { k: number; total: number; onOpen: (k: number) => void }) {
  return (
    <div className="fu-prob__nav">
      <button type="button" onClick={() => onOpen((k + total - 1) % total)}>
        Previous
      </button>
      <button type="button" onClick={() => onOpen((k + 1) % total)}>
        Next <span aria-hidden="true">→</span>
      </button>
    </div>
  )
}
