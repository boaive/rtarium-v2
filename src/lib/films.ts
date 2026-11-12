/**
 * The films playing on a phone's page (Home's figures, recorded from the 3D, and the production footage): only the one
 * most in view plays, so one film is decoded at a time, not two or three, and the scroll keeps its pace. The rest hold
 * their frame. A film is entered with how much of it is on the screen (`seenFilm`) and left when it goes (`dropFilm`).
 */
const films = new Map<HTMLVideoElement, { seen: number; held: boolean }>()

function playOne() {
  let best: HTMLVideoElement | null = null
  let most = 0.2
  for (const [v, f] of films)
    if (!f.held && f.seen > most) {
      most = f.seen
      best = v
    }
  for (const v of films.keys()) {
    if (v === best) {
      // (asked to play even before it has data: a film that loads only when asked would otherwise wait for ever)
      if (v.paused) void v.play().catch(() => {})
    } else if (!v.paused) v.pause()
  }
}

/** how much of a film is on the screen (0..1), and whether it is held still by the visitor */
export function seenFilm(v: HTMLVideoElement, seen: number, held = false) {
  films.set(v, { seen, held })
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
