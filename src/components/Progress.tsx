import { CHAPTERS, goToStep } from './Chapter'
import { useStageValue } from '../three/stageStore'

/**
 * Where you are in the story: the current chapter's steps as segments along the bottom of the
 * screen. Passed steps are full, the current one fills in time while its sequence plays, and each
 * segment takes you to its step.
 */
export function Progress() {
  const chapter = useStageValue('chapter')
  const step = useStageValue('step')
  const ground = useStageValue('ground')
  const meta = CHAPTERS.get(chapter)

  return (
    <nav className={`progress on-${ground} ${meta ? 'is-on' : ''}`} aria-label={meta ? `${meta.title}, steps` : 'Steps'} aria-hidden={!meta}>
      {meta && (
        <>
          <span className="progress__title">{meta.title}</span>
          <ol className="progress__steps">
            {meta.labels.map((label, i) => (
              <li key={`${chapter}-${label}-${i === step}`}>
                <button
                  type="button"
                  className={`progress__step ${i < step ? 'is-done' : i === step ? 'is-active' : ''}`}
                  aria-current={i === step ? 'step' : undefined}
                  onClick={() => goToStep(chapter, i)}
                >
                  <span className="progress__fill" aria-hidden="true" />
                  <span className="progress__label">{label}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </nav>
  )
}
