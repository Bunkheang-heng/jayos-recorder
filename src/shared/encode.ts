export interface EncoderAttempt {
  name: string
  videoArgs: string[]
}

/**
 * Prefer platform hardware encoders, then fall back to software x264.
 * Works on macOS, Windows, and Linux — unavailable HW encoders simply fail
 * the probe and the next attempt runs.
 */
export function buildVideoEncoderAttempts(
  platform: NodeJS.Platform = process.platform
): EncoderAttempt[] {
  const attempts: EncoderAttempt[] = []

  if (platform === 'darwin') {
    attempts.push({
      name: 'h264_videotoolbox',
      videoArgs: ['-c:v', 'h264_videotoolbox', '-b:v', '10M', '-realtime', '1']
    })
  }

  if (platform === 'win32') {
    attempts.push({
      name: 'h264_nvenc',
      videoArgs: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23']
    })
    attempts.push({
      name: 'h264_amf',
      videoArgs: ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '22', '-qp_p', '22']
    })
    attempts.push({
      name: 'h264_qsv',
      videoArgs: ['-c:v', 'h264_qsv', '-global_quality', '23']
    })
  }

  if (platform === 'linux') {
    attempts.push({
      name: 'h264_nvenc',
      videoArgs: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23']
    })
  }

  attempts.push({
    name: 'libx264',
    videoArgs: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p']
  })

  return attempts
}
