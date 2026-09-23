import { app, dialog } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { timestampedFilename } from '../shared/filename'

interface Settings {
  saveDir: string
}

interface RecordingSession {
  handle: fs.FileHandle
  webmPath: string
}

const sessions = new Map<string, RecordingSession>()

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function defaultSaveDir(): string {
  return app.getPath('desktop')
}

async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
    return JSON.parse(raw) as Settings
  } catch {
    return { saveDir: defaultSaveDir() }
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export async function getSaveDir(): Promise<string> {
  const settings = await readSettings()
  return settings.saveDir
}

export async function chooseSaveDir(): Promise<string | null> {
  const current = await getSaveDir()
  const result = await dialog.showOpenDialog({
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const chosen = result.filePaths[0]
  await writeSettings({ saveDir: chosen })
  return chosen
}

/** Opens a temp WebM on disk so chunks never pile up in renderer RAM. */
export async function beginRecordingSession(): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const webmPath = path.join(app.getPath('temp'), `jayos-${id}.webm`)
  const handle = await fs.open(webmPath, 'w')
  sessions.set(id, { handle, webmPath })
  return id
}

export async function appendRecordingChunk(sessionId: string, buffer: Buffer): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('Recording session not found')
  await session.handle.writeFile(buffer)
}

export async function finishRecordingSession(sessionId: string): Promise<string> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('Recording session not found')

  sessions.delete(sessionId)
  await session.handle.close()

  const dir = await getSaveDir()
  const webmPath = path.join(dir, timestampedFilename(new Date(), 'webm'))

  await exportRecording(session.webmPath, webmPath)
  return webmPath
}

export async function abortRecordingSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  sessions.delete(sessionId)
  await session.handle.close().catch(() => undefined)
  await fs.unlink(session.webmPath).catch(() => undefined)
}

/**
 * Legacy one-shot save (full buffer). Prefer streaming session APIs for recordings.
 */
export async function saveRecording(buffer: Buffer, sourceExt: string): Promise<string> {
  if (sourceExt !== 'webm' && sourceExt !== 'mp4') {
    throw new Error('Unsupported recording format')
  }
  const dir = await getSaveDir()
  const outputPath = path.join(dir, timestampedFilename(new Date(), sourceExt))
  const tmpSource = path.join(app.getPath('temp'), `jayos-${Date.now()}-${process.pid}.${sourceExt}`)
  await fs.writeFile(tmpSource, buffer)
  await exportRecording(tmpSource, outputPath)
  return outputPath
}

async function exportRecording(inputPath: string, outputPath: string): Promise<void> {
  let stagingDir: string | undefined
  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    stagingDir = await fs.mkdtemp(path.join(path.dirname(outputPath), '.jayos-export-'))
    const stagingPath = path.join(stagingDir, `recording${path.extname(outputPath)}`)
    // Stream-copy adds duration and seek metadata without re-encoding audio/video.
    await runFfmpeg([
      '-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a?',
      '-c', 'copy', stagingPath
    ])
    await runFfmpeg([
      '-v', 'error', '-xerror', '-i', stagingPath,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-frames:v', '1', '-frames:a', '1', '-f', 'null', '-'
    ])
    await fs.rename(stagingPath, outputPath)
  } catch (error) {
    throw new Error(`Export failed. Original recording kept at ${inputPath}. ${(error as Error).message}`)
  } finally {
    if (stagingDir) await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
  }
  await fs.unlink(inputPath).catch(() => undefined)
}

function resolveFfmpegPath(): string {
  if (!ffmpegStatic) {
    throw new Error('Bundled ffmpeg is missing. Reinstall dependencies and try again.')
  }

  if (ffmpegStatic.includes('app.asar')) {
    return ffmpegStatic.replace('app.asar', 'app.asar.unpacked')
  }
  return ffmpegStatic
}

function runFfmpeg(args: string[]): Promise<void> {
  const ffmpeg = resolveFfmpegPath()

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to start ffmpeg: ${error.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`ffmpeg exit ${code}. ${stderr.trim()}`))
    })
  })
}
