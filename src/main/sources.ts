import { desktopCapturer, screen } from 'electron'
import type { Rectangle, SourceInfo } from '../shared/types'

function thumbnailDataUrl(image: Electron.NativeImage): string {
  if (image.isEmpty()) return ''
  try {
    const jpeg = image.toJPEG(55)
    return `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`
  } catch {
    return image.toDataURL()
  }
}

export async function listSources(): Promise<SourceInfo[]> {
  const displays = screen.getAllDisplays()
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    // Small thumbs keep IPC light so the full source list actually reaches the UI.
    thumbnailSize: { width: 120, height: 80 },
    fetchWindowIcons: false
  })

  const mapped: SourceInfo[] = sources.map((source) => {
    const type: SourceInfo['type'] = source.id.startsWith('screen:') ? 'screen' : 'window'
    let displayBounds: Rectangle | undefined
    let captureSize: SourceInfo['captureSize']

    if (type === 'screen') {
      const matched =
        displays.find((display) => String(display.id) === source.display_id) ??
        displays.find((display) => source.id.includes(`:${display.id}:`)) ??
        (displays.length === 1 ? displays[0] : screen.getPrimaryDisplay())

      if (matched) {
        captureSize = {
          width: Math.round(matched.size.width * matched.scaleFactor),
          height: Math.round(matched.size.height * matched.scaleFactor)
        }
        displayBounds = {
          x: matched.bounds.x,
          y: matched.bounds.y,
          width: matched.bounds.width,
          height: matched.bounds.height
        }
      }
    }

    return {
      id: source.id,
      name: source.name.trim() || (type === 'screen' ? 'Display' : 'Window'),
      type,
      thumbnailDataUrl: thumbnailDataUrl(source.thumbnail),
      displayBounds,
      captureSize
    }
  })

  // Screens first, then windows A→Z so the list is predictable and easy to scan.
  return mapped.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'screen' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
