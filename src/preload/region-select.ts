import { contextBridge, ipcRenderer } from 'electron'
import type { Rectangle } from '../shared/types'

// Duplicated from IPC.regionComplete in ../shared/types rather than imported:
// Electron's sandboxed preload can only require Node/Electron built-ins, not
// local chunk files, so importing the shared runtime object here would make
// Rollup factor it into a chunk that fails to load ("module not found").
// Keeping this string in sync with shared/types.ts is required if it changes.
const REGION_COMPLETE_CHANNEL = 'region:complete'

const regionApi = {
  complete: (rect: Rectangle | null): void => ipcRenderer.send(REGION_COMPLETE_CHANNEL, rect)
}

export type RegionSelectApi = typeof regionApi

contextBridge.exposeInMainWorld('regionApi', regionApi)
