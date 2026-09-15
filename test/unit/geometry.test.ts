import { describe, expect, it } from 'vitest'
import {
  computeCoverCrop,
  computeCoverCropAtFocus,
  computeCropRect,
  computeNormalizedBounds,
  scaleToMaxDimension
} from '../../src/shared/geometry'
import type { RegionSelection } from '../../src/shared/types'

describe('computeNormalizedBounds', () => {
  it('maps window bounds to a 0..1 fraction of the work area', () => {
    const workArea = { x: 0, y: 0, width: 1600, height: 1000 }
    const bounds = { x: 800, y: 500, width: 160, height: 100 }

    expect(computeNormalizedBounds(bounds, workArea)).toEqual({
      nx: 0.5,
      ny: 0.5,
      nw: 0.1,
      nh: 0.1
    })
  })

  it('accounts for a work area with a non-zero origin (e.g. a secondary display)', () => {
    const workArea = { x: 1600, y: 0, width: 800, height: 500 }
    const bounds = { x: 1600, y: 0, width: 80, height: 50 }

    expect(computeNormalizedBounds(bounds, workArea)).toEqual({
      nx: 0,
      ny: 0,
      nw: 0.1,
      nh: 0.1
    })
  })
})

describe('computeCropRect', () => {
  it('returns null when there is no region selection', () => {
    expect(computeCropRect(null, 1920, 1080)).toBeNull()
  })

  it('scales a region drawn at 1x DIP up to a higher-resolution captured video', () => {
    const region: RegionSelection = {
      rect: { x: 100, y: 100, width: 400, height: 300 },
      displayWidth: 1600,
      displayHeight: 1000
    }

    // Captured video is 2x the display's DIP size (e.g. a Retina display).
    expect(computeCropRect(region, 3200, 2000)).toEqual({
      x: 200,
      y: 200,
      width: 800,
      height: 600
    })
  })

  it('passes a 1:1 region through unchanged when video resolution matches the display', () => {
    const region: RegionSelection = {
      rect: { x: 50, y: 60, width: 200, height: 150 },
      displayWidth: 1920,
      displayHeight: 1080
    }

    expect(computeCropRect(region, 1920, 1080)).toEqual({
      x: 50,
      y: 60,
      width: 200,
      height: 150
    })
  })
})

describe('scaleToMaxDimension', () => {
  it('leaves dimensions alone when already under the cap', () => {
    expect(scaleToMaxDimension(1280, 720, 1920)).toEqual({ width: 1280, height: 720 })
  })

  it('scales a 5K capture down so the longest side is 1920', () => {
    expect(scaleToMaxDimension(5120, 2880, 1920)).toEqual({ width: 1920, height: 1080 })
  })
})

describe('computeCoverCrop', () => {
  it('center-crops a widescreen frame into 9:16', () => {
    const crop = computeCoverCrop(1920, 1080, 9 / 16)
    expect(crop.height).toBe(1080)
    expect(crop.width).toBe(Math.round(1080 * (9 / 16)))
    expect(crop.x).toBe(Math.round((1920 - crop.width) / 2))
    expect(crop.y).toBe(0)
  })
})

describe('computeCoverCropAtFocus', () => {
  it('pans toward the focused X while keeping full height on widescreen', () => {
    const width = Math.round(1080 * (9 / 16))
    const left = computeCoverCropAtFocus(1920, 1080, 9 / 16, 0, 540)
    const right = computeCoverCropAtFocus(1920, 1080, 9 / 16, 1920, 540)
    expect(left).toEqual({ x: 0, y: 0, width, height: 1080 })
    expect(right).toEqual({ x: 1920 - width, y: 0, width, height: 1080 })
  })
})
