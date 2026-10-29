import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D } from '../three/Stage3D'
import { ScrubRig } from '../three/ScrubRig'
import { FollowScroll, smooth, type Progress } from '../progress'
import { CASTING, CastScene, castShot } from '../three/stud/CastScene'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useLive } from '../unitized/live'
import { StepBar } from '../unitized/StepBar'

/**
 * Cast in five steps, in the two components' split (the rainscreen barrier's styles, `fr-bw`): on
 * yellow, the words on the left, the bar at their foot; on the right a black box with the studio's grid,
 * the casting in it, opening out of the bottom right corner as the section comes up and folding back
 * into it as it goes. The box holds for the whole run while the scroll plays the casting; each step's
 * words come in where the last ones were (a fade and a short settle).
 */

const STEPS = [
  { name: 'Stud frame', head: ['Stud', 'frame'], line: 'Galvanized tubes, drilled at the ferrules’ intervals.', from: 0, to: CASTING.plates[1] },
  { name: 'Mould', head: ['The', 'mould'], line: 'CNC-routed timber, the cornice’s face as its cavity.', from: CASTING.mould[0], to: CASTING.mould[1] },
  { name: 'Spray-up', head: ['Sprayed,', 'stitched'], line: 'Concrete sprayed. RTARIUM cut to the profile and stitched.', from: CASTING.face[0], to: CASTING.back[1] },
  { name: 'Frame onto skin', head: ['Frame', 'onto skin'], line: 'Set on the ferrule inserts and locked.', from: CASTING.lock[0], to: CASTING.lock[1] },
  { name: 'Cure and pack', head: ['Cured,', 'packed'], line: 'A controlled cure, then a pallet for the road.', from: CASTING.cure[0], to: CASTING.pack[1] },
]
const N = STEPS.length
/** where each step of the bar takes you: each step done */
const HOLDS = [CASTING.plates[1], CASTING.mould[1], CASTING.back[1], CASTING.lock[1], CASTING.pack[1]].map((p) => p + 0.012)

/** screens of scroll the box holds for while the casting plays */
const RUN = 8

type Rect = [number, number, number, number]
interface Layout {
  words: Rect
  bar: Rect
  view: Rect
  fold: Rect
}
/** wide: the words and the bar on the left, the black box the right column; it folds into the bottom right corner */
const WIDE: Layout = { words: [0, 0, 0.4, 0.82], bar: [0, 0.82, 0.4, 0.18], view: [0.4, 0, 0.6, 1], fold: [1, 0, 0, 1] }
/** narrow: the words over the black box over the bar */
const NARROW: Layout = { words: [0, 0, 1, 0.3], bar: [0, 0.84, 1, 0.16], view: [0, 0.3, 1, 0.54], fold: [0, 1, 1, 0] }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const mix = (a: Rect, b: Rect, t: number): Rect => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]
/** the barrier's timings for the box (p: 1 the stage at the foot of the screen, 0 held, −1 gone) */
const OPEN_AT: [number, number] = [0.67, 0.06]
const CLOSING = -0.1
const CLOSED = -0.65

const where = (r: Rect) => ({ '--x': r[0], '--y': r[1], '--w': r[2], '--h': r[3] }) as CSSProperties

export function Cast() {
  const compact = useIsCompact()
  const L = compact ? NARROW : WIDE
  const block = useRef<HTMLElement>(null)
  const stageEl = useRef<HTMLDivElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const viewIn = useRef<HTMLDivElement>(null)
  const rx = useRef<HTMLSpanElement>(null)
  const ry = useRef<HTMLSpanElement>(null)
  const words = useRef<(HTMLDivElement | null)[]>([])
  const count = useRef<HTMLSpanElement>(null)
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const live = useLive(view)
  const [step, setStep] = useState(0)
  const shotAt = useMemo(() => (p: number) => castShot(p, compact), [compact])

  useEffect(() => {
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let eased = -1
    const tick = (time: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (time - last) / 1000))
      last = time
      const b = block.current
      const st = stageEl.current
      if (!b || !st) return
      const vh = window.innerHeight
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      const r = b.getBoundingClientRect()
      const sr = st.getBoundingClientRect()
      // where the stage is: 1 at the foot of the screen, 0 held, −1 gone above; the box opens and folds with it
      const p = (sr.top - navH) / Math.max(1, sr.height)
      const g = reduced ? 1 : p >= 0 ? 1 - ease(clamp01((p - OPEN_AT[1]) / (OPEN_AT[0] - OPEN_AT[1]))) : 1 - ease(clamp01((p - CLOSING) / (CLOSED - CLOSING)))
      // the casting's run, while it is held, eased so a wheel's steps arrive as one glide
      const target = clamp01((navH - r.top) / Math.max(1, r.height - sr.height))
      eased = eased < 0 || reduced ? target : damp(eased, target, 8, dt)
      if (Math.abs(eased - target) < 1e-4) eased = target
      if (progress.value !== eased) {
        progress.value = eased
        progress.listeners.forEach((f) => f())
      }
      const q = eased
      if (sr.bottom > 0 && sr.top < vh) {
        const SW = sr.width
        const SH = sr.height
        const cell = view.current
        const inner = viewIn.current
        if (cell && inner) {
          const [x, y, w, h] = mix(L.fold, L.view, g)
          cell.style.transform = `translate3d(${(x * SW).toFixed(1)}px, ${(y * SH).toFixed(1)}px, 0)`
          cell.style.width = `${(w * SW).toFixed(1)}px`
          cell.style.height = `${(h * SH).toFixed(1)}px`
          cell.style.visibility = w * h > 1e-5 ? 'visible' : 'hidden'
          inner.style.width = `${(L.view[2] * SW).toFixed(1)}px`
          inner.style.height = `${(L.view[3] * SH).toFixed(1)}px`
          inner.style.transform = `translate3d(${((L.view[0] - x) * SW).toFixed(1)}px, ${((L.view[1] - y) * SH).toFixed(1)}px, 0)`
          if (rx.current) rx.current.textContent = `X: ${Math.round(w * SW)}`
          if (ry.current) ry.current.textContent = `Y: ${Math.round(h * SH)}`
        }
      }
      // the words: each step's in where the last one's were; the bar fills; the count follows
      let now = 0
      STEPS.forEach((s, k) => {
        if (q >= s.from - 0.02) now = k
        const next = STEPS[k + 1]
        const inn = k === 0 ? 1 : smooth(s.from - 0.03, s.from + 0.01, q)
        const out = next ? smooth(next.from - 0.035, next.from - 0.005, q) : 0
        const vis = inn * (1 - out)
        const w = words.current[k]
        if (w) {
          w.style.opacity = vis.toFixed(3)
          w.style.visibility = vis > 0.004 ? '' : 'hidden'
          w.toggleAttribute('inert', vis < 0.5)
          if (!reduced) w.style.transform = `translate3d(0, ${(q < s.from + 0.01 ? (1 - vis) * 14 : -(1 - vis) * 10).toFixed(2)}px, 0)`
        }
        const c = cells.current[k]
        if (c) {
          c.style.setProperty('--f', smooth(s.from, s.to, q).toFixed(4))
          c.style.setProperty('--c', (next ? smooth(next.from - 0.03, next.from + 0.005, q) : 0).toFixed(4))
        }
      })
      setStep(now)
      if (count.current) count.current.textContent = `0${now + 1}`
      if (eased !== target) raf = requestAnimationFrame(tick)
    }
    const kick = () => {
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    kick()
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', kick)
    return () => {
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', kick)
      cancelAnimationFrame(raf)
    }
  }, [progress, L])

  const go = (k: number) => {
    const b = block.current
    const st = stageEl.current
    if (!b || !st) return
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
    scrollToY(b.getBoundingClientRect().top + window.scrollY - navH + (b.offsetHeight - st.offsetHeight) * HOLDS[k])
  }

  return (
    <section id="casting" className="fr-bw" aria-labelledby="fs-cast-title">
      <article ref={block} className="fr-bw__block" style={{ '--k': 0, '--run': RUN } as CSSProperties}>
        <div ref={stageEl} className="fr-bw__stage">
          <div className="fr-bw__words" style={where(L.words)}>
            <div className="fr-bw__top">
              <h2 id="fs-cast-title" className="fr-kicker">
                Cast in five steps
              </h2>
              <p className="fr-count num" aria-hidden="true">
                <span ref={count}>01</span> <span>/ 0{N}</span>
              </p>
            </div>
            <div className="fr-bw__beat fs-beats">
              {STEPS.map((s, k) => (
                <div key={s.name} ref={(el) => void (words.current[k] = el)} className="fs-beat" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
                  <h3 className="fr-name">
                    {s.head[0]} <br />
                    {s.head[1]}
                  </h3>
                  <p className="fr-say">{s.line}</p>
                  {k === 2 && <ReviewNote>{REVIEW.skin}</ReviewNote>}
                </div>
              ))}
            </div>
          </div>
          <div className="fr-bw__words fs-steps" style={where(L.bar)}>
            <StepBar label="How a stud frame element is cast" names={STEPS.map((s) => s.name)} step={step} onGo={go} cellRef={(k, el) => void (cells.current[k] = el)} />
          </div>

          <div ref={view} className="fr-bw__box fr-bw__box--view" style={{ visibility: 'hidden' }}>
            <div ref={viewIn} className="fr-bw__in">
              <div className="fr-bw__win">
                <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/mesh-on-face-coat.webp" alt="" />}>
                  <ScrubRig progress={progress} shotAt={shotAt} sway={0.6} live={live} aspect={1.25} />
                  <CastScene progress={progress} live={live} />
                  <FollowScroll progress={progress} />
                </Stage3D>
              </div>
            </div>
            <i className="fr-bw__dot" aria-hidden="true">
              <span ref={rx} className="fr-bw__x num" />
              <span ref={ry} className="fr-bw__y num" />
            </i>
          </div>
        </div>
      </article>
    </section>
  )
}
