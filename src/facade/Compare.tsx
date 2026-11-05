import type { ReactNode } from 'react'
import { useInView } from './Story'

export interface CompareColumn {
  label: string
  /** RTARIUM's column: it stands out on yellow, whatever it is set beside */
  ours?: boolean
}
export interface CompareRow {
  id: string
  name: string
  cells: ReactNode[]
}

/**
 * A comparison on one black screen: what the market does and what RTARIUM does, row by row, read at a
 * glance with nothing to scroll open. The title stands over it, an optional line closes it. Used
 * wherever a page weighs conventional products (the Rainscreen trade-offs, the three flooring pages'
 * screed against RTARIUM). Styles in `rainscreen.css`, which every page that uses it loads.
 */
export function Compare({ id, title, columns, rows, foot }: { id: string; title: ReactNode; columns: CompareColumn[]; rows: CompareRow[]; foot?: string[] }) {
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -20% 0px')
  return (
    <section id={id} className="cmp on-black" data-ground="black" aria-labelledby={`${id}-title`}>
      <div ref={ref} className={`cmp__in ${inView ? 'is-in' : ''}`}>
        <h2 id={`${id}-title`} className="cmp__title">
          {title}
        </h2>
        <table className="cmp__table" style={{ '--n': columns.length } as React.CSSProperties}>
          <thead>
            <tr>
              <td />
              {columns.map((c) => (
                <th key={c.label} scope="col" className={c.ours ? 'cmp__ours' : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ '--i': i } as React.CSSProperties}>
                <th scope="row">
                  <span className="num">0{i + 1}</span>
                  {r.name}
                </th>
                {r.cells.map((cell, k) => (
                  <td key={k} className={columns[k].ours ? 'cmp__ours' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {foot && (
          <p className="cmp__foot">
            {foot.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </p>
        )}
      </div>
    </section>
  )
}
