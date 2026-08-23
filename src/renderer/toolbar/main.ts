import type { RegionSelection, SourceInfo } from '../../shared/types'
import { Recorder } from './recorder'

const sourceBtn = document.getElementById('source-btn') as HTMLButtonElement
const sourceLabel = document.getElementById('source-label') as HTMLSpanElement
const sourceMenu = document.getElementById('source-menu') as HTMLDivElement
const micBtn = document.getElementById('mic-btn') as HTMLButtonElement
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
  regionItem.innerHTML = '<span>▭</span><span>Custom Region…</span>'
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
    void openSourceMenu()
  } else {
    sourceMenu.classList.add('hidden')
  }
})

document.addEventListener('click', (event) => {
  if (!sourceMenu.contains(event.target as Node) && event.target !== sourceBtn) {
    sourceMenu.classList.add('hidden')
  }
})

micBtn.addEventListener('click', () => {
  micEnabled = !micEnabled
  micBtn.classList.toggle('active', micEnabled)
  recorder.setMicEnabled(micEnabled)
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
    pauseBtn.textContent = '▶️'
  } else if (phase === 'paused') {
    recorder.resume()
    startTimer()
    setPhase('recording')
    pauseBtn.textContent = '⏸️'
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
