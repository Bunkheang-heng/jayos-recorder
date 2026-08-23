import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type { Rectangle } from '../shared/types'

const regionApi = {
  complete: (rect: Rectangle | null): void => ipcRenderer.send(IPC.regionComplete, rect)
}

export type RegionSelectApi = typeof regionApi

contextBridge.exposeInMainWorld('regionApi', regionApi)
