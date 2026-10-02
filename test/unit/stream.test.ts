import { describe, expect, it } from 'vitest'
import { streamArgs, streamTarget } from '../../src/shared/stream'

describe('stream destinations', () => {
  it('joins RTMP and encrypted RTMPS destinations without losing key query parameters', () => {
    expect(streamTarget({ serverUrl: ' rtmps://example.com/live/ ', streamKey: ' abc?token=123 ' }))
      .toBe('rtmps://example.com/live/abc?token=123')
    expect(streamTarget({ serverUrl: 'rtmp://localhost:1935/live', streamKey: 'key' }))
      .toBe('rtmp://localhost:1935/live/key')
  })
  it.each(['https://example.com/live', 'file:///tmp/video', 'rtmp://user:pass@example.com/live', 'rtmp://example.com/live?key=secret', 'bad'])('rejects unsupported destination %s', (serverUrl) => {
    expect(() => streamTarget({ serverUrl, streamKey: 'key' })).toThrow()
  })
  it.each(['', 'bad key', 'key\nsecret'])('rejects invalid keys', (streamKey) => {
    expect(() => streamTarget({ serverUrl: 'rtmp://example.com/live', streamKey })).toThrow()
  })
  it('encodes H.264 and AAC with a fixed GOP, optional audio, and an FLV output', () => {
    const args = streamArgs('rtmps://example.com/live/key')
    expect(args).toContain('libx264')
    expect(args).toContain('aac')
    expect(args).toContain('0:a:0?')
    expect(args.slice(-3)).toEqual(['-f', 'flv', 'rtmps://example.com/live/key'])
  })
})
