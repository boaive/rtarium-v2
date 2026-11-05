import type { ReactNode } from 'react'
import { Compare } from '../../facade/Compare'

/**
 * Conventional screed against RTARIUM, in one table on one black screen: what goes wrong and what
 * RTARIUM does about it, row by row, RTARIUM's column on yellow. The Data & AI Centres page's by
 * default; the other applications bring their own title, rows and closing line.
 */

export interface Problem {
  id: string
  name: string
  problem: string
  head: string
  line: string
}

/*
 * The client's segment brief for hyperscale data centres (RTARIUM Flooring Strategic Briefing):
 * 40–50 mm micro-concrete toppings add dead weight to hollow-core and post-tensioned slabs; RTARIUM's
 * screed cuts it by up to 60 % (20 mm here, the client's own build: 5 + 10 mm mesh + 5); steel-fibre
 * screeds erode into conductive dust; RTARIUM is a dense, crack-free anchor for ESD coatings.
 */
const PROBLEMS: Problem[] = [
  {
    id: 'deflect',
    name: 'Slab deflection',
    problem: 'A 40–50 mm topping adds dead weight that bends prestressed slabs over time.',
    head: '20 mm instead of 50',
    line: 'Up to 60% less dead weight. The slab stays level; the racks keep their clearance.',
  },
  {
    id: 'dust',
    name: 'Conductive dust',
    problem: 'Steel fibres wear into metal dust that the cooling air carries into the servers.',
    head: 'No metal to wear away.',
    line: 'A basalt mesh has nothing in it that can turn into conductive dust.',
  },
  {
    id: 'esd',
    name: 'ESD coat failure',
    problem: 'Cracks, and gas escaping from the screed, can break the ESD coating, so static no longer reaches ground.',
    head: 'Dense and crack-free.',
    line: 'A flat, uniform anchor for a continuous ESD coating.',
  },
]
/** the client's closing line */
const CLOSE = ['Less weight.', 'No metal.', 'Cracks under control.']
const TITLE = (
  <>
    Conventional screeds were never built for data centres. <b>RTARIUM was.</b>
  </>
)

export function Problems({ problems = PROBLEMS, close = CLOSE, title = TITLE }: { problems?: Problem[]; close?: string[]; title?: ReactNode }) {
  return (
    <Compare
      id="problems"
      title={title}
      columns={[{ label: 'Conventional screed' }, { label: 'With RTARIUM', ours: true }]}
      rows={problems.map((p) => ({
        id: p.id,
        name: p.name,
        cells: [
          p.problem,
          <>
            <b className="cmp__head">{p.head}</b>
            {p.line}
          </>,
        ],
      }))}
      foot={close}
    />
  )
}
