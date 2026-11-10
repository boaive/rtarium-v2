import { useEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { scrollToY, stepScreens } from '../lib/scroll'
import { prefersReducedMotion, useIsCompact } from '../lib/motion'
import type { Ground } from '../three/stageStore'
import { Stage3D, LabelProjector, Labels, MovingKeyLight, type LabelSpec } from './three/Stage3D'
import { createBus } from './three/kit'
import { CellRig, type CellShot } from './three/CellRig'
import { CladdingPanel, CUT_TARGET, PANEL_TARGET } from './three/CladdingPanel'
import { smooth, STORY_STEP } from './progress'


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
 *   - as it goes, its row is lowered into place under the header (an index: it takes you back to the block), and
 *     its boxes close diagonally into the far corner while it is still on screen: the panel's box
 *     shrinks to its edge as the yellow one grows, the photograph's frame shrinks back into its corner;
 *   - black and white change places from block to block, the panel changes sides, the yellow stays; the
 *     words always read left to right: the name in the top left box, what it comes to beside it.
 *
 * RTARIUM closes it apart from them, still, in two boxes: its photograph full-bleed on one side, and on black on
 * the other why it replaces them, large, with the way on; the rows go up as it comes. Only the materials' 3D has
 * motion of its own: a slow sway, in time.
 */

type Role = 'name' | 'limit' | 'claim' | 'photo' | 'panel'
type Rect = [number, number, number, number]
type Cut = [number, number]
/** the order of the boxes in the document: what they say, read in order */
const ORDER: Role[] = ['name', 'limit', 'claim', 'photo', 'panel']

interface Layout {
  /** where the cuts cross while the block is read, as it comes up, and as it goes */
  rest: Cut
  entry: Cut
  exit: Cut
  at: Partial<Record<Role, (c: Cut) => Rect>>
  ground: Partial<Record<Role, Ground>>
}

const tl = (c: Cut): Rect => [0, 0, c[0], c[1]]
const tr = (c: Cut): Rect => [c[0], 0, 1 - c[0], c[1]]
const bl = (c: Cut): Rect => [0, c[1], c[0], 1 - c[1]]
const br = (c: Cut): Rect => [c[0], c[1], 1 - c[0], 1 - c[1]]

/**
 * Wide screens. The words always read left to right: the name top left, what it comes to beside it. The
 * blocks take turns at the foot: the panel's box (the largest) at the bottom right on black, or at the
 * bottom left on warm white.
 */
const WIDE_RIGHT: Layout = {
  rest: [0.42, 0.4],
  entry: [0, 0],
  exit: [1, 1],
  at: { name: tl, limit: tr, photo: bl, panel: br },
  ground: { name: 'yellow', limit: 'light', photo: 'light', panel: 'black' },
}
const WIDE_LEFT: Layout = {
  rest: [0.58, 0.4],
  entry: [1, 0],
  exit: [0, 1],
  at: { name: tl, limit: tr, panel: bl, photo: br },
  ground: { name: 'yellow', limit: 'black', photo: 'black', panel: 'light' },
}
/**
 * RTARIUM, in the boxes of the blocks before it: its name top left, why it replaces them beside it, its
 * photograph at the foot and its panel at the bottom right. It opens and closes as they do, diagonally,
 * into the far corner as it goes. Black and white change places from the block before.
 */
const WIDE_LAST: Layout = {
  rest: WIDE_RIGHT.rest,
  entry: WIDE_RIGHT.entry,
  exit: WIDE_RIGHT.exit,
  at: { name: tl, claim: tr, photo: bl, panel: br },
  ground: { name: 'yellow', claim: 'black', photo: 'black', panel: 'light' },
}

/** narrow screens: name, why it is replaced, the panel, the photograph, top to bottom (c: where the panel begins and ends) */
function narrow(ground: Layout['ground']): Layout {
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
  }
}
const NARROW_LAST: Layout = {
  rest: [0.66, 0.84],
  entry: [1, 1],
  exit: [0.66, 0.84],
  at: {
    name: () => [0, 0, 1, 0.16],
    panel: (c) => [0, 0.16, 1, c[0] - 0.16],
    photo: (c) => [0, c[0], 1, c[1] - c[0]],
    claim: (c) => [0, c[1], 1, 1 - c[1]],
  },
  ground: { name: 'yellow', panel: 'yellow', photo: 'yellow', claim: 'yellow' },
}
const WIDE: Layout[] = [WIDE_RIGHT, WIDE_LEFT, WIDE_RIGHT, WIDE_LAST]
const NARROW: Layout[] = [narrow(WIDE_RIGHT.ground), narrow(WIDE_LEFT.ground), narrow(WIDE_RIGHT.ground), NARROW_LAST]

export interface Version {
  id: string
  name: string
  full: string
  /** why it was used, and why it is replaced; RTARIUM says why it replaces them */
  used?: string
  replaced?: string
  claim?: string
  /** a few facts set small under the claim (RTARIUM only) */
  facts?: string[]
  /** RTARIUM's closing card: a line under the claim, and where it leads (`#id` scrolls to that part of the page) */
  line?: string
  more?: { label: string; to: string }
  /** the label over its second box, when it is not the story's own (`words.replaced`) */
  label?: string
  /** what its row says at its end, if anything */
  tag?: string
  /** what the marker on the panel calls it */
  material: string
  thick: number
  /** its photograph (a story that sets a second model in the photograph's box goes without); `ratio` its frame's width over height, `pos` what to keep in it */
  photo?: { src: string; alt: string; credit?: string; ratio?: number; pos?: string }
}

/** the words a story sets over its boxes (the façade's, by default) */
export interface LineageWords {
  title: string
  rows: string
  used: string
  replaced: string
  claim: string
}
const FACADE_WORDS: LineageWords = {
  title: 'What RTARIUM replaces in a façade panel',
  rows: 'What RTARIUM replaces',
  used: 'Why it was used',
  replaced: 'Why it is replaced',
  claim: 'Why it replaces them',
}

const VERSIONS: Version[] = [
  {
    id: 'steel',
    name: 'Steel bar',
    full: 'Reinforced concrete',
    used: 'High tensile strength, decades of precedent.',
    replaced: 'Rust expands, concrete cracks, cover thickens, weight adds up.',
    material: 'Steel bar',
    thick: 100,
    photo: { src: '/img/facade/steel-bar.webp', alt: 'Ribbed steel reinforcing bars stacked side by side, rusting' },
  },
  {
    id: 'grc',
    name: 'GFRC / GRC',
    full: 'Glass fibre reinforced concrete',
    used: 'Light enough to hang on any façade.',
    replaced: 'Over time, alkali attacks the fibre. Strength and toughness go with it.',
    material: 'AR-glass fibre',
    thick: 20,
    photo: { src: '/img/facade/glass-fibre.webp', alt: 'A heap of short chopped glass fibre strands' },
  },
  {
    id: 'uhpc',
    name: 'UHPC',
    full: 'Ultra-high performance concrete',
    used: 'Thinner sections, higher strength.',
    replaced: 'Steel fibre corrodes. Aligned fibre leaves weaker directions.',
    material: 'Steel micro-fibre',
    thick: 20,
    photo: {
      src: '/img/facade/steel-fibres.webp',
      // supplied by the team: its source and licence are still to be confirmed
      alt: 'A break through fibre reinforced concrete, steel fibres standing out of both faces',
    },
  },
  {
    id: 'trc',
    name: 'RTARIUM',
    full: '3-d mesh reinforcement',
    claim: 'Thin at 20 mm. Reinforced in three dimensions. Non-corrosive.',
    line: 'One 3D basalt mesh in place of steel bar, AR-glass fibre and steel fibre in a thin façade panel.',
    more: { label: 'See the three systems', to: '#systems' },
    material: 'RTARIUM 3D basalt mesh',
    thick: 20,
    photo: { src: '/img/shoot/mesh-profile.webp', alt: 'An RTARIUM sheet seen edge-on: two basalt mesh faces with fibres looping between them' },
  },
]

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
  const LAST = VERSIONS.length - 1
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

/** a line revealed by a block of its own colour: the block runs across it, the words come up under it, it runs off */
function Masked({ k, children }: { k: number; children: ReactNode }) {
  return (
    <span className="fs-mask" style={{ '--k': k } as CSSProperties}>
      <span className="fs-mask__in">{children}</span>
    </span>
  )
}

/**
 * RTARIUM's closing card, in two boxes and still: its photograph full-bleed on the left; on black on the right, the
 * label of the card top left, then its name, why it replaces the others (a sentence a line), what that comes to, and
 * the way on. As it comes into view its name and claim are revealed line by line, each under a block of its own
 * colour that runs across it and off (as Enerblock's headings are), and the rest rises after them; it plays again
 * each time the card comes back into view.
 */
function Closing({ v, i, words, blockRef }: { v: Version; i: number; words: LineageWords; blockRef: (el: HTMLElement | null) => void }) {
  const lines = (v.claim ?? '').split(/(?<=\.)\s+/).filter(Boolean)
  const card = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = card.current
    if (!el || prefersReducedMotion()) return
    // hidden until it plays; without script, or under reduced motion, it is simply there
    el.classList.add('is-armed')
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.45) el.classList.add('is-in')
        else if (!e.isIntersecting) el.classList.remove('is-in')
      },
      { threshold: [0, 0.45] },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      el.classList.remove('is-armed', 'is-in')
    }
  }, [])
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    const to = v.more?.to
    if (!to?.startsWith('#')) return
    const el = document.querySelector<HTMLElement>(to)
    if (!el) return
    e.preventDefault()
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
    scrollToY(el.getBoundingClientRect().top + window.scrollY - navH)
  }
  return (
    <article
      ref={(el) => {
        card.current = el
        blockRef(el)
      }}
      className={`fs-block fs-block--${v.id} fs-block--last fs-duo`}
      style={{ '--i': i } as CSSProperties}
      aria-labelledby={`fs-${v.id}`}
    >
      <figure className="fs-duo__media">
        {v.photo && <img src={v.photo.src} alt={v.photo.alt} loading="lazy" width={1280} height={960} style={v.photo.pos ? { objectPosition: v.photo.pos } : undefined} />}
      </figure>
      <div className="fs-duo__panel on-black">
        <div className="fs-duo__top fs-rise" style={{ '--d': '0s' } as CSSProperties}>
          <p className="fs-label">{words.claim}</p>
        </div>
        <div className="fs-duo__head">
          <h3 id={`fs-${v.id}`} className="fs-duo__name">
            <Masked k={0}>{v.name}</Masked>
          </h3>
          <p className="fs-duo__full fs-rise" style={{ '--d': '0.7s' } as CSSProperties}>
            {v.full}
          </p>
        </div>
        <div className="fs-duo__body">
          <p className="fs-duo__claim">
            {lines.map((l, j) => (
              <Masked key={l} k={j + 2}>
                {l}
              </Masked>
            ))}
          </p>
          {v.facts && (
            <ul className="fs-facts">
              {v.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {v.line && (
            <p className="fs-duo__line fs-rise" style={{ '--d': `${0.95 + lines.length * 0.12}s` } as CSSProperties}>
              {v.line}
            </p>
          )}
          {v.more && (
            <a className="explore explore--yellow fs-duo__more fs-rise" style={{ '--d': `${1.1 + lines.length * 0.12}s` } as CSSProperties} href={v.more.to} onClick={go}>
              <span className="explore__label">{v.more.label}</span>
              <span className="explore__cell" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="20" height="20">
                  <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </span>
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * The story, for any set of versions: the façade's by default. Another page brings its own versions
 * (the last is RTARIUM), its own model for the panel's box and its own words; the boxes, the rows and
 * the motion are the same.
 */
export function Lineage({
  sectionRef,
  versions = VERSIONS,
  panel = (k, compact) => <Panel k={k} compact={compact} />,
  words = FACADE_WORDS,
  id = 'lineage',
  finale = true,
  second,
  fromTop = false,
  after,
  paged = false,
}: {
  sectionRef: RefObject<HTMLElement | null>
  live?: { current: boolean }
  versions?: Version[]
  panel?: (k: number, compact: boolean) => ReactNode
  /** a second model, in the photograph's box: a block that shows two things side by side, each in 3D (none: its photograph) */
  second?: (k: number, compact: boolean) => ReactNode
  words?: LineageWords
  id?: string
  /** whether the page steps from its very top (its opening screen) into the story, rather than scrolling freely down to it */
  fromTop?: boolean
  /** where the page rests after the story (the sections under it, the page's foot): the same one scroll a step on past it */
  after?: () => number[]
  /** the page steps through it with its own stepper (usePageSteps): where each block is read is written on the section */
  paged?: boolean
  /**
   * Whether the last version closes the story in a layout of its own, the rows of the others going up as it comes
   * (the façade's RTARIUM). Without it every version is a block like the others, and the rows leave with the section.
   */
  finale?: boolean
}) {
  const compact = useIsCompact()
  const LAST = finale ? versions.length - 1 : versions.length
  // the materials alternate sides; RTARIUM, last, has its own layout
  const layouts = useMemo(() => versions.map((_, k) => (k === LAST ? (compact ? NARROW_LAST : WIDE_LAST) : (compact ? NARROW : WIDE)[k % 2])), [versions, LAST, compact])
  const REPLACED = useMemo(() => (finale ? versions.slice(0, LAST) : versions), [versions, LAST, finale])

  const layer = useRef<HTMLElement>(null)
  const blocks = useRef<(HTMLElement | null)[]>([])
  const cells = useRef<Partial<Record<Role, HTMLDivElement | null>>[]>([])
  const inners = useRef<Partial<Record<Role, HTMLDivElement | null>>[]>([])
  const photos = useRef<(HTMLElement | null)[]>([])
  const reads = useRef<(HTMLSpanElement | null)[][]>([])
  /** the rows of what has been passed: an index, the way back */
  const bars = useRef<(HTMLButtonElement | null)[]>([])

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
        // RTARIUM's closing card holds still: nothing of it moves with the scroll
        if (finale && k === LAST) return
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
        // block goes, its size read out at the corner
        const ph = photos.current[k]
        if (ph) {
          const g = reduced ? 1 : Math.max(0.04, p >= 0 ? 1 - smooth(OPENED, 0.85, p) : 1 - smooth(CLOSING, CLOSED + 0.05, p))
          ph.style.setProperty('--g', g.toFixed(4))
          let size = sizes.get(ph)
          if (!size) sizes.set(ph, (size = [ph.offsetWidth, ph.offsetHeight]))
          const [rx, ry] = reads.current[k] ?? []
          if (rx) rx.textContent = `X: ${Math.round(g * size[0])}`
          if (ry) ry.textContent = `Y: ${Math.round(g * size[1])}`
        }
      })

      // the rows. As a block goes, its row is drawn in under the header, the block's words passing up behind
      // it. They leave as what follows comes up to them: RTARIUM's layout, or the section's foot
      REPLACED.forEach((_, k) => {
        const bar = bars.current[k]
        if (!bar) return
        const rise = reduced ? Number(q[k] < -0.1) : smooth(-0.02, -0.3, q[k])
        const edge = finale ? blocks.current[LAST]?.getBoundingClientRect().top : blocks.current[blocks.current.length - 1]?.getBoundingClientRect().bottom
        const stack = REPLACED.length * rowH
        const under = Math.min(0, (edge ?? Infinity) - (navH + stack))
        // RTARIUM's rows are clear of the header by the time it reaches it: nothing shows behind the logo
        const leave = finale ? (under * (navH + stack)) / Math.max(1, stack) : under
        // lowered into its slot from under the row above, as on the flooring pages: only what has come down past the
        // slot's top shows, solid, so the block's words pass behind it
        const e = ease(rise)
        bar.style.transform = `translate(0px, ${(navH + k * rowH - (1 - e) * rowH - layerTop + leave).toFixed(1)}px)`
        bar.style.width = `${W}px`
        bar.style.opacity = rise > 0 ? '1' : '0'
        bar.style.clipPath = `inset(${((1 - e) * 100).toFixed(2)}% 0 0 0)`
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
  }, [layouts, LAST, REPLACED, finale])

  // one scroll, one material (and, from the top, one scroll from the opening into the first): the page glides from
  // where a block is read to where the next is, and the one closes and the next opens on the way; above and below
  // the story the page scrolls freely
  useEffect(() => {
    /** where each block is read: the page there, the block held under the rows of those before it */
    const reads = () => {
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      const rowH = bars.current[0]?.offsetHeight ?? 0
      return blocks.current.flatMap((b, k) => (b ? [Math.round(b.getBoundingClientRect().top + window.scrollY - (k < LAST ? navH + k * rowH : navH))] : []))
    }
    if (paged) {
      // the page's one scroll a step goes through it: where each block is read, points of its run, both ways
      const el = sectionRef.current
      if (!el) return
      const write = () => {
        const top = el.getBoundingClientRect().top + window.scrollY
        const run = Math.max(1, el.offsetHeight - window.innerHeight)
        el.dataset.stops = reads()
          .map((y) => ((y - top) / run).toFixed(5))
          .join(',')
      }
      el.dataset.noTop = ''
      el.dataset.back = 'all'
      write()
      window.addEventListener('resize', write)
      return () => window.removeEventListener('resize', write)
    }
    return stepScreens(
      () => {
        const at = reads()
        const all = fromTop && at.length && at[0] > 0 ? [0, ...at] : at
        return after ? [...all, ...after().filter((y) => !all.length || y > all[all.length - 1] + 4)] : all
      },
      { time: STORY_STEP },
    )
  }, [LAST, fromTop, after, paged, sectionRef])

  /** a row takes you back to its material: the scroll where its block is read */
  const go = (i: number) => {
    const b = blocks.current[i]
    if (!b) return
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
    const rowH = bars.current[0]?.offsetHeight ?? 0
    scrollToY(b.getBoundingClientRect().top + window.scrollY - (navH + i * rowH))
  }

  /** what each block sets in its photograph's box in place of the photograph, if anything */
  const seconds = versions.map((_, i) => second?.(i, compact) ?? null)

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
            {v.used && (
              <div className="fs-used">
                <p className="fs-label">{words.used}</p>
                <p className="fs-used__text">{v.used}</p>
              </div>
            )}
          </>
        )
      case 'limit':
        return (
          <>
            {(v.label ?? words.replaced) && <p className="fs-label">{v.label ?? words.replaced}</p>}
            <p className="fs-limit">{v.replaced}</p>
          </>
        )
      case 'claim':
        return (
          <>
            <p className="fs-label">{words.claim}</p>
            {v.facts ? (
              <div className="fs-say">
                <p className="fs-claim">{v.claim}</p>
                <ul className="fs-facts">
                  {v.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="fs-claim">{v.claim}</p>
            )}
          </>
        )
      case 'photo':
        if (seconds[i]) return seconds[i]
        if (!v.photo) return null
        return (
          <>
            <figure ref={(el) => void (photos.current[i] = el)} className="fs-photo" style={v.photo.ratio ? ({ '--ar': v.photo.ratio } as CSSProperties) : undefined}>
              <span className="fs-photo__frame">
                <img src={v.photo.src} alt={v.photo.alt} loading="lazy" width={640} height={480} style={v.photo.pos ? { objectPosition: v.photo.pos } : undefined} />
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
        return panel(i, compact)
    }
  }

  return (
    <section ref={sectionRef} id={id} className="fs on-yellow" aria-labelledby="fs-title">
      {/* the rows of what has been passed, over the blocks: an index, the way back */}
      <nav ref={layer} className="fs-rows" aria-label={words.rows}>
        <ol>
          {REPLACED.map((v, i) => (
            <li key={v.id}>
              <button ref={(el) => void (bars.current[i] = el)} type="button" className="fs-row" tabIndex={-1} onClick={() => go(i)} aria-label={`${v.name}. Back to it`}>
                <span className="fs-row__num num">0{i + 1} /</span>
                <span className="fs-row__name">{v.name}</span>
                {v.tag && <span className="fs-row__tag">{v.tag}</span>}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {/* the yellow under the header: what scrolls up behind the rows never shows through the header */}
      <div className="fs-cap" aria-hidden="true" />

      <h2 id="fs-title" className="visually-hidden">
        {words.title}
      </h2>

      {versions.map((v, i) => {
        const L = layouts[i]
        if (finale && i === LAST) return <Closing key={v.id} v={v} i={i} words={words} blockRef={(el) => void (blocks.current[i] = el)} />
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
                  className={`fs-cell fs-cell--${role} on-${L.ground[role]} ${role === 'photo' && seconds[i] ? 'is-3d' : ''}`}
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
