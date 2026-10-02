export interface StreamDestination { serverUrl: string; streamKey: string }

export function streamTarget(destination: StreamDestination): string {
  const server = destination.serverUrl.trim()
  const key = destination.streamKey.trim()
  let url: URL
  try { url = new URL(server) } catch { throw new Error('Enter a valid RTMP or RTMPS server URL.') }
  if (!['rtmp:', 'rtmps:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash || url.search) {
    throw new Error('Use an RTMP or RTMPS server URL without credentials or query parameters.')
  }
  if (!key || /[\s\x00-\x1f]/.test(key)) throw new Error('Enter a valid stream key.')
  return `${server.replace(/\/+$/, '')}/${key}`
}

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'disconnected'
export interface StreamStatus { state: StreamState; encoder?: string }

export function streamingEncoders(platform: NodeJS.Platform): string[][] {
  const software = ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency']
  if (platform === 'darwin') return [['-c:v', 'h264_videotoolbox', '-realtime', '1', '-allow_sw', '0'], software]
  return [
    ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'll'],
    ...(platform === 'win32' ? [['-c:v', 'h264_qsv'], ['-c:v', 'h264_amf']] : []),
    software
  ]
}

export function streamArgs(target: string, videoArgs = streamingEncoders('unknown' as NodeJS.Platform).at(-1)!): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-stats_period', '1', '-f', 'webm', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    ...videoArgs,
    '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60', '-b:v', '4500k',
    '-maxrate', '4500k', '-bufsize', '9000k', '-c:a', 'aac', '-b:a', '128k',
    '-ar', '44100', '-rw_timeout', '15000000', '-f', 'flv', target]
}
