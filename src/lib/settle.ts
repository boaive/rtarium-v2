import { nativeScroll, prefersReducedMotion } from './motion'

/**
 * A phone, where a pinned section reads best at rest on one of its stops (`data-settle` with `data-stops`, shares of its
 * run: the rainscreen's "What the rainscreen ends", a listing at a time): once the finger is off and the browser's own
 * fling has died out, the page glides there slowly by itself, never half way between two. One driver at a time: nothing
 * moves the page while a finger is down or the browser is still scrolling it, and a new touch stops the glide at once.
 */
const QUIET = 170
/** the glide: slow, eased both ends (ms), and only to a stop this near (screens) */
const GLIDE = { least: 650, most: 1300, reach: 1 }

/** a screen of parts a scroll gone through once: never held, settled onto or stepped again this visit */
export function release(el: HTMLElement) {
  el.removeAttribute('data-hold')
  el.removeAttribute('data-settle')
}

export function startSettle() {
  if (!nativeScroll() || prefersReducedMotion()) return () => {}
  let down = false
  let quiet = 0
  let anim = 0
  let gliding = false
  /** the way the page last moved (1 down, -1 up), and where it was */
  let dir = 0
  let lastY = window.scrollY
  /*
   * A screen of parts a scroll (`data-hold`: the Unitized six layers, Wall Panels' panels; the user's, 18 Nov 2026). A
   * fling that crosses its top is stopped on it, cleanly (the page's overflow cut for two frames ends the browser's
   * momentum; nothing pulls against it). Held there, a swipe is a part: it is taken on its first move (CLAUDE.md rule 1:
   * no fling ever starts under it) and the screen told (`holdstep`, detail 1 on, -1 back). Its first part and its last
   * say so (`data-hold-at`: first, last): a swipe back from the first, or on from the last, is left to the browser, and
   * the page scrolls on to the next section naturally.
   */
  const topOf = (el: HTMLElement) => Math.round(el.getBoundingClientRect().top + window.scrollY)
  /** the touch: where it set off, and the screen whose part it is taking (null: the browser's) */
  const touch = { y: 0, x: 0, decided: true, taking: null as { el: HTMLElement; dir: number } | null }
  const heldOn = () => {
    const y = window.scrollY
    for (const el of document.querySelectorAll<HTMLElement>('[data-hold]')) if (Math.abs(topOf(el) - y) < 4) return el
    return null
  }
  const catchAt = (top: number) => {
    stop()
    const root = document.documentElement
    root.style.overflow = 'hidden'
    window.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
    lastY = top
    requestAnimationFrame(() => requestAnimationFrame(() => void (root.style.overflow = '')))
  }

  const stop = () => {
    cancelAnimationFrame(anim)
    gliding = false
  }
  const glide = (to: number) => {
    stop()
    const from = window.scrollY
    const far = to - from
    const ms = Math.min(GLIDE.most, GLIDE.least + (Math.abs(far) / window.innerHeight) * 900)
    const t0 = performance.now()
    gliding = true
    const frame = (now: number) => {
      if (!gliding) return
      const t = Math.min(1, (now - t0) / ms)
      // (eased in and out, reaching exactly 1: CLAUDE.md rule 3)
      const e = t >= 1 ? 1 : 0.5 - Math.cos(Math.PI * t) / 2
      window.scrollTo({ top: from + far * e, behavior: 'instant' as ScrollBehavior })
      if (t < 1) anim = requestAnimationFrame(frame)
      else gliding = false
    }
    anim = requestAnimationFrame(frame)
  }
  const check = () => {
    if (down || gliding) return
    const vh = window.innerHeight
    const y = window.scrollY
    for (const el of document.querySelectorAll<HTMLElement>('[data-settle][data-stops]')) {
      const r = el.getBoundingClientRect()
      // a section a screen tall (one that plays by itself: the Unitized page's six layers): left more than half on the
      // screen, brought whole onto it
      // (only one the page is arriving at: going down with it below the screen's top, or up with it above. Never one being
      // left: played through, the scroll on from it goes on to the next section, as any)
      if (el.offsetHeight <= vh * 1.05) {
        const arriving = (dir > 0 && r.top > 0) || (dir < 0 && r.top < 0)
        if (arriving && Math.abs(r.top) > 3 && Math.abs(r.top) < vh * 0.5) return glide(Math.round(r.top + y))
        continue
      }
      // (only while it holds the screen, pinned: not as it comes in or goes)
      if (r.top > 1 || r.bottom < vh - 1) continue
      const top = r.top + y
      const run = Math.max(1, el.offsetHeight - vh)
      const stops = (el.dataset.stops ?? '')
        .split(',')
        .map(Number)
        .filter(Number.isFinite)
        .map((f) => Math.round(top + f * run))
      if (!stops.length) continue
      const near = stops.reduce((a, s) => (Math.abs(s - y) < Math.abs(a - y) ? s : a), stops[0])
      const d = Math.abs(near - y)
      if (d > 3 && d < vh * GLIDE.reach) glide(near)
      return
    }
  }
  const arm = () => {
    window.clearTimeout(quiet)
    quiet = window.setTimeout(check, QUIET)
  }
  const onStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touch.decided = !t || e.touches.length !== 1
    touch.taking = null
    if (t) {
      touch.y = t.clientY
      touch.x = t.clientX
    }
    down = true
    window.clearTimeout(quiet)
    stop()
  }
  /** on the touch's first move, on a held screen: a part on or back is the screen's, taken; else the browser's */
  const onMove = (e: TouchEvent) => {
    if (touch.decided) {
      if (touch.taking && e.cancelable) e.preventDefault()
      return
    }
    const t = e.touches[0]
    if (!t) return
    const dy = touch.y - t.clientY
    const dx = touch.x - t.clientX
    if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return
    touch.decided = true
    if (Math.abs(dx) > Math.abs(dy) || !e.cancelable) return
    if ((e.target as Element | null)?.closest?.('dialog, [data-lenis-prevent]') || document.querySelector('dialog[open]')) return
    const el = heldOn()
    if (!el) return
    const d = Math.sign(dy)
    const at = el.dataset.holdAt
    if ((d > 0 && at === 'last') || (d < 0 && at === 'first')) return
    touch.taking = { el, dir: d }
    e.preventDefault()
  }
  const onEnd = (e: TouchEvent) => {
    down = false
    const taking = touch.taking
    touch.taking = null
    const t = e.changedTouches[0]
    if (taking && t && Math.abs(touch.y - t.clientY) > 24) taking.el.dispatchEvent(new CustomEvent('holdstep', { detail: taking.dir }))
    if (!taking) arm()
  }
  const onScroll = () => {
    const y = window.scrollY
    const was = lastY
    if (y !== was) dir = Math.sign(y - was)
    lastY = y
    // (a fling, no finger down, crossing the top of a screen that holds the page: stopped on it)
    if (!down && !gliding && Math.abs(y - was) < window.innerHeight * 0.9) {
      for (const el of document.querySelectorAll<HTMLElement>('[data-hold]')) {
        const top = topOf(el)
        if ((was < top && y >= top) || (was > top && y <= top)) return catchAt(top)
      }
    }
    if (!gliding) arm()
  }
  window.addEventListener('touchstart', onStart, { passive: true, capture: true })
  window.addEventListener('touchmove', onMove, { passive: false, capture: true })
  window.addEventListener('touchend', onEnd, { passive: true, capture: true })
  window.addEventListener('touchcancel', onEnd, { passive: true, capture: true })
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => {
    stop()
    window.clearTimeout(quiet)
    window.removeEventListener('touchstart', onStart, { capture: true })
    window.removeEventListener('touchmove', onMove, { capture: true })
    window.removeEventListener('touchend', onEnd, { capture: true })
    window.removeEventListener('touchcancel', onEnd, { capture: true })
    window.removeEventListener('scroll', onScroll)
  }
}
