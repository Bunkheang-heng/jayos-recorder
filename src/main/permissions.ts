import { shell, systemPreferences } from 'electron'
import type { PermissionKind, PermissionStatus } from '../shared/types'

export async function checkPermissions(): Promise<PermissionStatus> {
  if (process.platform !== 'darwin') {
    return { camera: true, microphone: true, screen: true }
  }

  return {
    camera: systemPreferences.getMediaAccessStatus('camera') === 'granted',
    microphone: systemPreferences.getMediaAccessStatus('microphone') === 'granted',
    screen: systemPreferences.getMediaAccessStatus('screen') === 'granted'
  }
}

const SETTINGS_PANE: Record<PermissionKind, string> = {
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
}

export async function openPermissionSettings(kind: PermissionKind): Promise<void> {
  if (process.platform !== 'darwin') return
  await shell.openExternal(SETTINGS_PANE[kind])
}
