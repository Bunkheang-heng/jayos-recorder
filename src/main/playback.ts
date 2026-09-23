import { dialog, protocol, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { createReadStream, promises as fs } from 'node:fs'
import { Readable } from 'node:stream'
import type { PlaybackRecording } from '../shared/types'

// Only files saved by this app or explicitly selected by the user are exposed.
const recordings = new Map<string, PlaybackRecording>()

export function registerPlaybackScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'jayos-media',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
  }])
}

export function registerPlaybackProtocol(): void {
  protocol.handle('jayos-media', async (request) => {
    const url = new URL(request.url)
    const recording = recordings.get(url.pathname.slice(1))
    if (url.hostname !== 'recording' || !recording || !['GET', 'HEAD'].includes(request.method)) {
      return new Response('Recording not available', { status: 404 })
    }
    try {
      const info = await fs.stat(recording.filePath)
      if (!info.isFile()) return new Response('Recording not available', { status: 404 })
      const rangeHeader = request.headers.get('Range')
      const range = rangeHeader ? parseByteRange(rangeHeader, info.size) : null
      if (rangeHeader && !range) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } })
      }
      const headers = new Headers({
        'Content-Type': path.extname(recording.filePath).toLowerCase() === '.webm' ? 'video/webm' :
          path.extname(recording.filePath).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(range ? range.end - range.start + 1 : info.size)
      })
      if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`)
      const body = request.method === 'HEAD' ? null : Readable.toWeb(
        createReadStream(recording.filePath, range ?? undefined)
      ) as ReadableStream<Uint8Array>
      return new Response(body, { status: range ? 206 : 200, headers })
    } catch {
      return new Response('Recording was moved or is no longer available', { status: 404 })
    }
  })
}

export function registerSavedRecording(filePath: string): PlaybackRecording {
  const existing = [...recordings.values()].find((recording) => recording.filePath === filePath)
  if (existing) return existing
  const id = randomUUID()
  const recording = { id, filePath, name: path.basename(filePath), url: `jayos-media://recording/${id}` }
  recordings.set(id, recording)
  return recording
}

export function getRecordingPlayback(filePath: string): PlaybackRecording {
  const recording = [...recordings.values()].find((item) => item.filePath === filePath)
  if (!recording) throw new Error('Choose this recording using Open Recording first.')
  return recording
}

export async function chooseRecording(): Promise<PlaybackRecording | null> {
  const result = await dialog.showOpenDialog({
    title: 'Open recording',
    properties: ['openFile'],
    filters: [{ name: 'Recordings', extensions: ['webm', 'mp4', 'mov'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null
  return registerSavedRecording(result.filePaths[0])
}

export function revealRecording(id: string): void {
  const recording = recordings.get(id)
  if (!recording) throw new Error('Recording not available')
  shell.showItemInFolder(recording.filePath)
}

/** Single byte ranges used by the video element, including open-ended and suffix ranges. */
export function parseByteRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2]) || size <= 0) return null
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null
  return { start, end }
}
