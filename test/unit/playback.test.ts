import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(), fetch: vi.fn(), dialog: vi.fn(), reveal: vi.fn()
}))
vi.mock('electron', () => ({
  protocol: { handle: mocks.handle, registerSchemesAsPrivileged: vi.fn() },
  net: { fetch: mocks.fetch },
  dialog: { showOpenDialog: mocks.dialog },
  shell: { showItemInFolder: mocks.reveal }
}))
import { chooseRecording, getRecordingPlayback, registerPlaybackProtocol, registerSavedRecording, revealRecording, parseByteRange } from '../../src/main/playback'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true })
})

describe('recording playback', () => {
  it('handles suffix/open ranges and rejects invalid byte ranges', () => {
    expect(parseByteRange('bytes=-50', 300)).toEqual({ start: 250, end: 299 })
    expect(parseByteRange('bytes=100-', 300)).toEqual({ start: 100, end: 299 })
    expect(parseByteRange('bytes=0-999', 300)).toEqual({ start: 0, end: 299 })
    expect(parseByteRange('bytes=20-10', 300)).toBeNull()
    expect(parseByteRange('bytes=-0', 300)).toBeNull()
    expect(parseByteRange('bytes=0-', 0)).toBeNull()
  })

  it('streams only approved recordings and forwards byte ranges for seeking', async () => {
    registerPlaybackProtocol()
    const handler = mocks.handle.mock.calls[0][1]
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jayos-playback-test-'))
    roots.push(root)
    const filePath = path.join(root, 'recording #1.webm')
    const bytes = Buffer.alloc(300, 42)
    await fs.writeFile(filePath, bytes)
    const recording = registerSavedRecording(filePath)
    const response = await handler(new Request(recording.url, { headers: { Range: 'bytes=100-199' } }))
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 100-199/300')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(100, 200))
    expect((await handler(new Request('jayos-media://recording/etc/passwd'))).status).toBe(404)
    expect((await handler(new Request(recording.url.replace('://recording/', '://elsewhere/')))).status).toBe(404)
    const invalid = await handler(new Request(recording.url, { headers: { Range: 'bytes=999-' } }))
    expect(invalid.status).toBe(416)
    const head = await handler(new Request(recording.url, { method: 'HEAD' }))
    expect(head.headers.get('Content-Length')).toBe('300')
    expect(await head.text()).toBe('')
    expect(() => getRecordingPlayback('/tmp/not-approved.webm')).toThrow()
  })

  it('opens user-selected files, handles cancellation, and reveals an approved recording', async () => {
    mocks.dialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await chooseRecording()).toBeNull()
    mocks.dialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/chosen.webm'] })
    const recording = await chooseRecording()
    expect(getRecordingPlayback('/tmp/chosen.webm')).toEqual(recording)
    revealRecording(recording!.id)
    expect(mocks.reveal).toHaveBeenCalledWith('/tmp/chosen.webm')
  })
})
