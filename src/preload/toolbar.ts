import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  AudioCapability,
  CursorPoint,
  NormalizedBounds,
  PermissionKind,
  PermissionStatus,
  RegionSelection,
  SourceInfo
} from '../shared/types'

const api = {
  listSources: (): Promise<SourceInfo[]> => ipcRenderer.invoke(IPC.listSources),
  selectRegion: (): Promise<RegionSelection | null> => ipcRenderer.invoke(IPC.selectRegion),

  showPip: (): Promise<void> => ipcRenderer.invoke(IPC.showPip),
  hidePip: (): Promise<void> => ipcRenderer.invoke(IPC.hidePip),
  onPipBoundsChanged: (callback: (bounds: NormalizedBounds) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, bounds: NormalizedBounds): void =>
      callback(bounds)
    ipcRenderer.on(IPC.pipBoundsChanged, listener)
    return () => ipcRenderer.removeListener(IPC.pipBoundsChanged, listener)
  },

  getSaveDir: (): Promise<string> => ipcRenderer.invoke(IPC.getSaveDir),
  chooseSaveDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.chooseSaveDir),
  saveRecording: (buffer: ArrayBuffer, ext: string): Promise<string> =>
    ipcRenderer.invoke(IPC.saveRecording, buffer, ext),
  beginRecordingSession: (): Promise<string> => ipcRenderer.invoke(IPC.beginRecordingSession),
  appendRecordingChunk: (sessionId: string, buffer: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke(IPC.appendRecordingChunk, sessionId, buffer),
  finishRecordingSession: (sessionId: string): Promise<string> =>
    ipcRenderer.invoke(IPC.finishRecordingSession, sessionId),
  abortRecordingSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.abortRecordingSession, sessionId),

  getAudioCapability: (): Promise<AudioCapability> => ipcRenderer.invoke(IPC.getAudioCapability),

  checkPermissions: (): Promise<PermissionStatus> => ipcRenderer.invoke(IPC.checkPermissions),
  openPermissionSettings: (kind: PermissionKind): Promise<void> =>
    ipcRenderer.invoke(IPC.openPermissionSettings, kind),

  getCursorPoint: (): Promise<CursorPoint> => ipcRenderer.invoke(IPC.getCursorPoint)
}

export type ToolbarApi = typeof api

contextBridge.exposeInMainWorld('api', api)
