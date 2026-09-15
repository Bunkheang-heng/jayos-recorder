export type QualityId = 'performance' | 'balanced' | 'high'

export interface QualityPreset {
  id: QualityId
  label: string
  /** Longest-side cap while only previewing (keeps the UI light). */
  previewMaxDimension: number
  /** Longest-side cap while recording. */
  recordMaxDimension: number
  /** Target FPS used for capture + encode while recording. */
  recordFps: number
  /** Preview draw rate — kept modest even on High. */
  previewFps: number
  videoBitsPerSecond: number
  preferVp9: boolean
}

export const QUALITY_PRESETS: Record<QualityId, QualityPreset> = {
  performance: {
    id: 'performance',
    label: 'Performance',
    previewMaxDimension: 960,
    recordMaxDimension: 1280,
    recordFps: 30,
    previewFps: 24,
    videoBitsPerSecond: 4_000_000,
    preferVp9: false
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    previewMaxDimension: 1280,
    recordMaxDimension: 1920,
    recordFps: 30,
    previewFps: 30,
    videoBitsPerSecond: 12_000_000,
    preferVp9: false
  },
  high: {
    id: 'high',
    label: 'High',
    previewMaxDimension: 1280,
    recordMaxDimension: 2560,
    recordFps: 60,
    previewFps: 30,
    videoBitsPerSecond: 18_000_000,
    preferVp9: true
  }
}

export const DEFAULT_QUALITY: QualityId = 'balanced'

export function getQualityPreset(id: QualityId): QualityPreset {
  return QUALITY_PRESETS[id] ?? QUALITY_PRESETS.balanced
}

export function isQualityId(value: string): value is QualityId {
  return value === 'performance' || value === 'balanced' || value === 'high'
}
