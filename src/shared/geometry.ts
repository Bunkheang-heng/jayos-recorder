import type { NormalizedBounds, Rectangle, RegionSelection } from './types'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export function computeNormalizedBounds(bounds: Rectangle, workArea: Rectangle): NormalizedBounds {
  return {
    nx: (bounds.x - workArea.x) / workArea.width,
    ny: (bounds.y - workArea.y) / workArea.height,
    nw: bounds.width / workArea.width,
    nh: bounds.height / workArea.height
  }
}

export function computeCropRect(
  region: RegionSelection | null,
  videoWidth: number,
  videoHeight: number
): CropRect | null {
  if (!region) return null

  const scaleX = videoWidth / region.displayWidth
  const scaleY = videoHeight / region.displayHeight

  return {
    x: Math.round(region.rect.x * scaleX),
    y: Math.round(region.rect.y * scaleY),
    width: Math.round(region.rect.width * scaleX),
    height: Math.round(region.rect.height * scaleY)
  }
}

/** Downscale so the longest side is at most `maxDimension` (keeps aspect ratio). */
export function scaleToMaxDimension(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxDimension) return { width, height }
  const scale = maxDimension / longest
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale))
  }
}

/**
 * Largest rect inside `srcW`×`srcH` that matches `destAspect` (width/height),
 * centered — used to center-crop a desktop frame into 9:16 TikTok output.
 */
export function computeCoverCrop(
  srcW: number,
  srcH: number,
  destAspect: number
): CropRect {
  const srcAspect = srcW / srcH
  if (srcAspect > destAspect) {
    const width = Math.max(2, Math.round(srcH * destAspect))
    return {
      x: Math.round((srcW - width) / 2),
      y: 0,
      width,
      height: srcH
    }
  }

  const height = Math.max(2, Math.round(srcW / destAspect))
  return {
    x: 0,
    y: Math.round((srcH - height) / 2),
    width: srcW,
    height
  }
}

/**
 * Same size as computeCoverCrop, but positioned so (focusX, focusY) stays
 * centered inside the crop when possible (clamped to the source edges).
 */
export function computeCoverCropAtFocus(
  srcW: number,
  srcH: number,
  destAspect: number,
  focusX: number,
  focusY: number
): CropRect {
  const sized = computeCoverCrop(srcW, srcH, destAspect)
  const x = Math.max(0, Math.min(srcW - sized.width, Math.round(focusX - sized.width / 2)))
  const y = Math.max(0, Math.min(srcH - sized.height, Math.round(focusY - sized.height / 2)))
  return { x, y, width: sized.width, height: sized.height }
}
