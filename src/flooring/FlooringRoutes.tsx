import '../facade/facade.css'
import { FLOORING, flooringAppByPath } from './content'
import { NotFound } from '../pages/Planned'
import Overview from './pages/Overview'
import DataCentres from './pages/DataCentres'
import AutomatedWarehouse from './pages/AutomatedWarehouse'
import SemiconductorPlant from './pages/SemiconductorPlant'

/** Advanced Flooring: its overview and its three application pages, loaded together as one chunk. */
export default function FlooringRoutes({ path }: { path: string }) {
  if (path === FLOORING.path) return <Overview />
  switch (flooringAppByPath(path)?.id) {
    case 'data':
      return <DataCentres />
    case 'warehouse':
      return <AutomatedWarehouse />
    case 'semiconductor':
      return <SemiconductorPlant />
    default:
      return <NotFound />
  }
}
