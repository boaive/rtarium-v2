import { useEffect, type RefObject } from 'react'

/**
 * Marks each of `selector` inside `root` with `is-in` once it has come up into view, and keeps it marked. Only
 * while `on` (a phone: the cards of Home's lists rise in as they come up from the foot of the screen); off, nothing
 * is marked, and the stylesheet hides nothing.
 */
export function useMarkIn(root: RefObject<HTMLElement | null>, selector: string, on: boolean) {
  useEffect(() => {
    const el = root.current
    if (!on || !el) return
    const items = [...el.querySelectorAll<HTMLElement>(selector)]
    if (!('IntersectionObserver' in window)) {
      items.forEach((c) => c.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )
    items.forEach((c) => io.observe(c))
    return () => {
      io.disconnect()
      items.forEach((c) => c.classList.remove('is-in'))
    }
  }, [root, selector, on])
}
