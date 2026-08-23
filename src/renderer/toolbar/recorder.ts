import type { NormalizedBounds, RegionSelection, SourceInfo } from '../../shared/types'
import { computeCropRect, type CropRect } from '../../shared/geometry'

/** Chromium's legacy desktop-capture constraint shape; not in the standard DOM lib types. */
interface DesktopCaptureConstraints {
  mandatory: {
    chromeMediaSource: 'desktop'
    chromeMediaSourceId?: string
  }
}

export interface RecorderCallbacks {
  onError: (message: string) => void
}

const DEFAULT_PIP_BOUNDS: NormalizedBounds = { nx: 0.78, ny: 0.72, nw: 0.18, nh: 0.18 }
const PIP_CORNER_RADIUS = 16

export class Recorder {
  private source: SourceInfo | null = null
  private region: RegionSelection | null = null
  private micEnabled = true
  private micDeviceId: string | null = null
  private webcamEnabled = true
  private systemAudioSupported = false
  private pipBounds: NormalizedBounds = DEFAULT_PIP_BOUNDS

  private screenStream: MediaStream | null = null
  private webcamStream: MediaStream | null = null
  private micStream: MediaStream | null = null
  private screenVideo: HTMLVideoElement | null = null
  private webcamVideo: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private rafHandle: number | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private cropRect: CropRect | null = null

  constructor(private callbacks: RecorderCallbacks) {}

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

  async start(): Promise<void> {
    if (!this.source) throw new Error('No source selected')

    const desktopConstraints: DesktopCaptureConstraints = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: this.source.id
      }
    }

    this.screenStream = await navigator.mediaDevices.getUserMedia({
      video: desktopConstraints as unknown as MediaTrackConstraints,
      audio: this.systemAudioSupported
        ? ({ mandatory: { chromeMediaSource: 'desktop' } } as unknown as MediaTrackConstraints)
        : false
    })

    if (this.webcamEnabled) {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    }

    if (this.micEnabled) {
      const audio: MediaTrackConstraints | boolean = this.micDeviceId
        ? { deviceId: { exact: this.micDeviceId } }
        : true
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    }

    this.screenVideo = await attachToVideoElement(this.screenStream)
    this.webcamVideo = this.webcamStream ? await attachToVideoElement(this.webcamStream) : null

    this.cropRect = computeCropRect(this.region, this.screenVideo.videoWidth, this.screenVideo.videoHeight)
    const outputWidth = this.cropRect ? this.cropRect.width : this.screenVideo.videoWidth
    const outputHeight = this.cropRect ? this.cropRect.height : this.screenVideo.videoHeight

    this.canvas = document.createElement('canvas')
    this.canvas.width = outputWidth
    this.canvas.height = outputHeight
    this.ctx = this.canvas.getContext('2d')

    this.runDrawLoop()

    const canvasStream = this.canvas.captureStream(30)
    const audioTracks = [
      ...(this.micStream?.getAudioTracks() ?? []),
      ...(this.screenStream?.getAudioTracks() ?? [])
    ]
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks])

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm'

    this.chunks = []
    this.recorder = new MediaRecorder(combined, { mimeType })
    this.recorder.ondataavailable = (event): void => {
      if (event.data.size > 0) this.chunks.push(event.data)
    }
    this.recorder.onerror = (): void => this.callbacks.onError('Recording failed unexpectedly.')
    this.recorder.start(1000)
  }

  pause(): void {
    this.recorder?.pause()
    // Stop compositing while paused — nothing is consuming these frames
    // (MediaRecorder is paused too), so drawing them just burns CPU/battery.
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
  }

  resume(): void {
    this.recorder?.resume()
    if (this.rafHandle === null) {
      this.runDrawLoop()
    }
  }

  async stop(): Promise<string> {
    const recorder = this.recorder
    if (!recorder) throw new Error('Not recording')

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = (): void => resolve()
    })
    recorder.stop()
    await stopped

    this.cleanupStreams()

    const blob = new Blob(this.chunks, { type: 'video/webm' })
    const buffer = await blob.arrayBuffer()
    return window.api.saveRecording(buffer, 'webm')
  }

  private cleanupStreams(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
    for (const stream of [this.screenStream, this.webcamStream, this.micStream]) {
      stream?.getTracks().forEach((track) => track.stop())
    }
    this.screenStream = null
    this.webcamStream = null
    this.micStream = null
    this.recorder = null
  }

  private runDrawLoop(): void {
    const draw = (): void => {
      if (!this.ctx || !this.canvas || !this.screenVideo) return

      if (this.cropRect) {
        this.ctx.drawImage(
          this.screenVideo,
          this.cropRect.x,
          this.cropRect.y,
          this.cropRect.width,
          this.cropRect.height,
          0,
          0,
          this.canvas.width,
          this.canvas.height
        )
      } else {
        this.ctx.drawImage(this.screenVideo, 0, 0, this.canvas.width, this.canvas.height)
      }

      if (this.webcamVideo) {
        this.drawWebcamOverlay(this.webcamVideo)
      }

      this.rafHandle = requestAnimationFrame(draw)
    }

    this.rafHandle = requestAnimationFrame(draw)
  }

  private drawWebcamOverlay(webcamVideo: HTMLVideoElement): void {
    if (!this.ctx || !this.canvas) return

    const { nx, ny, nw, nh } = this.pipBounds
    const x = nx * this.canvas.width
    const y = ny * this.canvas.height
    const w = nw * this.canvas.width
    const h = nh * this.canvas.height

    this.ctx.save()
    roundedRectPath(this.ctx, x, y, w, h, PIP_CORNER_RADIUS)
    this.ctx.clip()

    // Mirror horizontally so the overlay matches a natural selfie view.
    this.ctx.translate(x + w, y)
    this.ctx.scale(-1, 1)
    this.ctx.drawImage(webcamVideo, 0, 0, w, h)
    this.ctx.restore()
  }
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

async function attachToVideoElement(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream
  await video.play()
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => video.addEventListener('loadedmetadata', () => resolve(), { once: true }))
  }
  return video
}
