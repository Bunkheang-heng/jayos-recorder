import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

const TOOLBAR_WIDTH = 420
const TOOLBAR_HEIGHT = 64
const DEFAULT_PIP_SIZE = { width: 240, height: 160 }

function preloadPath(name: string): string {
  return path.join(__dirname, `../preload/${name}.js`)
}

function rendererUrlOrFile(name: string): { url?: string; file?: string } {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    return { url: `${devServerUrl}/${name}/index.html` }
  }
  return { file: path.join(__dirname, `../renderer/${name}/index.html`) }
}

function loadRenderer(win: BrowserWindow, name: string): void {
  const target = rendererUrlOrFile(name)
  if (target.url) {
    void win.loadURL(target.url)
  } else if (target.file) {
    void win.loadFile(target.file)
  }
}

export function createToolbarWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const x = Math.round(display.workArea.x + (display.workArea.width - TOOLBAR_WIDTH) / 2)
  const y = display.workArea.y + display.workArea.height - TOOLBAR_HEIGHT - 24

  const win = new BrowserWindow({
    width: TOOLBAR_WIDTH,
    height: TOOLBAR_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    webPreferences: {
      preload: preloadPath('toolbar'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  loadRenderer(win, 'toolbar')
  return win
}

export function createPipWindow(initialBounds?: { x: number; y: number; width: number; height: number }): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const bounds = initialBounds ?? {
    x: display.workArea.x + display.workArea.width - DEFAULT_PIP_SIZE.width - 32,
    y: display.workArea.y + display.workArea.height - DEFAULT_PIP_SIZE.height - 120,
    ...DEFAULT_PIP_SIZE
  }

  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    minWidth: 120,
    minHeight: 80,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  loadRenderer(win, 'pip')
  return win
}

export function createRegionSelectWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()

  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath('region-select'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  loadRenderer(win, 'region-select')
  return win
}
