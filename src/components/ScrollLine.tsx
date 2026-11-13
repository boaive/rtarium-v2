import { useEffect, useRef } from 'react'
import { useStageValue } from '../three/stageStore'

/**
 * On a phone, in place of the step bar along the foot of the screen: EnduroSat's way, a hairline down the right edge
 * that fills as the page is read. Where a section steps through its parts (it carries a step bar, hidden on a phone,
 * whose cells the section fills as it plays: `--f`, 0..1 each), the line is that section's: a tick for each part, and
 * filled part by part as they play. Anywhere else it is the page's: filled as far as the page has been read. It takes
 * the ink of the ground under the header (yellow on black, black on yellow and warm white).
 */
export function ScrollLine() {
  const line = useRef<HTMLDivElement>(null)
  const ticks = useRef<HTMLDivElement>(null)
  const ground = useStageValue('ground')

  useEffect(() => {
    const el = line.current
    const marks = ticks.current
    if (!el || !marks) return
    let raf = 0
    let shownTicks = -1
    const read = () => {
      raf = 0
      const vh = window.innerHeight
      // the step bar of the section holding the middle of the screen, if any (Home's own bar when it is showing)
      let cells: HTMLElement[] | null = null
      for (const bar of document.querySelectorAll<HTMLElement>('.fu-bar')) {
        const home = bar.closest<HTMLElement>('.progress')
        const owner = home ?? bar.closest<HTMLElement>('section')
        if (!owner) continue
        if (home) {
          if (!home.classList.contains('is-on')) continue
        } else {
          const r = owner.getBoundingClientRect()
          if (!(r.top <= vh * 0.5 && r.bottom > vh * 0.5)) continue
        }
        cells = [...bar.querySelectorAll<HTMLElement>('.fu-bar__cell')]
        if (cells.length > 1) break
        cells = null
      }
      let fill: number
      let n = 0
      if (cells) {
        n = cells.length
        const done = cells.reduce((sum, c) => sum + Math.min(1, Math.max(0, Number(c.style.getPropertyValue('--f') || 0))), 0)
        fill = done / n
      } else {
        const max = document.documentElement.scrollHeight - vh
        fill = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      }
      el.style.setProperty('--fill', fill.toFixed(4))
      // (out of the way over a row of cards swiped sideways, the applications': there it read as a stray line on a card)
      const cards = [...document.querySelectorAll<HTMLElement>('.ways')].some((s) => {
        const r = s.getBoundingClientRect()
        return r.top < vh * 0.75 && r.bottom > vh * 0.25
      })
      el.classList.toggle('is-away', cards)
      el.classList.toggle('is-steps', n > 1)
      if (n !== shownTicks) {
        shownTicks = n
        marks.replaceChildren(...Array.from({ length: Math.max(0, n - 1) }, (_, k) => {
          const t = document.createElement('i')
          t.style.top = `${((k + 1) / n) * 100}%`
          return t
        }))
      }
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    // the sections write their fills as they play, between scrolls too
    const every = window.setInterval(on, 250)
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(every)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [])

  return (
    <div ref={line} className={`sline on-${ground}`} aria-hidden="true">
      <span className="sline__fill" />
      <div ref={ticks} className="sline__ticks" />
    </div>
  )
}
