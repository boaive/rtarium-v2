/**
 * A scroll recorder for a real phone, on only with `?probe` in the address (never otherwise loaded). Every frame it
 * notes how long the frame took and where the page is; per section (the one holding the screen's middle) it counts
 * the frames that came late (over 25 ms, a dropped frame; over 50 ms, a visible hitch), the browser's long tasks, and
 * the times the page turned back on itself after a swipe had let go (two scroll drivers pulling against each other:
 * CLAUDE.md rule 1). A small box in the corner shows the totals; tap it for the table per section, tap again to clear.
 */
type Row = { frames: number; late: number; hitch: number; worst: number; long: number; longMs: number; turns: number }

export function startProbe() {
  const rows = new Map<string, Row>()
  const row = (id: string) => {
    let r = rows.get(id)
    if (!r) rows.set(id, (r = { frames: 0, late: 0, hitch: 0, worst: 0, long: 0, longMs: 0, turns: 0 }))
    return r
  }
  const sectionAt = () => {
    const mid = window.innerHeight / 2
    for (const el of document.querySelectorAll<HTMLElement>('main section[id], section[id], [data-screen]')) {
      const b = el.getBoundingClientRect()
      if (b.top <= mid && b.bottom > mid && b.height > 0) return el.id || el.className.split(' ')[0] || '?'
    }
    return window.scrollY < window.innerHeight * 4 ? 'hero' : '?'
  }

  let fingerDown = false
  let liftedAt = 0
  window.addEventListener('touchstart', () => (fingerDown = true), { passive: true, capture: true })
  const up = () => {
    fingerDown = false
    liftedAt = performance.now()
  }
  window.addEventListener('touchend', up, { passive: true, capture: true })
  window.addEventListener('touchcancel', up, { passive: true, capture: true })

  try {
    new PerformanceObserver((list) => {
      const r = row(sectionAt())
      for (const e of list.getEntries()) {
        r.long++
        r.longMs += e.duration
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch {
    /* (no long tasks here: Safari) */
  }

  let last = performance.now()
  let lastY = window.scrollY
  let dir = 0
  const frame = (now: number) => {
    const dt = now - last
    last = now
    const y = window.scrollY
    const dy = y - lastY
    lastY = y
    // (only frames where the page is moving count: a still page idles at whatever pace)
    if (Math.abs(dy) >= 0.5) {
      const r = row(sectionAt())
      r.frames++
      if (dt > 25) r.late++
      if (dt > 50) r.hitch++
      r.worst = Math.max(r.worst, dt)
      const d = Math.sign(dy)
      // a turn back while no finger is on the screen, within 1.5 s of the swipe letting go
      if (dir && d !== dir && !fingerDown && now - liftedAt < 1500) r.turns++
      dir = d
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  const box = document.createElement('div')
  box.setAttribute('data-lenis-prevent', '')
  box.style.cssText =
    'position:fixed;z-index:2147483647;left:6px;bottom:6px;max-width:calc(100vw - 12px);max-height:70vh;overflow:auto;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,.82);color:#fff;font:11px/1.35 ui-monospace,monospace;white-space:pre;pointer-events:auto'
  document.body.appendChild(box)
  let open = false
  box.addEventListener('click', () => {
    if (open) rows.clear()
    open = !open
    paint()
  })
  const paint = () => {
    const all = [...rows.entries()]
    const sum = all.reduce((a, [, r]) => ({ late: a.late + r.late, hitch: a.hitch + r.hitch, long: a.long + r.long, turns: a.turns + r.turns, frames: a.frames + r.frames }), { late: 0, hitch: 0, long: 0, turns: 0, frames: 0 })
    if (!open) {
      box.textContent = `probe  frames ${sum.frames}  late ${sum.late}  hitch ${sum.hitch}  long ${sum.long}  turns ${sum.turns}`
      return
    }
    const pad = (s: string | number, n: number) => String(s).padStart(n)
    const lines = ['section        frm late hit worst long  ms turn']
    for (const [id, r] of all) lines.push(`${id.slice(0, 14).padEnd(14)} ${pad(r.frames, 4)} ${pad(r.late, 4)} ${pad(r.hitch, 3)} ${pad(Math.round(r.worst), 5)} ${pad(r.long, 4)} ${pad(Math.round(r.longMs), 4)} ${pad(r.turns, 4)}`)
    lines.push(`${innerWidth}x${innerHeight} dpr ${devicePixelRatio}  tap: clear`)
    box.textContent = lines.join('\n')
  }
  window.setInterval(paint, 500)
}
