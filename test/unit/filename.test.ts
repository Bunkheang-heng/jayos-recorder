import { describe, expect, it } from 'vitest'
import { timestampedFilename } from '../../src/shared/filename'

describe('timestampedFilename', () => {
  it('zero-pads month/day/hour/minute/second', () => {
    const date = new Date(2026, 0, 5, 9, 3, 7)
    expect(timestampedFilename(date, 'webm')).toBe('Recording 2026-01-05 at 09.03.07.webm')
  })

  it('does not zero-pad the year', () => {
    const date = new Date(2026, 11, 25, 23, 59, 1)
    expect(timestampedFilename(date, 'webm')).toBe('Recording 2026-12-25 at 23.59.01.webm')
  })

  it('uses the given extension', () => {
    const date = new Date(2026, 5, 15, 12, 0, 0)
    expect(timestampedFilename(date, 'mp4')).toMatch(/\.mp4$/)
  })
})
