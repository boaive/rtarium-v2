import { useEffect, useMemo, useRef, type CSSProperties, type ComponentType, type ReactNode } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../three/Stage3D'
import { createBus, type LabelBus } from '../three/kit'
import { StructureScene, ThermalScene, WaterScene } from '../three/rain/BarrierScenes'
import { listingStops, smooth, type Progress } from '../progress'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { useLive } from '../unitized/live'
import { Skip } from '../unitized/StepBar'

/**
 * The barrier: what the rainscreen does, in the client's own chain (water damage, thermal bridging,
 * the structure), on the yellow the opening left off on, in the overview story's grammar (Lineage):
 * as a listing comes up its black box (its own 3D) opens out of the right edge, the words standing on
 * the yellow beside it. The listing then holds for a long, slow stretch of scroll while its 3D makes
 * one move, to where the point is made, inside the middle of its black box. As it goes its box folds
 * back while the next listing, just beneath, opens over the same stretch of scroll: one hides as the
 * next reveals, never an empty screen between. Its outcome is drawn into a row under the header (never
 * struck, a way back); the last as its own listing arrives, so its slot is never left empty, and the
 * listing stands clear under all three. The rows leave with the section. Skip goes past the section.
 */

interface Listing {
  id: string
  row: [string, string]
  head: ReactNode
  Scene: ComponentType<{ t: Progress; bus: LabelBus; live: { current: boolean }; compact: boolean }>
  labels: LabelSpec[]
}

const LISTINGS: Listing[] = [
  {
    id: 'water',
    row: ['Water damage', 'Eliminated'],
    head: (
      <>
        <p className="fr-fig num" aria-label="90 percent">
          90<small>%</small>
        </p>
        <p className="fr-say">of the rain and wind, turned away at the face.</p>
        <ReviewNote>{REVIEW.rain}</ReviewNote>
      </>
    ),
    Scene: WaterScene,
    labels: [
      { id: 'w-face', text: 'Rain runs off the face', dx: -80, dy: -56 },
      { id: 'w-drain', text: 'Drained cavity', dx: 76, dy: 64 },
      { id: 'w-dry', text: 'Dry wall', dx: 76, dy: -60 },
    ],
  },
  {
    id: 'thermal',
    row: ['Thermal bridging', 'Eliminated'],
    head: (
      <>
        <h3 className="fr-name">
          Keeps the wall <br />
          ventilated
        </h3>
        <p className="fr-say">Air rises behind the panels, keeping the wall dry and insulation continuous.</p>
      </>
    ),
    Scene: ThermalScene,
    labels: [
      { id: 'w-cavity', text: 'Ventilated cavity', dx: 76, dy: -56 },
      { id: 'w-wool', text: 'Unbroken insulation', dx: -76, dy: -64 },
    ],
  },
  {
    id: 'structure',
    row: ['Structure', 'Protected'],
    head: (
      <>
        <h3 className="fr-name">
          Adapts to <br />
          wind loads
        </h3>
        <p className="fr-say">The panels and brackets accommodate wind movement while the main structure remains stable.</p>
      </>
    ),
    Scene: StructureScene,
    labels: [
      { id: 'w-flex', text: 'Panel flexes', dx: -80, dy: -56 },
      { id: 'w-slide', text: 'Slotted bracket', dx: 80, dy: 60 },
    ],
  },
]
const N = LISTINGS.length
/** how many rows a listing's stage stands under: the last leaves its own row's slot empty, so its row is lowered into free space, over nothing */
const under = (k: number) => (k === N - 1 ? N : k)

/** screens of scroll per listing, and the stretch of its hold in which its 3D plays (screens into the hold) */
const RUN = 3.1
const PLAY: [number, number] = [0.05, 1.75]
/** the last listing holds a little longer */
const RUN_LAST = 3.25
/** the overview story's timings (p: 1 at the foot of the screen, 0 held, −1 gone): open by OPENED, close from CLOSING to CLOSED */
const OPENED = 0.3
const CLOSING = -0.1
const CLOSED = -0.65
/** the first listing comes up out of the opening's yellow: its boxes wait until a third of it is on screen */
const FIRST: [number, number] = [0.67, 0.06]

type Rect = [number, number, number, number]
interface Layout {
  /** where the words stand (on the yellow), and the black box once open; the box folded away */
  words: Rect
  view: Rect
  fold: Rect
}
/** wide: the words the left column, the black box the right; it folds into the right edge */
const WIDE: Layout = {
  words: [0, 0, 0.4, 1],
  view: [0.4, 0, 0.6, 1],
  fold: [1, 0, 0, 1],
}
/** narrow: the words over the black box, folding to the foot */
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

/** one listing: its stage held under the rows drawn so far, its words, its boxes, its own 3D */
function ListingView({ item, k, L, compact, refs }: { item: Listing; k: number; L: Layout; compact: boolean; refs: Refs }) {
  const bus = useMemo(createBus, [])
  const view = useRef<HTMLDivElement | null>(null)
  const live = useLive(view)
  const { Scene } = item
  return (
    <article ref={(el) => void (refs.block[k] = el)} className="fr-bw__block" style={{ '--k': under(k), '--run': k === N - 1 ? RUN_LAST : RUN } as CSSProperties} aria-labelledby={`fr-bw-${item.id}`}>
      <div ref={(el) => void (refs.stage[k] = el)} className="fr-bw__stage">
        {/* the words, on the yellow: they stand still; the boxes' edges pass them */}
        <div className="fr-bw__words" style={{ '--x': L.words[0], '--y': L.words[1], '--w': L.words[2], '--h': L.words[3] } as CSSProperties}>
          <div className="fr-bw__top">
            {/* said once, on the first listing */}
            {k === 0 ? (
              <h2 id="fr-bw-title" className="fr-kicker">
                A perfect weather-resistance barrier
              </h2>
            ) : (
              <span aria-hidden="true" />
            )}
            <p className="fr-count num" aria-hidden="true">
              0{k + 1} <span>/ 0{N}</span>
            </p>
          </div>
          <div id={`fr-bw-${item.id}`} className="fr-bw__beat">
            {item.head}
          </div>
        </div>

        {/* the 3D: a black box, the scene kept to the middle of it, the rest of the black left empty */}
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
              <Stage3D>
                <Scene t={refs.t[k]} bus={bus} live={live} compact={compact} />
                <LabelProjector bus={bus} bottom={8} />
              </Stage3D>
            </div>
            <div className="fr-bw__pins">
              <Labels bus={bus} labels={item.labels} shown={[]} />
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

export function Barrier() {
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
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      const rowH = rows.current[0]?.offsetHeight ?? 0
      let moving = false
      LISTINGS.forEach((_, k) => {
        const b = refs.block[k]
        const stage = refs.stage[k]
        if (!b || !stage) return
        const r = b.getBoundingClientRect()
        const sr = stage.getBoundingClientRect()
        const rest = navH + under(k) * rowH
        // where the listing is: 1 its stage at the foot of the screen, 0 held, −1 gone above
        const p = (sr.top - rest) / Math.max(1, sr.height)
        // its boxes: out of the corner as it comes up, back into it as it goes (the overview's timings)
        const [a, z] = k === 0 ? FIRST : [1, OPENED]
        const g = reduced ? 1 : p >= 0 ? 1 - ease(clamp01((p - z) / (a - z))) : 1 - ease(clamp01((p - CLOSING) / (CLOSED - CLOSING)))
        // the 3D's own run, while it is held, eased so a wheel's steps arrive as one glide
        const s = Math.max(0, (rest - r.top) / vh)
        const target = smooth(PLAY[0], PLAY[1], s)
        eased[k] = eased[k] < 0 || reduced ? target : damp(eased[k], target, 8, dt)
        if (Math.abs(eased[k] - target) < 1e-4) eased[k] = target
        else moving = true
        const tk = refs.t[k]
        if (tk.value !== eased[k]) {
          tk.value = eased[k]
          tk.listeners.forEach((f) => f())
        }
        if (sr.bottom > 0 && sr.top < vh) {
          const SW = sr.width
          const SH = sr.height
          // each box between folded and open; what it holds stays where it stands open, its edges reveal it
          const box = (cell: HTMLDivElement | null, inner: HTMLDivElement | null, open: Rect, fold: Rect) => {
            if (!cell || !inner) return [0, 0]
            const [x, y, w, h] = mix(fold, open, g)
            cell.style.transform = `translate3d(${(x * SW).toFixed(1)}px, ${(y * SH).toFixed(1)}px, 0)`
            cell.style.width = `${(w * SW).toFixed(1)}px`
            cell.style.height = `${(h * SH).toFixed(1)}px`
            cell.style.visibility = w * h > 1e-5 ? 'visible' : 'hidden'
            inner.style.width = `${(open[2] * SW).toFixed(1)}px`
            inner.style.height = `${(open[3] * SH).toFixed(1)}px`
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
          const lastOne = k === N - 1
          const d = reduced ? Number(lastOne ? p < 0.15 : p < -0.1) : ease(lastOne ? smooth(0.6, 0.15, p) : smooth(-0.02, -0.3, p))
          row.style.transform = `translate3d(0, ${((d - 1) * 100).toFixed(3)}%, 0)`
          row.style.visibility = d > 0.002 ? 'visible' : 'hidden'
          row.tabIndex = d > 0.5 ? 0 : -1
          row.toggleAttribute('data-docked', d > 0.5)
        }
      })
      // the rows leave with the section, never riding on into the next one
      const sec = section.current?.getBoundingClientRect()
      if (sec && rowsLayer.current) rowsLayer.current.style.transform = `translate3d(0, ${Math.min(0, sec.bottom - vh).toFixed(1)}px, 0)`
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
  }, [refs, L])

  // one scroll a step, by the page's stepper: each listing as it arrives, then its 3D played out, a scroll of its own
  useEffect(() => {
    const el = section.current
    if (!el) return
    const write = () => {
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      const rowH = rows.current[0]?.offsetHeight ?? 0
      listingStops(el, refs.block, (k) => navH + under(k) * rowH, PLAY[1])
    }
    // going up, back through it the same way, a listing at a time (as the overview's story), never over it whole
    el.dataset.back = 'all'
    write()
    window.addEventListener('resize', write)
    return () => window.removeEventListener('resize', write)
  }, [refs, L])

  /** a row takes you back to where its listing's 3D has played out */
  const go = (k: number) => {
    const b = refs.block[k]
    if (!b) return
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
    const rowH = rows.current[0]?.offsetHeight ?? 0
    scrollToY(b.getBoundingClientRect().top + window.scrollY - (navH + under(k) * rowH) + PLAY[1] * window.innerHeight)
  }

  return (
    <section ref={section} id="barrier" className="fr-bw" aria-labelledby="fr-bw-title" style={{ '--run': RUN } as CSSProperties}>
      {/* the outcomes reached, under the header, on the yellow: never struck, and the way back */}
      <nav ref={rowsLayer} className="fr-bw__rows" aria-label="What the rainscreen ends">
        <ol>
          {LISTINGS.map((it, k) => (
            <li key={it.id} className="fr-bw__slot" style={{ '--k': k } as CSSProperties}>
              <button ref={(el) => void (rows.current[k] = el)} type="button" className="fr-row" tabIndex={-1} onClick={() => go(k)} aria-label={`${it.row[0]}: ${it.row[1].toLowerCase()}. Back to it`}>
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
        <Skip label="What the rainscreen ends" className="fr-skip" />
      </nav>
      <div className="fr-bw__cap" aria-hidden="true" />
      {LISTINGS.map((it, k) => (
        <ListingView key={it.id} item={it} k={k} L={L} compact={compact} refs={refs} />
      ))}
    </section>
  )
}
