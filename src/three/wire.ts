/**
 * Every black line drawn on the site (the line drawings, the X-rays, the structure round a model, the cranes and
 * rigs): one black, one weight, one strength, so a drawing on one page reads as a drawing on any other. A scene may
 * fade its lines in and out, or dim them as they fall away into the distance, but at their fullest they are this.
 * Lines of another colour (the yellow that picks a part out, warnings, light lines on a dark ground) keep their own.
 */
export const WIRE = {
  color: '#080808',
  /** pixels, for the lines drawn with a weight (a plain line is one pixel) */
  width: 1.2,
  opacity: 0.85,
} as const

/** whether a line of this colour is one of the site's black wires */
export const isWire = (color?: string | number) => color === undefined || (typeof color === 'number' ? color === 0x080808 : color.toLowerCase() === WIRE.color)
