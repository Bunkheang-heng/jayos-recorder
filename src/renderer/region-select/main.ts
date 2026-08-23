const selectionEl = document.getElementById('selection') as HTMLDivElement

let startX = 0
let startY = 0
let dragging = false

function cancel(): void {
  window.regionApi.complete(null)
}

function updateSelection(x1: number, y1: number, x2: number, y2: number): void {
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)

  selectionEl.classList.remove('hidden')
  selectionEl.style.left = `${x}px`
  selectionEl.style.top = `${y}px`
  selectionEl.style.width = `${width}px`
  selectionEl.style.height = `${height}px`
}

window.addEventListener('mousedown', (event) => {
  dragging = true
  startX = event.clientX
  startY = event.clientY
  updateSelection(startX, startY, startX, startY)
})

window.addEventListener('mousemove', (event) => {
  if (!dragging) return
  updateSelection(startX, startY, event.clientX, event.clientY)
})

window.addEventListener('mouseup', (event) => {
  if (!dragging) return
  dragging = false

  const x = Math.min(startX, event.clientX)
  const y = Math.min(startY, event.clientY)
  const width = Math.abs(event.clientX - startX)
  const height = Math.abs(event.clientY - startY)

  if (width < 10 || height < 10) {
    cancel()
    return
  }

  window.regionApi.complete({ x, y, width, height })
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') cancel()
})
