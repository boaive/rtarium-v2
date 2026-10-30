import { useRef, useState } from 'react'
import '../../facade/overview.css'
import { Link } from '../../lib/router'
import { Arrow } from '../../facade/Shell'
import { Words, useInView } from '../../facade/Story'
import { Stage3D } from '../../facade/three/Stage3D'
import { useLive } from '../../facade/unitized/live'
import { FLOORING, FLOORING_APPS, type FlooringAppId } from '../content'
import { FlooringTrio } from '../three/FlooringTrio'

/**
 * Two more ways onto a floor, in the Façade system pages' close (`fu-more`, the overview's `fct`
 * block): the heading and the way back to the overview in the first column, the other two
 * applications in the next two, each with its floor over it as the overview shows it, its number, its
 * line and Explore. Pointing at a column fills it yellow and turns its floor towards the visitor.
 */
export function More({ current }: { current: FlooringAppId }) {
  const pick = FLOORING_APPS.map((_, n) => n).filter((n) => FLOORING_APPS[n].id !== current)
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -20% 0px')
  const section = useRef<HTMLElement>(null)
  const live = useLive(section)
  const [hover, setHover] = useState<number | null>(null)

  return (
    <section ref={section} className="fct fu-more on-light" aria-labelledby="fdc-more-title">
      <div ref={ref} className={`fu-more__grid fc-reveal ${inView ? 'is-in' : ''}`}>
        <header className="fu-more__head">
          <Words id="fdc-more-title" className="fct__title fu-more__title" lines={['Two more ways', 'onto a floor.']} />
          <Link to={FLOORING.path} className="fu-more__overview">
            Advanced Flooring overview
          </Link>
        </header>
        <div className="fct__stage fu-more__stage">
          <div className="fct__canvas" aria-hidden="true">
            <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/flooring/dc-site-strip.webp" alt="" />}>
              <FlooringTrio play={inView} hover={hover} live={live} pick={pick} />
            </Stage3D>
          </div>
          <ol className="fct__cols fu-more__cols">
            {pick.map((n, i) => {
              const a = FLOORING_APPS[n]
              return (
                <li
                  key={a.id}
                  className={`fct-col ${hover === i ? 'is-hover' : ''}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                >
                  <div className="fct-col__text">
                    <span className="fct-col__num num">0{n + 1}</span>
                    <h3 className="fct-col__name">{a.title}</h3>
                    <p className="fct-col__line">{a.line}</p>
                    <Link to={a.path} className="fc-go fct-col__go">
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
