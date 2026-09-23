import { BrowserWindow, app, screen } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'

const STUDIO_WIDTH = 1180
const STUDIO_HEIGHT = 760
const DEFAULT_PIP_SIZE = { width: 240, height: 160 }

function preloadPath(name: string): string {
  return path.join(__dirname, `../preload/${name}.js`)
}

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath, 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(__dirname, '../../build/icon.png')
  ]
  return candidates.find((candidate) => existsSync(candidate))
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
  const x = Math.round(display.workArea.x + (display.workArea.width - STUDIO_WIDTH) / 2)
  const y = Math.round(display.workArea.y + (display.workArea.height - STUDIO_HEIGHT) / 2)
  const icon = resolveAppIcon()

  const win = new BrowserWindow({
    width: STUDIO_WIDTH,
    height: STUDIO_HEIGHT,
    minWidth: 900,
    minHeight: 620,
    x,
    y,
    frame: true,
    transparent: false,
    resizable: true,
    backgroundColor: '#1f1e1f',
    title: 'JAYOS Recorder',
    ...(icon ? { icon } : {}),
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      preload: preloadPath('toolbar'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  loadRenderer(win, 'toolbar')
  // Keep the studio window out of its own screen capture — avoids mirror feedback
  // and a big chunk of the compositing cost when previewing the full display.
  win.setContentProtection(true)
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
