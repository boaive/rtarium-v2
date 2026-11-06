import { Fragment, useEffect, type RefObject } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import { smooth } from '../progress'

/**
 * A row of cards on one screen coming in with the scroll: the title's words rise into place, a line runs along the
 * top of the cards, and the frames (`.fu-prob__stage`, by `--g`) come in one after another. All of it is shares of
 * the section's rise up the screen, so the page is never held, and it runs back as the section goes down.
 *
 * The frames start at FROM and each takes OPEN; those between share what is left, so the last lands as the
 * section reaches the top: any sooner and the frames would finish below the fold, unseen.
 */
const FROM = 0.33
const OPEN = 0.31
/** the title's words, the same way: the first starts at WORDS_FROM, each next WORD_GAP after it, each takes WORD_RISE */
const WORDS_FROM = 0.16
const WORD_GAP = 0.04
const WORD_RISE = 0.24

/** a title, each word in a line of its own to rise out of */
export function RiseWords({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((w) => (
        <Fragment key={w}>
          <span className="fu-probs__word">
            <i>{w}</i>
          </span>{' '}
        </Fragment>
      ))}
    </>
  )
}

export function useRise(
  section: RefObject<HTMLElement | null>,
  title: RefObject<HTMLElement | null>,
  rail: RefObject<HTMLElement | null>,
  cols: RefObject<HTMLElement | null>,
  /** nothing moves on a phone: its cards stand one under the other, not in a row */
  compact: boolean,
) {
  useEffect(() => {
    const el = section.current
    if (!el) return
    const stages = cols.current ? [...cols.current.querySelectorAll<HTMLElement>('.fu-prob__stage')] : []
    const words = title.current ? [...title.current.querySelectorAll<HTMLElement>('.fu-probs__word i')] : []
    const still = compact || prefersReducedMotion()
    const step = (1 - FROM - OPEN) / Math.max(1, stages.length - 1)
    let raf = 0
    const read = () => {
      raf = 0
      const vh = window.innerHeight
      const rise = (vh - el.getBoundingClientRect().top) / vh
      words.forEach((word, i) => {
        const t = still ? 1 : Math.min(1, Math.max(0, (rise - WORDS_FROM - i * WORD_GAP) / WORD_RISE))
        word.style.transform = t < 1 ? `translateY(${(Math.pow(1 - t, 3) * 115).toFixed(1)}%)` : ''
      })
      rail.current?.style.setProperty('--run', still ? '1' : smooth(0.25, 0.95, rise).toFixed(4))
      stages.forEach((stage, k) => {
        const g = still ? 1 : smooth(FROM + k * step, FROM + k * step + OPEN, rise)
        stage.style.setProperty('--g', g.toFixed(4))
      })
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [section, title, rail, cols, compact])
}
