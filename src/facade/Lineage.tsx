import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { scrollToY } from '../lib/scroll'
import { prefersReducedMotion, useIsCompact } from '../lib/motion'
import type { Ground } from '../three/stageStore'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from './three/Stage3D'
import { createBus } from './three/kit'
import { CellRig, type CellShot } from './three/CellRig'
import { CladdingPanel, CUT_TARGET, PANEL_TARGET } from './three/CladdingPanel'
import { smooth } from './progress'

/**
 * The story: what RTARIUM replaces, one material at a time, and then RTARIUM.
 *
 * Steel bar, GFRC / GRC and UHPC each get a full screen that scrolls past, in four boxes about one
 * crossing: its photograph, large; its name and why it was used; why it is replaced; and, a little
 * larger, the façade panel reinforced with it (its own 3D). Everything follows the scroll:
 *
 *   - as a block comes up, its panel's box fills it, then the crossing slides out of the corner and the
 *     other boxes open; they are open, and still, well before the block reaches the top;
 *   - while it is read nothing moves but the page;
 *   - as it goes, its photograph is crossed out and greys, its row is drawn in under the header with
 *     its name struck through, and its boxes close diagonally into the far corner while it is still on
 *     screen: the panel's box shrinks to its edge as the yellow one grows, the photograph's frame
 *     shrinks back into its corner;
 *   - black and white change places from block to block, the panel changes sides; the yellow stays.
 *
 * RTARIUM then takes the whole screen in a layout of its own, and the struck rows come down into it.
 * Only the 3D has motion of its own: a slow sway, in time.
 */

type Role = 'name' | 'limit' | 'claim' | 'replaces' | 'photo' | 'panel'
type Rect = [number, number, number, number]
type Cut = [number, number]
type Align = 'start' | 'end'
/** the order of the boxes in the document: what they say, read in order */
const ORDER: Role[] = ['name', 'limit', 'claim', 'replaces', 'photo', 'panel']

interface Layout {
  /** where the cuts cross while the block is read, as it comes up, and as it goes */
  rest: Cut
  entry: Cut
  exit: Cut
  at: Partial<Record<Role, (c: Cut) => Rect>>
  ground: Partial<Record<Role, Ground>>
  /** which way the words in a box sit */
  align: Partial<Record<Role, Align>>
}

const tl = (c: Cut): Rect => [0, 0, c[0], c[1]]
const tr = (c: Cut): Rect => [c[0], 0, 1 - c[0], c[1]]
const bl = (c: Cut): Rect => [0, c[1], c[0], 1 - c[1]]
const br = (c: Cut): Rect => [c[0], c[1], 1 - c[0], 1 - c[1]]

/** wide screens: the panel's box (the largest) at the bottom right on black, or at the bottom left on warm white */
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
/**
 * RTARIUM, a layout of its own: its name and the panel, large, in the wide column; what it replaces
 * (the struck rows come down into it) and its photograph, full-bleed, in the narrow one; why it
 * replaces them along the foot. c[0] parts the columns, c[1] is where the foot begins.
 */
const BAND = 0.3
const SIDE = 0.36
const WIDE_LAST: Layout = {
  rest: [0.62, 0.86],
  entry: [1, 1],
  exit: [0.62, 0.86],
  at: {
    name: (c) => [0, 0, c[0], BAND],
    panel: (c) => [0, BAND, c[0], c[1] - BAND],
    replaces: (c) => [c[0], 0, 1 - c[0], SIDE],
    photo: (c) => [c[0], SIDE, 1 - c[0], c[1] - SIDE],
    claim: (c) => [0, c[1], 1, 1 - c[1]],
  },
  ground: { name: 'yellow', replaces: 'yellow', panel: 'yellow', photo: 'yellow', claim: 'yellow' },
  align: { name: 'start' },
}

/** narrow screens: name, why it is replaced, the panel, the photograph, top to bottom (c: where the panel begins and ends) */
function narrow(ground: Layout['ground'], align: Layout['align']): Layout {
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
    ground,
    align,
  }
}
const NARROW_LAST: Layout = {
  rest: [0.66, 0.84],
  entry: [1, 1],
  exit: [0.66, 0.84],
  at: {
    name: () => [0, 0, 1, 0.16],
    replaces: () => [0, 0.16, 1, 0.2],
    panel: (c) => [0, 0.36, 1, c[0] - 0.36],
    photo: (c) => [0, c[0], 1, c[1] - c[0]],
    claim: (c) => [0, c[1], 1, 1 - c[1]],
  },
  ground: WIDE_LAST.ground,
  align: { name: 'start' },
}
const WIDE: Layout[] = [WIDE_RIGHT, WIDE_LEFT, WIDE_RIGHT, WIDE_LAST]
const NARROW: Layout[] = [narrow(WIDE_RIGHT.ground, WIDE_RIGHT.align), narrow(WIDE_LEFT.ground, WIDE_LEFT.align), narrow(WIDE_RIGHT.ground, WIDE_RIGHT.align), NARROW_LAST]

interface Version {
  id: string
  name: string
  full: string
  /** why it was used, and why it is replaced; RTARIUM says why it replaces them */
  used?: string
  replaced?: string
  claim?: string
  /** what the marker on the panel calls it */
  material: string
  thick: number
  photo: { src: string; alt: string; credit?: string }
}

const VERSIONS: Version[] = [
  {
    id: 'steel',
    name: 'Steel bar',
    full: 'Reinforced concrete',
    used: 'Strong and proven.',
    replaced: 'Thick, heavy, and it rusts.',
    material: 'Steel bar',
    thick: 100,
    photo: { src: '/img/facade/steel-bar.webp', alt: 'Ribbed steel reinforcing bars stacked side by side, rusting' },
  },
  {
    id: 'grc',
    name: 'GFRC / GRC',
    full: 'Glass fibre reinforced concrete',
    used: 'Thin and light.',
    replaced: 'Alkali wears the glass fibre.',
    material: 'AR-glass fibre',
    thick: 20,
    photo: { src: '/img/facade/glass-fibre.webp', alt: 'A heap of short chopped glass fibre strands' },
  },
  {
    id: 'uhpc',
    name: 'UHPC',
    full: 'Ultra-high performance concrete',
    used: 'Thinner and stronger.',
    replaced: 'Steel fibre corrodes, and leaves weak directions.',
    material: 'Steel micro-fibre',
    thick: 20,
    photo: {
      src: '/img/facade/uhpc-fibres.webp',
      alt: 'A broken sample of ultra-high performance concrete with steel fibres standing out of the break',
      // CC BY-SA 4.0: the licence asks for this credit
      credit: 'Photo: B. P. Maffezzoli, CC BY-SA 4.0',
    },
  },
  {
    id: 'trc',
    name: 'RTARIUM',
    full: 'Textile reinforced concrete',
    claim: 'Thin, light, and strong in X, Y and Z. Nothing to corrode.',
    material: 'RTARIUM 3D basalt textile',
    thick: 20,
    photo: { src: '/img/shoot/mesh-profile.webp', alt: 'An RTARIUM sheet seen edge-on: two basalt mesh faces with fibres looping between them' },
  },
]
const LAST = VERSIONS.length - 1
const REPLACED = VERSIONS.slice(0, LAST)

/** how each panel is seen: turned towards the middle of the screen from whichever side it stands on */
const SHOTS: CellShot[] = [
  { target: PANEL_TARGET, azim: 30, elev: 12, zoom: 1, sway: 4 },
  { target: PANEL_TARGET, azim: -30, elev: 11, zoom: 1, sway: 4 },
  { target: [(PANEL_TARGET[0] * 2 + CUT_TARGET[0]) / 3, (PANEL_TARGET[1] * 2 + CUT_TARGET[1]) / 3, 0], azim: 32, elev: 14, zoom: 1.06, sway: 3 },
  { target: PANEL_TARGET, azim: 24, elev: 13, zoom: 1, sway: 8 },
]
const KEY: [number, number, number] = [-4, 10, 7.5]

/** the marks on a panel: what is in its cut, and how thick it is (closer to it on narrow screens) */
const marksOf = (v: Version, compact: boolean): LabelSpec[] => [
  { id: 'm', anchor: 'cp-cut', text: v.material, dx: 24, dy: compact ? 44 : 96 },
  { id: 't', anchor: 'cp-edge', text: `${v.thick} mm`, dx: compact ? 26 : 60, dy: compact ? -44 : 44 },
]

/*
 * When the boxes move, by where the block is (p: 1 at the foot of the screen, 0 read, −1 gone).
 * They open while it comes up and are open by OPENED; they hold still while it is read; from
 * CLOSING to CLOSED, while it is still well on screen, they close diagonally into the far corner.
 */
const OPENED = 0.3
const CLOSING = -0.1
const CLOSED = -0.65

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const mixCut = (a: Cut, b: Cut, t: number): Cut => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
const rolesOf = (L: Layout) => ORDER.filter((r) => L.at[r])

/** one panel, in its own canvas: the version it shows, seen as that version is seen, swaying while on screen */
function Panel({ k, compact }: { k: number; compact: boolean }) {
  const bus = useMemo(createBus, [])
  const stage = useMemo(() => ({ value: k }), [k])
  const shot = useMemo(() => () => SHOTS[k], [k])
  const host = useRef<HTMLDivElement>(null)
  const live = useRef(false)
  const marks = useMemo(() => marksOf(VERSIONS[k], compact), [k, compact])
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
        {/* RTARIUM's panel is framed closer: it is the one to look at */}
        <CellRig shotAt={shot} size={k === LAST ? (compact ? [0.92, 0.6] : [1.02, 0.66]) : compact ? [1.1, 0.72] : [1.3, 0.84]} live={live} />
        <MovingKeyLight focus={PANEL_TARGET} reach={0.9} offset={KEY} />
        <CladdingPanel stage={stage} bus={bus} />
        <LabelProjector bus={bus} bottom={16} />
      </Stage3D>
      <Labels key={compact ? 'narrow' : 'wide'} bus={bus} labels={marks} shown={marks.map((l) => l.id)} />
    </div>
  )
}

export function Lineage({ sectionRef }: { sectionRef: RefObject<HTMLElement | null>; live?: { current: boolean } }) {
  const compact = useIsCompact()
  const layouts = compact ? NARROW : WIDE

  const layer = useRef<HTMLElement>(null)
  const blocks = useRef<(HTMLElement | null)[]>([])
  const cells = useRef<Partial<Record<Role, HTMLDivElement | null>>[]>([])
  const inners = useRef<Partial<Record<Role, HTMLDivElement | null>>[]>([])
  const photos = useRef<(HTMLElement | null)[]>([])
  const reads = useRef<(HTMLSpanElement | null)[][]>([])
  /** the rows of what has been passed: struck, and the way back */
  const bars = useRef<(HTMLButtonElement | null)[]>([])
  /** where the rows come to rest inside RTARIUM */
  const docks = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    const reduced = prefersReducedMotion()
    /** each photograph's full size, for its read-out (measured once, again after a resize) */
    const sizes = new Map<HTMLElement, [number, number]>()
    let raf = 0
    const read = () => {
      raf = 0
      const vh = window.innerHeight
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      const rowH = bars.current[0]?.offsetHeight ?? 0
      const W = layer.current?.offsetWidth ?? window.innerWidth
      const layerTop = layer.current?.getBoundingClientRect().top ?? 0
      const rest = (k: number) => (k < LAST ? navH + k * rowH : navH)
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
        const p = (r.top - rest(k)) / Math.max(1, BH)
        q.push(p)
        if (r.bottom < navH - 4 || r.top > vh + 4) return
        const c: Cut = reduced
          ? L.rest
          : p >= 0
            ? mixCut(L.rest, L.entry, ease(clamp01((p - OPENED) / (1 - OPENED))))
            : mixCut(L.rest, L.exit, ease(clamp01((p - CLOSING) / (CLOSED - CLOSING))))
        for (const role of rolesOf(L)) {
          const [x, y, w, h] = L.at[role]!(c)
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
            const [rx, ry] = L.at[role]!(L.rest)
            inner.style.transform = `translate(${((rx - x) * BW).toFixed(1)}px, ${((ry - y) * BH).toFixed(1)}px)`
          }
        }
        // the photograph grows out of its corner as the block comes up and shrinks back into it as the
        // block goes, its size read out at the corner; on the way out it is crossed out and greys
        const ph = photos.current[k]
        if (ph) {
          const g = reduced ? 1 : Math.max(0.04, p >= 0 ? 1 - smooth(OPENED, 0.85, p) : 1 - smooth(CLOSING, CLOSED + 0.05, p))
          const gone = k < LAST ? (reduced ? Number(p < -0.2) : smooth(-0.02, -0.16, p)) : 0
          ph.style.setProperty('--g', g.toFixed(4))
          ph.style.setProperty('--x', gone.toFixed(4))
          let size = sizes.get(ph)
          if (!size) sizes.set(ph, (size = [ph.offsetWidth, ph.offsetHeight]))
          const [rx, ry] = reads.current[k] ?? []
          if (rx) rx.textContent = `X: ${Math.round(g * size[0])}`
          if (ry) ry.textContent = `Y: ${Math.round(g * size[1])}`
        }
      })

      // the rows. As a material's block goes, its row is drawn in under the header with its name struck;
      // the block's words pass up behind it. When RTARIUM arrives the rows come down into the box beside
      // its name: first drawn in to its narrow column, then dropped into place
      const across = reduced ? Number(q[LAST] < 0.15) : smooth(0.45, 0.25, q[LAST])
      const down = reduced ? Number(q[LAST] < 0.15) : smooth(0.35, 0.1, q[LAST])
      REPLACED.forEach((_, k) => {
        const bar = bars.current[k]
        if (!bar) return
        const rise = reduced ? Number(q[k] < -0.1) : smooth(-0.02, -0.3, q[k])
        const slot: Rect = [0, navH + k * rowH - layerTop, W, rowH]
        const d = docks.current[k]?.getBoundingClientRect()
        const dock: Rect = d ? [d.left, d.top - layerTop, d.width, d.height] : slot
        const x = lerp(slot[0], dock[0], ease(across))
        const y = lerp(slot[1], dock[1], ease(down))
        bar.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        bar.style.width = `${lerp(slot[2], dock[2], ease(across)).toFixed(1)}px`
        // drawn in from the left, solid, so the block's words pass behind it
        bar.style.opacity = rise > 0 ? '1' : '0'
        bar.style.clipPath = `inset(0 ${((1 - ease(smooth(0, 0.3, rise))) * 100).toFixed(2)}% 0 0)`
        bar.style.setProperty('--s', smooth(0.55, 1, rise).toFixed(3))
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

  /** a row takes you back to its material: the scroll where its block is read */
  const go = (i: number) => {
    const b = blocks.current[i]
    if (!b) return
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
    const rowH = bars.current[0]?.offsetHeight ?? 0
    scrollToY(b.getBoundingClientRect().top + window.scrollY - (navH + i * rowH))
  }

  const content = (v: Version, i: number, role: Role): ReactNode => {
    switch (role) {
      case 'name':
        return i === LAST ? (
          <>
            <h3 id={`fs-${v.id}`} className="fs-word">
              {v.name}
            </h3>
            <p className="fs-full">{v.full}</p>
          </>
        ) : (
          <>
            <h3 id={`fs-${v.id}`} className="fs-name">
              {v.name}
            </h3>
            <p className="fs-full">{v.full}</p>
            <div className="fs-used">
              <p className="fs-label">Why it was used</p>
              <p className="fs-used__text">{v.used}</p>
            </div>
          </>
        )
      case 'limit':
        return (
          <>
            <p className="fs-label">Why it is replaced</p>
            <p className="fs-limit">{v.replaced}</p>
          </>
        )
      case 'claim':
        return (
          <>
            <p className="fs-label">Why it replaces them</p>
            <p className="fs-claim">{v.claim}</p>
          </>
        )
      case 'replaces':
        return (
          <>
            <p className="fs-label">Replaces</p>
            <ol className="fs-docks">
              {REPLACED.map((o, j) => (
                <li key={o.id} ref={(el) => void (docks.current[j] = el)} className="fs-dock">
                  <span className="visually-hidden">{o.name}</span>
                </li>
              ))}
            </ol>
          </>
        )
      case 'photo':
        return (
          <>
            <figure ref={(el) => void (photos.current[i] = el)} className="fs-photo">
              <span className="fs-photo__frame">
                <img src={v.photo.src} alt={v.photo.alt} loading="lazy" width={640} height={480} />
                {i < LAST && <i className="fs-photo__cross" aria-hidden="true" />}
              </span>
              <i className="fs-photo__dot" aria-hidden="true">
                <span ref={(el) => void ((reads.current[i] ??= [])[0] = el)} className="fs-photo__x num" />
                <span ref={(el) => void ((reads.current[i] ??= [])[1] = el)} className="fs-photo__y num" />
              </i>
            </figure>
            {v.photo.credit && <p className="fs-credit">{v.photo.credit}</p>}
          </>
        )
      case 'panel':
        return <Panel k={i} compact={compact} />
    }
  }

  return (
    <section ref={sectionRef} id="lineage" className="fs on-yellow" aria-labelledby="fs-title">
      {/* the rows of what has been passed, over the blocks: struck, and the way back */}
      <nav ref={layer} className="fs-rows" aria-label="Replaced materials">
        <ol>
          {REPLACED.map((v, i) => (
            <li key={v.id}>
              <button ref={(el) => void (bars.current[i] = el)} type="button" className="fs-row" tabIndex={-1} onClick={() => go(i)} aria-label={`${v.name}, replaced. Back to it`}>
                <span className="fs-row__num num">0{i + 1} /</span>
                <span className="fs-row__name">{v.name}</span>
                <span className="fs-row__tag">Replaced</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {/* the yellow under the header: what scrolls up behind the rows never shows through the header */}
      <div className="fs-cap" aria-hidden="true" />

      <h2 id="fs-title" className="visually-hidden">
        What RTARIUM replaces in a façade panel
      </h2>

      {VERSIONS.map((v, i) => {
        const L = layouts[i]
        return (
          <article
            key={v.id}
            ref={(el) => void (blocks.current[i] = el)}
            className={`fs-block fs-block--${v.id} ${i === LAST ? 'fs-block--last' : ''}`}
            style={{ '--i': i } as CSSProperties}
            aria-labelledby={`fs-${v.id}`}
          >
            {rolesOf(L).map((role) => {
              const [, , rw, rh] = L.at[role]!(L.rest)
              return (
                <div
                  key={role}
                  ref={(el) => void ((cells.current[i] ??= {})[role] = el)}
                  className={`fs-cell fs-cell--${role} on-${L.ground[role]} ${L.align[role] === 'end' ? 'is-end' : ''}`}
                >
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
