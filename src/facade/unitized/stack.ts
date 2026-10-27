/**
 * Sticky stacking cards (six layers, four problems), in a box of their own. Every card is as tall as
 * the box less the headings of the cards before it; as its item arrives it comes up from under the
 * box's foot and settles one heading lower than the card before, over that card's content, so the
 * headings stay in view as a stack of tabs and only the newest card is read whole. A covered card
 * shrinks back from its top edge a little for each card that lies on it (`--shrink` on the box), so
 * the stack fans into the distance. It follows the scroll: `arrive` (0..1) per card. Each card is told
 * how far the next one covers it (`--cover`) and how many lie on it (`--depth`); which one is current
 * is left to the caller.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function paintCards(box: HTMLElement | null, cards: (HTMLElement | null)[], arrive: number[]) {
  if (!box) return
  const h = box.clientHeight
  const shrink = parseFloat(getComputedStyle(box).getPropertyValue('--shrink')) || 0
  // a heading's height as laid out (`--tab` is a clamp, which a custom property does not resolve)
  const first = cards.find(Boolean)
  const head = first?.querySelector<HTMLElement>('.fu-card__head')
  const tab = head && first ? head.offsetHeight + parseFloat(getComputedStyle(first).borderTopWidth) : 52
  cards.forEach((card, k) => {
    if (!card) return
    const a = clamp01(arrive[k] ?? 0)
    let depth = 0
    for (let j = k + 1; j < cards.length; j++) depth += clamp01(arrive[j] ?? 0)
    // from just under the box's foot up to its place in the stack, smaller the deeper it lies
    const y = h + (k * tab - h) * a
    const s = 1 - Math.min(depth, 5) * shrink
    card.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${s.toFixed(4)})`
    card.style.visibility = a > 0.001 ? 'visible' : 'hidden'
    card.style.setProperty('--cover', clamp01(arrive[k + 1] ?? 0).toFixed(4))
    card.style.setProperty('--depth', depth.toFixed(4))
  })
}
