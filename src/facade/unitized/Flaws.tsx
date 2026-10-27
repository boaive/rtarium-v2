import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus } from '../three/kit'
import { FollowScroll, smooth, useScrollProgress } from '../progress'
import { FlawPanel, type FlawMix } from '../three/unit/FlawPanel'
import { useLive } from './live'
import { paintCards } from './stack'

/**
 * Four problems of thin precast panels (the existing technology), on black. Pinned for its run: on
 * the left the title, the problems as sticky stacking cards and a meter of the four; on the right the
 * conventional panel standing in the open on a dark stage under a soft light, with the title block of
 * what is shown under it (existing technology, the problem, how to look). Everything follows the
 * scroll: a problem's card comes up from the foot of the cards' box over the last one, whose heading
 * stays in view, struck through, as the stack fans back; the panel turns to the new problem at the
 * same time, and once the card is in place the panel plays it out (the crack opens, the fibres clump,
 * the fixing pulls out, the panel grows). A heading takes you back to its problem; pointing at one
 * shows it on the panel without moving the page; dragging turns the panel.
 */

const FLAWS = [
  { name: 'Direction weakness', line: 'Fibres lie one way. Across them, the panel cracks.' },
  { name: 'Clumping', line: 'Loose fibre bunches up and leaves weak, bare zones.' },
  { name: 'Isolated anchorage', line: 'Each fixing holds on a small cone of concrete.' },
  { name: 'Length to weight ratio', line: 'A longer panel has to be thicker, and heavier.' },
]

const LABELS: LabelSpec[] = [
  { id: 'l0', anchor: 'f-crack', text: 'Crack along the fibres', dx: -56, dy: -78 },
  { id: 'l1', anchor: 'f-bare', text: 'Bare zone', dx: 60, dy: 70 },
  { id: 'l2', anchor: 'f-cone', text: 'Pull-out cone', dx: 60, dy: -66 },
  { id: 'l3', anchor: 'f-edge', text: 'Thicker, heavier', dx: 56, dy: 56 },
]
const RUN = 4.6
/**
 * The run as a count of problems: `u` goes from U0 when the section settles to U1 as it leaves.
 * Problem k comes in over k - 0.5 .. k - 0.2 (its card and the panel's turn together), and is played
 * out over k - 0.15 .. k + 0.35, its card already in place. The first plays out once the page has
 * settled on the section, never while it is still coming up.
 */
const U0 = -0.45
const U1 = 3.55

function flawsAt(p: number): FlawMix & { x: number[]; u: number } {
  const u = U0 + (U1 - U0) * p
  const x = FLAWS.map((_, k) => (k === 0 ? 1 : smooth(k - 0.5, k - 0.2, u)))
  const w = x.map((v, k) => v - (x[k + 1] ?? 0))
  const act = FLAWS.map((_, k) => (k === 0 ? smooth(-0.3, 0.2, u) : smooth(k - 0.15, k + 0.35, u)))
  return { x, w, act, u }
}

export function Flaws() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [progress] = useScrollProgress(section, 1, 'run')
  const [hover, setHover] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  /** the problem whose label is up: the current one once it has played out */
  const [lit, setLit] = useState<number | null>(null)
  const bus = useMemo(createBus, [])
  const live = useLive(stage)
  const drag = useRef(0)
  const mix = useRef<FlawMix>({ w: [1, 0, 0, 0], act: [0, 0, 0, 0] })
  const deck = useRef<HTMLOListElement>(null)
  const cards = useRef<(HTMLLIElement | null)[]>([])
  const marks = useRef<(HTMLSpanElement | null)[]>([])
  const cue = useRef<HTMLParagraphElement>(null)
  const shown = hover ?? active

  // the cards, the meter, the panel and the way on all follow the run
  useEffect(() => {
    const paint = () => {
      const f = flawsAt(progress.value)
      mix.current.w = f.w
      mix.current.act = f.act
      paintCards(deck.current, cards.current, f.x)
      let now = 0
      f.x.forEach((v, k) => v >= 0.5 && (now = k))
      cards.current.forEach((c, k) => c?.toggleAttribute('data-current', k === now))
      marks.current.forEach((m, k) => m?.style.setProperty('--f', f.x[k].toFixed(4)))
      setActive(now)
      // a problem's label is up once it has played out, and only while it is the whole of what is
      // shown: it goes as the next one starts to come in, before the camera swings round the panel
      setLit(f.act[now] > 0.6 && f.w[now] > 0.98 ? now : null)
      if (cue.current) {
        const c = smooth(3.1, 3.4, f.u)
        cue.current.style.opacity = c.toFixed(3)
        cue.current.style.transform = `translateY(${((1 - c) * 8).toFixed(2)}px)`
      }
    }
    paint()
    progress.listeners.add(paint)
    window.addEventListener('resize', paint)
    return () => {
      progress.listeners.delete(paint)
      window.removeEventListener('resize', paint)
    }
  }, [progress])

  // dragging turns the panel; it keeps the turn it was given
  useEffect(() => {
    const el = stage.current
    if (!el) return
    let x0: number | null = null
    const down = (e: PointerEvent) => {
      x0 = e.clientX
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (x0 === null) return
      drag.current = Math.max(-70, Math.min(70, drag.current + (e.clientX - x0) * 0.3))
      x0 = e.clientX
    }
    const up = () => void (x0 = null)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [])

  /** takes the page to where problem k has played out, its card still in place */
  const go = (k: number) => {
    const el = section.current
    if (!el) return
    const p = (k + 0.4 - U0) / (U1 - U0)
    scrollToY(el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * p)
  }

  return (
    <section ref={section} id="problems" className="fu-flaws on-black" aria-labelledby="fu-flaws-title" style={{ '--run': RUN } as CSSProperties}>
      <div className="fu-flaws__pin">
        {/* the panel on an open stage, under a soft light */}
        <div ref={stage} className="fu-flaws__stage" role="img" aria-label={`A conventional thin panel showing ${FLAWS[shown].name.toLowerCase()}`}>
          <Stage3D shadows keyLight={false}>
            <MovingKeyLight focus={[0, 0, 0]} reach={1.6} />
            <FlawPanel mix={mix} hover={hover} drag={drag} bus={bus} live={live} compact={compact} />
            <FollowScroll progress={progress} />
            <LabelProjector bus={bus} bottom={compact ? 24 : 200} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={hover !== null ? [`l${hover}`] : lit !== null ? [`l${lit}`] : []} />
        </div>

        <div className="fu-flaws__copy">
          <h2 id="fu-flaws-title" className="fu-flaws__title">
            Four problems
            <br /> with thin panels.
          </h2>
          {/* one at a time: each problem's card comes up over the last, whose heading stays, struck through */}
          <ol ref={deck} className="fu-deck fu-deck--flaws" aria-label="The four problems" style={{ '--n': FLAWS.length } as CSSProperties}>
            {FLAWS.map((f, i) => (
              <li key={f.name} ref={(el) => void (cards.current[i] = el)} className="fu-card" style={{ zIndex: i + 1 }}>
                <button
                  type="button"
                  className="fu-card__btn"
                  aria-current={i === active ? 'step' : undefined}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && i !== active && setHover(i)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                  onFocus={() => i !== active && setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => go(i)}
                >
                  <span className="fu-card__head">
                    <span className="fu-card__count num">
                      <b>0{i + 1}</b> / 04
                    </span>
                    <span className="fu-card__name">
                      {f.name}
                      <i className="fu-card__strike" aria-hidden="true" />
                    </span>
                  </span>
                  <span className="fu-card__body">{f.line}</span>
                </button>
              </li>
            ))}
          </ol>
          {/* how far through the four: a mark per problem, filling as it comes in */}
          <div className="fu-meter" aria-hidden="true">
            {FLAWS.map((f, i) => (
              <span key={f.name} ref={(el) => void (marks.current[i] = el)} className="fu-meter__mark" />
            ))}
            <span className="fu-meter__count num">
              <b>0{active + 1}</b> / 04
            </span>
          </div>
        </div>

        <p ref={cue} className="fu-flaws__next" aria-hidden={active !== FLAWS.length - 1}>
          Scroll to see how RTARIUM overcomes them
        </p>

        {/* what is shown: the existing technology, the problem, how to look at it */}
        <dl className="fu-block" aria-live="polite">
          <div className="fu-block__row">
            <dt>Existing technology</dt>
            <dd>Conventional thin panel</dd>
          </div>
          <div className="fu-block__row fu-block__row--now">
            <dt>Problem</dt>
            <dd>{FLAWS[shown].name}</dd>
          </div>
          <div className="fu-block__row fu-block__hint">
            <dt>Model</dt>
            <dd>Drag to turn</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
