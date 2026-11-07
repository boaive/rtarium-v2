import { Suspense, lazy, type ReactNode } from 'react'
import { useMediaQuery } from '../lib/motion'

/**
 * Phones get a homepage of their own (src/mobile): a short story built for one thumb, rather than
 * the desktop's held, sideways-scrubbed screens stacked into a column. Everything wider keeps the
 * desktop homepage exactly as it is. The mobile page, its styles and its 3D load as their own
 * chunk, so the desktop never downloads them, and every rule in them is scoped to `.m-home`.
 */
export const MOBILE_HOME_QUERY = '(max-width: 767px)'

const MobileHome = lazy(() => import('./MobileHome'))

export function HomeSwitch({ desktop }: { desktop: ReactNode }) {
  const mobile = useMediaQuery(MOBILE_HOME_QUERY)
  if (!mobile) return <>{desktop}</>
  return (
    <Suspense fallback={<div style={{ minHeight: '100svh' }} aria-busy="true" />}>
      <MobileHome />
    </Suspense>
  )
}
