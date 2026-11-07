import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { setShared, type Ground } from '../three/stageStore'
import { prefersReducedMotion } from '../lib/motion'

/**
 * Small pieces shared by the mobile homepage. Kept here rather than borrowed from the desktop
 * components, so the two homepages can change apart.
 */

/** A heading whose words rise out of their own masks once it scrolls into view (the site's word-by-word rule). */
export function Words({ lines, as: Tag = 'h2', className = '', id }: { lines: string[]; as?: 'h1' | 'h2' | 'h3' | 'p'; className?: string; id?: string }) {
  let w = 0
  return (
    <Tag id={id} className={`m-words ${className}`} data-reveal="">
      {lines.map((line, i) => (
        <span key={i} className="m-words__line">
          {line.split(' ').map((word, j, all) => (
            <Fragment key={j}>
              <span className="m-w">
                <span style={{ '--w': w++ } as CSSProperties}>{word}</span>
              </span>
              {j < all.length - 1 ? ' ' : null}
            </Fragment>
          ))}
        </span>
      ))}
    </Tag>
  )
}

/** Each line on its own slab of the inverse colour (black on yellow, yellow on black). */
export function Slabs({ lines, as: Tag = 'h2', className = '', id }: { lines: string[]; as?: 'h2' | 'h3'; className?: string; id?: string }) {
  return (
    <Tag id={id} className={`m-slabs ${className}`} data-reveal="">
      {lines.map((l, i) => (
        <span key={i} className="m-slabs__line" style={{ '--i': i } as CSSProperties}>
          {l}
        </span>
      ))}
    </Tag>
  )
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`m-eyebrow ${className}`} data-reveal="">
      {children}
    </p>
  )
}

/** Counts up to its value the first time it is seen; keeps the value's own format. */
export function CountUp({ value, duration = 1500 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const el = ref.current
    const match = value.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/)
    if (!el || !match || prefersReducedMotion()) return
    const [, before, digits, after] = match
    const target = parseFloat(digits.replace(/,/g, ''))
    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0
    const grouped = digits.includes(',')
    const format = (n: number) => `${before}${grouped ? n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals)}${after}`
    let raf = 0
    setShown(format(0))
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        const t0 = performance.now() + 200
        const tick = (now: number) => {
          const t = Math.min(1, Math.max(0, (now - t0) / duration))
          setShown(format(target * (1 - Math.pow(1 - t, 4))))
          if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      },
      { rootMargin: '0px' },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, duration])
  return (
    <span ref={ref} className="m-count" aria-label={value}>
      <span aria-hidden="true">{shown}</span>
    </span>
  )
}

/**
 * Reveals: every `[data-reveal]` in the page gets `is-in` once its top passes the lower part of
 * the screen, and keeps it.
 */
export function useReveals(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const items = el.querySelectorAll<HTMLElement>('[data-reveal]')
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      items.forEach((i) => i.classList.add('is-in'))
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
      { rootMargin: '0px 0px -12% 0px' },
    )
    items.forEach((i) => io.observe(i))
    return () => io.disconnect()
  }, [root])
}

/**
 * The header follows the ground under it: whichever section (`data-m-ground`, the footer's
 * `data-screen`) holds the middle of the header sets its colour, and names the chapter.
 */
export function useHeaderGround() {
  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const bar = document.querySelector('.nav__bar')
      const y = bar ? bar.getBoundingClientRect().height / 2 : 32
      let ground: string | undefined
      let chapter: string | undefined
      document.querySelectorAll<HTMLElement>('[data-m-ground], footer[data-screen]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.top <= y && r.bottom > y) {
          ground = el.dataset.mGround ?? el.dataset.screen
          chapter = el.dataset.mChapter ?? (el.tagName === 'FOOTER' ? 'footer' : chapter)
        }
      })
      if (ground) setShared({ ground: ground as Ground, chapter: chapter ?? 'hero', step: 0 })
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    const late = window.setTimeout(read, 120)
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.clearTimeout(late)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [])
}
