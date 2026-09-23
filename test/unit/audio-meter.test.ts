import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioMeter } from '../../src/renderer/toolbar/audio-meter'

const stopTrack = vi.fn()
const track = { stop: stopTrack, readyState: 'live', muted: false, enabled: true }
const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream
const getUserMedia = vi.fn()
let amplitude = 0
let meter: AudioMeter
let onLevel: ReturnType<typeof vi.fn>
let onStatus: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  amplitude = 0
  track.readyState = 'live'
  track.muted = false
  track.enabled = true
  stopTrack.mockReset()
  getUserMedia.mockReset().mockResolvedValue(stream)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('AudioContext', class {
    state = 'running'
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }))
    createAnalyser = vi.fn(() => ({
      fftSize: 1024,
      getFloatTimeDomainData: (samples: Float32Array) => samples.fill(amplitude)
    }))
    resume = vi.fn().mockResolvedValue(undefined)
    close = vi.fn().mockResolvedValue(undefined)
  })
  onLevel = vi.fn()
  onStatus = vi.fn()
  meter = new AudioMeter(onLevel, onStatus)
})
afterEach(() => {
  meter.stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('microphone meter', () => {
  it('reports disconnects and muted input without stopping recording tracks', async () => {
    await meter.start(null, stream)
    track.muted = true
    vi.advanceTimersByTime(50)
    expect(onStatus).toHaveBeenLastCalledWith('muted')
    track.muted = false
    amplitude = 0.1
    vi.advanceTimersByTime(50)
    expect(onStatus).toHaveBeenLastCalledWith('ok')
    track.readyState = 'ended'
    vi.advanceTimersByTime(50)
    expect(onStatus).toHaveBeenLastCalledWith('disconnected')
    expect(onLevel).toHaveBeenLastCalledWith(0)
    expect(stopTrack).not.toHaveBeenCalled()
  })

  it('reports an unavailable microphone when capture fails', async () => {
    getUserMedia.mockRejectedValue(new Error('Device not found'))
    await meter.start('missing')
    expect(onStatus).toHaveBeenLastCalledWith('unavailable')
  })

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
