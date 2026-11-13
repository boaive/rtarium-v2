/**
 * The 3D scenes still to be built ahead (Stage3D's queue), shared with the opening (src/opener.ts) without bringing the
 * 3D into the first script: while the opening shows, the page cannot scroll, so every scene is built then, back to back,
 * and the opening waits for them, so none is built as the visitor scrolls up to it. `stage`: the phone's shared stage still
 * priming (StageScene draws every card once, in every program it will use, behind the opening, never first mid-swipe).
 */
export const builds = { waiting: 0, stage: 0, tail: 0 }

/** the opening is showing (index.html's overlay, played by src/opener.ts) */
export const opening = () => typeof document !== 'undefined' && document.documentElement.classList.contains('is-opening')
