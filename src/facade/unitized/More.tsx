import { useRef, useState } from 'react'
import '../overview.css'
import { Link } from '../../lib/router'
import { useIsCompact } from '../../lib/motion'
import { Arrow } from '../Shell'
import { Words, useInView } from '../Story'
import { FACADE, SYSTEMS, type SystemId } from '../content'
import { Stage3D } from '../three/Stage3D'
import { SystemsTrio } from '../three/SystemsTrio'
import { useLive } from './live'

/**
 * Two more ways onto a building, in the overview's own systems block (`fct`): the heading and the way
 * back to the overview in the first column, the other two systems in the next two, each with its model
 * over it, seen from the same diagonal, its number as on the overview, its line and Explore. Pointing at
 * a column fills it yellow and turns its model towards the visitor; the whole column is the link's.
 * `current` is the page's own system, left out. The models are tall (a panel bay, a unit), so their band
 * starts at the section's line and takes more of its height, and each keeps clear room above it.
 */

export function More({ current = 'unitized' }: { current?: SystemId }) {
  const pick = SYSTEMS.map((_, n) => n).filter((n) => SYSTEMS[n].id !== current)
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -20% 0px')
  const section = useRef<HTMLElement>(null)
  const live = useLive(section)
  const [hover, setHover] = useState<number | null>(null)
  // two to a band, each model takes more of its column than the overview's three (a phone keeps its own share)
  const fill = useIsCompact() ? undefined : 0.8

  return (
    <section ref={section} className="fct fu-more fu-more--tall on-light" aria-labelledby="fu-more-title">
      <div ref={ref} className={`fu-more__grid fc-reveal ${inView ? 'is-in' : ''}`}>
        <header className="fu-more__head">
          <Words id="fu-more-title" className="fct__title fu-more__title" lines={['Two more ways', 'onto a building.']} />
          <Link to={FACADE.path} className="fu-more__overview">
            Façade & Cladding overview
          </Link>
        </header>
        <div className="fct__stage fu-more__stage">
          <div className="fct__canvas" aria-hidden="true">
            <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/panel-ivory.webp" alt="" />}>
              <SystemsTrio play={inView} hover={hover} live={live} pick={pick} fill={fill} headroom={0.13} />
            </Stage3D>
          </div>
          <ol className="fct__cols fu-more__cols">
            {pick.map((n, i) => {
              const s = SYSTEMS[n]
              return (
                <li
                  key={s.id}
                  className={`fct-col ${hover === i ? 'is-hover' : ''}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                >
                  <div className="fct-col__text">
                    <span className="fct-col__num num">0{n + 1}</span>
                    <h3 className="fct-col__name">{s.title}</h3>
                    <p className="fct-col__line">{s.short}</p>
                    <Link to={s.path} className="fc-go fct-col__go">
                      <span className="fc-go__label">Explore</span>
                      <span className="fc-go__cell" aria-hidden="true">
                        <Arrow />
                      </span>
                    </Link>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
