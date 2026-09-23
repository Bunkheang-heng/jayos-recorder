import { app, BrowserWindow } from 'electron'
import { createToolbarWindow } from './windows'
import { registerIpcHandlers } from './ipc'
import { registerPlaybackScheme, registerPlaybackProtocol } from './playback'

registerPlaybackScheme()

let toolbarWindow: BrowserWindow | null = null

function createMainWindows(): void {
  toolbarWindow = createToolbarWindow()
  registerIpcHandlers(() => toolbarWindow as BrowserWindow)

  toolbarWindow.on('closed', () => {
    toolbarWindow = null
  })
}

app.whenReady().then(() => {
  registerPlaybackProtocol()
  createMainWindows()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindows()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
