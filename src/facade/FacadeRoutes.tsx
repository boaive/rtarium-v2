import './facade.css'
import { FACADE, systemByPath } from './content'
import { NotFound } from '../pages/Planned'
import Overview from './pages/Overview'
import Unitized from './pages/Unitized'
import Rainscreen from './pages/Rainscreen'
import StudFrame from './pages/StudFrame'

/** Façade & Cladding: its overview and its three system pages, loaded together as one chunk. */
export default function FacadeRoutes({ path }: { path: string }) {
  if (path === FACADE.path) return <Overview />
  switch (systemByPath(path)?.id) {
    case 'unitized':
      return <Unitized />
    case 'rainscreen':
      return <Rainscreen />
    case 'stud':
      return <StudFrame />
    default:
      return <NotFound />
  }
}
