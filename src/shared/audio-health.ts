export type MicStatus = 'idle' | 'ok' | 'silent' | 'clipping' | 'muted' | 'disconnected' | 'unavailable'

/** Time-based thresholds keep normal pauses and brief peaks from flickering the UI. */
export class AudioHealth {
  private quietSince: number
  private clippingSince: number | null = null
  private clippingUntil = 0

  constructor(now: number) {
    this.quietSince = now
  }

  sample(db: number, peak: number, now: number): MicStatus {
    if (db > -55) this.quietSince = now
    if (peak >= 0.98) {
      this.clippingSince ??= now
      if (now - this.clippingSince >= 100) this.clippingUntil = now + 1500
    } else {
      this.clippingSince = null
    }
    if (now < this.clippingUntil) return 'clipping'
    if (now - this.quietSince >= 5000) return 'silent'
    return 'ok'
  }
}
