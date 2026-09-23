export interface SourceInfo {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnailDataUrl: string
  /** Present for screen sources — DIP bounds of that display. */
  displayBounds?: Rectangle
  /** Native display pixels, before the portrait crop. */
  captureSize?: { width: number; height: number }
}

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

/** Fractional (0..1) position/size of the webcam bubble within its display's work area. */
export interface NormalizedBounds {
  nx: number
  ny: number
  nw: number
  nh: number
}

/**
 * A user-dragged capture rectangle, plus the size (in the same DIP coordinate
 * space) of the display it was drawn on — needed to scale the rect into the
 * captured video's actual pixel dimensions, which can differ under DPI scaling.
 */
export interface RegionSelection {
  rect: Rectangle
  displayWidth: number
  displayHeight: number
}

export interface AudioCapability {
  systemAudioSupported: boolean
}

export type PermissionKind = 'camera' | 'microphone' | 'screen'

export interface PermissionStatus {
  camera: boolean
  microphone: boolean
  screen: boolean
}

export interface RecordingSource {
  sourceId: string
  kind: 'screen' | 'window' | 'region'
  cropRegion: Rectangle | null
}

export interface CursorPoint {
  x: number
  y: number
}

export const IPC = {
  listSources: 'sources:list',
  selectRegion: 'region:select',
  regionComplete: 'region:complete',
  showPip: 'pip:show',
  hidePip: 'pip:hide',
  pipInit: 'pip:init',
  pipBoundsChanged: 'pip:bounds-changed',
  getSaveDir: 'save:get-dir',
  chooseSaveDir: 'save:choose-dir',
  saveRecording: 'save:recording',
  beginRecordingSession: 'save:begin-session',
  appendRecordingChunk: 'save:append-chunk',
  finishRecordingSession: 'save:finish-session',
  abortRecordingSession: 'save:abort-session',
  getAudioCapability: 'audio:capability',
  checkPermissions: 'permissions:check',
  openPermissionSettings: 'permissions:open-settings',
  getCursorPoint: 'cursor:point'
} as const
