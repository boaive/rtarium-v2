import { useEffect, useRef, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import { smooth } from '../facade/progress'

/**
 * The panels begin, on black, as the homepage's challenge does: the whole screen is one sentence. First the
 * panel's name, large, in the middle; as the page scrolls it rises and settles, smaller, into its place over the
 * middle of the screen (one name, moving: it never goes out and comes back), and the panel's promise comes in
 * under it, word by word, as far as the page has scrolled.
 */
export function Statement({ name, text }: { name: string; text: string }) {
  const section = useRef<HTMLElement>(null)
  const big = useRef<HTMLHeadingElement>(null)
  const slot = useRef<HTMLSpanElement>(null)
  const words = text.split(' ')

  useEffect(() => {
    const el = section.current
    const nm = big.current
    const sl = slot.current
    if (!el || !nm || !sl) return
    const reduced = prefersReducedMotion()
    /** where the name goes, from where it stands, and how much smaller it gets there */
    let to = { dx: 0, dy: 0, s: 1 }
    const measure = () => {
      const before = nm.style.transform
      nm.style.transform = 'none'
      const a = nm.getBoundingClientRect()
      const b = sl.getBoundingClientRect()
      nm.style.transform = before
      const fa = parseFloat(getComputedStyle(nm).fontSize) || 1
      const fb = parseFloat(getComputedStyle(sl).fontSize) || 1
      to = { dx: b.left + b.width / 2 - (a.left + a.width / 2), dy: b.top + b.height / 2 - (a.top + a.height / 2), s: fb / fa }
    }
    let raf = 0
    const read = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const span = Math.max(1, r.height - window.innerHeight)
      const p = reduced ? 1 : Math.min(1, Math.max(0, -r.top / span))
      // the name: from the middle to its place, smaller, in one move
      const n = smooth(0.04, 0.24, p)
      nm.style.transform = `translate3d(${(to.dx * n).toFixed(1)}px, ${(to.dy * n).toFixed(1)}px, 0) scale(${(1 - n * (1 - to.s)).toFixed(4)})`
      el.style.setProperty('--n', n.toFixed(4))
      // the words, one after another, over the rest of the run
      const k = smooth(0.26, 0.88, p) * words.length
      el.querySelectorAll<HTMLElement>('.wp-say__w').forEach((w, i) => w.style.setProperty('--o', Math.min(1, Math.max(0, k - i)).toFixed(3)))
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    const resize = () => {
      measure()
      on()
    }
    measure()
    read()
    // the fonts may still be loading: measure again once they are in
    document.fonts?.ready.then(resize).catch(() => {})
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', resize)
    }
  }, [words.length])

  return (
    <section ref={section} className="wp-say on-black" aria-labelledby="wp-say-title">
      <div className="wp-say__pin">
        <div className="wp-say__body">
          {/* the name's place over the sentence: kept empty, the name itself moves into it */}
          <span ref={slot} className="wp-say__slot" aria-hidden="true">
            {name}
          </span>
          <p className="wp-say__text">
            {words.map((w, i) => (
              <span key={i} className="wp-say__w" style={{ '--i': i } as CSSProperties}>
                {w}
                {i < words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        </div>
        <h2 id="wp-say-title" className="wp-say__name" ref={big}>
          {name}
        </h2>
      </div>
    </section>
  )
}
