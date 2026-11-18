import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { scrollToY } from '../lib/scroll'
import { useRoute } from '../lib/router'
import { DeckCards, type DeckItem } from '../facade/DeckCards'
import { useIsCompact, COMPACT_QUERY } from '../lib/motion'
import { Arrow } from '../facade/Shell'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus, type LabelBus } from '../facade/three/kit'
import { FollowScroll, smooth, usePlay, type Progress } from '../facade/progress'

/** where each of a build's four steps has played out, as points of the section's run */
const STREAM_ENDS = [0, 1, 2, 3].map((i) => Math.min(1, (i + 0.95) / 4))
import { REPLAY_HINT, StepBar } from '../facade/unitized/StepBar'
import { closerAt, StreamScene } from './three/StreamScene'
import { WallsTrio } from './three/WallsTrio'
import { useInView } from '../facade/Story'
import { useLive } from '../facade/unitized/live'
import { buildingOf, quantities, type BuildId } from './three/buildings'
import type { Room } from './three/fit'
import { Block, Figures, Sheet, Steps, useSheet } from './Sheet'
import { HomePlan, InfillSection, PortalSection, ShedElevation } from './Diagrams'
import { CASES, REVIEW, STREAMS, type StreamId } from './content'
import { WaysCards } from '../facade/WaysCards'
import { FrameStations } from '../flooring/FrameStations'

/**
 * Streams, on warm white. First the choice: three cards, as the overview's systems stand, each with a still of its
 * own finished build, its one line and a way in. Choosing one opens its build under it, pinned as the Unitized
 * page's slab to slab, put up as on site: it opens on one panel already in its place, the frame round it, and draws
 * back as the frame is drawn out; one wall; the walls the building needs next; the rest, and the finish; the bar along
 * the foot. Once it is built, a space of its own follows: what
 * was built, its figures counted off the model, and the way into its illustrative case study (which opens over the
 * page). A frame structure is an RC frame or a steel portal on one footprint: a switch over the stage changes it.
 */

/** seconds for the whole sequence, played on one scroll once the section is on screen (as the warehouse's frame to floor) */
const PLAY = 9

/** a figure counted up from nothing once it is in view, in a second and a half, easing out */
function Count({ to, digits = 0, go }: { to: number; digits?: number; go: boolean }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!go) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setV(to)
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / 1500)
      setV(to * (1 - Math.pow(1 - u, 3)))
      if (u < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [go, to])
  return <>{v.toFixed(digits)}</>
}

/**
 * A stream, built: a screen of its own. On the left what was built, its line, its figures counted up as the screen
 * arrives and the way into its case study; on the right the building itself, finished, large, turning slowly, what it
 * has going for it set over its foot.
 */
function Built({
  which,
  title,
  brief,
  pros,
  totals,
  openSheet,
  frame,
}: {
  which: BuildId
  title: string
  brief: string
  pros: string[]
  totals: { panels: number; area: number; tonnes: number }
  openSheet: () => void
  /** the frame stream: its two frames, switched here as on the build above */
  frame?: { on: 'rc' | 'peb'; set: (f: 'rc' | 'peb') => void }
}) {
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -25% 0px')
  const section = useRef<HTMLElement>(null)
  const live = useLive(section)
  const ids = useMemo(() => [which], [which])
  return (
    <section ref={section} className="wp-built on-light" aria-labelledby="wp-built-title">
      <div ref={ref} className={`wp-built__words fc-reveal ${inView ? 'is-in' : ''}`}>
        <p className="wp-built__kicker">Illustrative case study</p>
        {frame && (
          <div className="wp-switch wp-built__switch" role="group" aria-label="Frame">
            {(['rc', 'peb'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={frame.on === f} className={frame.on === f ? 'is-on' : ''} onClick={() => frame.set(f)}>
                {f === 'rc' ? 'RC frame' : 'Steel portal (PEB)'}
              </button>
            ))}
          </div>
        )}
        <h2 id="wp-built-title" className="wp-built__title">
          {title.includes(',') ? `${title}.` : `${title}, built.`}
        </h2>
        <p className="wp-built__lede">{brief}</p>
        <dl className="wp-built__figs">
          <div>
            <dt>Panels</dt>
            <dd className="num">
              <Count to={totals.panels} go={inView} />
            </dd>
          </div>
          <div>
            <dt>Wall area</dt>
            <dd className="num">
              <Count to={Math.round(totals.area)} go={inView} />
              <small>m²</small>
            </dd>
          </div>
          <div>
            <dt>Panels&rsquo; weight</dt>
            <dd className="num">
              <Count to={totals.tonnes} digits={1} go={inView} />
              <small>t</small>
            </dd>
          </div>
        </dl>
        <button type="button" className="fc-go wp-go" onClick={openSheet}>
          <span className="fc-go__label">View the case study</span>
          <span className="fc-go__cell" aria-hidden="true">
            <Arrow />
          </span>
        </button>
      </div>
      <div className="wp-built__stage">
        <div className="wp-built__canvas" aria-hidden="true">
          <Stage3D shadows keyLight={false}>
            <WallsTrio ids={ids} play={inView} hover={null} live={live} fill={0.62} height={0.62} spin />
          </Stage3D>
        </div>
        {/* what it has going for it, over the building's foot */}
        <ul className={`wp-built__pros ${inView ? 'is-in' : ''}`} aria-label="Its advantages">
          {pros.slice(0, 3).map((n, i) => (
            <li key={n} style={{ '--i': i } as CSSProperties}>
              {n}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** a phone: what each step of a build does, in a line (StepFloor) */
const LINES: Record<BuildId, [string, string, string, string]> = {
  housing: [
    'One panel stands in its U-track; the slab and the frame are drawn round it.',
    'The front wall goes up, panels laid flat over each opening.',
    'Full-height panels close the sides and the rear.',
    'The partitions go in; the roof is left as its frame.',
  ],
  hub: [
    'One panel in its place; the steel columns go up round it at 5.8 m.',
    'One bay: 100 mm SIP to 3.6 m, 30 mm solid above it to 8 m.',
    'The loading face: a lintel over the bay, a shutter in the side.',
    'The walls close round the whole hub.',
  ],
  rc: ['One panel in its place; the RC frame is drawn round it.', 'Vertical SIP fills one bay, slab to beam.', 'The infill goes on, floor by floor.', 'The frame closed in, the windows go in last.'],
  peb: [
    'One panel in its place; the tapered steel portal goes up round it.',
    'Outside the frame: SIP to 3.6 m, solid above.',
    'The side wall goes on, a shutter cut into it.',
    'Gable panels cut to the roof’s pitch close it in.',
  ],
}

type Built3D = ReturnType<typeof buildingOf>
const NO_LABELS: LabelSpec[] = []
const NO_SHOWN: string[] = []

/**
 * A phone's build, as the warehouse's frame to floor is on one (FrameStations: the Unitized page's slab to slab), the
 * steps playing themselves one after another on a floor, each played out from where the last left off over its share
 * of the wide screen's play, its marks up once it has.
 */
function BuildPhone({ which, building, title, still }: { which: BuildId; building: Built3D; title: string; still: string }) {
  const Scene = useMemo(
    () =>
      function Scene({ progress, bus, room }: { progress: Progress; bus: LabelBus; room: { current: unknown } }) {
        return <StreamScene progress={progress} bus={bus} room={room as { current: Room }} building={building} />
      },
    [building],
  )
  return (
    <FrameStations
      key={which}
      id="stream-build"
      title={`${title}.`}
      sub={`Four steps — ${building.steps[0].toLowerCase()} to ${building.steps[3].toLowerCase()}`}
      phases={building.steps.map((name, i) => ({
        name,
        line: LINES[which][i],
        to: STREAM_ENDS[i],
      }))}
      play={PLAY}
      Scene={Scene}
      // (no labels on a phone: the step's line under the heading says what is going on)
      labels={NO_LABELS}
      shownAt={() => NO_SHOWN}
      fallback={<img className="fu-still" src={still} alt="" />}
    />
  )
}

/**
 * A phone: a system on a page of its own (/wall-panels/<system>), as the façade's systems each have one, without their
 * opening: on yellow, its name and its brief; the systems to go between as a row of pills (and the frame's two frames);
 * its figures, counted off the building; the way into its case study; the building itself, finished, turning slowly.
 * Then the build on white, step by step; why it works, dealt as cards on black (DeckCards); the other two systems.
 */

function SystemPage({
  id,
  which,
  building,
  study,
  totals,
  openSheet,
  still,
  frame,
}: {
  id: StreamId
  which: BuildId
  building: Built3D
  study: (typeof CASES)[BuildId]
  totals: { panels: number; area: number; tonnes: number }
  openSheet: () => void
  still: string
  frame?: { on: 'rc' | 'peb'; set: (f: 'rc' | 'peb') => void }
}) {
  const { go } = useRoute()
  const live = useMemo(() => ({ current: true }), [])
  const ids = useMemo(() => [which], [which])
  const items: DeckItem[] = useMemo(
    () =>
      WHYS[which].map((w, i) => ({
        id: `${which}-${i}`,
        name: w.name,
        full: study.title,
        icon: (
          <span className="vs__glyph" aria-hidden="true">
            {WHY_ICONS[w.icon]}
          </span>
        ),
        parts: [{ label: 'Why it works', text: w.text }],
      })),
    [which, study.title],
  )
  return (
    <>
      <div className="fu" data-ground="yellow">
        <section className="wsys" aria-labelledby="wsys-title">
        <p className="wsys__kicker">Illustrative case study</p>
        <h2 id="wsys-title" className="wsys__title">
          {study.title.includes(',') ? `${study.title}.` : `${study.title}, built.`}
        </h2>
        <p className="wsys__lede">{study.brief}</p>
        {frame && (
          <>
            <p className="wsys__label">Frame</p>
            <div className="wsys__pills" role="group" aria-label="Frame">
              {(['rc', 'peb'] as const).map((f) => (
                <button key={f} type="button" aria-pressed={frame.on === f} className={frame.on === f ? 'is-on' : ''} onClick={() => frame.set(f)}>
                  {f === 'rc' ? 'RC frame' : 'Steel portal'}
                </button>
              ))}
            </div>
          </>
        )}
        <dl className="wsys__figs">
          <div>
            <dt>Panels</dt>
            <dd className="num">{totals.panels}</dd>
          </div>
          <div>
            <dt>Wall area</dt>
            <dd className="num">
              {Math.round(totals.area)}
              <small>m²</small>
            </dd>
          </div>
          <div>
            <dt>Weight</dt>
            <dd className="num">
              {totals.tonnes.toFixed(1)}
              <small>t</small>
            </dd>
          </div>
        </dl>
        <div className="wsys__ways">
          <button type="button" className="wsys__btn" onClick={openSheet}>
            Case study
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </button>
        </div>
        <div className="wsys__model" aria-hidden="true">
          <Stage3D shadows keyLight={false} fallback={<img src={still} alt="" />}>
            <WallsTrio ids={ids} play hover={null} live={live} fill={0.86} height={0.7} spin />
          </Stage3D>
        </div>
        </section>
      </div>
      <div className="fu" data-ground="light">
        <BuildPhone which={which} building={building} title={study.title} still={still} />
      </div>
      <div className="fu" data-ground="black">
        <DeckCards key={which} id="wsys-why" title="Why it works." items={items} ground="black" />
      </div>
      <div className="fu" data-ground="light">
        <StreamsCards id="other-streams" title="Two more systems." leave={id} chosen={null} onChoose={(s) => go(STREAMS.find((x) => x.id === s)!.path)} />
      </div>
    </>
  )
}

/** what each build has going for it, a card each: a short name over what it gives (from its case study's advantages) */
type WhyIcon = 'bolt' | 'warm' | 'shield' | 'thin' | 'dry' | 'floor'
const WHYS: Record<BuildId, { icon: WhyIcon; name: string; text: string }[]> = {
  housing: [
    { icon: 'bolt', name: 'Dry, bolted walls', text: 'No welding and no wet trades for the walls: panels slid into a U-track and bolted.' },
    { icon: 'warm', name: 'Insulated all round', text: 'A 100 mm SIP panel in every wall, its concrete faces inside and out.' },
    { icon: 'shield', name: 'Nothing to rust', text: 'Basalt reinforcement: fire-rated, non-magnetic, made to the millimetre to one layout.' },
  ],
  hub: [
    { icon: 'thin', name: 'Slender, wide bays', text: 'Hyper-slender 30 mm solid panels cross 5.8 m bays, up to 8 m.' },
    { icon: 'warm', name: 'Insulated where needed', text: 'SIP panels only round the conditioned zone at the docks; solid panels above.' },
    { icon: 'bolt', name: 'Weld-free, tough', text: 'A bolted assembly, with high impact resistance at the working level.' },
  ],
  rc: [
    { icon: 'floor', name: 'Thin, light infill', text: 'At 74 kg/m², a thin wall that leaves more floor inside the same frame.' },
    { icon: 'bolt', name: 'Dry and bolted', text: 'Set storey by storey, made to the millimetre, bolted to plates in the columns.' },
    { icon: 'shield', name: 'Nothing to rust', text: 'Rust-proof, fire-rated and non-magnetic.' },
  ],
  peb: [
    { icon: 'bolt', name: 'No welding', text: 'A concrete wall on a steel frame, bolted and cleated.' },
    { icon: 'dry', name: 'The steel kept dry', text: 'Panels outside the frame: the steel stays inside, out of the weather.' },
    { icon: 'warm', name: 'Insulated where needed', text: 'SIP panels below, 30 mm solid above. Rust-proof, fire-rated, non-magnetic.' },
  ],
}
const WHY_ICONS: Record<WhyIcon, ReactNode> = {
  bolt: (
    <svg viewBox="0 0 40 40">
      <path d="M8 12h24M8 28h24M14 12v16M26 12v16" />
      <circle className="vs__glyph-fill" cx="20" cy="20" r="4" />
    </svg>
  ),
  warm: (
    <svg viewBox="0 0 40 40">
      <path d="M8 8v24M32 8v24" />
      <path className="vs__glyph-fill" d="M13 8h14v24H13z" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 40 40">
      <path d="M20 6l12 5v9c0 7-5 12-12 14-7-2-12-7-12-14v-9z" />
      <path className="vs__glyph-fill" d="M15 20l4 4 7-8" />
    </svg>
  ),
  thin: (
    <svg viewBox="0 0 40 40">
      <path d="M6 32h28M6 8v24M34 8v24" />
      <path className="vs__glyph-fill" d="M18 8h4v24h-4z" />
    </svg>
  ),
  dry: (
    <svg viewBox="0 0 40 40">
      <path d="M8 16l12-9 12 9M12 16v16h16V16" />
      <path className="vs__glyph-fill" d="M17 22h6v10h-6z" />
    </svg>
  ),
  floor: (
    <svg viewBox="0 0 40 40">
      <path d="M6 10h28v20H6zM10 10v20M30 10v20" />
      <path className="vs__glyph-fill" d="M14 14h12v12H14z" />
    </svg>
  ),
}

function Build({ id, page }: { id: StreamId; /** a phone: the system's own page (SystemPage) */ page?: boolean }) {
  const compact = useIsCompact()
  const [frame, setFrame] = useState<'rc' | 'peb'>('rc')
  const which: BuildId = id === 'housing' ? 'housing' : id === 'industrial' ? 'hub' : frame
  const building = useMemo(() => buildingOf(which), [which])
  const [sheet, openSheet] = useSheet()
  const study = CASES[which]
  const stream = STREAMS.find((s) => s.id === id)!
  // the finished build's still (the frame stream's card shows the RC frame; its steel portal has its own)
  const still =
    which === 'peb'
      ? {
          src: '/img/walls/streams/peb.webp',
          alt: 'The steel portal built in 3D: RTARIUM panels outside its frame, a door in its side wall',
        }
      : stream.still
  const labels: LabelSpec[] = useMemo(
    () =>
      building.marks.map((k) => ({
        id: k.id,
        anchor: `st-${k.id}`,
        text: k.text,
        dx: k.dx,
        dy: k.dy,
      })),
    [building],
  )
  // the case study's figures, counted off the building itself
  const totals = useMemo(() => {
    const q = quantities(building)
    const area = q.sip.area + q.solid.area
    return {
      panels: q.sip.n + q.solid.n,
      area,
      tonnes: (q.sip.area * 74 + q.solid.area * 70) / 1000,
    }
  }, [building])
  const figures = useMemo(() => {
    const q = quantities(building)
    const rows: [string, string, string][] = []
    for (const [kind, name, kg] of [
      ['sip', '100 mm SIP', 74],
      ['solid', '30 mm solid', 70],
    ] as const) {
      const k = q[kind]
      if (!k.n) continue
      rows.push([`${name} panels`, `${k.n}`, ''], [`${name}, wall area`, k.area.toFixed(0), 'm²'], [`${name}, weight at ${kg} kg/m²`, ((k.area * kg) / 1000).toFixed(1), 't'])
    }
    rows.push(['Ferrule inserts, for fixing', `${q.ferrules}`, ''], ['Tie holes, 20 mm, to lift by', `${q.ties}`, ''])
    return rows
  }, [building])

  const sheetEl = (
  <Sheet dialog={sheet} kicker="Illustrative case study" title={study.title} review={REVIEW.caseStudy}>
    <p className="wp-sheet__lede">{study.brief}</p>
    <div className="wp-sheet__grid">
      <Block label="The challenge">
        <p className="wp-sheet__para">{study.challenge}</p>
      </Block>
      <div className="wp-sheet__side">
        <Block label="The RTARIUM wall">
          <ul className="wp-list">
            {study.wall.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Block>
      </div>
      <Block label="Quantities, from the panels’ own figures" wide>
        <Figures rows={figures} />
      </Block>
      <Block label="How it goes up">
        <Steps items={study.sequence} />
      </Block>
      <div className="wp-sheet__side">
        <Block label="What it needs">
          <ul className="wp-list">
            {study.needs.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Block>
      </div>
      <Block label="Drawing" wide>
        {which === 'housing' ? <HomePlan /> : which === 'hub' ? <ShedElevation /> : which === 'rc' ? <InfillSection /> : <PortalSection />}
      </Block>
      <Block label="The build, finished" wide>
        <img className="wp-sheet__still" src={still.src} alt={still.alt} loading="lazy" decoding="async" />
      </Block>
      <Block label="Advantages">
        <ul className="wp-list wp-list--plus">
          {study.pros.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Block>
      <Block label="Limitations">
        <ul className="wp-list wp-list--minus">
          {study.limits.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Block>
    </div>
  </Sheet>
  )
  // a phone: the system on a page of its own (SystemPage)
  if (compact && page)
    return (
      <>
        <SystemPage id={id} which={which} building={building} study={study} totals={totals} openSheet={openSheet} still={still.src} frame={id === 'frame' ? { on: frame, set: setFrame } : undefined} />
        {sheetEl}
      </>
    )
  return (
    <>
      {compact ? (
        <BuildPhone which={which} building={building} title={study.title} still={still.src} />
      ) : (
        <BuildPinned id={id} which={which} building={building} labels={labels} title={study.title} frame={frame} setFrame={setFrame} />
      )}
      {sheetEl}
      {/* once it is built: the building itself, finished, turning; what it is, its figures counted off the model as the
          screen arrives, what it has going for it, and the way into its case study */}
      <Built which={which} title={study.title} brief={study.brief} pros={study.pros} totals={totals} openSheet={openSheet} frame={id === 'frame' ? { on: frame, set: setFrame } : undefined} />
    </>
  )
}

/** the wide screen's build: pinned, played by the scroll, the bar along the foot */
function BuildPinned({
  id,
  which,
  building,
  labels,
  title,
  frame,
  setFrame,
}: {
  id: StreamId
  which: BuildId
  building: Built3D
  labels: LabelSpec[]
  title: string
  frame: 'rc' | 'peb'
  setFrame: (f: 'rc' | 'peb') => void
}) {
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const [progress, seek] = usePlay(section, PLAY)
  const bus = useMemo(createBus, [])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const [step, setStep] = useState(0)
  /** played to its end: its bar says its steps can be picked to be seen again */
  const [ended, setEnded] = useState(false)
  const [shown, setShown] = useState<string[]>([])
  const room = useRef<Room>({ x: 0.05, y: 0.2, w: 0.9, h: 0.62 })
  const edge = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const head = pin.current?.querySelector('.wp-build__head')?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !head || !bar || !p.width || !p.height) return
      const y0 = head.bottom + 20
      const y1 = bar.top - 24
      const r = (room.current = {
        x: (bar.left - p.left) / p.width,
        y: (y0 - p.top) / p.height,
        w: bar.width / p.width,
        h: (y1 - y0) / p.height,
      })
      // the room's edge, shown while the camera is in on the first panel
      const e = edge.current
      if (e) {
        e.style.left = `${(r.x * 100).toFixed(3)}%`
        e.style.top = `${(r.y * 100).toFixed(3)}%`
        e.style.width = `${(r.w * 100).toFixed(3)}%`
        e.style.height = `${(r.h * 100).toFixed(3)}%`
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    const paint = () => {
      const t = progress.value * 4
      setEnded(progress.value >= 0.995)
      edge.current?.style.setProperty('--z', closerAt(t).toFixed(3))
      const k = Math.min(3, Math.floor(t))
      setStep(k)
      for (let i = 0; i < 4; i++) {
        const el = cells.current[i]
        if (!el) continue
        el.style.setProperty('--f', smooth(i, i + 0.9, t).toFixed(4))
        el.style.setProperty('--c', (i < 3 ? smooth(i + 0.92, i + 1, t) : 0).toFixed(4))
      }
      // each mark while what it names is in view and done
      const on = building.marks.filter((m) => t >= m.show[0] && t < m.show[1]).map((m) => m.id)
      setShown((s) => (s.join() === on.join() ? s : on))
    }
    paint()
    progress.listeners.add(paint)
    return () => void progress.listeners.delete(paint)
  }, [progress, building])

  // a step of the bar: played in full, from where the step before it ends
  const go = (i: number) => seek(STREAM_ENDS[i], i ? STREAM_ENDS[i - 1] : 0)

  return (
    <section ref={section} id="stream-build" className="fu-hang wp-build on-light" aria-labelledby="wp-build-title" style={{ '--run': 1 } as CSSProperties}>
      <div ref={pin} className="fu-hang__pin">
        <div className="wp-build__head">
          <h2 id="wp-build-title" className="fu-hang__title">
            {title}.
          </h2>
          <div className="wp-build__tools">
            {id === 'frame' && (
              <div className="wp-switch" role="group" aria-label="Frame">
                {(['rc', 'peb'] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={frame === f} className={frame === f ? 'is-on' : ''} onClick={() => setFrame(f)}>
                    {f === 'rc' ? 'RC frame' : 'Steel portal (PEB)'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="fu-hang__stage" aria-hidden="true">
          <Stage3D shadows keyLight={false}>
            <StreamScene progress={progress} bus={bus} room={room} building={building} />
            <FollowScroll progress={progress} />
            <LabelProjector bus={bus} bottom={110} />
          </Stage3D>
          <Labels key={which} bus={bus} labels={labels} shown={shown} />
          <div ref={edge} className="wp-edge" />
        </div>
        <StepBar label={`${title}, step by step`} names={building.steps} step={step} onGo={go} cellRef={(i, el) => void (cells.current[i] = el)} hint={ended ? REPLAY_HINT : null} />
      </div>
    </section>
  )
}

/** each stream's own build, in the columns' order: the home, the logistics hub, the RC frame infilled */
const TRIO: BuildId[] = ['housing', 'hub', 'rc']

/**
 * The streams' close (the façade and flooring pages' `fu-more` grammar): a band under the header, its line, the heading's
 * column, then a column for each stream, its building standing over it, rising in turn as the block arrives and turning
 * when its column is pointed at; its number, its name, its line and the way in. `leave`: the stream already shown,
 * left out, so the block is the other two.
 */
type BlockProps = {
  id: string
  title: string
  leave?: StreamId
  chosen: StreamId | null
  onChoose: (id: StreamId) => void
}

function StreamsBlock(props: BlockProps) {
  return useIsCompact() ? <StreamsCards {...props} /> : <StreamsColumns {...props} />
}

/** a phone: the systems as every family's close is (WaysCards, Home's row of cards), a building on each; its way in opens
 * the system's build under the row, as the wide screen's Explore does */
function StreamsCards({ id, title, leave, onChoose }: BlockProps) {
  const pick = STREAMS.map((_, n) => n).filter((n) => STREAMS[n].id !== leave)
  const words = title.replace(/\.$/, '').split(' ')
  const cut = Math.ceil(words.length / 2)
  return (
    <WaysCards
      id={id}
      lines={[words.slice(0, cut).join(' '), `${words.slice(cut).join(' ')}.`]}
      label="The wall panel systems"
      items={pick.map((n) => ({
        id: STREAMS[n].id,
        title: STREAMS[n].name,
        num: n + 1,
        of: STREAMS.length,
        go: () => onChoose(STREAMS[n].id),
      }))}
      model={(i, front, play, live) => (
        <Stage3D shadows keyLight={false}>
          <WallsTrio ids={[TRIO[pick[i]]]} play={play} hover={front ? 0 : null} live={live} fill={0.9} />
        </Stage3D>
      )}
    />
  )
}

function StreamsColumns({ id, title, leave, chosen, onChoose }: BlockProps) {
  const pick = STREAMS.map((_, n) => n).filter((n) => STREAMS[n].id !== leave)
  const ids = useMemo(() => pick.map((n) => TRIO[n]), [pick.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const [cols, inView] = useInView<HTMLOListElement>('0px 0px -20% 0px')
  const close = useRef<HTMLElement>(null)
  const live = useLive(close)
  const [hover, setHover] = useState<number | null>(null)
  // the buildings' room: the columns' top down to where their words start, measured, so each building stands in the
  // middle of the space over its words
  const stage = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<number | null>(null)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => {
      const stills = [...el.querySelectorAll<HTMLElement>('.wp-stream__still')]
      if (!stills.length) return
      const top = el.getBoundingClientRect().top
      setRoom(Math.max(140, Math.round(Math.min(...stills.map((x) => x.getBoundingClientRect().bottom)) - top)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <section ref={close} id={id} className={`wp-streams ${pick.length === 2 ? 'wp-streams--two' : ''} on-light`} aria-labelledby={`${id}-title`}>
      <header className="wp-streams__head">
        <h2 id={`${id}-title`} className="wp-streams__title">
          {title}
        </h2>
      </header>
      <div ref={stage} className="wp-streams__stage">
        <div className="wp-streams__canvas" aria-hidden="true" style={room ? { height: room } : undefined}>
          <Stage3D shadows keyLight={false}>
            <WallsTrio ids={ids} play={inView} hover={hover} live={live} />
          </Stage3D>
        </div>
        <ol ref={cols} className="wp-streams__cols">
          {pick.map((n, i) => {
            const s = STREAMS[n]
            return (
              <li
                key={s.id}
                className={`wp-stream ${chosen === s.id ? 'is-on' : ''} ${hover === i ? 'is-hover' : ''}`}
                style={{ '--i': i } as CSSProperties}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
              >
                {/* room for its building, which stands here in the canvas over the columns */}
                <figure className="wp-stream__still" role="img" aria-label={s.still.alt} />
                <span className="wp-stream__num num">0{n + 1} /</span>
                <h3 className="wp-stream__name">
                  {s.head[0]} <br />
                  {s.head[1]}
                </h3>
                <p className="wp-stream__line">{s.line}</p>
                <button type="button" className="fc-go wp-stream__go" data-track={`Explore ${s.head.join(' ')}`} aria-pressed={chosen === s.id} onClick={() => onChoose(s.id)}>
                  <span className="fc-go__label">{chosen === s.id ? 'Exploring' : 'Explore'}</span>
                  <span className="fc-go__cell" aria-hidden="true">
                    <Arrow />
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

/** a phone: a system's own page (/wall-panels/<system>) */
export function SystemRoute({ id }: { id: StreamId }) {
  return <Build key={id} id={id} page />
}

export function Streams({ initial = null }: { /** a wide screen opened on a system's own address: that system, chosen */ initial?: StreamId | null }) {
  const [chosen, setChosen] = useState<StreamId | null>(initial)
  const { go } = useRoute()
  // once a stream is chosen (or another one), its build comes up under the choice
  const pending = useRef(!!initial)
  useEffect(() => {
    if (!chosen || !pending.current) return
    pending.current = false
    const id = window.setTimeout(() => {
      const el = document.getElementById('stream-build')
      if (!el) return
      const y = el.getBoundingClientRect().top + window.scrollY
      // (a phone: straight there; its smooth scroll is set aside while the page steps a swipe at a time, and a glide asked of
      // it went nowhere, and so did a jump through it)
      if (window.matchMedia(COMPACT_QUERY).matches) window.scrollTo({ top: y, behavior: 'instant' })
      else scrollToY(y)
    }, 60)
    return () => window.clearTimeout(id)
  }, [chosen])
  const choose = (id: StreamId) => {
    pending.current = true
    setChosen(id)
  }
  const compact = useIsCompact()
  // a phone: the carousel, then the footer; a system picked opens its own page (SystemRoute)
  if (compact) return <StreamsBlock id="streams" title="Explore a system." chosen={null} onChoose={(s) => go(STREAMS.find((x) => x.id === s)!.path)} />
  return (
    <>
      <StreamsBlock id="streams" title="Explore a system." chosen={chosen} onChoose={choose} />
      {chosen && <Build key={chosen} id={chosen} />}
      {/* the other two, in the same block: a stream a column, its building over it */}
      {chosen && <StreamsBlock key={`others-${chosen}`} id="other-streams" title="Two more systems." leave={chosen} chosen={null} onChoose={choose} />}
    </>
  )
}
