import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { scrollToY } from '../lib/scroll'
import { prefersReducedMotion, useIsCompact } from '../lib/motion'
import type { Ground } from '../three/stageStore'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from '../facade/three/Stage3D'
import { createBus } from '../facade/three/kit'
import { CellRig, type CellShot } from '../facade/three/CellRig'
import { smooth } from '../facade/progress'
import { FloorSample, type SampleKind } from './three/FloorSample'

/**
 * The layer: what RTARIUM is in a floor, in the Façade overview's story (Lineage), its boxes and its
 * timings. Three blocks, each a full screen that scrolls past in four boxes about one crossing: its
 * name and what it is; one line; its photograph; and the floor sample, its own 3D. As a block comes
 * up its boxes open diagonally out of the corner; while it is read nothing moves but the page; as it
 * goes they close into the far corner and its row is drawn in under the header (the way back). Black
 * and white change places from block to block, the 3D changes sides; the yellow stays.
 *
 *   the headache   screed over a moving slab: no RTARIUM, the slab drops at its joint, the screed cracks
 *   the layer      RTARIUM between the slab and the screed, a window cut to show it
 *   any premix     the screed poured over it: rust-proof, non-magnetic, inert
 */

type Role = 'name' | 'limit' | 'photo' | 'panel'
type Rect = [number, number, number, number]
type Cut = [number, number]
type Align = 'start' | 'end'
const ORDER: Role[] = ['name', 'limit', 'photo', 'panel']

interface Layout {
  rest: Cut
  entry: Cut
  exit: Cut
  at: Record<Role, (c: Cut) => Rect>
  ground: Record<Role, Ground>
  align: Partial<Record<Role, Align>>
}

const tl = (c: Cut): Rect => [0, 0, c[0], c[1]]
const tr = (c: Cut): Rect => [c[0], 0, 1 - c[0], c[1]]
const bl = (c: Cut): Rect => [0, c[1], c[0], 1 - c[1]]
const br = (c: Cut): Rect => [c[0], c[1], 1 - c[0], 1 - c[1]]

/** the Façade overview's two wide layouts: the 3D's box (the largest) bottom right on black, or bottom left on warm white */
const WIDE_RIGHT: Layout = {
  rest: [0.42, 0.4],
  entry: [0, 0],
  exit: [1, 1],
  at: { name: tl, limit: tr, photo: bl, panel: br },
  ground: { name: 'yellow', limit: 'light', photo: 'light', panel: 'black' },
  align: { name: 'start', limit: 'end' },
}
const WIDE_LEFT: Layout = {
  rest: [0.58, 0.4],
  entry: [1, 0],
  exit: [0, 1],
  at: { limit: tl, name: tr, panel: bl, photo: br },
  ground: { name: 'yellow', limit: 'black', photo: 'black', panel: 'light' },
  align: { name: 'end', limit: 'start' },
}
/** narrow screens: name, line, the 3D, the photograph, top to bottom */
function narrow(L: Layout): Layout {
  return {
    rest: [0.38, 0.72],
    entry: [0, 1],
    exit: [1, 1],
    at: {
      name: (c) => [0, 0, 1, c[0] * 0.56],
      limit: (c) => [0, c[0] * 0.56, 1, c[0] * 0.44],
      panel: (c) => [0, c[0], 1, c[1] - c[0]],
      photo: (c) => [0, c[1], 1, 1 - c[1]],
    },
    ground: L.ground,
    align: L.align,
  }
}
const WIDE: Layout[] = [WIDE_RIGHT, WIDE_LEFT, WIDE_RIGHT]
const NARROW: Layout[] = WIDE.map(narrow)

interface Block {
  id: string
  name: string
  full: string
  label: string
  line: string
  /** what its row says once it has been read */
  tag: string
  kind: SampleKind
  marks: (compact: boolean) => LabelSpec[]
  /** a stand-in photograph until the site's own are chosen */
  photo: { src: string; alt: string }
}

const BLOCKS: Block[] = [
  {
    id: 'headache',
    name: 'The oldest headache',
    full: 'Ultra-fluid, high-strength screeds',
    label: 'What goes wrong',
    line: 'The slab moves. The screed cracks.',
    tag: 'Cracking',
    kind: 'cracked',
    marks: (c) => [
      { id: 'c', anchor: 'fl-crack', text: 'Reflective crack', dx: 30, dy: c ? -44 : -96 },
      { id: 's', anchor: 'fl-slab', text: 'Moving slab', dx: c ? -30 : -70, dy: c ? 40 : 70 },
    ],
    photo: { src: '/img/facade/precast-joint.webp', alt: 'A joint in concrete, opened by movement (stand-in photograph)' },
  },
  {
    id: 'layer',
    name: 'The layer between',
    full: 'RTARIUM, a 3D basalt mesh',
    label: 'What it does',
    line: 'It holds the screed together as the slab moves.',
    tag: 'Intermediate layer',
    kind: 'cut',
    marks: (c) => [
      { id: 'm', anchor: 'fl-mesh', text: 'RTARIUM', dx: 30, dy: c ? -44 : -96 },
      { id: 'sc', anchor: 'fl-screed', text: 'Screed', dx: -40, dy: c ? -40 : -80 },
      { id: 's', anchor: 'fl-slab', text: 'Structural slab', dx: c ? -30 : -70, dy: c ? 40 : 70 },
    ],
    photo: { src: '/img/shoot/mesh-macro.webp', alt: 'RTARIUM basalt mesh, close up (stand-in photograph)' },
  },
  {
    id: 'premix',
    name: 'Any premix',
    full: 'Rust-proof · Non-magnetic · Inert',
    label: 'Works with',
    line: 'Every premium industrial premix on the market.',
    tag: 'Inert',
    kind: 'pour',
    marks: (c) => [
      { id: 'm', anchor: 'fl-mesh', text: 'Basalt: nothing to rust', dx: -30, dy: c ? -44 : -96 },
      { id: 'sc', anchor: 'fl-screed', text: 'Your premix', dx: 40, dy: c ? -40 : -80 },
    ],
    photo: { src: '/img/site-strip.webp', alt: 'RTARIUM laid out on a site trial (stand-in photograph)' },
  },
]

/** how each sample is seen: turned towards the middle of the screen from whichever side it stands on */
const SHOTS: CellShot[] = [
  { target: [0, -0.01, 0], azim: 30, elev: 24, zoom: 1, sway: 4 },
  { target: [0.06, -0.01, 0.04], azim: -32, elev: 30, zoom: 1, sway: 4 },
  { target: [0, -0.01, 0], azim: 34, elev: 26, zoom: 1, sway: 4 },
]
const KEY: [number, number, number] = [-4, 10, 7.5]

/* the Façade overview's timings (p: 1 at the foot of the screen, 0 read, −1 gone) */
const OPENED = 0.3
const CLOSING = -0.1
const CLOSED = -0.65

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const mixCut = (a: Cut, b: Cut, t: number): Cut => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]

/** one sample, in its own canvas, swaying while on screen */
function Sample({ k, compact }: { k: number; compact: boolean }) {
  const bus = useMemo(createBus, [])
  const shot = useMemo(() => () => SHOTS[k], [k])
  const host = useRef<HTMLDivElement>(null)
  const live = useRef(false)
  const marks = useMemo(() => BLOCKS[k].marks(compact), [k, compact])
  const pour = useMemo(() => ({ current: 0.62 }), [])
  useEffect(() => {
    const el = host.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => void (live.current = e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={host} className="fs-panel">
      <Stage3D shadows keyLight={false}>
        <CellRig shotAt={shot} size={compact ? [0.86, 0.5] : [1.0, 0.6]} live={live} />
        <MovingKeyLight focus={[0, 0, 0]} reach={0.8} offset={KEY} />
        <FloorSample bus={bus} kind={BLOCKS[k].kind} pour={pour} />
        <LabelProjector bus={bus} bottom={16} />
      </Stage3D>
      <Labels key={compact ? 'narrow' : 'wide'} bus={bus} labels={marks} shown={marks.map((l) => l.id)} />
    </div>
  )
}

export function Layer({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const compact = useIsCompact()
  const layouts = compact ? NARROW : WIDE
  const layer = useRef<HTMLElement>(null)
  const blocks = useRef<(HTMLElement | null)[]>([])
  const cells = useRef<Partial<Record<Role, HTMLDivElement | null>>[]>([])
  const inners = useRef<Partial<Record<Role, HTMLDivElement | null>>[]>([])
  const photos = useRef<(HTMLElement | null)[]>([])
  const reads = useRef<(HTMLSpanElement | null)[][]>([])
  const bars = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const reduced = prefersReducedMotion()
    const sizes = new Map<HTMLElement, [number, number]>()
    let raf = 0
    const read = () => {
      raf = 0
      const vh = window.innerHeight
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      const rowH = bars.current[0]?.offsetHeight ?? 0
      const W = layer.current?.offsetWidth ?? window.innerWidth
      const layerTop = layer.current?.getBoundingClientRect().top ?? 0
      const q: number[] = []

      blocks.current.forEach((b, k) => {
        const L = layouts[k]
        if (!b) {
          q.push(1)
          return
        }
        const r = b.getBoundingClientRect()
        const BW = r.width
        const BH = r.height
        // where the block is: 1 arriving at the foot of the screen, 0 read, −1 gone above
        const p = (r.top - (navH + k * rowH)) / Math.max(1, BH)
        q.push(p)
        if (r.bottom < navH - 4 || r.top > vh + 4) return
        const c: Cut = reduced
          ? L.rest
          : p >= 0
            ? mixCut(L.rest, L.entry, ease(clamp01((p - OPENED) / (1 - OPENED))))
            : mixCut(L.rest, L.exit, ease(clamp01((p - CLOSING) / (CLOSED - CLOSING))))
        for (const role of ORDER) {
          const [x, y, w, h] = L.at[role](c)
          const cell = cells.current[k]?.[role]
          if (cell) {
            cell.style.left = `${(x * 100).toFixed(3)}%`
            cell.style.top = `${(y * 100).toFixed(3)}%`
            cell.style.width = `${(w * 100).toFixed(3)}%`
            cell.style.height = `${(h * 100).toFixed(3)}%`
          }
          // what a box holds stays where it stands when the block is read; the box's edges reveal it
          const inner = inners.current[k]?.[role]
          if (inner) {
            const [rx, ry] = L.at[role](L.rest)
            inner.style.transform = `translate(${((rx - x) * BW).toFixed(1)}px, ${((ry - y) * BH).toFixed(1)}px)`
          }
        }
        // the photograph grows out of its corner as the block comes up and shrinks back into it as it goes
        const ph = photos.current[k]
        if (ph) {
          const g = reduced ? 1 : Math.max(0.04, p >= 0 ? 1 - smooth(OPENED, 0.85, p) : 1 - smooth(CLOSING, CLOSED + 0.05, p))
          ph.style.setProperty('--g', g.toFixed(4))
          ph.style.setProperty('--x', '0')
          let size = sizes.get(ph)
          if (!size) sizes.set(ph, (size = [ph.offsetWidth, ph.offsetHeight]))
          const [rx, ry] = reads.current[k] ?? []
          if (rx) rx.textContent = `X: ${Math.round(g * size[0])}`
          if (ry) ry.textContent = `Y: ${Math.round(g * size[1])}`
        }
      })

      // as a block goes, its row is drawn in under the header; the block's words pass up behind it
      BLOCKS.forEach((_, k) => {
        const bar = bars.current[k]
        if (!bar) return
        const rise = reduced ? Number(q[k] < -0.1) : smooth(-0.02, -0.3, q[k])
        bar.style.transform = `translate(0px, ${(navH + k * rowH - layerTop).toFixed(1)}px)`
        bar.style.width = `${W}px`
        bar.style.opacity = rise > 0 ? '1' : '0'
        bar.style.clipPath = `inset(0 ${((1 - ease(smooth(0, 0.3, rise))) * 100).toFixed(2)}% 0 0)`
        bar.style.setProperty('--s', '0')
        const docked = rise > 0.5
        bar.tabIndex = docked ? 0 : -1
        bar.toggleAttribute('data-docked', docked)
      })
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    const resize = () => {
      sizes.clear()
      on()
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', resize)
    }
  }, [layouts])

  /** a row takes you back to its block */
  const go = (i: number) => {
    const b = blocks.current[i]
    if (!b) return
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
    const rowH = bars.current[0]?.offsetHeight ?? 0
    scrollToY(b.getBoundingClientRect().top + window.scrollY - (navH + i * rowH))
  }

  const content = (v: Block, i: number, role: Role): ReactNode => {
    switch (role) {
      case 'name':
        return (
          <>
            <h3 id={`ffl-${v.id}`} className="fs-name">
              {v.name}
            </h3>
            <p className="fs-full">{v.full}</p>
          </>
        )
      case 'limit':
        return (
          <>
            <p className="fs-label">{v.label}</p>
            <p className="fs-limit">{v.line}</p>
          </>
        )
      case 'photo':
        return (
          <figure ref={(el) => void (photos.current[i] = el)} className="fs-photo">
            <span className="fs-photo__frame">
              <img src={v.photo.src} alt={v.photo.alt} loading="lazy" width={640} height={480} />
            </span>
            <i className="fs-photo__dot" aria-hidden="true">
              <span ref={(el) => void ((reads.current[i] ??= [])[0] = el)} className="fs-photo__x num" />
              <span ref={(el) => void ((reads.current[i] ??= [])[1] = el)} className="fs-photo__y num" />
            </i>
          </figure>
        )
      case 'panel':
        return <Sample k={i} compact={compact} />
    }
  }

  return (
    <section ref={sectionRef} id="layer" className="fs on-yellow" aria-labelledby="ffl-title">
      <nav ref={layer} className="fs-rows" aria-label="The layer, read">
        <ol>
          {BLOCKS.map((v, i) => (
            <li key={v.id}>
              <button ref={(el) => void (bars.current[i] = el)} type="button" className="fs-row" tabIndex={-1} onClick={() => go(i)} aria-label={`${v.name}. Back to it`}>
                <span className="fs-row__num num">0{i + 1} /</span>
                <span className="fs-row__name">{v.name}</span>
                <span className="fs-row__tag">{v.tag}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="fs-cap" aria-hidden="true" />

      <h2 id="ffl-title" className="visually-hidden">
        The layer between the slab and the screed
      </h2>

      {BLOCKS.map((v, i) => {
        const L = layouts[i]
        return (
          <article key={v.id} ref={(el) => void (blocks.current[i] = el)} className="fs-block" style={{ '--i': i } as CSSProperties} aria-labelledby={`ffl-${v.id}`}>
            {ORDER.map((role) => {
              const [, , rw, rh] = L.at[role](L.rest)
              return (
                <div key={role} ref={(el) => void ((cells.current[i] ??= {})[role] = el)} className={`fs-cell fs-cell--${role} on-${L.ground[role]} ${L.align[role] === 'end' ? 'is-end' : ''}`}>
                  <div
                    ref={(el) => void ((inners.current[i] ??= {})[role] = el)}
                    className="fs-cell__in"
                    style={{ width: `calc(${rw} * 100cqw)`, height: `calc(${rh} * 100cqh)` } as CSSProperties}
                  >
                    {content(v, i, role)}
                  </div>
                </div>
              )
            })}
          </article>
        )
      })}
    </section>
  )
}
