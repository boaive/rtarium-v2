import { useEffect, useRef, type RefObject } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import { smooth } from '../progress'

/**
 * Whether an element is on screen, as a ref read every frame (never a render): a scene keeps its
 * motion in time only while it can be seen.
 */
export function useLive(ref: RefObject<HTMLElement | null>) {
  const live = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => void (live.current = e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return live
}

/**
 * A box that opens out of its top-left corner, diagonally, once its section is half way up the
 * screen, and is fully open as the section settles (its play starts only then); as the section
 * leaves it folds back into the same corner (Enerblock's frames). Its size is read out at the
 * corner that moves. Writes `--k` (how far open) on the box, following the scroll. Under reduced
 * motion it is simply open.
 */
export function useCornerBox(section: RefObject<HTMLElement | null>, box: RefObject<HTMLElement | null>, rx: RefObject<HTMLElement | null>, ry: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let raf = 0
    let size: [number, number] | null = null
    const read = () => {
      raf = 0
      const s = section.current
      const b = box.current
      if (!s || !b) return
      const r = s.getBoundingClientRect()
      const vh = window.innerHeight
      const reduced = prefersReducedMotion()
      // open from when the section's top is half way up the screen until it reaches the top
      const g = reduced ? 1 : smooth(0.5, 0.98, (vh - r.top) / vh)
      // closed again by the time half of its last screen has gone
      const o = reduced ? 0 : smooth(0.02, 0.5, (vh - r.bottom) / vh)
      const k = g * (1 - o)
      b.style.setProperty('--k', k.toFixed(4))
      size ??= [b.offsetWidth, b.offsetHeight]
      if (rx.current) rx.current.textContent = `X: ${Math.round(size[0] * k)}`
      if (ry.current) ry.current.textContent = `Y: ${Math.round(size[1] * k)}`
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    const resize = () => {
      size = null
      on()
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', resize)
    }
  }, [section, box, rx, ry])
}
