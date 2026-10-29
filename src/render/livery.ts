/**
 * The colours of a bike and its rider, all in one place. Another rider (an AI
 * rider later, say) is the same bike and rider drawn in a different livery:
 * `{ ...FACTORY, jersey: 0x22aa44, plastics: 0x22aa44 }`. Colours are written
 * as hex numbers, like on the web: 0xRRGGBB.
 */
export interface Livery {
  /** Tank, radiator shrouds and fenders. */
  plastics: number
  /** The number plates. */
  plates: number
  /** Seat, engine, handlebar, silencer, footpegs. */
  trim: number
  /** Frame, forks, swingarm, hubs and brake discs. */
  metal: number
  /** The rear shock's spring. */
  shock: number
  tyres: number
  rims: number
  spokes: number
  jersey: number
  pants: number
  helmet: number
  visor: number
  boots: number
}

/** The bike as it comes: red plastics, white plates, yellow spokes, a blue jersey. */
export const FACTORY: Livery = {
  plastics: 0xd8432b,
  plates: 0xf1f1ee,
  trim: 0x2a2a2e,
  metal: 0xb8bcc4,
  shock: 0xe8c21e,
  tyres: 0x1c1c1c,
  rims: 0xc9ccd2,
  spokes: 0xf2c418,
  jersey: 0x2b6fd8,
  pants: 0x33363d,
  helmet: 0xf2f2f2,
  visor: 0x111111,
  boots: 0xe9e9e4,
}
