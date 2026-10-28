/**
 * Seeded Perlin noise: smooth random bumps, the same every time for the same
 * seed. Layering several sizes of it ("octaves") gives natural rolling hills.
 */

export type Noise2D = (x: number, y: number) => number

/** A small, fast random number generator that always gives the same sequence for a seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Perlin noise roughly in -1..1, with features about 1 unit apart. */
export function createPerlin(seed: number): Noise2D {
  const random = mulberry32(seed)
  const order = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = order[i & 255]
  // Shift away from the grid, where Perlin noise is always exactly 0.
  const offsetX = random() * 256
  const offsetY = random() * 256

  return (x, y) => {
    x += offsetX
    y += offsetY
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const X = xi & 255
    const Y = yi & 255
    const u = fade(xf)
    const v = fade(yf)
    const near = lerp(grad(perm[perm[X] + Y], xf, yf), grad(perm[perm[X + 1] + Y], xf - 1, yf), u)
    const far = lerp(
      grad(perm[perm[X] + Y + 1], xf, yf - 1),
      grad(perm[perm[X + 1] + Y + 1], xf - 1, yf - 1),
      u,
    )
    return lerp(near, far, v)
  }
}

/**
 * Several layers of noise, each twice as fine and `roughness` times as strong
 * as the one before. Scaled back to roughly -1..1.
 */
export function fractalNoise(
  noise: Noise2D,
  x: number,
  y: number,
  octaves: number,
  roughness: number,
): number {
  let sum = 0
  let strength = 1
  let scale = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * scale, y * scale) * strength
    total += strength
    strength *= roughness
    scale *= 2
  }
  return total > 0 ? sum / total : 0
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function grad(hash: number, x: number, y: number): number {
  switch (hash & 7) {
    case 0: return x + y
    case 1: return -x + y
    case 2: return x - y
    case 3: return -x - y
    case 4: return x
    case 5: return -x
    case 6: return y
    default: return -y
  }
}
