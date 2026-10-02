import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import ffmpegStatic from 'ffmpeg-static'
import { streamArgs, streamTarget, streamingEncoders, type StreamStatus, type StreamDestination } from '../shared/stream'

let encoderSelection: Promise<string[]> | undefined
function selectEncoder(): Promise<string[]> {
  return encoderSelection ??= (async () => {
    const candidates = streamingEncoders(process.platform)
    for (const args of candidates.slice(0, -1)) {
      const supported = await new Promise<boolean>((resolve) => {
        const probe = spawn(ffmpegStatic!.replace('app.asar', 'app.asar.unpacked'), [
          '-v', 'error', '-f', 'lavfi', '-i', 'color=size=1280x720:rate=30',
          '-frames:v', '3', ...args, '-pix_fmt', 'yuv420p', '-f', 'null', '-'
        ], { stdio: 'ignore' })
        const timer = setTimeout(() => { probe.kill('SIGKILL'); resolve(false) }, 5000)
        probe.once('error', () => { clearTimeout(timer); resolve(false) })
        probe.once('close', code => { clearTimeout(timer); resolve(code === 0) })
      })
      if (supported) return args
    }
    return candidates.at(-1)!
  })()
}

interface Session { process: ChildProcessWithoutNullStreams; failed: boolean }
const sessions = new Map<string, Session>()

export async function beginStream(destination: StreamDestination, onFailure: () => void, onStatus: (status: StreamStatus) => void): Promise<string> {
  const target = streamTarget(destination)
  if (sessions.size) throw new Error('A live stream is already running.')
  if (!ffmpegStatic) throw new Error('Streaming encoder is unavailable.')
  onStatus({ state: 'connecting' })
  const videoArgs = await selectEncoder()
  if (sessions.size) throw new Error('A live stream is already running.')
  const encoder = spawn(ffmpegStatic.replace('app.asar', 'app.asar.unpacked'), streamArgs(target, videoArgs), { stdio: 'pipe' })
  const id = randomUUID()
  const session = { process: encoder, failed: false }
  sessions.set(id, session)
  const fail = (): void => {
    if (session.failed || !sessions.has(id)) return
    session.failed = true
    onStatus({ state: 'disconnected' })
    onFailure()
  }
  encoder.on('error', fail)
  encoder.stdin.on('error', fail)
  // Never expose encoder stderr: it can contain the stream key.
  encoder.stderr.resume()
  let progress = ''
  let liveReported = false
  encoder.stdout.on('data', (chunk: Buffer) => {
    progress += chunk.toString()
    const lines = progress.split('\n')
    progress = lines.pop()!.slice(-1024)
    for (const line of lines) {
      if (!liveReported && line.startsWith('out_time_us=') && Number(line.slice(12)) > 0 && !session.failed && sessions.has(id)) {
        liveReported = true
        onStatus({ state: 'live', encoder: videoArgs[1] })
      }
    }
  })
  const startupTimer = setTimeout(() => {
    if (!liveReported) { fail(); encoder.kill('SIGKILL') }
  }, 20000)
  encoder.once('close', () => clearTimeout(startupTimer))
  encoder.on('exit', fail)
  return id
}

export async function appendStream(id: string, buffer: Buffer): Promise<void> {
  const session = sessions.get(id)
  if (!session || session.failed) throw new Error('Live stream disconnected. Check your server URL, key, and connection.')
  if (buffer.length > 16 * 1024 * 1024) throw new Error('Streaming chunk is too large.')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { session.process.kill(); reject(new Error('Live stream connection timed out.')) }, 15000)
    session.process.stdin.write(buffer, (error) => {
      clearTimeout(timer)
      if (error) reject(new Error('Live stream disconnected.'))
      else resolve()
    })
  })
}

export async function finishStream(id: string): Promise<void> {
  const session = sessions.get(id)
  if (!session) return
  sessions.delete(id)
  const encoder = session.process
  if (encoder.exitCode !== null || encoder.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { encoder.kill('SIGKILL'); resolve() }, 3000)
    encoder.once('close', () => { clearTimeout(timer); resolve() })
    encoder.stdin.end()
  })
}

export function abortStreams(): void {
  for (const session of sessions.values()) session.process.kill('SIGKILL')
  sessions.clear()
}
