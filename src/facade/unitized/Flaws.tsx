import { useEffect, useMemo, useRef, useState } from 'react'
import { useIsCompact } from '../../lib/motion'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../three/Stage3D'
import { createBus } from '../three/kit'
import { FollowScroll, smooth, usePlay } from '../progress'
import { FlawPanel, type FlawMix } from '../three/unit/FlawPanel'
import { useLive } from './live'

/**
 * Four problems of thin precast panels, on black, on one screen. On the left the title and all four
 * problems, read at a glance; on the right the conventional panel standing in the open under a soft
 * light. As the section comes in the panel plays each problem out in turn, on its own clock (the crack
 * opens, the fibres clump, the fixing pulls out, the panel grows), the problem it is showing lit in the
 * list; the page is never held. Pointing at a problem shows it at once, a click stays on it, and the
 * panel turns under the cursor, which a quiet nudge beside it says.
 */

const FLAWS = [
  { name: 'Direction weakness', line: 'Fibres settle in one direction. Load the panel across them and it cracks first.' },
  { name: 'Clumping', line: 'Loose fibre bunches together. Between the bunches, nothing reinforces the panel.' },
  { name: 'Isolated anchorage', line: 'Each fixing holds on a small cone of concrete.' },
  { name: 'Length to weight ratio', line: 'A longer panel has to be thicker and heavier.' },
]

const LABELS: LabelSpec[] = [
  { id: 'l0', anchor: 'f-crack', text: 'Crack along the fibres', dx: -56, dy: -78 },
  { id: 'l1', anchor: 'f-bare', text: 'Bare zone', dx: 60, dy: 70 },
  { id: 'l2', anchor: 'f-cone', text: 'Pull-out cone', dx: 60, dy: -66 },
  { id: 'l3', anchor: 'f-edge', text: 'Thicker, heavier', dx: 56, dy: 56 },
]
/** seconds for the four to play out */
const PLAY = 15
/**
 * The play as a count of problems: `u` goes from U0 to U1. Problem k comes in over k - 0.5 .. k - 0.2
 * (the panel turns to it) and is played out over k - 0.15 .. k + 0.35.
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
  const [progress, seek] = usePlay(section, PLAY)
  const [hover, setHover] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  /** the problem whose label is up: the current one once it has played out */
  const [lit, setLit] = useState<number | null>(null)
  /** the nudge goes once the panel has been turned */
  const [turned, setTurned] = useState(false)
  const bus = useMemo(createBus, [])
  const live = useLive(stage)
  const drag = useRef(0)
  const mix = useRef<FlawMix>({ w: [1, 0, 0, 0], act: [0, 0, 0, 0] })
  const shown = hover ?? active

  useEffect(() => {
    const paint = () => {
      const f = flawsAt(progress.value)
      mix.current.w = f.w
      mix.current.act = f.act
      let now = 0
      f.x.forEach((v, k) => v >= 0.5 && (now = k))
      setActive(now)
      // a problem's label is up once it has played out, and only while it is the whole of what is
      // shown: it goes as the next one starts to come in, before the camera swings round the panel
      setLit(f.act[now] > 0.6 && f.w[now] > 0.98 ? now : null)
    }
    paint()
    progress.listeners.add(paint)
    return () => void progress.listeners.delete(paint)
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
      setTurned(true)
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

  /** to where problem k has played out, and there it stays */
  const go = (k: number) => seek((k + 0.4 - U0) / (U1 - U0))

  return (
    <section ref={section} id="problems" className="fu-flaws on-black" aria-labelledby="fu-flaws-title">
      <div className="fu-flaws__pin">
        {/* the panel on an open stage, under a soft light */}
        <div ref={stage} className="fu-flaws__stage" role="img" aria-label={`A conventional thin panel showing ${FLAWS[shown].name.toLowerCase()}`}>
          <Stage3D shadows keyLight={false}>
            <MovingKeyLight focus={[0, 0, 0]} reach={1.6} />
            <FlawPanel mix={mix} hover={hover} drag={drag} bus={bus} live={live} compact={compact} />
            <FollowScroll progress={progress} />
            <LabelProjector bus={bus} bottom={compact ? 24 : 60} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={hover !== null ? [`l${hover}`] : lit !== null ? [`l${lit}`] : []} />
        </div>

        <div className="fu-flaws__copy">
          <h2 id="fu-flaws-title" className="fu-flaws__title">
            Four problems
            <br /> with thin panels.
          </h2>
          <ol className="fu-flaw-list" aria-label="The four problems">
            {FLAWS.map((f, i) => (
              <li key={f.name} className="fu-flaw" data-now={i === shown || undefined}>
                <button
                  type="button"
                  className="fu-flaw__btn"
                  aria-current={i === shown ? 'step' : undefined}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => go(i)}
                >
                  <span className="fu-flaw__num num">0{i + 1}</span>
                  <span className="fu-flaw__name">{f.name}</span>
                  <span className="fu-flaw__line">{f.line}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* the one thing to do here, as a nudge */}
        <p className={`fu-nudge ${turned ? 'is-gone' : ''}`} aria-hidden="true">
          <svg viewBox="0 0 22 12" width="22" height="12">
            <path d="M6 1.5 1.5 6 6 10.5M16 1.5 20.5 6 16 10.5M2 6h18" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Drag to turn
        </p>
      </div>
    </section>
  )
}
