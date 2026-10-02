import { afterEach, expect, it, vi } from 'vitest'
import { Recorder } from '../../src/renderer/toolbar/recorder'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it.each([false, true])('captures native display detail and preserves the local recording across reconnects (streaming=%s)', async (streaming) => {
  vi.useFakeTimers()
  const track = { stop: vi.fn() }
  const screenStream = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] }
  const micStream = { getTracks: () => [track], getVideoTracks: () => [], getAudioTracks: () => [track] }
  const ctx = { imageSmoothingEnabled: false, imageSmoothingQuality: 'low', drawImage: vi.fn() }
  const canvas = { width: 0, height: 0, getContext: () => ctx, captureStream: () => screenStream }
  const getUserMedia = vi.fn().mockResolvedValueOnce(screenStream).mockResolvedValueOnce(micStream)
  const recorderOptions = vi.fn()
  const mediaRecorders: { ondataavailable?: (event: { data: Blob }) => void; stop: () => void; state: string }[] = []
  const beginLocal = vi.fn().mockResolvedValue('session')
  const finishLocal = vi.fn().mockResolvedValue('recording.webm')
  const appendLocal = vi.fn().mockResolvedValue(undefined)
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
      beginRecordingSession: beginLocal,
      finishRecordingSession: finishLocal,
      appendRecordingChunk: appendLocal,
      beginStream: vi.fn().mockResolvedValue('stream-session'),
      appendStream: vi.fn().mockResolvedValue(undefined),
      finishStream: vi.fn().mockResolvedValue(undefined),
      getCursorPoint: vi.fn().mockResolvedValue({ x: 960, y: 540 })
    }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { draw = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('MediaStream', class { constructor(public tracks: unknown[]) {} })
  vi.stubGlobal('MediaRecorder', class {
    static isTypeSupported = () => true
    onstop?: () => void
    ondataavailable?: (event: { data: Blob }) => void
    state = 'inactive'
    constructor(_stream: unknown, options: unknown) { recorderOptions(options); mediaRecorders.push(this) }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.onstop?.() }
  })
  const recorder = new Recorder({ onError: vi.fn() })
  recorder.setSource({
    id: 'screen:1', name: 'Retina display', type: 'screen', thumbnailDataUrl: '',
    captureSize: { width: 3840, height: 2160 },
    displayBounds: { x: 0, y: 0, width: 1920, height: 1080 }
  })
  recorder.setWebcamEnabled(false)
  recorder.setFormat('tiktok')
  const destination = { serverUrl: 'rtmp://example.com/live', streamKey: 'key' }
  await recorder.startRecording(streaming ? destination : undefined, streaming)
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
  if (streaming) {
    const backup = mediaRecorders[0]
    backup.ondataavailable?.({ data: new Blob(['before reconnect']) })
    await recorder.restartStream(destination)
    expect(backup.state).toBe('recording')
    expect(beginLocal).toHaveBeenCalledTimes(1)
    expect(finishLocal).not.toHaveBeenCalled()
    expect(recorder.getMicrophoneStream()).toBe(micStream)
    backup.ondataavailable?.({ data: new Blob(['after reconnect']) })
  }
  expect(await recorder.stopRecording()).toBe('recording.webm')
  if (streaming) {
    expect(appendLocal).toHaveBeenCalledTimes(2)
    expect(finishLocal).toHaveBeenCalledTimes(1)
  }
  expect(recorder.getMicrophoneStream()).toBeNull()
  await recorder.closePreview()
})
