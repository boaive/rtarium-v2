import { Link } from '../../lib/router'
import { usePageMeta } from '../../facade/Shell'
import { FLOORING, FLOORING_APPS } from '../content'

/** Advanced Flooring, the overview: in preparation; links to the three applications. */
export default function Overview() {
  usePageMeta(FLOORING.title, 'RTARIUM in advanced flooring: a 3D basalt reinforcement mesh for high-performance concrete overlays.')
  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page__copy">
        <h1 id="page-title" className="page__title">
          {FLOORING.title}
        </h1>
        <ul className="page__points">
          {FLOORING_APPS.map((a) => (
            <li key={a.id}>
              <Link to={a.path}>{a.title}</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
