import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

const TOOLBAR_WIDTH = 420
// The window must be tall enough to contain the pill AND the source-menu
// dropdown / toast / countdown that render above it — a BrowserWindow clips
// its content to its own bounds, so anything positioned outside this height
// would be invisible even though it's "in the DOM".
const TOOLBAR_WINDOW_HEIGHT = 500
const TOOLBAR_BOTTOM_MARGIN = 24
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
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[${name} console][level ${level}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.log(`[${name} did-fail-load] ${code} ${description} ${url}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.log(`[${name} render-process-gone]`, details)
  })

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
  const y = display.workArea.y + display.workArea.height - TOOLBAR_WINDOW_HEIGHT - TOOLBAR_BOTTOM_MARGIN

  const win = new BrowserWindow({
    width: TOOLBAR_WIDTH,
    height: TOOLBAR_WINDOW_HEIGHT,
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
