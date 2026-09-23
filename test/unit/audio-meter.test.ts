import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioMeter } from '../../src/renderer/toolbar/audio-meter'

const stopTrack = vi.fn()
const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
const getUserMedia = vi.fn()
let amplitude = 0
let meter: AudioMeter
let onLevel: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  amplitude = 0
  stopTrack.mockReset()
  getUserMedia.mockReset().mockResolvedValue(stream)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('AudioContext', class {
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }))
    createAnalyser = vi.fn(() => ({
      fftSize: 1024,
      getFloatTimeDomainData: (samples: Float32Array) => samples.fill(amplitude)
    }))
    resume = vi.fn().mockResolvedValue(undefined)
    close = vi.fn().mockResolvedValue(undefined)
  })
  onLevel = vi.fn()
  meter = new AudioMeter(onLevel)
})
afterEach(() => {
  meter.stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('microphone meter', () => {
  it('responds to recorded audio and never stops the borrowed recording tracks', async () => {
    await meter.start(null, stream)
    expect(getUserMedia).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(onLevel).toHaveBeenLastCalledWith(0)
    amplitude = 0.1
    vi.advanceTimersByTime(50)
    expect(onLevel.mock.lastCall![0]).toBeGreaterThan(60)
    meter.stop()
    expect(stopTrack).not.toHaveBeenCalled()
    expect(onLevel).toHaveBeenLastCalledWith(0)
  })

  it('releases the preview microphone before borrowing the recording stream', async () => {
    await meter.start('external-mic')
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { exact: 'external-mic' } }, video: false })
    await meter.start(null, stream)
    expect(stopTrack).toHaveBeenCalledTimes(1)
    meter.stop()
    expect(stopTrack).toHaveBeenCalledTimes(1)
  })

  it('releases a late preview request after the meter has been stopped', async () => {
    let resolve!: (value: MediaStream) => void
    getUserMedia.mockReturnValue(new Promise<MediaStream>((done) => { resolve = done }))
    const pending = meter.start(null)
    meter.stop()
    resolve(stream)
    await pending
    expect(stopTrack).toHaveBeenCalledTimes(1)
    amplitude = 0.5
    vi.advanceTimersByTime(100)
    expect(onLevel).toHaveBeenLastCalledWith(0)
  })
})
