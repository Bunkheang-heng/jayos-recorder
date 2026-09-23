import { afterEach, expect, it, vi } from 'vitest'
import { Recorder } from '../../src/renderer/toolbar/recorder'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('captures native display detail before recording a 1080p portrait crop', async () => {
  vi.useFakeTimers()
  const track = { stop: vi.fn() }
  const screenStream = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] }
  const micStream = { getTracks: () => [track], getVideoTracks: () => [], getAudioTracks: () => [track] }
  const ctx = { imageSmoothingEnabled: false, imageSmoothingQuality: 'low', drawImage: vi.fn() }
  const canvas = { width: 0, height: 0, getContext: () => ctx, captureStream: () => screenStream }
  const getUserMedia = vi.fn().mockResolvedValueOnce(screenStream).mockResolvedValueOnce(micStream)
  const recorderOptions = vi.fn()
  let draw!: FrameRequestCallback
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('document', {
    visibilityState: 'visible', addEventListener: vi.fn(),
    createElement: (tag: string) => tag === 'canvas' ? canvas : {
      videoWidth: 3840, videoHeight: 2160, play: () => Promise.resolve()
    }
  })
  vi.stubGlobal('window', {
    setInterval, clearInterval, setTimeout, clearTimeout,
    api: {
      beginRecordingSession: vi.fn().mockResolvedValue('session'),
      finishRecordingSession: vi.fn().mockResolvedValue('recording.webm'),
      getCursorPoint: vi.fn().mockResolvedValue({ x: 960, y: 540 })
    }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { draw = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('MediaStream', class { constructor(public tracks: unknown[]) {} })
  vi.stubGlobal('MediaRecorder', class {
    static isTypeSupported = () => true
    onstop?: () => void
    constructor(_stream: unknown, options: unknown) { recorderOptions(options) }
    start() {}
    stop() { this.onstop?.() }
  })
  const recorder = new Recorder({ onError: vi.fn() })
  recorder.setSource({
    id: 'screen:1', name: 'Retina display', type: 'screen', thumbnailDataUrl: '',
    captureSize: { width: 3840, height: 2160 },
    displayBounds: { x: 0, y: 0, width: 1920, height: 1080 }
  })
  recorder.setWebcamEnabled(false)
  recorder.setFormat('tiktok')
  await recorder.startRecording()
  expect(getUserMedia.mock.calls[0][0].video.mandatory).toMatchObject({
    minWidth: 3840, maxWidth: 3840, minHeight: 2160, maxHeight: 2160
  })
  expect(canvas).toMatchObject({ width: 1080, height: 1920 })
  expect(recorderOptions).toHaveBeenCalledWith(expect.objectContaining({ videoBitsPerSecond: 16_000_000 }))
  expect(recorder.getMicrophoneStream()).toBe(micStream)
  draw(100)
  expect(ctx.imageSmoothingEnabled).toBe(true)
  expect(ctx.imageSmoothingQuality).toBe('high')
  expect(ctx.drawImage).toHaveBeenCalled()
  await recorder.stopRecording()
  expect(recorder.getMicrophoneStream()).toBeNull()
  await recorder.closePreview()
})
