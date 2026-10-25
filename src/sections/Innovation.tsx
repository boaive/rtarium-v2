import { useEffect, useState, type CSSProperties } from 'react'
import { Lines, Track, type Step } from '../components/Chapter'
import { StageLabel } from '../three/Stage'
import { stage } from '../three/stageStore'
import { prefersReducedMotion } from '../lib/motion'

/**
 * Opening the shear-plane step plays the comparison in time: a flat mesh lying on its own plane
 * first, then RTARIUM's second face and fibres grow in across it. The visitor can switch back.
 */
function ShearCompare({ active }: { active: boolean }) {
  const [flat, setFlat] = useState(false)
  useEffect(() => {
    if (!active) {
      stage.flat = 0
      setFlat(false)
      return
    }
    if (prefersReducedMotion()) return
    stage.flat = 1
    setFlat(true)
    const t = window.setTimeout(() => {
      stage.flat = 0
      setFlat(false)
    }, 2200)
    return () => window.clearTimeout(t)
  }, [active])
  const choose = (f: boolean) => {
    stage.flat = f ? 1 : 0
    setFlat(f)
  }
  return (
    <div className="toggle rv" style={{ '--i': 4 } as CSSProperties} role="group" aria-label="Compare with a flat mesh">
      <button type="button" aria-pressed={flat} tabIndex={active ? 0 : -1} onClick={() => choose(true)}>
        Flat mesh
      </button>
      <button type="button" aria-pressed={!flat} tabIndex={active ? 0 : -1} onClick={() => choose(false)}>
        RTARIUM
      </button>
    </div>
  )
}

/*
 * Innovation sets its headings on slabs of the inverse colour (black on the yellow screens,
 * yellow on the black one), so they hold their own beside the mesh.
 */
const steps: Step[] = [
  {
    id: 'depth',
    label: 'Depth',
    ground: 'yellow',
    pose: 'depth',
    // the axes grow on the left; the copy hangs from the top right
    render: () => (
      <div className="copy copy--tr">
        <Lines slab lines={['Reinforced', 'through its depth.']} />
        <p className="lead rv" style={{ '--i': 3 } as CSSProperties}>
          A flat mesh reinforces only along the sheet. RTARIUM’s connecting fibres add the third direction, so load is
          carried in X, Y and Z.
        </p>
      </div>
    ),
  },
  {
    id: 'shear',
    label: 'No weak plane',
    ground: 'yellow',
    pose: 'shear',
    // the plane is drawn upper right; the copy and the comparison sit lower left
    render: (active) => (
      <div className="copy copy--bl">
        <Lines slab lines={['No plane', 'to split along.']} />
        <p className="lead rv" style={{ '--i': 3 } as CSSProperties}>
          In thin concrete a flat mesh leaves a weak plane. RTARIUM’s fibres cross it and tie both sides together.
        </p>
        <ShearCompare active={active} />
      </div>
    ),
  },
  {
    id: 'mineral',
    label: 'No coating',
    ground: 'black',
    pose: 'mineral',
    // the fibre close up above, the statement on a ground band below it
    render: () => (
      <div className="copy copy--foot">
        <Lines slab lines={['No coating', 'to wear off.']} />
        <p className="lead rv" style={{ '--i': 3 } as CSSProperties}>
          Basalt resists alkali by its mineral nature, so RTARIUM needs no chemical top-coating. It does not corrode.
        </p>
      </div>
    ),
  },
]

export function Innovation() {
  return (
    <>
      <Track id="innovation" title="Innovation" steps={steps} />
      <StageLabel anchor="axis-x">X</StageLabel>
      <StageLabel anchor="axis-y">Y</StageLabel>
      <StageLabel anchor="axis-z">Z, through the depth</StageLabel>
      <StageLabel anchor="shear-plane">The plane between the faces</StageLabel>
    </>
  )
}
