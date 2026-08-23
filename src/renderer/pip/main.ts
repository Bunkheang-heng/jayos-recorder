const video = document.getElementById('webcam') as HTMLVideoElement

navigator.mediaDevices
  .getUserMedia({ video: true, audio: false })
  .then((stream) => {
    video.srcObject = stream
  })
  .catch((error) => {
    console.error('Failed to open webcam for PiP preview', error)
  })
