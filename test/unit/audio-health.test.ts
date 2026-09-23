import { describe, expect, it } from 'vitest'
import { AudioHealth } from '../../src/shared/audio-health'

describe('mic warnings', () => {
  it('waits through normal pauses, warns after five seconds, and recovers on speech', () => {
    const health = new AudioHealth(0)
    expect(health.sample(-90, 0, 4999)).toBe('ok')
    expect(health.sample(-90, 0, 5000)).toBe('silent')
    expect(health.sample(-25, 0.2, 5100)).toBe('ok')
    expect(health.sample(-90, 0, 10099)).toBe('ok')
    expect(health.sample(-90, 0, 10100)).toBe('silent')
  })

  it('ignores isolated peaks and holds a sustained clipping warning long enough to read', () => {
    const health = new AudioHealth(0)
    expect(health.sample(-3, 1, 0)).toBe('ok')
    expect(health.sample(-20, 0.2, 50)).toBe('ok')
    expect(health.sample(-3, 1, 100)).toBe('ok')
    expect(health.sample(-3, 1, 200)).toBe('clipping')
    expect(health.sample(-20, 0.2, 1600)).toBe('clipping')
    expect(health.sample(-20, 0.2, 1700)).toBe('ok')
  })
})
