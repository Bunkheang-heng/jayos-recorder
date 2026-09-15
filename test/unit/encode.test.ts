import { describe, expect, it } from 'vitest'
import { buildVideoEncoderAttempts } from '../../src/shared/encode'

describe('buildVideoEncoderAttempts', () => {
  it('prefers VideoToolbox on macOS then falls back to libx264', () => {
    const names = buildVideoEncoderAttempts('darwin').map((attempt) => attempt.name)
    expect(names[0]).toBe('h264_videotoolbox')
    expect(names.at(-1)).toBe('libx264')
  })

  it('tries common Windows hardware encoders before software', () => {
    const names = buildVideoEncoderAttempts('win32').map((attempt) => attempt.name)
    expect(names).toContain('h264_nvenc')
    expect(names).toContain('h264_amf')
    expect(names).toContain('h264_qsv')
    expect(names.at(-1)).toBe('libx264')
  })

  it('supports Linux with nvenc then software fallback', () => {
    const names = buildVideoEncoderAttempts('linux').map((attempt) => attempt.name)
    expect(names[0]).toBe('h264_nvenc')
    expect(names.at(-1)).toBe('libx264')
  })
})
