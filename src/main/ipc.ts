import { ipcMain, BrowserWindow, screen } from 'electron'
import { IPC } from '../shared/types'
import type { PermissionKind, Rectangle, RegionSelection } from '../shared/types'
import { computeNormalizedBounds } from '../shared/geometry'
import { listSources } from './sources'
import { chooseSaveDir, getSaveDir, saveRecording, beginRecordingSession, appendRecordingChunk, finishRecordingSession, abortRecordingSession } from './save'
import { checkPermissions, openPermissionSettings } from './permissions'
import { createPipWindow, createRegionSelectWindow } from './windows'

let toolbarWindow: BrowserWindow | null = null
let pipWindow: BrowserWindow | null = null
let regionSelectWindow: BrowserWindow | null = null
let pendingRegionSelection: ((selection: RegionSelection | null) => void) | null = null

function normalizedBoundsOf(win: BrowserWindow) {
  const bounds = win.getBounds()
  const { workArea } = screen.getDisplayMatching(bounds)
  return computeNormalizedBounds(bounds, workArea)
}

function attachPipBoundsReporting(win: BrowserWindow): void {
  const report = (): void => {
    toolbarWindow?.webContents.send(IPC.pipBoundsChanged, normalizedBoundsOf(win))
  }
  win.on('move', report)
  win.on('resize', report)
  report()
}

export function registerIpcHandlers(getToolbarWindow: () => BrowserWindow): void {
  toolbarWindow = getToolbarWindow()

  ipcMain.handle(IPC.listSources, async () => listSources())

  ipcMain.handle(IPC.getSaveDir, async () => getSaveDir())
  ipcMain.handle(IPC.chooseSaveDir, async () => chooseSaveDir())

  ipcMain.handle(IPC.saveRecording, async (_event, arrayBuffer: ArrayBuffer, ext: string) => {
    return saveRecording(Buffer.from(arrayBuffer), ext)
  })
  ipcMain.handle(IPC.beginRecordingSession, async () => beginRecordingSession())
  ipcMain.handle(IPC.appendRecordingChunk, async (_event, sessionId: string, arrayBuffer: ArrayBuffer) => {
    await appendRecordingChunk(sessionId, Buffer.from(arrayBuffer))
  })
  ipcMain.handle(IPC.finishRecordingSession, async (_event, sessionId: string) => {
    return finishRecordingSession(sessionId)
  })
  ipcMain.handle(IPC.abortRecordingSession, async (_event, sessionId: string) => {
    await abortRecordingSession(sessionId)
  })

  ipcMain.handle(IPC.getAudioCapability, async () => ({
    systemAudioSupported: process.platform !== 'darwin'
  }))

  ipcMain.handle(IPC.checkPermissions, async () => checkPermissions())
  ipcMain.handle(IPC.openPermissionSettings, async (_event, kind: PermissionKind) =>
    openPermissionSettings(kind)
  )

  ipcMain.handle(IPC.getCursorPoint, async () => screen.getCursorScreenPoint())

  ipcMain.handle(IPC.selectRegion, async () => {
    if (regionSelectWindow) {
      regionSelectWindow.close()
      regionSelectWindow = null
    }

    return new Promise<RegionSelection | null>((resolve) => {
      pendingRegionSelection = resolve
      regionSelectWindow = createRegionSelectWindow()
      const display = screen.getDisplayMatching(regionSelectWindow.getBounds())

      regionSelectWindow.on('closed', () => {
        regionSelectWindow = null
        if (pendingRegionSelection) {
          pendingRegionSelection(null)
          pendingRegionSelection = null
        }
      })

      ipcMain.once(IPC.regionComplete, (_event, rect: Rectangle | null) => {
        if (pendingRegionSelection) {
          pendingRegionSelection(
            rect ? { rect, displayWidth: display.bounds.width, displayHeight: display.bounds.height } : null
          )
          pendingRegionSelection = null
        }
        regionSelectWindow?.close()
      })
    })
  })

  ipcMain.handle(IPC.showPip, async () => {
    if (!pipWindow) {
      pipWindow = createPipWindow()
      attachPipBoundsReporting(pipWindow)
      pipWindow.on('closed', () => {
        pipWindow = null
      })
    } else {
      pipWindow.show()
    }
  })

  ipcMain.handle(IPC.hidePip, async () => {
    pipWindow?.close()
    pipWindow = null
  })
}
