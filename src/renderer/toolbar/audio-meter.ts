/** Observe a recording stream without owning (or stopping) its tracks. */
export class AudioMeter {
  private stream: MediaStream | null = null
  private ownsStream = false
  private context: AudioContext | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private generation = 0

  constructor(private onLevel: (percent: number) => void) {}

  async start(deviceId: string | null, recordingStream?: MediaStream): Promise<void> {
    this.stop()
    const generation = this.generation
    try {
      const stream = recordingStream ?? await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false
      })
      if (generation !== this.generation) {
        if (!recordingStream) stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.stream = stream
      this.ownsStream = !recordingStream
      const context = new AudioContext()
      this.context = context
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      void context.resume().catch(() => undefined)
      const samples = new Float32Array(analyser.fftSize)
      this.timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        let power = 0
        for (const value of samples) power += value * value
        const rms = Math.sqrt(power / samples.length)
        const db = 20 * Math.log10(Math.max(rms, 0.000001))
        this.onLevel(Math.max(0, Math.min(100, (db + 60) / 60 * 100)))
      }, 50)
    } catch {
      if (generation === this.generation) this.stop()
    }
  }

  stop(): void {
    this.generation++
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    if (this.ownsStream) this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.ownsStream = false
    // Chromium can hang on close; never block recording on meter cleanup.
    if (this.context) void this.context.close().catch(() => undefined)
    this.context = null
    this.onLevel(0)
  }
}
