import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordingPlayback } from '../../src/renderer/toolbar/playback'

class Element extends EventTarget {
  textContent = ''
  open = false
  src = ''
  muted = true
  volume = 0
  videoWidth = 1080
  videoHeight = 1920
  duration = 12
  classList = { add: vi.fn(), remove: vi.fn() }
  pause = vi.fn()
  load = vi.fn()
  showModal(): void { this.open = true }
  close(): void { this.open = false; this.dispatchEvent(new Event('close')) }
  removeAttribute(name: string): void { if (name === 'src') this.src = '' }
  getAttribute(name: string): string | null { return name === 'src' ? this.src : null }
}
let elements: Map<string, Element>
let player: RecordingPlayback
let visible: ReturnType<typeof vi.fn>
const recording = { id: 'recording', name: 'Recording.webm', filePath: '/Recordings/Recording.webm', url: 'jayos-media://recording/id' }
const get = (id: string): Element => elements.get(id)!

beforeEach(() => {
  elements = new Map(['playback-dialog', 'playback-video', 'playback-details', 'playback-error', 'playback-close', 'playback-reveal', 'playback-name', 'playback-path'].map((id) => [id, new Element()]))
  vi.stubGlobal('document', { getElementById: (id: string) => elements.get(id) })
  vi.stubGlobal('window', { api: { revealRecording: vi.fn().mockResolvedValue(undefined) } })
  visible = vi.fn()
  player = new RecordingPlayback(visible)
})
afterEach(() => vi.unstubAllGlobals())

describe('recording review', () => {
  it('opens an audible player, displays metadata, and retains the last recording', () => {
    player.show(recording)
    expect(player.isOpen()).toBe(true)
    expect(get('playback-video').src).toBe(recording.url)
    expect(get('playback-video').muted).toBe(false)
    get('playback-video').dispatchEvent(new Event('loadedmetadata'))
    expect(get('playback-details').textContent).toContain('1080 × 1920 · 0:12')
    expect(visible).toHaveBeenLastCalledWith(true)
    expect(player.hasRecording()).toBe(true)
  })

  it('stops and unloads playback on close, and can reopen the same recording', () => {
    player.show(recording)
    get('playback-close').dispatchEvent(new Event('click'))
    expect(player.isOpen()).toBe(false)
    expect(get('playback-video').pause).toHaveBeenCalled()
    expect(get('playback-video').src).toBe('')
    expect(get('playback-video').load).toHaveBeenCalled()
    expect(visible).toHaveBeenLastCalledWith(false)
    player.reviewLast()
    expect(get('playback-video').src).toBe(recording.url)
    expect(player.isOpen()).toBe(true)
  })

  it('shows a readable playback error and clears it for the next recording', () => {
    player.show(recording)
    get('playback-video').dispatchEvent(new Event('error'))
    expect(get('playback-error').textContent).toContain('could not be played')
    expect(get('playback-error').classList.remove).toHaveBeenCalledWith('hidden')
    player.show(recording)
    expect(get('playback-error').classList.add).toHaveBeenCalledWith('hidden')
  })
})
