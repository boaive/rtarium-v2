import { useEffect } from 'react'
import { scrollToY, stepScreens } from '../lib/scroll'
import { STORY_STEP } from './progress'

/**
 * One scroll, one step, the whole page through, as the façade overview's story: the façade system pages (Unitized,
 * Rainscreen, Stud Frame) all go this way. Each section rests at its own stops where it plays out in steps
 * (`data-stops`, points of its run, after its top unless `data-no-top`), else a screen at a time. Going up, as the
 * warehouse's frame to floor and the slab to slab: a section that steps through its parts, or plays with the scroll
 * (`free`, by id), is left whole, so a scroll up from any of its parts goes back to the section before it; its bar,
 * arrows or rows take you back through them; a story (`data-back="all"`, the overview's, the walls') is stepped back
 * through block by block, as it always was. The sections are the page's own (`.fc-page > section`), or each in its
 * ground (`.fu > section`, or a ground of its own within it: `.fu > div > section`).
 *
 * The sections whose run plays with the scroll itself (`free`) are left like the slab to slab's build: going down they
 * play with the scroll, as they always did, from their top to where they are done (`data-done`, a point of their run),
 * where the page lands; past that a scroll down is a step on to the next section. They never play back: a scroll up
 * from anywhere in them, or from under them, is a step back to the section before them, the section held where it
 * stands the while (`data-held`); gone back past, it is kept as it was left, and back down to it, it comes in as it was
 * and the page goes straight on to where it was left. Once done it is held there, and its bar shows a step where it
 * stands (`run:show`, { k, move }); before that its bar takes the page straight to the step (`move`). Off the screen
 * above it, it is let go to the scroll again (`run:release`).
 */
export function usePageSteps(free: readonly string[]) {
  const key = free.join(',')
  useEffect(() => {
    const FREE = key ? key.split(',') : []
    const stopsOf = (back: boolean) => () => {
      const vh = window.innerHeight
      const ys: number[] = []
      document.querySelectorAll<HTMLElement>('.fc-page > section, .fu > section, .fu > div > section').forEach((el) => {
        const top = el.getBoundingClientRect().top + window.scrollY
        const h = el.offsetHeight
        const run = Math.max(0, h - vh)
        const at = el.dataset.stops
        if (FREE.includes(el.id)) {
          // its top and where it is done; going up, the page stops at where it is done (held as it stands, never played
          // back), and the next step up leaves it whole for the section before it
          const done = top + run * Number(el.dataset.done ?? 1)
          ys.push(...(back ? [done] : [top, done]))
        } else if (at) {
          const parts = at.split(',').map((p) => top + run * Number(p))
          if (back && el.dataset.back !== 'all') ys.push(parts[parts.length - 1])
          else {
            if (el.dataset.noTop === undefined) ys.push(top)
            ys.push(...parts)
          }
        } else {
          // a screen at a time through its run: its top, evenly on to where its foot meets the foot of the screen
          const m = Math.max(1, Math.round(run / vh))
          for (let i = 0; i <= m; i++) ys.push(top + (run * i) / m)
        }
      })
      ys.push(document.documentElement.scrollHeight - vh)
      const stops: number[] = []
      for (const y of ys.map(Math.round).sort((a, b) => a - b)) {
        if (stops.length && y - stops[stops.length - 1] < vh * 0.12) stops[stops.length - 1] = y
        else stops.push(y)
      }
      return stops
    }
    const sections = () =>
      FREE.map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => !!el)
        .map((el) => {
          const a = Math.round(el.getBoundingClientRect().top + window.scrollY)
          const h = el.offsetHeight
          const b = a + Math.round(Math.max(0, h - window.innerHeight) * Number(el.dataset.done ?? 1))
          return { el, a, b, h }
        })
    const played = new Set<HTMLElement>()
    const leaving = new Set<HTMLElement>()
    /** where the page went back past it from, and whether it was done then; once the page is above it, kept */
    const left = new Map<HTMLElement, { y: number; played: boolean }>()
    const parked = new Map<HTMLElement, { y: number; played: boolean }>()
    const leave = (el: HTMLElement, from: number, again = false) => {
      if (again || !leaving.has(el)) left.set(el, { y: from, played: played.has(el) })
      leaving.add(el)
    }
    const held = (el: HTMLElement, on: boolean) => {
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
      sections().forEach(({ el, a, b, h }) => {
        const was = played.has(el)
        // back down to it: it has come in as it was left, and the page goes straight on to where it was left
        const back = parked.get(el)
        if (back && dy > 0 && y >= a - 2) {
          parked.delete(el)
          left.delete(el)
          leaving.delete(el)
          // the page taken straight past it (a link, a jump): let go, never pulled back up to it
          if (y > a + h) {
            played.delete(el)
            held(el, false)
            return
          }
          if (back.played) played.add(el)
          else played.delete(el)
          scrollToY(back.played ? b : back.y, true)
          held(el, back.played)
          return
        }
        if (y < a - 4) {
          // above it: gone back past it, it is kept as it was left
          const from = left.get(el)
          if (leaving.has(el) && from) parked.set(el, from)
          leaving.delete(el)
          left.delete(el)
          played.delete(el)
        } else {
          if (y >= b - 4) played.add(el)
          if (dy < 0 && y > a + 4 && y < a + h + 4) leave(el, prev)
          else if (dy > 0) {
            leaving.delete(el)
            left.delete(el)
          }
        }
        held(el, played.has(el) || leaving.has(el) || parked.has(el))
        // done: shown at its last step played out (its run may still be easing up to it)
        if (!was && played.has(el)) el.dispatchEvent(new CustomEvent('run:show', { detail: { k: el.querySelectorAll('.fu-bar__cell').length - 1 } }))
      })
    }
    // a step back out of one: held where it stands, and from its top, which looks the same (its pin holds still all its
    // run), so the way back is one screen, as from any other section
    const leap = (from: number, to: number) => {
      for (const { el, a, b } of sections()) {
        if (to < a && from > a + 4 && from <= b + 4) {
          leave(el, from, true)
          held(el, true)
          return a
        }
      }
      // as quick out of a section stepped through its parts that asks for it (`data-leap-back`: its screen holds still all
      // its run, and it keeps itself as it stands): going up, from its top, and going down, from the end of its run, the
      // way out is one screen
      for (const el of document.querySelectorAll<HTMLElement>('[data-leap-back]')) {
        const a = Math.round(el.getBoundingClientRect().top + window.scrollY)
        const end = a + Math.max(0, el.offsetHeight - window.innerHeight)
        if (to < a && from > a + 4 && from <= a + el.offsetHeight) return a
        if (to > end + 4 && from >= a - 4 && from < end - 4) return end
      }
      return null
    }
    const pick = (e: MouseEvent) => {
      const btn = (e.target as Element | null)?.closest?.<HTMLElement>('.fu-bar__btn')
      const el = btn ? sections().find((s) => s.el.contains(btn))?.el : undefined
      if (!btn || !el) return
      // the section's own handler would glide the page back through the steps between, playing them back
      e.preventDefault()
      e.stopPropagation()
      const cell = btn.closest('li')
      const k = cell?.parentElement ? [...cell.parentElement.children].indexOf(cell) : -1
      if (k >= 0) el.dispatchEvent(new CustomEvent('run:show', { detail: { k, move: !played.has(el) } }))
    }
    window.addEventListener('scroll', watch, { passive: true })
    document.addEventListener('click', pick, true)
    const free = (dir: number) => (dir < 0 ? [] : sections().map(({ a, b }) => [a, b] as [number, number]))
    const stop = stepScreens(stopsOf(false), {
      free,
      leap,
      time: (screens) => Math.min(1.9, STORY_STEP + 0.35 * Math.max(0, screens - 1)),
      back: stopsOf(true),
    })
    return () => {
      stop()
      window.removeEventListener('scroll', watch)
      document.removeEventListener('click', pick, true)
    }
  }, [key])
}
