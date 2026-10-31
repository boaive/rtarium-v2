/**
 * Advanced Flooring: the section's pages, its site map.
 *
 * Source: the client's Advanced Flooring brief (owner, 30 Oct 2026): RTARIUM as the intermediate
 * reinforcement layer for high-performance concrete overlays on structural slabs, in three
 * applications. The overview, Data & AI Centres and Semiconductor Plant are built; Automated Warehouse
 * is still a placeholder. Each application page is its own file under `pages/`.
 */

export const FLOORING = { path: '/advanced-flooring', title: 'Advanced Flooring' } as const

export type FlooringAppId = 'data' | 'warehouse' | 'semiconductor'

export interface FlooringApp {
  id: FlooringAppId
  path: string
  title: string
  /** what the floor has to do there, in one line */
  line: string
}

export const FLOORING_APPS: FlooringApp[] = [
  {
    id: 'data',
    path: '/advanced-flooring/data-ai-centres',
    title: 'Data & AI Centres',
    line: 'Heavy racks on a floor that must never crack.',
  },
  {
    id: 'warehouse',
    path: '/advanced-flooring/automated-warehouse',
    title: 'Automated Warehouse',
    line: 'Flat, jointless floors for robots running all day.',
  },
  {
    id: 'semiconductor',
    path: '/advanced-flooring/semiconductor-plant',
    title: 'Semiconductor Plant',
    line: 'Still, inert floors for cleanrooms and their tools.',
  },
]

export const flooringAppByPath = (path: string) => FLOORING_APPS.find((a) => a.path === path)
