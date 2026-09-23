import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  root: '',
  spawn: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => mocks.root },
  dialog: {}
}))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))

import { appendRecordingChunk, beginRecordingSession, finishRecordingSession } from '../../src/main/save'

beforeEach(async () => {
  mocks.root = await fs.mkdtemp(path.join(os.tmpdir(), 'jayos-save-test-'))
  mocks.spawn.mockReset()
})
afterEach(async () => {
  await fs.rm(mocks.root, { recursive: true, force: true })
})

function mockRemux(invalidAttempts = 0): void {
  let validationCount = 0
  mocks.spawn.mockImplementation((_binary: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
    child.stderr = new EventEmitter()
    setTimeout(async () => {
      if (args.includes('-xerror')) {
        validationCount++
        if (validationCount <= invalidAttempts) {
          child.stderr.emit('data', Buffer.from('Invalid WebM data'))
          child.emit('close', 1)
          return
        }
      } else {
        await fs.copyFile(args[args.indexOf('-i') + 1], args.at(-1)!)
      }
      child.emit('close', 0)
    }, 0)
    return child
  })
}

async function record(): Promise<string> {
  const id = await beginRecordingSession()
  await appendRecordingChunk(id, Buffer.from('first chunk'))
  await appendRecordingChunk(id, Buffer.from('last chunk'))
  return id
}

describe('recording export', () => {
  it('saves WebM without re-encoding and validates before publishing', async () => {
    mockRemux()
    const id = await record()
    const result = await finishRecordingSession(id)
    expect(await fs.readFile(result, 'utf8')).toBe('first chunklast chunk')
    expect(await fs.readdir(mocks.root)).toEqual([path.basename(result)])
    const encodeArgs = mocks.spawn.mock.calls[0][1] as string[]
    expect(path.dirname(encodeArgs.at(-1)!)).not.toBe(mocks.root)
    expect(result).toMatch(/\.webm$/)
    expect(encodeArgs).toContain('copy')
    expect(encodeArgs).not.toContain('aac')
    expect(mocks.spawn.mock.calls[1][1]).toContain('-xerror')
  })

  it('keeps every source chunk and publishes no broken WebM if validation fails', async () => {
    mockRemux(Infinity)
    const id = await record()
    await expect(finishRecordingSession(id)).rejects.toThrow('Original recording kept at')
    const files = await fs.readdir(mocks.root)
    expect(files).toEqual([`jayos-${id}.webm`])
    expect(await fs.readFile(path.join(mocks.root, files[0]), 'utf8')).toBe('first chunklast chunk')
  })
})
