import type { RegionSelection, SourceInfo } from '../../shared/types'
import { Recorder } from './recorder'
import { ICON_MIC, ICON_MIC_OFF, ICON_PAUSE, ICON_PLAY, ICON_REGION } from './icons'

const sourceBtn = document.getElementById('source-btn') as HTMLButtonElement
const sourceLabel = document.getElementById('source-label') as HTMLSpanElement
const sourceMenu = document.getElementById('source-menu') as HTMLDivElement
const micBtn = document.getElementById('mic-btn') as HTMLButtonElement
const micMenu = document.getElementById('mic-menu') as HTMLDivElement
const camBtn = document.getElementById('cam-btn') as HTMLButtonElement
const recordBtn = document.getElementById('record-btn') as HTMLButtonElement
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement
const timerEl = document.getElementById('timer') as HTMLDivElement
const countdownEl = document.getElementById('countdown') as HTMLDivElement
const toastEl = document.getElementById('toast') as HTMLDivElement

type Phase = 'idle' | 'recording' | 'paused'
let phase: Phase = 'idle'
let micEnabled = true
let selectedMicId: string | null = null
let webcamEnabled = true
let selectedSource: SourceInfo | null = null
let selectedRegion: RegionSelection | null = null
let elapsedSeconds = 0
let timerHandle: number | null = null

const recorder = new Recorder({
  onError: (message) => showToast(message)
})

function showToast(message: string, duration = 4000): void {
  toastEl.textContent = message
  toastEl.classList.remove('hidden')
  window.setTimeout(() => toastEl.classList.add('hidden'), duration)
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

async function openSourceMenu(): Promise<void> {
  sourceMenu.innerHTML = ''
  sourceMenu.classList.remove('hidden')

  const regionItem = document.createElement('div')
  regionItem.className = 'menu-item'
  regionItem.innerHTML = `<span>${ICON_REGION}</span><span>Custom Region…</span>`
  regionItem.addEventListener('click', async () => {
    sourceMenu.classList.add('hidden')
    const selection = await window.api.selectRegion()
    if (!selection) return
    selectedRegion = selection
    selectedSource = { id: 'screen:0', name: 'Region', type: 'screen', thumbnailDataUrl: '' }
    sourceLabel.textContent = 'Custom Region'
  })
  sourceMenu.appendChild(regionItem)

  const sources = await window.api.listSources()
  for (const source of sources) {
    const item = document.createElement('div')
    item.className = 'menu-item'
    const img = document.createElement('img')
    img.src = source.thumbnailDataUrl
    const label = document.createElement('span')
    label.textContent = source.name
    item.appendChild(img)
    item.appendChild(label)
    item.addEventListener('click', () => {
      selectedSource = source
      selectedRegion = null
      sourceLabel.textContent = source.name
      sourceMenu.classList.add('hidden')
    })
    sourceMenu.appendChild(item)
  }
}

sourceBtn.addEventListener('click', () => {
  if (sourceMenu.classList.contains('hidden')) {
    micMenu.classList.add('hidden')
    void openSourceMenu()
  } else {
    sourceMenu.classList.add('hidden')
  }
})

async function openMicMenu(): Promise<void> {
  micMenu.innerHTML = ''
  micMenu.classList.remove('hidden')

  // Device labels are only populated once mic permission has been granted in
  // this session — request it up front so the list below shows real names
  // instead of blank/generic ones. Triggers the OS permission prompt if needed.
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
    probe.getTracks().forEach((track) => track.stop())
  } catch {
    // No permission or no mic connected — device list will just be empty below.
  }

  const offItem = document.createElement('div')
  offItem.className = micEnabled ? 'menu-item' : 'menu-item selected'
  const offIcon = document.createElement('span')
  offIcon.innerHTML = ICON_MIC_OFF
  const offLabel = document.createElement('span')
  offLabel.textContent = 'Microphone Off'
  offItem.appendChild(offIcon)
  offItem.appendChild(offLabel)
  offItem.addEventListener('click', () => {
    micEnabled = false
    selectedMicId = null
    micBtn.classList.remove('active')
    micBtn.title = 'Microphone off'
    recorder.setMicEnabled(false)
    micMenu.classList.add('hidden')
  })
  micMenu.appendChild(offItem)

  const devices = await navigator.mediaDevices.enumerateDevices()
  const mics = devices.filter((device) => device.kind === 'audioinput')

  if (mics.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'menu-item'
    empty.textContent = 'No microphone detected'
    micMenu.appendChild(empty)
    return
  }

  for (const mic of mics) {
    const item = document.createElement('div')
    item.className = micEnabled && mic.deviceId === selectedMicId ? 'menu-item selected' : 'menu-item'
    const icon = document.createElement('span')
    icon.innerHTML = ICON_MIC
    const label = document.createElement('span')
    label.textContent = mic.label || `Microphone (${mic.deviceId.slice(0, 6)})`
    item.appendChild(icon)
    item.appendChild(label)
    item.addEventListener('click', () => {
      micEnabled = true
      selectedMicId = mic.deviceId
      micBtn.classList.add('active')
      micBtn.title = label.textContent as string
      recorder.setMicEnabled(true)
      recorder.setMicDeviceId(mic.deviceId)
      micMenu.classList.add('hidden')
    })
    micMenu.appendChild(item)
  }
}

micBtn.addEventListener('click', () => {
  if (micMenu.classList.contains('hidden')) {
    sourceMenu.classList.add('hidden')
    void openMicMenu()
  } else {
    micMenu.classList.add('hidden')
  }
})

document.addEventListener('click', (event) => {
  const target = event.target as Node
  if (!sourceMenu.contains(target) && target !== sourceBtn) {
    sourceMenu.classList.add('hidden')
  }
  if (!micMenu.contains(target) && target !== micBtn) {
    micMenu.classList.add('hidden')
  }
})

camBtn.addEventListener('click', async () => {
  webcamEnabled = !webcamEnabled
  camBtn.classList.toggle('active', webcamEnabled)
  recorder.setWebcamEnabled(webcamEnabled)
  if (webcamEnabled) {
    await window.api.showPip()
  } else {
    await window.api.hidePip()
  }
})

function runCountdown(): Promise<void> {
  return new Promise((resolve) => {
    let count = 3
    countdownEl.textContent = String(count)
    countdownEl.classList.remove('hidden')

    const tick = (): void => {
      count -= 1
      if (count === 0) {
        countdownEl.classList.add('hidden')
        resolve()
        return
      }
      countdownEl.textContent = String(count)
      window.setTimeout(tick, 1000)
    }
    window.setTimeout(tick, 1000)
  })
}

function setPhase(next: Phase): void {
  phase = next
  recordBtn.classList.toggle('hidden', phase !== 'idle')
  pauseBtn.classList.toggle('hidden', phase === 'idle')
  stopBtn.classList.toggle('hidden', phase === 'idle')
  timerEl.classList.toggle('hidden', phase === 'idle')
  sourceBtn.disabled = phase !== 'idle'
}

function startTimer(): void {
  elapsedSeconds = 0
  timerEl.textContent = formatTime(0)
  timerHandle = window.setInterval(() => {
    elapsedSeconds += 1
    timerEl.textContent = formatTime(elapsedSeconds)
  }, 1000)
}

function stopTimer(): void {
  if (timerHandle !== null) {
    window.clearInterval(timerHandle)
    timerHandle = null
  }
}

recordBtn.addEventListener('click', async () => {
  if (!selectedSource) {
    showToast('Choose what to record first.')
    return
  }

  const permissions = await window.api.checkPermissions()
  if (!permissions.screen) {
    showToast('Screen Recording permission is required. Opening System Settings…')
    await window.api.openPermissionSettings('screen')
    return
  }
  if (webcamEnabled && !permissions.camera) {
    showToast('Camera permission is required. Opening System Settings…')
    await window.api.openPermissionSettings('camera')
    return
  }
  if (micEnabled && !permissions.microphone) {
    showToast('Microphone permission is required. Opening System Settings…')
    await window.api.openPermissionSettings('microphone')
    return
  }

  recorder.setSource(selectedSource)
  recorder.setRegion(selectedRegion)

  await runCountdown()

  try {
    await recorder.start()
    setPhase('recording')
    recordBtn.classList.add('recording')
    startTimer()
  } catch (error) {
    showToast(`Couldn't start recording: ${(error as Error).message}`)
  }
})

pauseBtn.addEventListener('click', () => {
  if (phase === 'recording') {
    recorder.pause()
    stopTimer()
    setPhase('paused')
    pauseBtn.innerHTML = ICON_PLAY
  } else if (phase === 'paused') {
    recorder.resume()
    startTimer()
    setPhase('recording')
    pauseBtn.innerHTML = ICON_PAUSE
  }
})

stopBtn.addEventListener('click', async () => {
  stopTimer()
  recordBtn.classList.remove('recording')
  try {
    const savedPath = await recorder.stop()
    showToast(`Saved to ${savedPath}`)
  } catch (error) {
    showToast(`Failed to save recording: ${(error as Error).message}`)
  } finally {
    setPhase('idle')
  }
})

async function init(): Promise<void> {
  const audioCapability = await window.api.getAudioCapability()
  recorder.setSystemAudioSupported(audioCapability.systemAudioSupported)
  if (!audioCapability.systemAudioSupported) {
    showToast('System audio capture isn’t supported on macOS — recordings will use microphone audio only.', 6000)
  }

  window.api.onPipBoundsChanged((bounds) => recorder.updatePipBounds(bounds))

  await window.api.showPip()

  const sources = await window.api.listSources()
  const firstScreen = sources.find((s) => s.type === 'screen')
  if (firstScreen) {
    selectedSource = firstScreen
    sourceLabel.textContent = firstScreen.name
  }

  setPhase('idle')
}

void init()
