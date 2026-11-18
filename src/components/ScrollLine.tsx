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
    // (nothing here measures the page as it scrolls: measured on every frame, after the sections had written their own
    // styles, the page was laid out again for it each frame, which a phone felt as a lag. Observers say which stepped
    // section holds the middle of the screen and whether a row of cards is in the way; the page's height is kept as it
    // changes)
    let max = 0
    const sized = new ResizeObserver(() => void (max = document.documentElement.scrollHeight - window.innerHeight))
    sized.observe(document.body)
    const middle = new Set<Element>()
    const mid = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.isIntersecting ? middle.add(e.target) : middle.delete(e.target)
        on()
      },
      { rootMargin: '-50% 0px -49% 0px' },
    )
    const near = new Set<Element>()
    const band = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.isIntersecting ? near.add(e.target) : near.delete(e.target)
        on()
      },
      { rootMargin: '-25% 0px -25% 0px' },
    )
    const seen = new WeakSet<Element>()
    const scan = () => {
      for (const bar of document.querySelectorAll<HTMLElement>('.fu-bar')) {
        const owner = bar.closest('.progress') ? null : bar.closest('section')
        if (owner && !seen.has(owner)) {
          seen.add(owner)
          mid.observe(owner)
        }
      }
      for (const w of document.querySelectorAll('.ways')) {
        if (seen.has(w)) continue
        seen.add(w)
        band.observe(w)
      }
    }
    const read = () => {
      raf = 0
      // the step bar of the section holding the middle of the screen, if any (Home's own bar when it is showing)
      let cells: HTMLElement[] | null = null
      for (const bar of document.querySelectorAll<HTMLElement>('.fu-bar')) {
        const home = bar.closest<HTMLElement>('.progress')
        if (home) {
          if (!home.classList.contains('is-on')) continue
        } else {
          const owner = bar.closest('section')
          if (!owner || !middle.has(owner)) continue
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
      } else fill = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      // (out of the way over a row of cards swiped sideways, the applications': there it read as a stray line on a card)
      let cards = false
      for (const w of near) if (w.isConnected) cards = true
      el.style.setProperty('--fill', fill.toFixed(4))
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
    function on() {
      if (!raf) raf = requestAnimationFrame(read)
    }
    scan()
    read()
    // the sections write their fills as they play, between scrolls too (and a page come in has its own bars and cards)
    const every = window.setInterval(() => {
      scan()
      on()
    }, 250)
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(every)
      sized.disconnect()
      mid.disconnect()
      band.disconnect()
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
