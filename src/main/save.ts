import { app, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { timestampedFilename } from '../shared/filename'

interface Settings {
  saveDir: string
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function defaultSaveDir(): string {
  return app.getPath('desktop')
}

async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
    return JSON.parse(raw) as Settings
  } catch {
    return { saveDir: defaultSaveDir() }
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export async function getSaveDir(): Promise<string> {
  const settings = await readSettings()
  return settings.saveDir
}

export async function chooseSaveDir(): Promise<string | null> {
  const current = await getSaveDir()
  const result = await dialog.showOpenDialog({
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const chosen = result.filePaths[0]
  await writeSettings({ saveDir: chosen })
  return chosen
}

export async function saveRecording(buffer: Buffer, ext: string): Promise<string> {
  const dir = await getSaveDir()
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, timestampedFilename(new Date(), ext))
  await fs.writeFile(filePath, buffer)
  return filePath
}
