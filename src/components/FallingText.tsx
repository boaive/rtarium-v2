import { useEffect, useMemo, useRef } from 'react'
import Matter from 'matter-js'
import './FallingText.css'

/**
 * After FallingText, from React Bits: a sentence that shatters into its words, on real physics (matter-js). `fallen`
 * drives it: turned on, the words are blown outward from the middle of the box and rain down to its foot; turned off
 * they fly back into place and the sentence stands whole again. Once down they can be picked up, dragged and thrown,
 * and a quick swipe knocks them about.
 */

const STEP = 1000 / 120
const WALL = 400
const GRAVITY = 1.4
const BOUNCE = 0.32
/** how hard the blast throws a word, at its centre and at the edge of the sentence */
const BLAST = [20, 9]
const SPRING = 'cubic-bezier(0.34, 1.4, 0.64, 1)'
/** how tightly a dragged word follows the pointer, and how hard a quick swipe knocks the words */
const STIFFNESS = 0.2
const PUSH = 0.5

interface Piece {
  element: HTMLElement
  body: Matter.Body
  w: number
  h: number
  x0: number
  y0: number
  px: number
  py: number
  pa: number
  pushed?: number
}

export function FallingText({ text, fallen }: { text: string; fallen: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])
  /** turns the fall on and off, from the effect that owns the physics */
  const control = useRef<{ fall: () => void; restore: () => void } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    const block = textRef.current
    if (!container || !block) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let phase: 'idle' | 'falling' | 'restoring' = 'idle'
    let engine: Matter.Engine | null = null
    let pieces: Piece[] = []
    let walls: Matter.Body[] = []
    let raf = 0
    let last = 0
    let accumulator = 0
    let drag: { constraint: Matter.Constraint; id: number } | null = null
    const pointer = { x: 0, y: 0, vx: 0, vy: 0, time: 0 }

    const local = (event: PointerEvent) => {
      const box = container.getBoundingClientRect()
      return { x: event.clientX - box.left, y: event.clientY - box.top }
    }

    const placeWalls = () => {
      if (!engine) return
      const width = container.clientWidth
      const height = container.clientHeight
      const [floor, left, right, ceiling] = walls
      Matter.Body.setPosition(floor, { x: width / 2, y: height + WALL / 2 })
      Matter.Body.setPosition(left, { x: -WALL / 2, y: height / 2 })
      Matter.Body.setPosition(right, { x: width + WALL / 2, y: height / 2 })
      Matter.Body.setPosition(ceiling, { x: width / 2, y: -WALL / 2 })
      pieces.forEach((piece) => Matter.Sleeping.set(piece.body, false))
    }

    const draw = (alpha: number) => {
      for (const piece of pieces) {
        const { body } = piece
        const x = piece.px + (body.position.x - piece.px) * alpha
        const y = piece.py + (body.position.y - piece.py) * alpha
        const angle = piece.pa + (body.angle - piece.pa) * alpha
        piece.element.style.transform = `translate3d(${(x - piece.w / 2).toFixed(2)}px, ${(y - piece.h / 2).toFixed(2)}px, 0) rotate(${angle.toFixed(4)}rad)`
      }
    }

    const frame = (now: number) => {
      raf = 0
      if (!engine) return
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60)
      last = now
      accumulator += dt * 1000
      while (accumulator >= STEP) {
        for (const piece of pieces) {
          piece.px = piece.body.position.x
          piece.py = piece.body.position.y
          piece.pa = piece.body.angle
        }
        Matter.Engine.update(engine, STEP)
        accumulator -= STEP
      }
      draw(accumulator / STEP)
      // settled: nothing left to draw until it is told otherwise
      if (drag || !pieces.every((piece) => piece.body.isSleeping)) raf = requestAnimationFrame(frame)
    }

    const wake = () => {
      if (!raf && engine) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }

    const fall = () => {
      if (phase !== 'idle' || reduced) return
      const elements = [...block.querySelectorAll<HTMLElement>('[data-piece]')]
      if (!elements.length) return
      const box = container.getBoundingClientRect()
      const rects = elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left - box.left, y: rect.top - box.top, w: rect.width, h: rect.height }
      })
      block.style.minHeight = `${block.offsetHeight}px`
      const world = Matter.Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 })
      world.gravity.y = GRAVITY
      walls = [
        Matter.Bodies.rectangle(0, 0, 10000, WALL, { isStatic: true, friction: 0.8 }),
        Matter.Bodies.rectangle(0, 0, WALL, 10000, { isStatic: true, friction: 0.3 }),
        Matter.Bodies.rectangle(0, 0, WALL, 10000, { isStatic: true, friction: 0.3 }),
        Matter.Bodies.rectangle(0, 0, 10000, WALL, { isStatic: true, friction: 0.3 }),
      ]
      const cx = container.clientWidth / 2
      const cy = rects.reduce((sum, rect) => sum + rect.y + rect.h / 2, 0) / rects.length
      const reach = Math.max(1, ...rects.map((rect) => Math.hypot(rect.x + rect.w / 2 - cx, rect.y + rect.h / 2 - cy)))
      pieces = elements.map((element, index) => {
        const rect = rects[index]
        const body = Matter.Bodies.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(2, rect.w - 1), Math.max(2, rect.h - 1), {
          chamfer: { radius: 4 },
          restitution: BOUNCE,
          friction: 0.4,
          frictionStatic: 0.8,
          frictionAir: 0.012,
          density: 0.0015,
          slop: 0.02,
        })
        // blown out from the middle, the nearest hardest, each word with a spin of its own
        const dx = rect.x + rect.w / 2 - cx
        const dy = rect.y + rect.h / 2 - cy
        const away = Math.hypot(dx, dy) || 1
        const speed = BLAST[0] + (BLAST[1] - BLAST[0]) * (away / reach)
        const spread = (Math.random() - 0.5) * 0.7
        const angle = Math.atan2(dy, dx) + spread
        Matter.Body.setVelocity(body, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 4 })
        Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.5)
        element.style.position = 'absolute'
        element.style.left = '0'
        element.style.top = '0'
        element.style.width = `${rect.w}px`
        element.style.height = `${rect.h}px`
        element.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`
        return { element, body, w: rect.w, h: rect.h, x0: rect.x, y0: rect.y, px: body.position.x, py: body.position.y, pa: 0 }
      })
      Matter.Composite.add(world.world, [...walls, ...pieces.map((piece) => piece.body)])
      engine = world
      placeWalls()
      phase = 'falling'
      container.dataset.phase = 'falling'
      accumulator = 0
      last = 0
      raf = requestAnimationFrame(frame)
    }

    const reset = () => {
      cancelAnimationFrame(raf)
      raf = 0
      if (engine) {
        Matter.Composite.clear(engine.world, false)
        Matter.Engine.clear(engine)
      }
      engine = null
      for (const piece of pieces) {
        piece.element.getAnimations().forEach((animation) => animation.cancel())
        for (const prop of ['position', 'left', 'top', 'width', 'height', 'transform'] as const) piece.element.style[prop] = ''
      }
      pieces = []
      walls = []
      drag = null
      block.style.minHeight = ''
      phase = 'idle'
      delete container.dataset.phase
      delete container.dataset.dragging
    }

    const restore = () => {
      if (phase !== 'falling') return
      phase = 'restoring'
      container.dataset.phase = 'restoring'
      if (drag && engine) Matter.Composite.remove(engine.world, drag.constraint)
      drag = null
      delete container.dataset.dragging
      cancelAnimationFrame(raf)
      raf = 0
      const order = [...pieces].sort((a, b) => a.body.position.y - b.body.position.y)
      const animations = order.map((piece, index) => {
        const angle = Math.atan2(Math.sin(piece.body.angle), Math.cos(piece.body.angle))
        const from = `translate3d(${(piece.body.position.x - piece.w / 2).toFixed(2)}px, ${(piece.body.position.y - piece.h / 2).toFixed(2)}px, 0) rotate(${angle.toFixed(4)}rad)`
        const to = `translate3d(${piece.x0}px, ${piece.y0}px, 0) rotate(0rad)`
        piece.element.style.transform = to
        return piece.element.animate([{ transform: from }, { transform: to }], { duration: 620, delay: Math.min(index * 14, 200), easing: SPRING, fill: 'backwards' })
      })
      Promise.all(animations.map((animation) => animation.finished.catch(() => null))).then(() => {
        if (phase === 'restoring') reset()
      })
    }

    // pick a word up: it follows the pointer on a spring, and goes on when let go
    const onDown = (event: PointerEvent) => {
      if (!engine || phase !== 'falling' || (event.pointerType === 'mouse' && event.button !== 0)) return
      const point = local(event)
      const hit = Matter.Query.point(pieces.map((piece) => piece.body), point)[0]
      if (!hit) return
      event.preventDefault()
      container.setPointerCapture?.(event.pointerId)
      Matter.Sleeping.set(hit, false)
      const constraint = Matter.Constraint.create({
        pointA: point,
        bodyB: hit,
        pointB: { x: point.x - hit.position.x, y: point.y - hit.position.y },
        stiffness: STIFFNESS,
        damping: 0.08,
        length: 0,
      })
      Matter.Composite.add(engine.world, constraint)
      drag = { constraint, id: event.pointerId }
      container.dataset.dragging = ''
      wake()
    }

    // a quick swipe through the words knocks them about
    const onMove = (event: PointerEvent) => {
      const point = local(event)
      const now = performance.now()
      const dt = Math.max(1, now - pointer.time)
      if (pointer.time && dt < 120) {
        const blend = Math.min(1, dt / 40)
        pointer.vx += ((point.x - pointer.x) / dt - pointer.vx) * blend
        pointer.vy += ((point.y - pointer.y) / dt - pointer.vy) * blend
      } else {
        pointer.vx = 0
        pointer.vy = 0
      }
      pointer.x = point.x
      pointer.y = point.y
      pointer.time = now
      if (phase !== 'falling') return
      if (drag && event.pointerId === drag.id) {
        drag.constraint.pointA = point
        return
      }
      const speed = Math.hypot(pointer.vx, pointer.vy)
      if (speed < 0.35) return
      let touched = false
      for (const piece of pieces) {
        const { body } = piece
        const reach = Math.max(piece.w, piece.h) / 2 + 18
        const distance = Math.hypot(body.position.x - point.x, body.position.y - point.y)
        if (distance > reach || now - (piece.pushed ?? 0) < 60) continue
        piece.pushed = now
        const kick = Math.min(20, speed * PUSH * (1 - (distance / reach) ** 2) * 16)
        Matter.Sleeping.set(body, false)
        Matter.Body.setVelocity(body, { x: body.velocity.x + (pointer.vx / speed) * kick, y: body.velocity.y + (pointer.vy / speed) * kick - kick * 0.7 })
        Matter.Body.setAngularVelocity(body, body.angularVelocity + (Math.random() - 0.5) * 0.06 * PUSH)
        touched = true
      }
      if (touched) wake()
    }

    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      if (engine) Matter.Composite.remove(engine.world, drag.constraint)
      drag = null
      delete container.dataset.dragging
    }

    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerup', onUp)
    container.addEventListener('pointercancel', onUp)

    const resized = new ResizeObserver(() => {
      if (phase === 'falling') {
        placeWalls()
        wake()
      }
    })
    resized.observe(container)
    control.current = { fall, restore }
    return () => {
      resized.disconnect()
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerup', onUp)
      container.removeEventListener('pointercancel', onUp)
      control.current = null
      reset()
    }
  }, [words])

  useEffect(() => {
    if (fallen) control.current?.fall()
    else control.current?.restore()
  }, [fallen])

  return (
    <div ref={containerRef} className={`falling-text ${fallen ? 'is-fallen' : ''}`}>
      <p ref={textRef} className="falling-text__text" aria-label={text}>
        {words.map((word, index) => (
          <span key={index} aria-hidden="true">
            {index > 0 && ' '}
            <span className="falling-text__piece" data-piece="">
              {word}
            </span>
          </span>
        ))}
      </p>
    </div>
  )
}
