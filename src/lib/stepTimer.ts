import { useEffect, useRef, type RefObject } from 'react'
import { CHAPTERS } from '../components/Chapter'
import { getShared, subscribeShared } from '../three/stageStore'
import { granted, sectionName, sectionOf, track } from './analytics'

/**
 * Time on each step of the stepped sections (the six layers, the five stations, the steps of a build): the page's own
 * store knows which chapter and step hold the middle of the screen. When it moves on (or the page changes, or the tab
 * is hidden) one `step_view` goes out with the seconds it was read; under a second is a pass, not a read.
 */
export function startStepTimer(path: string) {
  if (!granted()) return () => {}
  let key = ''
  let chapter = ''
  let step = 0
  let since = 0

  const flush = () => {
    if (key && since) {
      const seconds = Math.round((performance.now() - since) / 1000)
      if (seconds >= 1) {
        const found = CHAPTERS.get(chapter)
        track('step_view', {
          chapter_name: found?.title ?? chapter,
          step_name: tidy(found?.labels[step] ?? `Step ${step + 1}`),
          step_number: step + 1,
          page_path: path,
          content_group: sectionOf(path),
          step_seconds: seconds,
        })
      }
    }
    since = 0
  }
  const read = () => {
    const s = getShared()
    // only a chapter of several steps (a single screen is the section's own time, `section_view`)
    const next = (CHAPTERS.get(s.chapter)?.labels.length ?? 0) > 1 ? `${s.chapter}:${s.step}` : ''
    if (next === key) return
    flush()
    key = next
    chapter = s.chapter
    step = s.step
    since = key && document.visibilityState === 'visible' ? performance.now() : 0
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
    else if (key) since = performance.now()
  }
  const off = subscribeShared(read)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', flush)
  read()
  return () => {
    off()
    flush()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flush)
  }
}

/** a step's name without its closing full stop */
const tidy = (s: string) => s.replace(/[.\s]+$/, '')

/**
 * The same for a step bar (the six layers, the stations of a build, the steps of a floor): while its section holds the
 * middle of the screen, the seconds each of its steps is on show, sent when the step changes or the section is left.
 * Home's own bar reads from the store above, so it does not report here.
 */
export function useStepView(nav: RefObject<Element | null>, label: string, names: string[], step: number, enabled = true) {
  const live = useRef({ label, names })
  live.current = { label, names }
  const now = useRef({ step, inView: false, since: 0, section: '' })

  const flush = () => {
    const c = now.current
    if (c.since) {
      const seconds = Math.round((performance.now() - c.since) / 1000)
      if (seconds >= 1) {
        const path = window.location.pathname
        track('step_view', {
          chapter_name: c.section || live.current.label.replace(/,? steps$/i, '').replace(/\s+/g, ' ').trim().slice(0, 80),
          step_name: tidy(live.current.names[c.step] ?? `Step ${c.step + 1}`),
          step_number: c.step + 1,
          page_path: path,
          content_group: sectionOf(path),
          step_seconds: seconds,
        })
      }
    }
    c.since = 0
  }
  const resume = () => {
    now.current.since = now.current.inView && document.visibilityState === 'visible' ? performance.now() : 0
  }

  useEffect(() => {
    const root = nav.current?.closest('section')
    if (!enabled || !root || typeof IntersectionObserver === 'undefined') return
    // named as its section is in `section_view`, so the two reports read together
    now.current.section = sectionName(root)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting === now.current.inView) continue
          flush()
          now.current.inView = e.isIntersecting
          resume()
        }
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    )
    io.observe(root)
    const onVisibility = () => (document.visibilityState === 'hidden' ? flush() : resume())
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      io.disconnect()
      flush()
      now.current.inView = false
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nav])

  useEffect(() => {
    if (now.current.step === step) return
    flush()
    now.current.step = step
    resume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])
}
