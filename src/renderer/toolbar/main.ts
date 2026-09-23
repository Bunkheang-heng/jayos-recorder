import type { NormalizedBounds, RegionSelection, SourceInfo } from '../../shared/types'
import { DEFAULT_QUALITY, isQualityId, type QualityId } from '../../shared/quality'
import { DEFAULT_FORMAT, isOutputFormat, type OutputFormat } from '../../shared/format'
import { Recorder } from './recorder'
import { AudioMeter } from './audio-meter'
import { ICON_MIC, ICON_MIC_OFF } from './icons'

const previewMount = document.getElementById('preview-mount') as HTMLDivElement
const previewPlaceholder = document.getElementById('preview-placeholder') as HTMLDivElement
const previewStage = document.getElementById('preview-stage') as HTMLDivElement
const webcamLayer = document.getElementById('webcam-layer') as HTMLDivElement
const formatBadge = document.getElementById('format-badge') as HTMLDivElement
const sourcesList = document.getElementById('sources-list') as HTMLDivElement
const refreshSourcesBtn = document.getElementById('refresh-sources') as HTMLButtonElement
const regionBtn = document.getElementById('region-btn') as HTMLButtonElement
const camBtn = document.getElementById('cam-btn') as HTMLButtonElement
const micBtn = document.getElementById('mic-btn') as HTMLButtonElement
const micLabel = document.getElementById('mic-label') as HTMLDivElement
const micMeter = document.getElementById('mic-meter') as HTMLDivElement
const desktopAudioLabel = document.getElementById('desktop-audio-label') as HTMLDivElement
const micMenu = document.getElementById('mic-menu') as HTMLDivElement
const qualitySelect = document.getElementById('quality-select') as HTMLSelectElement
const sceneStandardBtn = document.getElementById('scene-standard') as HTMLButtonElement
const sceneTiktokBtn = document.getElementById('scene-tiktok') as HTMLButtonElement
const recordBtn = document.getElementById('record-btn') as HTMLButtonElement
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement
const saveDirBtn = document.getElementById('save-dir-btn') as HTMLButtonElement
const saveDirLabel = document.getElementById('save-dir-label') as HTMLDivElement
const timerEl = document.getElementById('timer') as HTMLSpanElement
const phaseLabel = document.getElementById('phase-label') as HTMLSpanElement
const modeChip = document.getElementById('mode-chip') as HTMLSpanElement
const recIndicator = document.getElementById('rec-indicator') as HTMLSpanElement
const countdownEl = document.getElementById('countdown') as HTMLDivElement
const toastEl = document.getElementById('toast') as HTMLDivElement

type Phase = 'idle' | 'arming' | 'recording' | 'paused' | 'saving'
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

const MIN_WEBCAM_SIZE = 0.08
const QUALITY_STORAGE_KEY = 'jayos.quality'
const FORMAT_STORAGE_KEY = 'jayos.format'

let phase: Phase = 'idle'
let micEnabled = true
let selectedMicId: string | null = null
let webcamEnabled = true
let selectedSource: SourceInfo | null = null
let selectedRegion: RegionSelection | null = null
let elapsedSeconds = 0
let timerHandle: number | null = null
let sources: SourceInfo[] = []
let screenPermissionPrompted = false
let mountedCanvas: HTMLCanvasElement | null = null

const recorder = new Recorder({
  onError: (message) => showToast(message, true)
})

let webcamBounds: NormalizedBounds = recorder.getDefaultPipBoundsForFormat(DEFAULT_FORMAT)

function showToast(message: string, isError = false, duration = 4000): void {
  toastEl.textContent = message
  toastEl.classList.toggle('error', isError)
  toastEl.classList.remove('hidden')
  window.setTimeout(() => toastEl.classList.add('hidden'), duration)
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function shortPath(path: string): string {
  if (path.length <= 42) return path
  return `…${path.slice(-40)}`
}

function loadStoredQuality(): QualityId {
  const stored = localStorage.getItem(QUALITY_STORAGE_KEY)
  if (stored && isQualityId(stored)) return stored
  return DEFAULT_QUALITY
}

function loadStoredFormat(): OutputFormat {
  const stored = localStorage.getItem(FORMAT_STORAGE_KEY)
  if (stored && isOutputFormat(stored)) return stored
  return DEFAULT_FORMAT
}

function applyFormatUI(format: OutputFormat): void {
  sceneStandardBtn.classList.toggle('selected', format === 'standard')
  sceneTiktokBtn.classList.toggle('selected', format === 'tiktok')
  formatBadge.classList.toggle('hidden', format !== 'tiktok')
  previewMount.classList.toggle('tiktok-frame', format === 'tiktok')
  modeChip.textContent = format === 'tiktok' ? 'TikTok 9:16' : 'Standard'
  modeChip.classList.toggle('tiktok', format === 'tiktok')
}

function setOutputFormat(format: OutputFormat, resetWebcamPlacement = true): void {
  recorder.setFormat(format)
  localStorage.setItem(FORMAT_STORAGE_KEY, format)
  applyFormatUI(format)

  if (resetWebcamPlacement) {
    webcamBounds = recorder.getDefaultPipBoundsForFormat(format)
    applyWebcamLayerBounds()
  }

  syncPreviewStage()
}

function syncPipBounds(): void {
  recorder.updatePipBounds(webcamBounds)
}

function applyWebcamLayerBounds(): void {
  webcamLayer.style.left = `${webcamBounds.nx * 100}%`
  webcamLayer.style.top = `${webcamBounds.ny * 100}%`
  webcamLayer.style.width = `${webcamBounds.nw * 100}%`
  webcamLayer.style.height = `${webcamBounds.nh * 100}%`
  syncPipBounds()
}

function syncPreviewStage(): void {
  const frame = previewMount.parentElement
  if (!frame || !mountedCanvas) {
    previewStage.style.left = '0'
    previewStage.style.top = '0'
    previewStage.style.width = '100%'
    previewStage.style.height = '100%'
    return
  }

  const frameRect = frame.getBoundingClientRect()
  const canvasRect = mountedCanvas.getBoundingClientRect()
  previewStage.style.left = `${canvasRect.left - frameRect.left}px`
  previewStage.style.top = `${canvasRect.top - frameRect.top}px`
  previewStage.style.width = `${canvasRect.width}px`
  previewStage.style.height = `${canvasRect.height}px`
}

function mountCanvas(canvas: HTMLCanvasElement): void {
  previewMount.replaceChildren(canvas)
  mountedCanvas = canvas
  previewPlaceholder.classList.add('hidden')
  applyWebcamLayerBounds()
  setWebcamVisible(webcamEnabled)
  requestAnimationFrame(() => {
    syncPreviewStage()
    requestAnimationFrame(syncPreviewStage)
  })
}

function clearCanvasMount(): void {
  previewMount.replaceChildren()
  mountedCanvas = null
  previewPlaceholder.classList.remove('hidden')
  setWebcamVisible(false)
}

function setWebcamVisible(visible: boolean): void {
  webcamLayer.classList.toggle('hidden', !visible)
}

async function startPreview(): Promise<void> {
  if (!selectedSource || phase !== 'idle') return

  recorder.setSource(selectedSource)
  recorder.setRegion(selectedRegion)
  recorder.setWebcamEnabled(webcamEnabled)
  syncPipBounds()

  try {
    const canvas = await recorder.openPreview()
    mountCanvas(canvas)
  } catch (error) {
    clearCanvasMount()
    showToast(`Preview unavailable: ${(error as Error).message}`, true)
  }
}

function renderSources(): void {
  sourcesList.innerHTML = ''

  if (webcamEnabled) {
    sourcesList.appendChild(
      createSourceRow({
        title: 'Video Capture Device',
        subtitle: 'Webcam',
        selected: true,
        thumbLabel: 'CAM'
      })
    )
  }

  if (selectedRegion) {
    sourcesList.appendChild(
      createSourceRow({
        title: 'Custom Region',
        subtitle: 'Cropped display',
        selected: true,
        thumbLabel: 'REG'
      })
    )
  }

  if (sources.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'source-empty'
    empty.textContent = 'No capture sources found'
    sourcesList.appendChild(empty)
    return
  }

  for (const source of sources) {
    const selected = selectedSource?.id === source.id && !selectedRegion
    const item = createSourceRow({
      title: source.name,
      subtitle: source.type === 'screen' ? 'Display Capture' : 'Window Capture',
      selected,
      thumbUrl: source.thumbnailDataUrl || undefined
    })
    item.addEventListener('click', () => {
      if (phase !== 'idle') return
      selectedSource = source
      selectedRegion = null
      regionBtn.classList.remove('active')
      renderSources()
      void startPreview()
    })
    sourcesList.appendChild(item)
  }
}

function createSourceRow(options: {
  title: string
  subtitle: string
  selected?: boolean
  thumbUrl?: string
  thumbLabel?: string
}): HTMLButtonElement {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = options.selected ? 'source-item selected' : 'source-item'

  if (options.thumbUrl) {
    const img = document.createElement('img')
    img.className = 'source-thumb'
    img.src = options.thumbUrl
    img.alt = ''
    item.appendChild(img)
  } else {
    const thumb = document.createElement('div')
    thumb.className = 'source-thumb placeholder'
    thumb.textContent = options.thumbLabel ?? 'SRC'
    item.appendChild(thumb)
  }

  const meta = document.createElement('div')
  meta.className = 'source-meta'
  const name = document.createElement('div')
  name.className = 'source-name'
  name.textContent = options.title
  name.title = options.title
  const type = document.createElement('div')
  type.className = 'source-type'
  type.textContent = options.subtitle
  meta.appendChild(name)
  meta.appendChild(type)
  item.title = options.title
  item.appendChild(meta)
  return item
}

async function refreshSources(): Promise<void> {
  const permissions = await window.api.checkPermissions()
  if (!permissions.screen) {
    showToast(
      'Screen Recording permission is required to list windows. Enable it for Electron / JAYOS, then hit Refresh.',
      true,
      7000
    )
    if (!screenPermissionPrompted) {
      screenPermissionPrompted = true
      await window.api.openPermissionSettings('screen')
    }
  }

  sources = await window.api.listSources()
  if (!selectedSource && !selectedRegion) {
    const firstScreen = sources.find((source) => source.type === 'screen')
    if (firstScreen) selectedSource = firstScreen
  } else if (selectedSource && !selectedRegion) {
    selectedSource = sources.find((source) => source.id === selectedSource?.id) ?? selectedSource
  }
  renderSources()
  if (selectedSource && phase === 'idle') {
    await startPreview()
  }
}

const audioMeter = new AudioMeter((level) => {
  micMeter.style.setProperty('--level', `${level}%`)
})

async function stopMeter(): Promise<void> {
  audioMeter.stop()
}

async function startMeter(recordingStream?: MediaStream): Promise<void> {
  if (!micEnabled) {
    audioMeter.stop()
    return
  }
  await audioMeter.start(selectedMicId, recordingStream)
}

async function openMicMenu(): Promise<void> {
  if (phase !== 'idle') return
  micMenu.innerHTML = ''
  micMenu.classList.remove('hidden')

  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
    probe.getTracks().forEach((track) => track.stop())
  } catch {
    // Permission denied or no device — list may be empty.
  }

  const offItem = document.createElement('div')
  offItem.className = micEnabled ? 'menu-item' : 'menu-item selected'
  offItem.innerHTML = `<span>${ICON_MIC_OFF}</span><span>Mute Mic/Aux</span>`
  offItem.addEventListener('click', () => {
    if (phase !== 'idle') return
    micEnabled = false
    selectedMicId = null
    micBtn.classList.remove('active')
    micLabel.textContent = 'Mic/Aux (Muted)'
    recorder.setMicEnabled(false)
    void stopMeter()
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
    const label = mic.label || `Microphone (${mic.deviceId.slice(0, 6)})`
    const item = document.createElement('div')
    item.className = micEnabled && mic.deviceId === selectedMicId ? 'menu-item selected' : 'menu-item'
    item.innerHTML = `<span>${ICON_MIC}</span><span></span>`
    ;(item.lastElementChild as HTMLSpanElement).textContent = label
    item.addEventListener('click', () => {
      if (phase !== 'idle') return
      micEnabled = true
      selectedMicId = mic.deviceId
      micBtn.classList.add('active')
      micLabel.textContent = label
      recorder.setMicEnabled(true)
      recorder.setMicDeviceId(mic.deviceId)
      micMenu.classList.add('hidden')
      void startMeter()
    })
    micMenu.appendChild(item)
  }
}

micBtn.addEventListener('click', () => {
  if (micMenu.classList.contains('hidden')) {
    void openMicMenu()
  } else {
    micMenu.classList.add('hidden')
  }
})

document.addEventListener('click', (event) => {
  const target = event.target as Node
  if (!micMenu.contains(target) && target !== micBtn && !micBtn.contains(target)) {
    micMenu.classList.add('hidden')
  }
})

camBtn.addEventListener('click', async () => {
  webcamEnabled = !webcamEnabled
  camBtn.classList.toggle('active', webcamEnabled)
  camBtn.textContent = 'Webcam'
  recorder.setWebcamEnabled(webcamEnabled)
  renderSources()
  setWebcamVisible(webcamEnabled)
  try {
    await recorder.setWebcamLive(webcamEnabled)
  } catch (error) {
    showToast(`Webcam unavailable: ${(error as Error).message}`, true)
    setWebcamVisible(false)
  }
})

qualitySelect.addEventListener('change', () => {
  if (phase !== 'idle') {
    qualitySelect.value = recorder.getQuality().id
    return
  }
  const value = qualitySelect.value
  if (!isQualityId(value)) return
  recorder.setQuality(value)
  localStorage.setItem(QUALITY_STORAGE_KEY, value)
  syncPreviewStage()
})

sceneStandardBtn.addEventListener('click', () => {
  if (phase !== 'idle') return
  setOutputFormat('standard', true)
})

sceneTiktokBtn.addEventListener('click', () => {
  if (phase !== 'idle') return
  setOutputFormat('tiktok', true)
})

regionBtn.addEventListener('click', async () => {
  if (phase !== 'idle') return
  const selection = await window.api.selectRegion()
  if (!selection) return
  selectedRegion = selection
  regionBtn.classList.add('active')

  const screen = sources.find((source) => source.type === 'screen')
  if (screen) {
    selectedSource = { ...screen, name: 'Region' }
  }
  renderSources()
  await startPreview()
})

refreshSourcesBtn.addEventListener('click', () => {
  void refreshSources()
})

saveDirBtn.addEventListener('click', async () => {
  const chosen = await window.api.chooseSaveDir()
  if (chosen) {
    saveDirLabel.textContent = `WebM · Save to: ${shortPath(chosen)}`
  }
})

function setupWebcamInteraction(): void {
  let dragMode: 'move' | ResizeHandle | null = null
  let startX = 0
  let startY = 0
  let startBounds: NormalizedBounds = { ...webcamBounds }

  const onPointerDown = (event: PointerEvent): void => {
    if (!webcamEnabled) return
    const target = event.target as HTMLElement
    const handle = target.dataset.handle as ResizeHandle | undefined
    dragMode = handle ?? 'move'
    startX = event.clientX
    startY = event.clientY
    startBounds = { ...webcamBounds }
    webcamLayer.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragMode) return
    const stageRect = previewStage.getBoundingClientRect()
    if (stageRect.width === 0 || stageRect.height === 0) return

    const dx = (event.clientX - startX) / stageRect.width
    const dy = (event.clientY - startY) / stageRect.height
    let { nx, ny, nw, nh } = startBounds

    if (dragMode === 'move') {
      nx = Math.min(Math.max(0, startBounds.nx + dx), 1 - startBounds.nw)
      ny = Math.min(Math.max(0, startBounds.ny + dy), 1 - startBounds.nh)
    } else {
      if (dragMode.includes('e')) {
        nw = Math.min(Math.max(MIN_WEBCAM_SIZE, startBounds.nw + dx), 1 - startBounds.nx)
      }
      if (dragMode.includes('s')) {
        nh = Math.min(Math.max(MIN_WEBCAM_SIZE, startBounds.nh + dy), 1 - startBounds.ny)
      }
      if (dragMode.includes('w')) {
        const right = startBounds.nx + startBounds.nw
        nx = Math.min(Math.max(0, startBounds.nx + dx), right - MIN_WEBCAM_SIZE)
        nw = right - nx
      }
      if (dragMode.includes('n')) {
        const bottom = startBounds.ny + startBounds.nh
        ny = Math.min(Math.max(0, startBounds.ny + dy), bottom - MIN_WEBCAM_SIZE)
        nh = bottom - ny
      }
    }

    webcamBounds = { nx, ny, nw, nh }
    applyWebcamLayerBounds()
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (!dragMode) return
    dragMode = null
    try {
      webcamLayer.releasePointerCapture(event.pointerId)
    } catch {
      // Already released.
    }
  }

  webcamLayer.addEventListener('pointerdown', onPointerDown)
  webcamLayer.addEventListener('pointermove', onPointerMove)
  webcamLayer.addEventListener('pointerup', onPointerUp)
  webcamLayer.addEventListener('pointercancel', onPointerUp)
}

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
  const idle = phase === 'idle'
  const arming = phase === 'arming'
  const live = phase === 'recording' || phase === 'paused'

  recordBtn.classList.toggle('hidden', !idle && !arming)
  recordBtn.disabled = !idle
  pauseBtn.classList.toggle('hidden', !live)
  stopBtn.classList.toggle('hidden', !live)
  recIndicator.classList.toggle('hidden', !live)
  recIndicator.classList.toggle('paused', phase === 'paused')
  timerEl.classList.toggle('hidden', !live && !arming)
  recordBtn.classList.toggle('recording', phase === 'recording' || arming)

  refreshSourcesBtn.disabled = !idle
  regionBtn.disabled = !idle
  camBtn.disabled = !idle
  micBtn.disabled = !idle
  if (!idle) micMenu.classList.add('hidden')
  qualitySelect.disabled = !idle
  sceneStandardBtn.disabled = !idle
  sceneTiktokBtn.disabled = !idle
  saveDirBtn.disabled = !idle

  if (phase === 'arming') {
    recordBtn.textContent = 'Starting…'
    phaseLabel.textContent = 'Starting'
  } else if (phase === 'recording') {
    pauseBtn.textContent = 'Pause'
    recordBtn.textContent = 'Recording…'
    phaseLabel.textContent = 'Recording'
  } else if (phase === 'paused') {
    pauseBtn.textContent = 'Resume'
    phaseLabel.textContent = 'Paused'
  } else if (phase === 'saving') {
    phaseLabel.textContent = 'Saving WebM…'
  } else {
    recordBtn.textContent = 'Start Recording'
    phaseLabel.textContent = 'Ready'
    timerEl.textContent = '00:00:00'
  }
}

function startTimer(): void {
  elapsedSeconds = 0
  timerEl.textContent = formatTime(0)
  timerEl.classList.remove('hidden')
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
  if (phase !== 'idle') return
  if (!selectedSource) {
    showToast('Choose a source first.', true)
    return
  }

  setPhase('arming')

  try {
    const permissions = await window.api.checkPermissions()
    if (!permissions.screen) {
      showToast('Screen Recording permission is required. Opening System Settings…', true)
      await window.api.openPermissionSettings('screen')
      setPhase('idle')
      return
    }
    if (webcamEnabled && !permissions.camera) {
      showToast('Camera permission is required. Opening System Settings…', true)
      await window.api.openPermissionSettings('camera')
      setPhase('idle')
      return
    }
    if (micEnabled && !permissions.microphone) {
      showToast('Microphone permission is required. Opening System Settings…', true)
      await window.api.openPermissionSettings('microphone')
      setPhase('idle')
      return
    }

    recorder.setSource(selectedSource)
    recorder.setRegion(selectedRegion)
    recorder.setMicEnabled(micEnabled)
    recorder.setWebcamEnabled(webcamEnabled)
    syncPipBounds()

    await stopMeter()
    await runCountdown()

    if (!recorder.isPreviewOpen()) {
      const canvas = await recorder.openPreview()
      mountCanvas(canvas)
    }
    await recorder.startRecording()
    const micStream = recorder.getMicrophoneStream()
    if (micStream) await startMeter(micStream)
    syncPreviewStage()
    setPhase('recording')
    startTimer()
  } catch (error) {
    showToast(`Couldn't start recording: ${(error as Error).message}`, true)
    setPhase('idle')
    await startPreview()
    if (micEnabled) await startMeter()
  }
})

pauseBtn.addEventListener('click', () => {
  if (phase === 'recording') {
    recorder.pause()
    stopTimer()
    setPhase('paused')
  } else if (phase === 'paused') {
    recorder.resume()
    startTimer()
    setPhase('recording')
  }
})

stopBtn.addEventListener('click', async () => {
  if (phase !== 'recording' && phase !== 'paused') return
  setPhase('saving')
  stopTimer()
  await stopMeter()
  try {
    const savedPath = await recorder.stopRecording()
    showToast(`Saved WebM to ${savedPath}`)
  } catch (error) {
    showToast(`Failed to save recording: ${(error as Error).message}`, true)
  } finally {
    setPhase('idle')
    if (!recorder.isPreviewOpen()) {
      await startPreview()
    } else {
      syncPreviewStage()
    }
    if (micEnabled) await startMeter()
  }
})

async function init(): Promise<void> {
  const audioCapability = await window.api.getAudioCapability()
  recorder.setSystemAudioSupported(audioCapability.systemAudioSupported)
  desktopAudioLabel.textContent = audioCapability.systemAudioSupported
    ? 'Desktop Audio'
    : 'Desktop Audio (Unavailable)'

  if (!audioCapability.systemAudioSupported) {
    showToast('System audio isn’t available on macOS — mic audio only.', false, 5000)
  }

  await window.api.hidePip()

  const quality = loadStoredQuality()
  qualitySelect.value = quality
  recorder.setQuality(quality)

  const format = loadStoredFormat()
  recorder.setFormat(format)
  webcamBounds = recorder.getDefaultPipBoundsForFormat(format)
  applyFormatUI(format)

  applyWebcamLayerBounds()
  setupWebcamInteraction()
  window.addEventListener('resize', syncPreviewStage)

  const saveDir = await window.api.getSaveDir()
  saveDirLabel.textContent = `WebM · Save to: ${shortPath(saveDir)}`

  await refreshSources()
  await startMeter()
  setPhase('idle')
}

void init()
