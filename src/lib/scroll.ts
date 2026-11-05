import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { prefersReducedMotion } from './motion'

/**
 * How the page scrolls, on every page. The wheel glides: Lenis eases the page towards where the wheel
 * has asked it to go, a shorter step than the browser's own and a long, soft tail, as a premium 3D site
 * scrolls. Nothing is held and nothing snaps: the page stops where the visitor stops, at any point of a
 * screen. Touch keeps the device's own momentum, and under reduced motion the browser's own scrolling is
 * left alone. Every scroll the site starts goes through `scrollToY`.
 */
let lenis: Lenis | null = null

/** how much of a wheel's step the page takes, and how much of the way there it eases each frame */
const WHEEL = 0.7
const LERP = 0.07

export function startSmoothScroll() {
  if (lenis || prefersReducedMotion()) return
  lenis = new Lenis({ lerp: LERP, wheelMultiplier: WHEEL, smoothWheel: true, autoRaf: true })
}

export function scrollToY(y: number, immediate = false) {
  if (lenis) {
    // a long way takes a little longer, so a jump never lurches
    const far = Math.abs(y - window.scrollY) / Math.max(1, window.innerHeight)
    lenis.scrollTo(y, immediate ? { immediate: true, force: true } : { duration: Math.min(2.2, 1.15 + far * 0.08), force: true })
  } else window.scrollTo({ top: y, behavior: immediate || prefersReducedMotion() ? 'auto' : 'smooth' })
}

/** while an overlay (the menu) is open, the page underneath does not scroll */
export function holdScroll(held: boolean) {
  if (!lenis) return
  if (held) lenis.stop()
  else lenis.start()
}
