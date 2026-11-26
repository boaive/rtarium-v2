/**
 * The films playing on a phone's page (Home's figures where there is no 3D, and the production footage): only the one
 * most in view plays, so one film is decoded at a time, not two or three, and the scroll keeps its pace. The rest hold
 * their frame. A film is entered with how much of it is on the screen (`seenFilm`) and left when it goes (`dropFilm`).
 *
 * A figure's film (`turns`) also holds while the page moves, as its 3D card does (StageScene `pageMoving`): it is never
 * decoded mid-swipe, only carried along as a picture, and takes up its turn once the page is still again.
 */
const films = new Map<HTMLVideoElement, { seen: number; held: boolean; turns: boolean }>()

/** the page moving: the scroll changed since the last frame (as StageScene reads it, one frame at a time) */
let moving = false
let lastY = -1
let watch = 0
function still() {
  watch = 0
  const y = window.scrollY
  if (y !== lastY) {
    lastY = y
    watch = requestAnimationFrame(still)
    return
  }
  moving = false
  playOne()
}
function onScroll() {
  if (!moving) {
    moving = true
    playOne()
  }
  lastY = window.scrollY
  if (!watch) watch = requestAnimationFrame(still)
}
let listening = false
function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('scroll', onScroll, { passive: true })
}

function playOne() {
  let best: HTMLVideoElement | null = null
  let most = 0.2
  for (const [v, f] of films)
    if (!f.held && f.seen > most) {
      most = f.seen
      best = v
    }
  for (const [v, f] of films) {
    if (v === best && !(f.turns && moving)) {
      // (asked to play even before it has data: a film that loads only when asked would otherwise wait for ever)
      if (v.paused) void v.play().catch(() => {})
    } else if (!v.paused) v.pause()
  }
}

/**
 * how much of a film is on the screen (0..1), whether it is held still by the visitor, and whether it is a figure's turn
 * (held while the page moves)
 */
export function seenFilm(v: HTMLVideoElement, seen: number, held = false, turns = false) {
  if (turns) listen()
  films.set(v, { seen, held, turns })
  playOne()
}

export function dropFilm(v: HTMLVideoElement) {
  films.delete(v)
  playOne()
}

/** a film that has just become able to play: it starts if it is the one in view */
export const filmReady = playOne

/** the thresholds a film's watcher reports at */
export const FILM_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1]
