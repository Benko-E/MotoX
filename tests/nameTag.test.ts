import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { riderName } from '../src/render/nameTag'

describe('AI rider names', () => {
  it('the first one is Helga', () => {
    expect(riderName(0, config.ai.riders.map((r) => r.name))).toBe('Helga')
  })

  it('a rider with no name in the list is just numbered', () => {
    expect(riderName(1, ['Helga'])).toBe('Rider 2')
    expect(riderName(0, ['', 'Bob'])).toBe('Rider 1')
  })
})
