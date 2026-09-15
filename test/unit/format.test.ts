import { describe, expect, it } from 'vitest'
import { getTikTokOutputSize, isOutputFormat, TIKTOK_ASPECT } from '../../src/shared/format'

describe('tiktok format', () => {
  it('uses a 9:16 aspect ratio', () => {
    expect(TIKTOK_ASPECT).toBeCloseTo(9 / 16)
  })

  it('returns portrait sizes for balanced record', () => {
    expect(getTikTokOutputSize('balanced', 'record')).toEqual({ width: 1080, height: 1920 })
  })

  it('keeps preview smaller than record', () => {
    const preview = getTikTokOutputSize('balanced', 'preview')
    const record = getTikTokOutputSize('balanced', 'record')
    expect(preview.width * preview.height).toBeLessThan(record.width * record.height)
  })

  it('validates format ids', () => {
    expect(isOutputFormat('tiktok')).toBe(true)
    expect(isOutputFormat('square')).toBe(false)
  })
})
