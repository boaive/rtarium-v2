import { useEffect, useMemo, useRef, type CSSProperties, type ComponentType, type ReactNode } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D } from '../three/Stage3D'
import { createBus, type LabelBus } from '../three/kit'
import { AnchorScene, DayScene, NightScene } from '../three/stud/ComponentScenes'
import { listingStops, smooth, type Progress } from '../progress'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useLive } from '../unitized/live'
import { Skip } from '../unitized/StepBar'
import { ListingScreen, type ListingPoint } from '../ListingScreen'

/**
 * The design stage: how the skin is held and how it moves through the day, three listings in the
 * rainscreen barrier's grammar and its styles
 * (`rainscreen.css`, `fr-bw`): on yellow, each listing's black 3D box opens out of the right edge as it
 * comes up, the words standing on the yellow beside it; the
 * listing holds for a long, slow stretch of scroll while its 3D makes one move (see `ComponentScenes`),
 * then its boxes fold back into the corner as the next one's open. Each is drawn into a row under the
 * header as it is passed (never struck, a way back); the last as its own listing arrives, so its slot is never left empty. The rows leave
 * with the section.
 */

interface Listing {
  id: string
  row: [string, string]
  head: ReactNode
  Scene: ComponentType<{ t: Progress; bus: LabelBus; live: { current: boolean }; compact: boolean }>
}

const LISTINGS: Listing[] = [
  {
    id: 'anchor',
    row: ['Architectural skin', '16–20 mm'],
    head: (
      <>
        <h3 className="fr-name">
          Fixed on <br />
          flex anchors
        </h3>
        <p className="fr-say">A 16–20 mm concrete skin, held to the steel stud frame by flexible L&#8288;-&#8288;plates.</p>
        <ReviewNote>{REVIEW.skin}</ReviewNote>
      </>
    ),
    Scene: AnchorScene,
  },
  {
    id: 'day',
    row: ['Steel stud frame', 'Flex-anchored'],
    head: (
      <>
        <h3 className="fr-name">
          Expands <br />
          in the heat
        </h3>
        <p className="fr-say">The façade expands in the heat. Flexible L&#8288;-&#8288;plates accommodate the shift.</p>
        <ReviewNote>{REVIEW.heat}</ReviewNote>
      </>
    ),
    Scene: DayScene,
  },
  {
    id: 'night',
    row: ['Cool nights', 'No cracks'],
    head: (
      <>
        <h3 className="fr-name">
          Cools <br />
          at night
        </h3>
        <p className="fr-say">As temperatures fall, the façade contracts and the flexible plates move with it, maintaining a stable, even surface.</p>
      </>
    ),
    Scene: NightScene,
  },
]
const N = LISTINGS.length
/** how many rows a listing's stage stands under: the last leaves its own row's slot empty, so its row is lowered into free space, over nothing */
const under = (k: number, compact = false) => (compact ? k + 1 : k === N - 1 ? N : k)
/* (a phone: each listing's row is its header, there as the listing arrives, so its stage stands under its own row too:
   as the Rainscreen barrier's) */

/** the barrier's timings: screens of scroll per listing, the stretch of its hold in which its 3D plays, the last's row drawn in while it still holds */
const RUN = 3.1
const PLAY: [number, number] = [0.05, 1.75]
const RUN_LAST = 3.25
/**
 * a phone: each listing held a shorter while, its 3D played over the first screen of it, so the page answers the finger
 * as it scrolls freely (held 3 screens a listing, it read as the page locked; the user, 18 Nov 2026)
 */
const PHONE_RUN = 1.8
const PHONE_RUN_LAST = 1.9
const PHONE_PLAY: [number, number] = [0.05, 0.95]
const runOf = (k: number, compact: boolean) => (compact ? (k === N - 1 ? PHONE_RUN_LAST : PHONE_RUN) : k === N - 1 ? RUN_LAST : RUN)
const playOf = (compact: boolean) => (compact ? PHONE_PLAY : PLAY)
const OPENED = 0.3
const CLOSING = -0.1
const CLOSED = -0.65
const FIRST: [number, number] = [0.67, 0.06]

type Rect = [number, number, number, number]
interface Layout {
  words: Rect
  view: Rect
  fold: Rect
}
const WIDE: Layout = {
  words: [0, 0, 0.4, 1],
  view: [0.4, 0, 0.6, 1],
  fold: [1, 0, 0, 1],
}
const NARROW: Layout = {
  words: [0, 0, 1, 0.36],
  view: [0, 0.36, 1, 0.64],
  fold: [0, 1, 1, 0],
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const mix = (a: Rect, b: Rect, t: number): Rect => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]

interface Refs {
  block: (HTMLElement | null)[]
  stage: (HTMLDivElement | null)[]
  view: (HTMLDivElement | null)[]
  viewIn: (HTMLDivElement | null)[]
  rx: (HTMLSpanElement | null)[]
  ry: (HTMLSpanElement | null)[]
  t: Progress[]
}

function ListingView({ item, k, L, compact, refs }: { item: Listing; k: number; L: Layout; compact: boolean; refs: Refs }) {
  const bus = useMemo(createBus, [])
  const view = useRef<HTMLDivElement | null>(null)
  const live = useLive(view)
  const { Scene } = item
  return (
    <article ref={(el) => void (refs.block[k] = el)} className="fr-bw__block" style={{ '--k': under(k, compact), '--run': runOf(k, compact) } as CSSProperties} aria-labelledby={`fs-bw-${item.id}`}>
      <div ref={(el) => void (refs.stage[k] = el)} className="fr-bw__stage">
        <div className="fr-bw__words" style={{ '--x': L.words[0], '--y': L.words[1], '--w': L.words[2], '--h': L.words[3] } as CSSProperties}>
          {/* (a phone: no count over the words, the rows say where it is; the section's line kept for screen readers only) */}
          {compact ? (
            k === 0 && (
              <h2 id="fs-bw-title" className="visually-hidden">
                Built to breathe with the heat
              </h2>
            )
          ) : (
            <div className="fr-bw__top">
              {/* said once, on the first listing */}
              {k === 0 ? (
                <h2 id="fs-bw-title" className="fr-kicker">
                  Built to breathe with the heat
                </h2>
              ) : (
                <span aria-hidden="true" />
              )}
              <p className="fr-count num" aria-hidden="true">
                0{k + 1} <span>/ 0{N}</span>
              </p>
            </div>
          )}
          <div id={`fs-bw-${item.id}`} className="fr-bw__beat">
            {item.head}
          </div>
        </div>

        <div
          ref={(el) => {
            refs.view[k] = el
            view.current = el
          }}
          className="fr-bw__box fr-bw__box--view"
          style={{ visibility: 'hidden' }}
        >
          <div ref={(el) => void (refs.viewIn[k] = el)} className="fr-bw__in">
            <div className="fr-bw__win">
              <Stage3D shadows keyLight={false}>
                <Scene t={refs.t[k]} bus={bus} live={live} compact={compact} />
              </Stage3D>
            </div>
          </div>
          <i className="fr-bw__dot" aria-hidden="true">
            <span ref={(el) => void (refs.rx[k] = el)} className="fr-bw__x num" />
            <span ref={(el) => void (refs.ry[k] = el)} className="fr-bw__y num" />
          </i>
        </div>

      </div>
    </article>
  )
}

/** a phone: the three as the flooring pages' "Where the screed fails" (ListingScreen), each point its own scene */
const PHONE_POINTS: ListingPoint[] = [
  { id: 'anchor', head: 'Fixed on flex anchors', stops: [0, 1], tag: LISTINGS[0].row[0], line: 'A 16–20 mm concrete skin, held to the steel stud frame by flexible L⁠-⁠plates.', Scene: AnchorScene },
  { id: 'day', head: 'Expands in the heat', stops: [0, 1], tag: LISTINGS[1].row[0], line: 'The façade expands in the heat. Flexible L⁠-⁠plates accommodate the shift.', Scene: DayScene },
  { id: 'night', head: 'Cools at night', stops: [0, 1], tag: LISTINGS[2].row[0], line: 'As temperatures fall, the façade contracts and the flexible plates move with it, maintaining a stable, even surface.', Scene: NightScene },
]

export function Components() {
  return useIsCompact() ? <ListingScreen id="components" title="Built to breathe with the heat" points={PHONE_POINTS} shadows snap /> : <ComponentsWide />
}

function ComponentsWide() {
  const compact = useIsCompact()
  const L = compact ? NARROW : WIDE
  const section = useRef<HTMLElement>(null)
  const rowsLayer = useRef<HTMLElement>(null)
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const refs = useMemo<Refs>(() => ({ block: [], stage: [], view: [], viewIn: [], rx: [], ry: [], t: LISTINGS.map(() => ({ value: 0, listeners: new Set() })) }), [])

  useEffect(() => {
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    const eased = LISTINGS.map(() => -1)
    const tick = (time: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (time - last) / 1000))
      last = time
      const vh = window.innerHeight
      // (every size and place read first, then every style written: one layout a frame. Read listing by listing between
      // the writes, the page was laid out again three or four times a frame, which a phone felt as a lag)
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      const rowH = rows.current[0]?.offsetHeight ?? 0
      const rects = LISTINGS.map((_, k) => [refs.block[k]?.getBoundingClientRect() ?? null, refs.stage[k]?.getBoundingClientRect() ?? null] as const)
      const sec = section.current?.getBoundingClientRect()
      let moving = false
      LISTINGS.forEach((_, k) => {
        const [r, sr] = rects[k]
        if (!r || !sr) return
        const rest = navH + under(k, compact) * rowH
        // where the listing is: 1 its stage at the foot of the screen, 0 held, −1 gone above
        const p = (sr.top - rest) / Math.max(1, sr.height)
        // its boxes: out of the corner as it comes up, back into it as it goes (the overview's timings)
        const [a, z] = k === 0 ? FIRST : [1, OPENED]
        const g = reduced ? 1 : p >= 0 ? 1 - ease(clamp01((p - z) / (a - z))) : 1 - ease(clamp01((p - CLOSING) / (CLOSED - CLOSING)))
        // the 3D's own run, while it is held, eased so a wheel's steps arrive as one glide
        const s = Math.max(0, (rest - r.top) / vh)
        const target = smooth(playOf(compact)[0], playOf(compact)[1], s)
        eased[k] = eased[k] < 0 || reduced ? target : damp(eased[k], target, 8, dt)
        if (Math.abs(eased[k] - target) < 1e-4) eased[k] = target
        else moving = true
        const tk = refs.t[k]
        if (tk.value !== eased[k]) {
          tk.value = eased[k]
          tk.listeners.forEach((f) => f())
        }
        const SW = sr.width
        const SH = sr.height
        // what the box holds, at the size it stands open at: set on every listing, on the screen or not, so each scene has a
        // size, and is built, behind the loading screen (a canvas of no size is not built until it has one: mid-scroll)
        const inner = refs.viewIn[k]
        if (inner) {
          const iw = `${(L.view[2] * SW).toFixed(1)}px`
          const ih = `${(L.view[3] * SH).toFixed(1)}px`
          if (inner.style.width !== iw) inner.style.width = iw
          if (inner.style.height !== ih) inner.style.height = ih
        }
        if (sr.bottom > 0 && sr.top < vh) {
          // each box between folded and open; what it holds stays where it stands open, its edges reveal it
          const box = (cell: HTMLDivElement | null, inner: HTMLDivElement | null, open: Rect, fold: Rect) => {
            if (!cell || !inner) return [0, 0]
            const [x, y, w, h] = mix(fold, open, g)
            cell.style.transform = `translate3d(${(x * SW).toFixed(1)}px, ${(y * SH).toFixed(1)}px, 0)`
            cell.style.width = `${(w * SW).toFixed(1)}px`
            cell.style.height = `${(h * SH).toFixed(1)}px`
            cell.style.visibility = w * h > 1e-5 ? 'visible' : 'hidden'
            inner.style.transform = `translate3d(${((open[0] - x) * SW).toFixed(1)}px, ${((open[1] - y) * SH).toFixed(1)}px, 0)`
            return [w * SW, h * SH]
          }
          const [vw, vhh] = box(refs.view[k], refs.viewIn[k], L.view, L.fold)
          const rx = refs.rx[k]
          const ry = refs.ry[k]
          if (rx) rx.textContent = `X: ${Math.round(vw)}`
          if (ry) ry.textContent = `Y: ${Math.round(vhh)}`
        }
        // its outcome is drawn into its row as it goes, the listing's words passing up behind the rows;
        // the last as its own listing arrives, so its slot is never left empty
        const row = rows.current[k]
        if (row) {
          const lastOne = compact || k === N - 1
          const d = reduced ? Number(lastOne ? p < 0.15 : p < -0.1) : ease(lastOne ? smooth(0.6, 0.15, p) : smooth(-0.02, -0.3, p))
          row.style.transform = `translate3d(0, ${((d - 1) * 100).toFixed(3)}%, 0)`
          row.style.visibility = d > 0.002 ? 'visible' : 'hidden'
          row.tabIndex = d > 0.5 ? 0 : -1
          row.toggleAttribute('data-docked', d > 0.5)
        }
      })
      // the rows leave with the section, never riding on into the next one
      if (sec && rowsLayer.current) rowsLayer.current.style.transform = `translate3d(0, ${Math.min(0, sec.bottom - vh).toFixed(1)}px, 0)`
      // (a phone: the cap stands over the screen above the section until the section reaches the header; shown only then)
      const cap = section.current?.querySelector<HTMLElement>('.fr-bw__cap')
      if (sec && cap) cap.style.visibility = !compact || sec.top <= navH + 0.5 ? 'visible' : 'hidden'
      if (moving) raf = requestAnimationFrame(tick)
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
  }, [refs, L, compact])

  // one scroll a step, by the page's stepper: each listing as it arrives, then its 3D played out, a scroll of its own
  useEffect(() => {
    const el = section.current
    if (!el) return
    const write = () => {
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      const rowH = rows.current[0]?.offsetHeight ?? 0
      listingStops(el, refs.block, (k) => navH + under(k, compact) * rowH, playOf(compact)[1])
    }
    // going up, back through it the same way, a listing at a time (as the Rainscreen barrier), never over it whole
    el.dataset.back = 'all'
    write()
    window.addEventListener('resize', write)
    return () => window.removeEventListener('resize', write)
  }, [refs, L, compact])

  /** a row takes you back to where its listing's 3D has played out */
  const go = (k: number) => {
    const b = refs.block[k]
    if (!b) return
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
    const rowH = rows.current[0]?.offsetHeight ?? 0
    scrollToY(b.getBoundingClientRect().top + window.scrollY - (navH + under(k, compact) * rowH) + playOf(compact)[1] * window.innerHeight)
  }

  return (
    <section ref={section} id="components" className="fr-bw" aria-labelledby="fs-bw-title" style={{ '--run': RUN } as CSSProperties}>
      <nav ref={rowsLayer} className="fr-bw__rows" aria-label="How the skin moves with the heat">
        <ol>
          {LISTINGS.map((it, k) => (
            <li key={it.id} className="fr-bw__slot" style={{ '--k': k } as CSSProperties}>
              <button ref={(el) => void (rows.current[k] = el)} type="button" className="fr-row" tabIndex={-1} onClick={() => go(k)} aria-label={`${it.row[0]}: ${it.row[1]}. Back to it`}>
                <span className="fr-row__num num">0{k + 1}</span>
                <span className="fr-row__name">{it.row[0]}</span>
                <span className="fr-row__tag">
                  <i aria-hidden="true" />
                  {it.row[1]}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <Skip label="How the skin moves with the heat" className="fr-skip" />
      </nav>
      <div className="fr-bw__cap" aria-hidden="true" />
      {LISTINGS.map((it, k) => (
        <ListingView key={it.id} item={it} k={k} L={L} compact={compact} refs={refs} />
      ))}
    </section>
  )
}
