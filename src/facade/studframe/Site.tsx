import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D } from '../three/Stage3D'
import { ScrubRig } from '../three/ScrubRig'
import { FollowScroll, smooth, type Progress } from '../progress'
import { SiteScene, siteShot, type SiteAxis } from '../three/stud/SiteScene'
import { DetailScene, detailShot } from '../three/stud/DetailScene'
import { DETAIL_OPEN } from '../three/stud/site'
import { StepBar } from '../unitized/StepBar'

/**
 * On site, in the stage of the rainscreen's "RTARIUM bridges the gap" (the Unitized answers' stage,
 * `fu-ans`): on yellow, one pinned screen, the words always in one place on the left, the 3D in the room
 * right of them and on their line, the bar along the foot. A step's words come in where the last ones
 * were (a fade and a short settle), and the scene plays the step out; the scroll is the clock. The block
 * is seen whole; as the element comes down to its place, the joint opens in close in a box of its own
 * over the room (the Unitized page's box, out of its corner, its size read out), and the rest is told
 * there: the lock, RTARIUM seen through, the levelling, the sealant.
 */

interface Step {
  id: string
  name: string
  head: [string, string]
  line: string
}
const STEPS: Step[] = [
  { id: 'site', name: 'To site', head: ['To', 'site'], line: 'Wrapped on its pallet, craned onto the truck.' },
  { id: 'lift', name: 'Lifted on', head: ['Lifted', 'on'], line: 'By its frame, onto two L frames on the building.' },
  { id: 'lock', name: 'Locked from the top', head: ['Locked from', 'the top'], line: 'Angles come down over its frame.' },
  { id: 'level', name: 'Levelled', head: ['Levelled', 'to the mm'], line: 'Bolts turned until its faces run on from the next.' },
  { id: 'seal', name: 'Sealed', head: ['Sealed', 'tight'], line: 'Airtight and watertight, against sandstorms and driving rain.' },
]
const N = STEPS.length

/** screens of scroll for each step */
const STRETCH = [1.7, 1.7, 1.4, 1.4, 1.7]
const RUN = STRETCH.reduce((a, b) => a + b, 0)
const START = STRETCH.map((_, k) => STRETCH.slice(0, k).reduce((a, b) => a + b, 0))

/** the run, in screens scrolled into the pin, as steps: step k over k..k+1 */
function stepAt(s: number) {
  if (s <= 0) return 0
  for (let k = 0; k < N; k++) if (s < START[k] + STRETCH[k]) return k + (s - START[k]) / STRETCH[k]
  return N - 1e-4
}
/** how far step k's words are in (0..1), at `t` */
function wordsAt(k: number, t: number) {
  const f = t - k
  if (f < 0) return 0
  const inn = k === 0 ? 1 : smooth(0, 0.14, f)
  const out = k === N - 1 ? 0 : smooth(0.86, 0.98, f)
  return inn * (1 - out)
}
/** scrolls to where step k has played out, its words still in place */
function goToStep(k: number) {
  const el = document.getElementById('site')
  if (!el) return
  const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.97 : 0.8)
  scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight)
}

export function Site() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const words = useRef<(HTMLDivElement | null)[]>([])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  /** the run, 0..1 (a fifth for each step), told to the scene */
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const live = useRef(false)
  const [step, setStep] = useState(0)
  /** where the scene stands, from the layout: the middle of the room right of the words, on their line */
  const axis = useRef<SiteAxis>({ x: 0.64, y: 0.5 })
  const shotAt = useMemo(() => (p: number) => siteShot(p, compact, axis.current), [compact])
  const detail = useRef<HTMLDivElement>(null)
  const rx = useRef<HTMLSpanElement>(null)
  const ry = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const w = room.current?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !w || !bar || !p.width || !p.height) return
      axis.current = compact ? { x: 0.5, y: 0.38 } : { x: ((w.right + bar.right) / 2 - p.left) / p.width, y: (w.top + w.height / 2 - p.top) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    const el = stage.current
    const io = el ? new IntersectionObserver(([e]) => void (live.current = e.isIntersecting)) : null
    if (el) io?.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      io?.disconnect()
    }
  }, [compact])

  useEffect(() => {
    const el = section.current
    if (!el) return
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let p = -1
    const place = () => {
      STEPS.forEach((_, k) => {
        const f = p - k
        const w = words.current[k]
        if (w) {
          const vis = wordsAt(k, p)
          w.style.opacity = vis.toFixed(3)
          w.style.visibility = vis > 0.004 ? '' : 'hidden'
          w.toggleAttribute('inert', vis < 0.5)
          if (!reduced) {
            const y = f < 0.5 ? (1 - vis) * 14 : -(1 - vis) * 10
            w.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
            w.style.filter = vis > 0.995 ? '' : `blur(${((1 - vis) * 5).toFixed(2)}px)`
          }
        }
        // the bar: the current cell fills as its step plays; a passed one closes to its number
        const c = cells.current[k]
        if (c) {
          c.style.setProperty('--f', Math.min(1, Math.max(0, f / 0.94)).toFixed(4))
          c.style.setProperty('--c', (k < N - 1 ? smooth(0.9, 1, f) : 0).toFixed(4))
        }
      })
    }
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const target = stepAt(-el.getBoundingClientRect().top / window.innerHeight)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      const v = p / N
      if (progress.value !== v) {
        progress.value = v
        progress.listeners.forEach((f) => f())
      }
      place()
      // the joint's box: out of its corner as the element comes down to its place
      const box = detail.current
      if (box) {
        const k = reduced ? Number(v > DETAIL_OPEN[0]) : smooth(DETAIL_OPEN[0], DETAIL_OPEN[1], v)
        box.style.setProperty('--k', k.toFixed(4))
        box.style.visibility = k > 0.002 ? '' : 'hidden'
        if (rx.current) rx.current.textContent = `X: ${Math.round(box.offsetWidth * k)}`
        if (ry.current) ry.current.textContent = `Y: ${Math.round(box.offsetHeight * k)}`
      }
      setStep(Math.min(N - 1, Math.max(0, Math.floor(p))))
      if (p !== target) raf = requestAnimationFrame(tick)
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
  }, [progress])

  return (
    <section ref={section} id="site" className="fu-ans on-yellow" aria-labelledby="fs-site-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div ref={stage} className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-back.webp" alt="" />}>
            <ScrubRig progress={progress} shotAt={shotAt} sway={0.6} live={live} aspect={compact ? 0.75 : undefined} />
            <SiteScene progress={progress} live={live} compact={compact} axis={axis} />
            <FollowScroll progress={progress} />
          </Stage3D>
        </div>

        {/* the joint in close, in its own box over the room */}
        <div ref={detail} className="fu-box fs-detail" aria-hidden="true" style={{ visibility: 'hidden' }}>
          <div className="fu-box__clip on-black">
            <Stage3D shadows keyLight={false}>
              <ScrubRig progress={progress} shotAt={detailShot} sway={0.5} live={live} aspect={1.1} />
              <DetailScene progress={progress} live={live} />
              <FollowScroll progress={progress} />
            </Stage3D>
          </div>
          <i className="fu-box__dot" aria-hidden="true">
            <span ref={rx} className="fu-box__x num" />
            <span ref={ry} className="fu-box__y num" />
          </i>
        </div>

        <h2 id="fs-site-title" className="fu-ans__title">
          On site
        </h2>

        <div ref={room} className="fu-ans__words">
          {STEPS.map((s, k) => (
            <div key={s.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
              <h3 className="fu-ans__name">
                {s.head[0]} <br />
                {s.head[1]}
              </h3>
              <p className="fu-ans__line">{s.line}</p>
            </div>
          ))}
        </div>

        <StepBar label="How a stud frame element goes onto the building" names={STEPS.map((s) => s.name)} step={step} onGo={goToStep} cellRef={(k, el) => void (cells.current[k] = el)} />
      </div>
    </section>
  )
}
