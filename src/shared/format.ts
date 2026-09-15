import type { QualityId } from './quality'

export type OutputFormat = 'standard' | 'tiktok'

export const DEFAULT_FORMAT: OutputFormat = 'standard'
export const TIKTOK_ASPECT = 9 / 16

export function isOutputFormat(value: string): value is OutputFormat {
  return value === 'standard' || value === 'tiktok'
}

/** Exact portrait canvas size for TikTok mode (preview is lighter). */
export function getTikTokOutputSize(
  qualityId: QualityId,
  phase: 'preview' | 'record'
): { width: number; height: number } {
  if (phase === 'preview') {
    if (qualityId === 'performance') return { width: 540, height: 960 }
    return { width: 720, height: 1280 }
  }

  if (qualityId === 'performance') return { width: 720, height: 1280 }
  // Balanced + High both target native TikTok upload size; High still wins via fps/bitrate/codec.
  return { width: 1080, height: 1920 }
}
