import type { StreamDestination } from '../../shared/stream'
import type { NormalizedBounds, RegionSelection, SourceInfo } from '../../shared/types'
import {
  computeCoverCropAtFocus,
  computeCropRect,
  scaleToMaxDimension,
  type CropRect
} from '../../shared/geometry'
import {
  DEFAULT_QUALITY,
  getQualityPreset,
  type QualityId,
  type QualityPreset
} from '../../shared/quality'
import {
  DEFAULT_FORMAT,
  getTikTokOutputSize,
  getRecordingBitrate,
  TIKTOK_ASPECT,
  type OutputFormat
} from '../../shared/format'

/** Chromium's legacy desktop-capture constraint shape; not in the standard DOM lib types. */
interface DesktopCaptureConstraints {
  mandatory: {
    chromeMediaSource: 'desktop'
    chromeMediaSourceId?: string
    maxFrameRate?: number
    minWidth?: number
    minHeight?: number
    maxWidth?: number
    maxHeight?: number
  }
}

export interface RecorderCallbacks {
  onError: (message: string) => void
}

const DEFAULT_PIP_BOUNDS: NormalizedBounds = { nx: 0.78, ny: 0.72, nw: 0.18, nh: 0.18 }
const TIKTOK_PIP_BOUNDS: NormalizedBounds = { nx: 0.58, ny: 0.74, nw: 0.36, nh: 0.2 }
/** How quickly the TikTok crop eases toward the cursor (0..1 per frame). */
const CURSOR_FOLLOW_SMOOTHING = 0.16
const CURSOR_POLL_MS = 32

export class Recorder {
  private source: SourceInfo | null = null
  private region: RegionSelection | null = null
  private micEnabled = true
  private micDeviceId: string | null = null
  private webcamEnabled = true
  private systemAudioSupported = false
  private pipBounds: NormalizedBounds = DEFAULT_PIP_BOUNDS
  private quality: QualityPreset = getQualityPreset(DEFAULT_QUALITY)
  private format: OutputFormat = DEFAULT_FORMAT

  private screenStream: MediaStream | null = null
  private webcamStream: MediaStream | null = null
  private micStream: MediaStream | null = null
  private screenVideo: HTMLVideoElement | null = null
  private webcamVideo: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private rafHandle: number | null = null
  private lastFrameAt = 0
  private recorder: MediaRecorder | null = null
  private canvasStream: MediaStream | null = null
  private pendingStreamBytes = 0
  private streamAudioContext: AudioContext | null = null
  private backupRecorder: MediaRecorder | null = null
  private backupSessionId: string | null = null
  private backupQueue: Promise<void> = Promise.resolve()
  private backupError: Error | null = null
  private combinedStream: MediaStream | null = null
  private streaming = false
  private sessionId: string | null = null
  private chunkQueue: Promise<void> = Promise.resolve()
  private cropRect: CropRect | null = null
  private rawWidth = 0
  private rawHeight = 0
  private previewOpen = false
  private recording = false
  private focusX = 0.5
  private focusY = 0.5
  private smoothCropX = 0
  private smoothCropY = 0
  private cropSmoothReady = false
  private cursorPollHandle: number | null = null
  private drawSuspended = false

  constructor(private callbacks: RecorderCallbacks) {
    document.addEventListener('visibilitychange', () => {
      this.syncVisibilityCompositor()
    })
  }

  setSource(source: SourceInfo): void {
    this.source = source
  }

  setRegion(region: RegionSelection | null): void {
    this.region = region
  }

  setMicEnabled(enabled: boolean): void {
    this.micEnabled = enabled
  }

  setMicDeviceId(deviceId: string | null): void {
    this.micDeviceId = deviceId
  }

  setWebcamEnabled(enabled: boolean): void {
    this.webcamEnabled = enabled
  }

  setSystemAudioSupported(supported: boolean): void {
    this.systemAudioSupported = supported
  }

  updatePipBounds(bounds: NormalizedBounds): void {
    this.pipBounds = bounds
  }

  setQuality(id: QualityId): void {
    this.quality = getQualityPreset(id)
    if (this.previewOpen && !this.recording) {
      this.applyOutputSize('preview')
    }
  }

  getQuality(): QualityPreset {
    return this.quality
  }

  setFormat(format: OutputFormat): void {
    const changed = this.format !== format
    this.format = format
    if (changed) {
      this.cropSmoothReady = false
      if (this.previewOpen && !this.recording) {
        this.applyOutputSize('preview')
      }
      this.syncCursorFollow()
    }
  }

  getFormat(): OutputFormat {
    return this.format
  }

  /** Suggested default webcam placement when switching into TikTok framing. */
  getDefaultPipBoundsForFormat(format: OutputFormat = this.format): NormalizedBounds {
    return format === 'tiktok' ? { ...TIKTOK_PIP_BOUNDS } : { ...DEFAULT_PIP_BOUNDS }
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas
  }

  isPreviewOpen(): boolean {
    return this.previewOpen
  }

  getMicrophoneStream(): MediaStream | null {
    return this.micStream
  }

  isRecording(): boolean {
    return this.recording
  }

  async openPreview(): Promise<HTMLCanvasElement> {
    if (!this.source) throw new Error('No source selected')

    await this.teardownPipeline({ keepMic: false })

    const fps = this.quality.previewFps
    const desktopConstraints: DesktopCaptureConstraints = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: this.source.id,
        maxFrameRate: this.quality.recordFps,
        // Preserve display detail before cropping to portrait, especially on Retina.
        ...(this.source.captureSize ? {
          minWidth: this.source.captureSize.width,
          maxWidth: this.source.captureSize.width,
          minHeight: this.source.captureSize.height,
          maxHeight: this.source.captureSize.height
        } : { maxWidth: 3840, maxHeight: 2160 })
      }
    }

    this.screenStream = await navigator.mediaDevices.getUserMedia({
      video: desktopConstraints as unknown as MediaTrackConstraints,
      audio: false
    })

    if (this.webcamEnabled) {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: fps, max: this.quality.recordFps }
        },
        audio: false
      })
    }

    this.screenVideo = await attachToVideoElement(this.screenStream)
    this.webcamVideo = this.webcamStream ? await attachToVideoElement(this.webcamStream) : null

    this.cropRect = computeCropRect(this.region, this.screenVideo.videoWidth, this.screenVideo.videoHeight)
    this.rawWidth = this.cropRect ? this.cropRect.width : this.screenVideo.videoWidth
    this.rawHeight = this.cropRect ? this.cropRect.height : this.screenVideo.videoHeight

    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d', { alpha: false })
    this.applyOutputSize('preview')

    this.previewOpen = true
    this.cropSmoothReady = false
    this.syncCursorFollow()
    this.runDrawLoop()
    this.syncVisibilityCompositor()
    return this.canvas
  }

  async closePreview(): Promise<void> {
    if (this.recording) {
      await this.stopRecording()
    }
    await this.teardownPipeline({ keepMic: false })
    this.previewOpen = false
  }

  async setWebcamLive(enabled: boolean): Promise<void> {
    this.webcamEnabled = enabled
    if (!this.previewOpen || this.recording) return

    this.webcamStream?.getTracks().forEach((track) => track.stop())
    this.webcamStream = null
    this.webcamVideo = null

    if (!enabled) return

    this.webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: this.quality.previewFps, max: this.quality.recordFps }
      },
      audio: false
    })
    this.webcamVideo = await attachToVideoElement(this.webcamStream)
  }

  async startRecording(destination?: StreamDestination, recordLocal = false): Promise<void> {
    if (!this.previewOpen || !this.canvas) {
      await this.openPreview()
    }
    if (!this.canvas) throw new Error('Preview failed to open')
    if (this.recording) return

    this.applyOutputSize('record')

    if (this.micEnabled) {
      this.micStream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          audio: this.micDeviceId ? { deviceId: { exact: this.micDeviceId } } : true,
          video: false
        }),
        8000,
        'Microphone did not respond. Check macOS mic permission for JAYOS.'
      )
    }

    if (this.systemAudioSupported && this.source) {
      const desktopConstraints: DesktopCaptureConstraints = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: this.source.id,
          maxFrameRate: this.quality.recordFps
        }
      }
      const withAudio = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          video: desktopConstraints as unknown as MediaTrackConstraints,
          audio: { mandatory: { chromeMediaSource: 'desktop' } } as unknown as MediaTrackConstraints
        }),
        8000,
        'Desktop audio capture timed out.'
      )
      for (const track of withAudio.getAudioTracks()) {
        this.screenStream?.addTrack(track)
      }
      withAudio.getVideoTracks().forEach((track) => track.stop())
    }

    this.canvasStream = this.canvas.captureStream(this.quality.recordFps)
    const audioTracks = [
      ...(this.micStream?.getAudioTracks() ?? []),
      ...(this.screenStream?.getAudioTracks() ?? [])
    ]
    let outputAudio = audioTracks
    if (destination && audioTracks.length > 1) {
      this.streamAudioContext = new AudioContext()
      const mixed = this.streamAudioContext.createMediaStreamDestination()
      for (const track of audioTracks) {
        this.streamAudioContext.createMediaStreamSource(new MediaStream([track])).connect(mixed)
      }
      await this.streamAudioContext.resume()
      outputAudio = mixed.stream.getAudioTracks()
    }
    const combined = new MediaStream([...this.canvasStream.getVideoTracks(), ...outputAudio])

    this.streaming = !!destination
    this.sessionId = destination ? await window.api.beginStream(destination) : await window.api.beginRecordingSession()
    this.combinedStream = combined
    if (destination && recordLocal) {
      try {
        this.backupSessionId = await window.api.beginRecordingSession()
        this.backupQueue = Promise.resolve()
        this.backupError = null
        this.backupRecorder = createMediaRecorder(combined, this.quality, this.format)
        const backupId = this.backupSessionId
        this.backupRecorder.ondataavailable = (event): void => {
          if (!event.data.size || this.backupError) return
          this.backupQueue = this.backupQueue.then(async () => {
            if (!this.backupError) await window.api.appendRecordingChunk(backupId, await event.data.arrayBuffer())
          }).catch((error: unknown) => {
            this.backupError = error as Error
          })
        }
        this.backupRecorder.onerror = (): void => { this.backupError = new Error('Local recording failed.') }
        this.backupRecorder.start(1000)
      } catch (error) {
        if (this.backupSessionId) await window.api.abortRecordingSession(this.backupSessionId).catch(() => undefined)
        this.backupSessionId = null
        await window.api.finishStream(this.sessionId).catch(() => undefined)
        this.sessionId = null
        throw error
      }
    }
    this.startMediaRecorder(combined)
    this.recording = true
    this.drawSuspended = false
    if (this.rafHandle === null) this.runDrawLoop()
  }

  private startMediaRecorder(combined: MediaStream): void {
    this.pendingStreamBytes = 0
    this.chunkQueue = Promise.resolve()
    this.recorder = createMediaRecorder(combined, this.quality, this.format)
    this.recorder.ondataavailable = (event): void => {
      if (event.data.size === 0 || !this.sessionId) return
      const sessionId = this.sessionId
      const blob = event.data
      if (this.streaming && this.pendingStreamBytes + blob.size > 16 * 1024 * 1024) {
        this.callbacks.onError('Live stream upload is too slow. Streaming stopped.')
        return
      }
      this.pendingStreamBytes += blob.size
      this.chunkQueue = this.chunkQueue
        .then(async () => {
          const buffer = await blob.arrayBuffer()
          if (this.streaming) await window.api.appendStream(sessionId, buffer)
          else await window.api.appendRecordingChunk(sessionId, buffer)
        })
        .catch((error: unknown) => {
          this.callbacks.onError(
            `Failed to send media chunk: ${(error as Error).message}`
          )
        })
        .finally(() => { this.pendingStreamBytes -= blob.size })
    }
    this.recorder.onerror = (): void => this.callbacks.onError('Recording failed unexpectedly.')
    this.recorder.start(1000)
  }

  async restartStream(destination: StreamDestination): Promise<void> {
    if (!this.streaming || !this.combinedStream) throw new Error('No live capture to reconnect.')
    if (this.recorder && this.recorder.state !== 'inactive') {
      const stopped = new Promise<void>(resolve => { this.recorder!.onstop = () => resolve() })
      this.recorder.stop()
      await stopped
    }
    await this.chunkQueue
    if (this.sessionId) await window.api.finishStream(this.sessionId)
    this.sessionId = await window.api.beginStream(destination)
    this.startMediaRecorder(this.combinedStream)
  }

  private async finishBackup(): Promise<string> {
    const backup = this.backupRecorder
    const id = this.backupSessionId
    if (!backup || !id) return ''
    if (backup.state !== 'inactive') {
      const stopped = new Promise<void>(resolve => { backup.onstop = () => resolve() })
      backup.stop()
      await stopped
    }
    await this.backupQueue
    this.backupRecorder = null
    this.backupSessionId = null
    if (this.backupError) {
      // Keep the temporary recording for recovery instead of deleting it.
      throw new Error(`Local backup could not be completed: ${this.backupError.message}`)
    }
    return window.api.finishRecordingSession(id)
  }

  pause(): void {
    this.recorder?.pause()
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
  }

  resume(): void {
    this.recorder?.resume()
    this.drawSuspended = false
    if (this.rafHandle === null) {
      this.runDrawLoop()
    }
  }

  async stopRecording(): Promise<string> {
    const recorder = this.recorder
    const sessionId = this.sessionId
    if (!recorder || !sessionId) throw new Error('Not recording')

    if (recorder.state !== 'inactive') {
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = (): void => resolve()
      })
      recorder.stop()
      await stopped
    }
    await this.chunkQueue
    let backupPath = ''
    let backupFailure: unknown
    try { backupPath = await this.finishBackup() } catch (error) { backupFailure = error }

    this.recording = false
    this.recorder = null
    this.sessionId = null
    this.canvasStream?.getTracks().forEach((track) => track.stop())
    this.canvasStream = null
    this.micStream?.getTracks().forEach((track) => track.stop())
    this.micStream = null
    for (const track of this.screenStream?.getAudioTracks() ?? []) {
      track.stop()
      this.screenStream?.removeTrack(track)
    }

    await this.streamAudioContext?.close()
    this.streamAudioContext = null
    this.applyOutputSize('preview')
    this.syncVisibilityCompositor()

    const wasStreaming = this.streaming
    try {
      if (this.streaming) {
        await window.api.finishStream(sessionId)
        this.streaming = false
        this.combinedStream = null
        if (backupFailure) throw backupFailure
        return backupPath
      }
      return await window.api.finishRecordingSession(sessionId)
    } catch (error) {
      if (wasStreaming) await window.api.finishStream(sessionId).catch(() => undefined)
      else await window.api.abortRecordingSession(sessionId).catch(() => undefined)
      this.streaming = false
      throw error
    }
  }

  async start(): Promise<void> {
    await this.startRecording()
  }

  async stop(): Promise<string> {
    return this.stopRecording()
  }

  private applyOutputSize(phase: 'preview' | 'record'): void {
    if (!this.canvas) return

    let width: number
    let height: number
    if (this.format === 'tiktok') {
      const size = getTikTokOutputSize(this.quality.id, phase)
      width = size.width
      height = size.height
    } else {
      if (this.rawWidth === 0 || this.rawHeight === 0) return
      const maxDim =
        phase === 'preview' ? this.quality.previewMaxDimension : this.quality.recordMaxDimension
      const sized = scaleToMaxDimension(this.rawWidth, this.rawHeight, maxDim)
      width = sized.width
      height = sized.height
    }

    if (this.canvas.width === width && this.canvas.height === height) return
    this.canvas.width = width
    this.canvas.height = height
  }

  private sourceRect(): CropRect {
    if (this.cropRect) return this.cropRect
    const width = this.screenVideo?.videoWidth ?? 0
    const height = this.screenVideo?.videoHeight ?? 0
    return { x: 0, y: 0, width, height }
  }

  private screenDrawRect(): CropRect {
    const base = this.sourceRect()
    if (this.format !== 'tiktok') return base

    const localFocusX = this.focusX * base.width
    const localFocusY = this.focusY * base.height
    const target = computeCoverCropAtFocus(
      base.width,
      base.height,
      TIKTOK_ASPECT,
      localFocusX,
      localFocusY
    )

    if (!this.cropSmoothReady) {
      this.smoothCropX = target.x
      this.smoothCropY = target.y
      this.cropSmoothReady = true
    } else {
      this.smoothCropX += (target.x - this.smoothCropX) * CURSOR_FOLLOW_SMOOTHING
      this.smoothCropY += (target.y - this.smoothCropY) * CURSOR_FOLLOW_SMOOTHING
    }

    return {
      x: base.x + Math.round(this.smoothCropX),
      y: base.y + Math.round(this.smoothCropY),
      width: target.width,
      height: target.height
    }
  }

  private syncCursorFollow(): void {
    const shouldFollow = this.previewOpen && this.format === 'tiktok'
    if (shouldFollow && this.cursorPollHandle === null) {
      void this.pollCursorFocus()
      this.cursorPollHandle = window.setInterval(() => {
        void this.pollCursorFocus()
      }, CURSOR_POLL_MS)
      return
    }

    if (!shouldFollow && this.cursorPollHandle !== null) {
      window.clearInterval(this.cursorPollHandle)
      this.cursorPollHandle = null
      this.focusX = 0.5
      this.focusY = 0.5
      this.cropSmoothReady = false
    }
  }

  private async pollCursorFocus(): Promise<void> {
    if (this.format !== 'tiktok' || !this.previewOpen) return

    try {
      const point = await window.api.getCursorPoint()
      this.updateFocusFromScreenPoint(point.x, point.y)
    } catch {
      // Keep the last known focus if cursor polling fails.
    }
  }

  private updateFocusFromScreenPoint(screenX: number, screenY: number): void {
    if (this.region) {
      const { rect } = this.region
      if (rect.width <= 0 || rect.height <= 0) return
      this.focusX = clamp01((screenX - rect.x) / rect.width)
      this.focusY = clamp01((screenY - rect.y) / rect.height)
      return
    }

    const bounds = this.source?.displayBounds
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      this.focusX = clamp01((screenX - bounds.x) / bounds.width)
      this.focusY = clamp01((screenY - bounds.y) / bounds.height)
      return
    }

    // Window capture (no display bounds): stay centered.
    this.focusX = 0.5
    this.focusY = 0.5
  }

  private async teardownPipeline(options: { keepMic: boolean }): Promise<void> {
    if (this.cursorPollHandle !== null) {
      window.clearInterval(this.cursorPollHandle)
      this.cursorPollHandle = null
    }
    this.cropSmoothReady = false
    this.drawSuspended = false

    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }

    if (this.recording && this.recorder) {
      try {
        this.recorder.stop()
      } catch {
        // Ignore — teardown path.
      }
      this.recording = false
      this.recorder = null
    }

    if (this.backupRecorder) {
      await this.finishBackup().catch((error: unknown) => {
        this.callbacks.onError((error as Error).message)
      })
    }
    this.combinedStream = null
    if (this.sessionId) {
      const id = this.sessionId
      this.sessionId = null
      if (this.streaming) await window.api.finishStream(id).catch(() => undefined)
      else await window.api.abortRecordingSession(id).catch(() => undefined)
      this.streaming = false
    }

    await this.streamAudioContext?.close()
    this.streamAudioContext = null
    this.canvasStream?.getTracks().forEach((track) => track.stop())
    this.canvasStream = null

    for (const stream of [this.screenStream, this.webcamStream]) {
      stream?.getTracks().forEach((track) => track.stop())
    }
    this.screenStream = null
    this.webcamStream = null
    this.screenVideo = null
    this.webcamVideo = null
    this.canvas = null
    this.ctx = null
    this.cropRect = null
    this.rawWidth = 0
    this.rawHeight = 0

    if (!options.keepMic) {
      this.micStream?.getTracks().forEach((track) => track.stop())
      this.micStream = null
    }
  }

  private runDrawLoop(): void {
    if (this.drawSuspended) return

    const draw = (now: number): void => {
      if (this.drawSuspended) {
        this.rafHandle = null
        return
      }
      this.rafHandle = requestAnimationFrame(draw)
      const fps = this.recording ? this.quality.recordFps : this.quality.previewFps
      const interval = 1000 / fps
      if (now - this.lastFrameAt < interval) return
      this.lastFrameAt = now
      this.paintFrame()
    }
    this.rafHandle = requestAnimationFrame(draw)
  }

  /** Pause preview compositing when the studio is hidden (keep going while recording). */
  private syncVisibilityCompositor(): void {
    const shouldSuspend = document.visibilityState === 'hidden' && !this.recording
    if (shouldSuspend === this.drawSuspended) return

    this.drawSuspended = shouldSuspend
    if (shouldSuspend) {
      if (this.rafHandle !== null) {
        cancelAnimationFrame(this.rafHandle)
        this.rafHandle = null
      }
      if (this.cursorPollHandle !== null) {
        window.clearInterval(this.cursorPollHandle)
        this.cursorPollHandle = null
      }
      return
    }

    if (this.previewOpen && this.rafHandle === null) {
      this.runDrawLoop()
    }
    this.syncCursorFollow()
  }

  private paintFrame(): void {
    if (!this.ctx || !this.canvas || !this.screenVideo) return

    const src = this.screenDrawRect()
    if (src.width <= 0 || src.height <= 0) return

    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'high'
    this.ctx.drawImage(
      this.screenVideo,
      src.x,
      src.y,
      src.width,
      src.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    )

    if (this.webcamEnabled && this.webcamVideo && this.webcamVideo.videoWidth > 0) {
      this.drawWebcamCover(this.webcamVideo)
    }
  }

  private drawWebcamCover(webcamVideo: HTMLVideoElement): void {
    if (!this.ctx || !this.canvas) return

    const { nx, ny, nw, nh } = this.pipBounds
    const dx = nx * this.canvas.width
    const dy = ny * this.canvas.height
    const dw = nw * this.canvas.width
    const dh = nh * this.canvas.height

    const vw = webcamVideo.videoWidth
    const vh = webcamVideo.videoHeight
    const videoRatio = vw / vh
    const destRatio = dw / dh

    let sx = 0
    let sy = 0
    let sw = vw
    let sh = vh
    if (videoRatio > destRatio) {
      sw = vh * destRatio
      sx = (vw - sw) / 2
    } else {
      sh = vw / destRatio
      sy = (vh - sh) / 2
    }

    this.ctx.save()
    this.ctx.beginPath()
    this.ctx.rect(dx, dy, dw, dh)
    this.ctx.clip()
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'high'
    this.ctx.translate(dx + dw, dy)
    this.ctx.scale(-1, 1)
    this.ctx.drawImage(webcamVideo, sx, sy, sw, sh, 0, 0, dw, dh)
    this.ctx.restore()
  }
}

export function pickRecorderMimeType(preferVp9: boolean): string {
  if (preferVp9 && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
    return 'video/webm;codecs=vp9,opus'
  }
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
    return 'video/webm;codecs=vp8,opus'
  }
  return 'video/webm'
}

function createMediaRecorder(stream: MediaStream, quality: QualityPreset, format: OutputFormat): MediaRecorder {
  const candidates = [
    quality.preferVp9 ? 'video/webm;codecs=vp9,opus' : '',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ].filter((value) => value.length > 0 && MediaRecorder.isTypeSupported(value))

  let lastError: unknown = null
  for (const mimeType of candidates) {
    try {
      return new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: getRecordingBitrate(quality.id, format),
        audioBitsPerSecond: 192_000
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('WebM recording is not supported on this device.')
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

async function attachToVideoElement(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  await video.play()
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => video.addEventListener('loadedmetadata', () => resolve(), { once: true }))
  }
  return video
}
