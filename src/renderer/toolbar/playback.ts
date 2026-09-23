import type { PlaybackRecording } from '../../shared/types'

export class RecordingPlayback {
  private dialog = document.getElementById('playback-dialog') as HTMLDialogElement
  private video = document.getElementById('playback-video') as HTMLVideoElement
  private details = document.getElementById('playback-details') as HTMLSpanElement
  private error = document.getElementById('playback-error') as HTMLParagraphElement
  private lastRecording: PlaybackRecording | null = null

  constructor(private onVisibilityChange: (open: boolean) => void) {
    document.getElementById('playback-close')!.addEventListener('click', () => this.dialog.close())
    this.dialog.addEventListener('close', () => {
      this.video.pause()
      this.video.removeAttribute('src')
      this.video.load()
      this.onVisibilityChange(false)
    })
    document.getElementById('playback-reveal')!.addEventListener('click', () => {
      if (this.lastRecording) {
        void window.api.revealRecording(this.lastRecording.id).catch(() => {
          this.showError('Could not reveal this recording. The file may have been moved.')
        })
      }
    })
    this.video.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(this.video.duration) ? Math.round(this.video.duration) : null
      const time = duration === null ? 'Duration unavailable' : `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
      this.details.textContent = `${this.video.videoWidth} × ${this.video.videoHeight} · ${time} · Press play to review picture and sound`
    })
    this.video.addEventListener('error', () => {
      if (!this.dialog.open || !this.video.getAttribute('src')) return
      this.details.textContent = 'Playback unavailable'
      this.showError('This recording could not be played. It may have been moved, be incomplete, or use an unsupported format.')
    })
  }

  isOpen(): boolean { return this.dialog.open }
  hasRecording(): boolean { return this.lastRecording !== null }

  show(recording: PlaybackRecording): void {
    this.lastRecording = recording
    this.video.pause()
    this.error.classList.add('hidden')
    this.details.textContent = 'Loading recording…'
    document.getElementById('playback-name')!.textContent = recording.name
    document.getElementById('playback-path')!.textContent = recording.filePath
    this.video.src = recording.url
    this.video.muted = false
    this.video.volume = 1
    if (!this.dialog.open) this.dialog.showModal()
    this.onVisibilityChange(true)
  }

  reviewLast(): void {
    if (this.lastRecording) this.show(this.lastRecording)
  }

  private showError(message: string): void {
    this.error.textContent = message
    this.error.classList.remove('hidden')
  }
}
