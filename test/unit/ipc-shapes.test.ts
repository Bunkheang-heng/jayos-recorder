import { describe, expect, it } from 'vitest'
import { IPC } from '../../src/shared/types'

describe('IPC channel names', () => {
  it('are all non-empty strings', () => {
    for (const channel of Object.values(IPC)) {
      expect(typeof channel).toBe('string')
      expect(channel.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate channel names', () => {
    const values = Object.values(IPC)
    expect(new Set(values).size).toBe(values.length)
  })
})
