import { FLOORING, FLOORING_APPS, type FlooringAppId } from './content'
import { Link } from '../lib/router'
import { usePageMeta } from '../facade/Shell'

/**
 * An application page still to be built: its title, its one line and the way back to the overview,
 * so the site map has somewhere to land. Each page replaces this in its own file.
 */
export function Placeholder({ id }: { id: FlooringAppId }) {
  const a = FLOORING_APPS.find((x) => x.id === id)!
  usePageMeta(a.title, `RTARIUM advanced flooring for ${a.title.toLowerCase()}.`)
  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page__copy">
        <h1 id="page-title" className="page__title">
          {a.title}
        </h1>
        <p className="page__lede">{a.line}</p>
        <p className="page__status">This page is in preparation.</p>
        <div className="page__actions">
          <Link to={FLOORING.path} className="pill pill--solid">
            Advanced Flooring overview
          </Link>
        </div>
      </div>
    </section>
  )
}
