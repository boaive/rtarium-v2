import { useEffect, useRef } from 'react'
import { CHAPTERS, goToStep } from './Chapter'
import { useStageValue } from '../three/stageStore'
import { StepBar } from '../facade/unitized/StepBar'
import { scrollToY } from '../lib/scroll'

/** how far the screen's own sequence has played (0..1): its timed reveals, word by word and piece by piece */
function played(scene: Element | null) {
  if (!scene) return 0
  let end = 0
  let now = 0
  for (const a of scene.getAnimations({ subtree: true })) {
    const timing = a.effect?.getComputedTiming()
    const e = Number(timing?.endTime ?? 0)
    // a loop (a video's, a sway) has no end to fill towards
    if (!Number.isFinite(e) || e <= 0) continue
    end = Math.max(end, e)
    now = Math.max(now, Math.min(e, Number(a.currentTime ?? 0)))
  }
  return end > 0 ? now / end : 1
}

/**
 * Where you are in the story: the current chapter's steps in the product pages' bar along the foot of
 * the screen (StepBar). A passed step closes to its number, the ones to come stand open, and the current
 * one fills with its screen's own sequence, as its words and pieces come in; each cell takes you to its
 * step, and Skip goes past the chapter. A chapter of a single step shows none.
 */
export function Progress() {
  const chapter = useStageValue('chapter')
  const step = useStageValue('step')
  const ground = useStageValue('ground')
  // a chapter of one step has nowhere to go: no bar for it (its cells would be buttons that do nothing)
  const found = CHAPTERS.get(chapter)
  const meta = found && found.labels.length > 1 ? found : undefined
  const cells = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    if (!meta) return
    let raf = 0
    const tick = () => {
      const scene = document.querySelector(`#${CSS.escape(chapter)} .scene.is-active`)
      const f = played(scene)
      cells.current.forEach((el, k) => el?.style.setProperty('--f', k < step ? '1' : k === step ? f.toFixed(3) : '0'))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [chapter, step, meta])

  const past = () => {
    const section = document.getElementById(chapter)
    if (section) scrollToY(section.getBoundingClientRect().bottom + window.scrollY)
  }

  return (
    <div className={`progress on-${ground} ${meta ? 'is-on' : ''}`} aria-hidden={!meta}>
      {meta && (
        <StepBar
          key={chapter}
          label={`${meta.title}, steps`}
          names={meta.labels}
          step={step}
          onGo={(i) => goToStep(chapter, i)}
          cellRef={(k, el) => void (cells.current[k] = el)}
          onSkip={past}
        />
      )}
    </div>
  )
}
