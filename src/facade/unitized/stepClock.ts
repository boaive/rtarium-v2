import { useEffect } from 'react'
import type { Progress } from '../progress'

/**
 * A phone's step played on its own clock (StepFloor, Stations with a live scene): each time step `k` comes round
 * (`turn`), `progress` eases from where it stands (from `start` on the first step) to `to`, over `ms`. The scene follows
 * `progress` as it follows the scroll on a wide screen. `onDone` is called once the step has played out (its labels up).
 */
export function useStepClock(progress: Progress, k: number, turn: number, to: number, ms: number, start = 0, onDone?: () => void) {
  useEffect(() => {
    const from = k === 0 ? start : progress.value
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / Math.max(1, ms))
      progress.value = from + (to - from) * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
      progress.listeners.forEach((f) => f())
      if (t < 1) raf = requestAnimationFrame(tick)
      else onDone?.()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, turn, progress])
}
