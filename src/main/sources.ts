import { desktopCapturer, screen } from 'electron'
import type { Rectangle, SourceInfo } from '../shared/types'

export async function listSources(): Promise<SourceInfo[]> {
  const displays = screen.getAllDisplays()
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 300, height: 200 }
  })

  return sources.map((source) => {
    const type: SourceInfo['type'] = source.id.startsWith('screen:') ? 'screen' : 'window'
    let displayBounds: Rectangle | undefined

    if (type === 'screen') {
      const matched =
        displays.find((display) => String(display.id) === source.display_id) ??
        displays.find((display) => source.id.includes(`:${display.id}:`)) ??
        (displays.length === 1 ? displays[0] : screen.getPrimaryDisplay())

      if (matched) {
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
      name: source.name,
      type,
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      displayBounds
    }
  })
}
