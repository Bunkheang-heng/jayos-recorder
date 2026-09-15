import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUALITY,
  getQualityPreset,
  isQualityId,
  QUALITY_PRESETS
} from '../../src/shared/quality'

describe('quality presets', () => {
  it('defaults to balanced', () => {
    expect(DEFAULT_QUALITY).toBe('balanced')
    expect(getQualityPreset(DEFAULT_QUALITY).label).toBe('Balanced')
  })

  it('keeps preview lighter than record for every preset', () => {
    for (const preset of Object.values(QUALITY_PRESETS)) {
      expect(preset.previewMaxDimension).toBeLessThanOrEqual(preset.recordMaxDimension)
      expect(preset.previewFps).toBeLessThanOrEqual(preset.recordFps)
    }
  })

  it('sets balanced bitrate around 12 Mbps', () => {
    expect(QUALITY_PRESETS.balanced.videoBitsPerSecond).toBe(12_000_000)
  })

  it('validates quality ids', () => {
    expect(isQualityId('high')).toBe(true)
    expect(isQualityId('ultra')).toBe(false)
  })
})
