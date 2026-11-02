import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { Arrow } from '../facade/Shell'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus } from '../facade/three/kit'
import { smooth, type Progress } from '../facade/progress'
import { PieceStage, RUN_AT } from './three/PieceStage'
import type { Room } from './three/fit'
import { Block, Figures, Sheet, Steps, useSheet } from './Sheet'
import { PanelPlan, Section100, Section30, TiePlate } from './Diagrams'
import { PAIRED, REVIEW, SOLID } from './content'

/**
 * The panels, on yellow, pinned: one piece of panel standing in the room right of its build-up. On the left, its name
 * and thickness, and every part of it in a numbered list; on the 3D, each part's number. As the page scrolls the panel
 * bursts (its layers apart through its depth, the outermost first, the camera coming round to its side) and its parts
 * are marked one by one, each row of the list lighting as its number comes up on the model; it closes; it divides,
 * takes its core and joins as the 100 mm SIP panel, and bursts and is marked the same way. The scroll is the clock:
 * never held, never taken over. One line of figures and the way to its technical sheet stand at the foot.
 */

interface Part {
  /** the model's anchor */
  id: string
  name: string
  value: string
  /** where its number stands from its point (px) */
  dx: number
  dy: number
}
const PARTS30: Part[] = [
  { id: 'pp-cover', name: 'Cover, inner face', value: '7.5 mm', dx: 26, dy: -30 },
  { id: 'pp-tie', name: 'Tie hole, to bolt through', value: 'Fixing', dx: -34, dy: 30 },
  { id: 'pp-ferrule', name: 'Ferrule insert, on the mesh', value: 'M8', dx: 30, dy: -34 },
  { id: 'pp-zone', name: 'RTARIUM, 3D basalt mesh', value: '15 mm', dx: 34, dy: -40 },
  { id: 'pp-grp', name: 'GRP grid, at its mid-plane', value: '3 mm', dx: 36, dy: 34 },
  { id: 'pp-tongue', name: 'Tongue and recess, four sides', value: '15 mm', dx: 34, dy: 24 },
  { id: 'pp-back', name: 'Cover, outer face', value: '7.5 mm', dx: -32, dy: -34 },
]
const PARTS100: Part[] = [
  { id: 'pp-inner7', name: 'Cover, inner face', value: '7 mm', dx: 26, dy: -32 },
  { id: 'pp-ferrule100', name: 'Ferrule insert', value: 'M8', dx: 30, dy: -34 },
  { id: 'pp-mesh6i', name: 'RTARIUM, 3D basalt mesh', value: '6 mm', dx: 32, dy: -36 },
  { id: 'pp-rod', name: 'GRP rods, through the clips', value: '3 mm', dx: 32, dy: 34 },
  { id: 'pp-cover2', name: 'Cover', value: '2 mm', dx: 30, dy: -32 },
  { id: 'pp-core', name: 'EPS/SPS core, stay-in-place', value: '70 mm', dx: 0, dy: -40 },
  { id: 'pp-clip', name: 'GI tie-clip', value: '2 mm plate', dx: -34, dy: -28 },
  { id: 'pp-recess', name: 'Male / female recess', value: '20 mm', dx: -34, dy: 30 },
  { id: 'pp-outer', name: 'Outer leaf: 2 + 6 + 7', value: '15 mm', dx: -30, dy: -34 },
]
const LABELS: LabelSpec[] = [
  ...PARTS30.map((p, i) => ({ id: `a${i}`, anchor: p.id, text: null, num: i + 1, dx: p.dx, dy: p.dy })),
  ...PARTS100.map((p, i) => ({ id: `b${i}`, anchor: p.id, text: null, num: i + 1, dx: p.dx, dy: p.dy })),
]
/** screens of scroll the section runs for: every stretch of it moves the panel, the strip or the list */
const RUN = 7.5

/** how far through a run of marks we are: the k-th of n comes up at its share */
const markAt = ([a, b]: readonly [number, number], n: number, k: number, p: number) => smooth(a + ((b - a) * k) / n, a + ((b - a) * (k + 0.35)) / n, p)

export function Panels() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const side = useRef<HTMLDivElement>(null)
  const foot = useRef<HTMLDivElement>(null)
  const rows30 = useRef<(HTMLLIElement | null)[]>([])
  const rows100 = useRef<(HTMLLIElement | null)[]>([])
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const [shown, setShown] = useState<string[]>([])
  const [focus, setFocus] = useState<string | null>(null)
  const [which, setWhich] = useState<30 | 100>(30)
  /** the room the piece keeps to: right of the build-up, under the header, over the foot */
  const room = useRef<Room>({ x: 0.42, y: 0.16, w: 0.54, h: 0.66 })
  const [solidSheet, openSolid] = useSheet()
  const [sipSheet, openSip] = useSheet()

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const sd = side.current?.getBoundingClientRect()
      const ft = foot.current?.getBoundingClientRect()
      if (!p || !sd || !ft || !p.width || !p.height) return
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      if (compact) {
        // a phone: the piece between the name and the part being marked
        const name = side.current?.querySelector('.wp-panels__thick')?.getBoundingClientRect()
        const y0 = (name?.bottom ?? p.top + p.height * 0.25) + 24
        const y1 = sd.bottom - 44
        room.current = { x: 0.04, y: (y0 - p.top) / p.height, w: 0.92, h: Math.max(0.2, (y1 - y0) / p.height) }
        return
      }
      const x0 = sd.right + 48
      const y0 = p.top + navH + 16
      const y1 = ft.top - 20
      room.current = { x: (x0 - p.left) / p.width, y: (y0 - p.top) / p.height, w: (p.right - x0 - 28) / p.width, h: (y1 - y0) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [compact])

  useEffect(() => {
    const el = section.current
    if (!el) return
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let p = -1
    const A = RUN_AT
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const r = el.getBoundingClientRect()
      const target = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)))
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      if (t.value !== p) {
        t.value = p
        t.listeners.forEach((f) => f())
      }
      // the name and its thickness change over as the panel divides and takes its core
      const to100 = smooth(A.divide[0], A.core[1], p)
      el.style.setProperty('--to100', to100.toFixed(4))
      setWhich(to100 > 0.5 ? 100 : 30)
      // the list: its rows come in with the burst, and each lights as its number comes up on the model
      const on: string[] = []
      let now30 = -1
      let now100 = -1
      const rows = (list: Part[], refs: (HTMLLIElement | null)[], marks: readonly [number, number], come: readonly [number, number], go: number) => {
        let latest = -1
        list.forEach((_, k) => {
          const row = refs[k]
          const m = markAt(marks, list.length, k, p) * (1 - smooth(go, go + 0.03, p))
          if (m > 0.5) latest = k
          if (row) {
            row.style.setProperty('--in', (smooth(come[0] + k * 0.006, come[1] + k * 0.006, p) * (1 - smooth(go, go + 0.04, p))).toFixed(4))
            row.style.setProperty('--on', m.toFixed(4))
          }
        })
        return latest
      }
      now30 = rows(PARTS30, rows30.current, A.marks30, A.burst30, A.close30[0])
      now100 = rows(PARTS100, rows100.current, A.marks100, A.burst100, A.close100[0])
      for (let k = 0; k <= now30; k++) on.push(`a${k}`)
      for (let k = 0; k <= now100; k++) on.push(`b${k}`)
      rows30.current.forEach((row, k) => row?.toggleAttribute('data-now', k === now30))
      rows100.current.forEach((row, k) => row?.toggleAttribute('data-now', k === now100))
      setShown((s) => (s.join() === on.join() ? s : on))
      const f = now100 >= 0 ? `b${now100}` : now30 >= 0 ? `a${now30}` : null
      setFocus((x) => (x === f ? x : f))
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
  }, [t])

  const list = (parts: Part[], refs: { current: (HTMLLIElement | null)[] }, cls: string, hidden: boolean) => (
    <ol className={`wp-parts ${cls}`} aria-hidden={hidden}>
      {parts.map((p, i) => (
        <li key={p.id} ref={(el) => void (refs.current[i] = el)} className="wp-parts__row">
          <span className="wp-parts__num num">{String(i + 1).padStart(2, '0')}</span>
          <span className="wp-parts__name">{p.name}</span>
          <span className="wp-parts__value">{p.value}</span>
        </li>
      ))}
    </ol>
  )

  return (
    <>
      <section ref={section} id="panels" className="wp-panels on-yellow" aria-labelledby="wp-panels-title" style={{ '--run': RUN } as CSSProperties}>
        <div ref={pin} className="wp-panels__pin">
          <div className="wp-panels__stage" aria-hidden="true">
            <Stage3D shadows keyLight={false}>
              <PieceStage t={t} bus={bus} room={room} />
              <LabelProjector bus={bus} bottom={compact ? 140 : 110} />
            </Stage3D>
            <Labels bus={bus} labels={LABELS} shown={shown} focus={focus} />
          </div>

          <div ref={side} className="wp-panels__side">
            <h2 id="wp-panels-title" className="wp-panels__name">
              <span className="wp-panels__a">{SOLID.name}</span>
              <span className="wp-panels__b" aria-hidden={which === 30}>
                {PAIRED.name}
              </span>
            </h2>
            <p className="wp-panels__thick num">
              <span className="wp-panels__a">30 mm</span>
              <span className="wp-panels__b">100 mm</span>
            </p>
            <div className="wp-panels__lists">
              {list(PARTS30, rows30, 'wp-panels__a', which !== 30)}
              {list(PARTS100, rows100, 'wp-panels__b', which !== 100)}
            </div>
          </div>

          <div ref={foot} className="wp-panels__foot">
            <p className="wp-panels__figs">
              <span className="wp-panels__a">70 kg/m² · 125 kg per point · M8 ferrules</span>
              <span className="wp-panels__b">74 kg/m² · 72 kg per point · EPS/SPS core</span>
            </p>
            <button type="button" className="fc-go wp-go" onClick={which === 30 ? openSolid : openSip}>
              <span className="fc-go__label">View all details</span>
              <span className="fc-go__cell" aria-hidden="true">
                <Arrow />
              </span>
            </button>
          </div>
        </div>
      </section>

      <Sheet dialog={solidSheet} kicker="Technical details" title={`${SOLID.name}, ${SOLID.thick} mm`}>
        <div className="wp-sheet__grid">
          <Block label="Section">
            <Section30 />
          </Block>
          <div className="wp-sheet__side">
            <Block label="Panel construction">
              <Steps items={SOLID.construction} />
            </Block>
            <Block label="Panel dimensions">
              <Figures rows={SOLID.dimensions} />
            </Block>
            <Block label="Panel dynamics">
              <Figures rows={SOLID.dynamics} />
            </Block>
          </div>
          <Block label="Plan: GRP grid, ferrules, tie holes" wide>
            <PanelPlan kind="solid" />
          </Block>
        </div>
      </Sheet>

      <Sheet dialog={sipSheet} kicker="Technical details" title={`${PAIRED.name}, ${PAIRED.thick} mm`} review={REVIEW.core}>
        <div className="wp-sheet__grid">
          <Block label="Section">
            <Section100 />
          </Block>
          <div className="wp-sheet__side">
            <Block label="Panel construction">
              <Steps items={PAIRED.construction} />
            </Block>
            <Block label="Panel dimensions">
              <Figures rows={PAIRED.dimensions} />
            </Block>
            <Block label="Panel dynamics">
              <Figures rows={PAIRED.dynamics} />
            </Block>
          </div>
          <Block label="Plan: tie-clips, ferrules, tie holes" wide>
            <PanelPlan kind="sip" />
          </Block>
          <Block label="GI tie-clip" wide>
            <TiePlate />
          </Block>
        </div>
      </Sheet>
    </>
  )
}
