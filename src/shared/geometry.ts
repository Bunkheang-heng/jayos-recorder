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
