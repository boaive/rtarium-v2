import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { scrollToY } from '../lib/scroll'
import { useIsCompact } from '../lib/motion'
import { Arrow } from '../facade/Shell'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus } from '../facade/three/kit'
import { FollowScroll, smooth, usePlay } from '../facade/progress'

/** where each of a build's four steps has played out, as points of the section's run */
const STREAM_ENDS = [0, 1, 2, 3].map((i) => Math.min(1, (i + 0.95) / 4))
import { REPLAY_HINT, StepBar } from '../facade/unitized/StepBar'
import { closerAt, StreamScene } from './three/StreamScene'
import { buildingOf, quantities, type BuildId } from './three/buildings'
import type { Room } from './three/fit'
import { Block, Figures, Sheet, Steps, useSheet } from './Sheet'
import { HomePlan, InfillSection, PortalSection, ShedElevation } from './Diagrams'
import { CASES, REVIEW, STREAMS, type StreamId } from './content'

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

function Build({ id }: { id: StreamId }) {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<'rc' | 'peb'>('rc')
  const which: BuildId = id === 'housing' ? 'housing' : id === 'industrial' ? 'hub' : frame
  const building = useMemo(() => buildingOf(which), [which])
  const [progress, seek] = usePlay(section, PLAY)
  const bus = useMemo(createBus, [])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const [step, setStep] = useState(0)
  /** played to its end: its bar says its steps can be picked to be seen again */
  const [ended, setEnded] = useState(false)
  const [shown, setShown] = useState<string[]>([])
  const room = useRef<Room>({ x: 0.05, y: 0.2, w: 0.9, h: 0.62 })
  const [sheet, openSheet] = useSheet()
  const edge = useRef<HTMLDivElement>(null)
  const study = CASES[which]
  const stream = STREAMS.find((s) => s.id === id)!
  // the finished build's still (the frame stream's card shows the RC frame; its steel portal has its own)
  const still = which === 'peb' ? { src: '/img/walls/streams/peb.webp', alt: 'The steel portal built in 3D: RTARIUM panels outside its frame, a door in its side wall' } : stream.still
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

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const head = pin.current?.querySelector('.wp-build__head')?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !head || !bar || !p.width || !p.height) return
      const y0 = head.bottom + 20
      const y1 = bar.top - 24
      const r = (room.current = { x: (bar.left - p.left) / p.width, y: (y0 - p.top) / p.height, w: bar.width / p.width, h: (y1 - y0) / p.height })
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
  }, [compact])

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

  const go = (i: number) => seek(STREAM_ENDS[i])

  return (
    <>
      <section ref={section} id="stream-build" className="fu-hang wp-build on-light" aria-labelledby="wp-build-title" style={{ '--run': 1 } as CSSProperties}>
        <div ref={pin} className="fu-hang__pin">
          <div className="wp-build__head">
            <h2 id="wp-build-title" className="fu-hang__title">
              {study.title}.
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
          <StepBar label={`${study.title}, step by step`} names={building.steps} step={step} onGo={go} cellRef={(i, el) => void (cells.current[i] = el)} hint={ended ? REPLAY_HINT : null} />
        </div>

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
      </section>
      {/* once it is built: what was built, in figures counted off the model, and the way into its case study */}
      <section className="wp-built on-light" aria-labelledby="wp-built-title">
        <div className="wp-built__words">
          <p className="wp-built__kicker">Illustrative case study</p>
          <h2 id="wp-built-title" className="wp-built__title">
            {study.title.includes(',') ? `${study.title}.` : `${study.title}, built.`}
          </h2>
          <p className="wp-built__lede">{study.brief}</p>
        </div>
        <div className="wp-built__side">
          <dl className="wp-built__figs">
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
              <dt>Panels&rsquo; weight</dt>
              <dd className="num">
                {totals.tonnes.toFixed(1)}
                <small>t</small>
              </dd>
            </div>
          </dl>
          <p className="wp-built__line">How it goes up, its quantities, a drawing, what it needs, its advantages and its limits.</p>
          <button type="button" className="fc-go wp-go" onClick={openSheet}>
            <span className="fc-go__label">View the case study</span>
            <span className="fc-go__cell" aria-hidden="true">
              <Arrow />
            </span>
          </button>
        </div>
      </section>
    </>
  )
}

export function Streams() {
  const [chosen, setChosen] = useState<StreamId | null>(null)
  // once a stream is chosen (or another one), its build comes up under the choice
  const pending = useRef(false)
  useEffect(() => {
    if (!chosen || !pending.current) return
    pending.current = false
    const id = window.setTimeout(() => {
      const el = document.getElementById('stream-build')
      if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY)
    }, 60)
    return () => window.clearTimeout(id)
  }, [chosen])
  const choose = (id: StreamId) => {
    pending.current = true
    setChosen(id)
  }

  return (
    <>
      <section id="streams" className="wp-streams on-light" aria-labelledby="wp-streams-title">
        <header className="wp-streams__head">
          <h2 id="wp-streams-title" className="wp-streams__title">
            Explore a system.
          </h2>
        </header>
        <ol className="wp-streams__cols">
          {STREAMS.map((s, i) => (
            <li key={s.id} className={`wp-stream ${chosen === s.id ? 'is-on' : ''}`} style={{ '--i': i } as CSSProperties}>
              <figure className="wp-stream__still">
                <img src={s.still.src} alt={s.still.alt} loading="lazy" decoding="async" width={960} height={640} />
              </figure>
              <span className="wp-stream__num num">0{i + 1} /</span>
              <h3 className="wp-stream__name">
                {s.head[0]} <br />
                {s.head[1]}
              </h3>
              <p className="wp-stream__line">{s.line}</p>
              <button type="button" className="fc-go wp-stream__go" aria-pressed={chosen === s.id} onClick={() => choose(s.id)}>
                <span className="fc-go__label">{chosen === s.id ? 'Exploring' : 'Explore'}</span>
                <span className="fc-go__cell" aria-hidden="true">
                  <Arrow />
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      {chosen && <Build key={chosen} id={chosen} />}
      {chosen && (
        <nav className="wp-others on-light" aria-label="The other streams">
          <p className="wp-others__label">The other streams</p>
          <ul className="wp-others__list">
            {STREAMS.filter((s) => s.id !== chosen).map((s) => (
              <li key={s.id}>
                <button type="button" className="fc-go wp-others__go" onClick={() => choose(s.id)}>
                  <span className="fc-go__label">{s.name}</span>
                  <span className="fc-go__cell" aria-hidden="true">
                    <Arrow />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  )
}
