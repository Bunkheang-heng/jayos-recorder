import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))
vi.mock('ffmpeg-static', () => ({ default: '/encoder' }))

function child() {
  const process = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    exitCode: null as number | null, signalCode: null, kill: vi.fn()
  })
  process.stdin.on('finish', () => { process.exitCode = 0; process.emit('close', 0) })
  return process
}

afterEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.useRealTimers() })

it('falls back when hardware probes fail, reports live only on progress, and suppresses failures after stop', async () => {
  const encoder = child()
  spawn.mockImplementation((_path, args: string[]) => {
    if (args.includes('lavfi')) {
      const probe = child()
      queueMicrotask(() => probe.emit('close', 1))
      return probe
    }
    return encoder
  })
  const { beginStream, appendStream, finishStream } = await import('../../src/main/stream')
  const status = vi.fn()
  const failure = vi.fn()
  const id = await beginStream({ serverUrl: 'rtmps://example.com/live', streamKey: 'secret' }, failure, status)
  expect(status).toHaveBeenCalledWith({ state: 'connecting' })
  expect(status).not.toHaveBeenCalledWith(expect.objectContaining({ state: 'live' }))
  await appendStream(id, Buffer.from('header'))
  encoder.stdout.emit('data', Buffer.from('out_time_'))
  encoder.stdout.emit('data', Buffer.from('us=1000000\nprogress=continue\n'))
  expect(status).toHaveBeenLastCalledWith({ state: 'live', encoder: 'libx264' })
  await finishStream(id)
  encoder.emit('exit', 0)
  expect(failure).not.toHaveBeenCalled()
})

it('reports a disconnected encoder once and rejects further uploads', async () => {
  const encoder = child()
  spawn.mockImplementation((_path, args: string[]) => {
    if (args.includes('lavfi')) {
      const probe = child()
      queueMicrotask(() => probe.emit('close', 0))
      return probe
    }
    return encoder
  })
  const { beginStream, appendStream, abortStreams } = await import('../../src/main/stream')
  const failure = vi.fn()
  const status = vi.fn()
  const id = await beginStream({ serverUrl: 'rtmp://example.com/live', streamKey: 'secret' }, failure, status)
  encoder.emit('error', new Error('private encoder message'))
  encoder.emit('exit', 1)
  expect(failure).toHaveBeenCalledTimes(1)
  expect(status).toHaveBeenLastCalledWith({ state: 'disconnected' })
  await expect(appendStream(id, Buffer.from('chunk'))).rejects.toThrow('disconnected')
  encoder.emit('close', 1)
  abortStreams()
})
