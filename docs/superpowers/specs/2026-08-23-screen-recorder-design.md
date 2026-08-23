# Screen Recording App with Webcam Overlay — Design

Date: 2026-08-23
Status: Approved

## Summary

An Electron desktop app (TypeScript) that records the screen (full display,
a chosen window, or a custom drag-selected region) with an optional
picture-in-picture webcam overlay, mic narration, and system audio
(Windows/Linux). Recordings are saved directly to disk as `.webm` files.
Target platforms: macOS and Windows.

## Requirements

- Capture sources: full screen, a specific open window, or a custom region
  (drag-select rectangle).
- Webcam appears as a rounded-rectangle picture-in-picture overlay,
  draggable and resizable by the user before/during recording, composited
  into a single merged output video (not a separate file).
- Audio: microphone always; system/app audio additionally on Windows and
  Linux. macOS has no native system-audio capture, so macOS recordings are
  mic-only, with an in-app note explaining why (no bundled virtual audio
  driver in v1).
- Controls: 3-2-1 countdown before recording starts, pause/resume, stop.
- On stop, the recording is written straight to disk (default
  `~/Movies`/`~/Videos`, user-configurable) — no in-app preview, trim
  editor, or recording history/library in v1.
- Output format: `.webm` (native `MediaRecorder` output). No bundled
  ffmpeg/MP4 conversion in v1, to keep the app small and avoid a
  conversion step.
- Main UI is a compact floating toolbar/pill (like Loom's launcher), not a
  full standard app window and not tray-only.

## Architecture

Three Electron windows, all owned/managed by the main process:

- **Toolbar window** — frameless, always-on-top, draggable pill containing
  source picker, mic/webcam toggles, and record/pause/stop controls.
- **Webcam PiP window** — frameless, transparent, always-on-top; shows the
  live webcam feed as a rounded rectangle. Draggable and resizable by the
  user. Visible only while recording is armed or active.
- **Region-select overlay** — a full-screen transparent window shown only
  when the user chooses "custom region," for drag-selecting the capture
  rectangle.

The main process owns `desktopCapturer.getSources()`, window lifecycle,
and all file writes. Renderers have no direct Node integration; they talk
to the main process over Electron IPC via a `contextBridge` preload script
exposing a minimal typed API.

## Recording Pipeline (Data Flow)

1. User picks a source (screen/window/region) and toggles mic/webcam in
   the toolbar.
2. On "Record," the toolbar renderer requests:
   - the screen stream via `getUserMedia` with
     `chromeMediaSource: 'desktop'`, constrained to the chosen source id
     (or full-screen + crop coordinates, for a custom region), and
   - the webcam + mic streams via standard `getUserMedia`.
3. Every frame, both video streams are drawn onto an off-screen
   `<canvas>`: the screen capture as the base layer, the webcam feed
   cropped to a rounded rectangle and drawn at the PiP window's current
   position/size (synced from the PiP window over IPC as the user drags
   or resizes it).
4. `canvas.captureStream()` is combined with the audio track(s) — mic
   always, system-audio track additionally on Windows/Linux — into one
   `MediaStream`, fed into a single `MediaRecorder` (`video/webm`),
   producing one merged output file.
5. A 3-2-1 countdown runs before `MediaRecorder.start()`. Pause/resume map
   to `MediaRecorder.pause()/resume()`. Stop maps to
   `MediaRecorder.stop()`.
6. On `dataavailable`/`stop`, chunks are sent via IPC to the main process,
   which writes the `.webm` file directly to the user's configured save
   folder.

## Error Handling & Edge Cases

- **Permissions**: macOS requires explicit Screen Recording and
  Camera/Microphone grants in System Settings. On first launch, detect
  denial via `desktopCapturer`/`getUserMedia` failures and show an in-app
  prompt with instructions plus a button to open the relevant System
  Settings pane.
- **No webcam/mic connected**: the corresponding toolbar toggle disables
  gracefully; recording proceeds without it (e.g. screen-only).
- **System audio unavailable (macOS)**: falls back to mic-only audio, with
  a small non-blocking info note in the toolbar.
- **Disk write failure** (folder deleted, permissions, disk full): caught
  on the main-process write; surfaced as a toast/error in the toolbar
  rather than silently dropping the recording. Chunks are buffered in
  memory until a write is confirmed.
- **App/window closed mid-recording**: intercepted via `beforeunload`/
  `will-quit`; user is prompted to stop and save before the app actually
  quits.

## Testing Approach

- **Unit tests** (Vitest or Jest) for pure logic: region-crop math,
  filename/path generation, settings persistence, IPC message shape
  validation. No Electron runtime required.
- **Manual verification checklist** for parts that depend on real OS
  permissions and hardware: screen capture, webcam, mic, system audio on
  Windows/Linux, and the macOS permission-denial flow. These don't mock
  meaningfully and are cheap to check by hand at each milestone.
- **Packaging smoke test**: build with `electron-builder` for macOS and
  Windows, launch the packaged app once per platform to confirm it works
  outside of dev mode.
- No automated E2E (e.g. Playwright-for-Electron) in v1 — the pipeline
  depends on real screen/camera hardware that's hard to fake meaningfully;
  can revisit if the app grows.

## Explicitly Out of Scope (v1)

- In-app recording history/library (recordings are just files in a
  folder).
- Preview/trim editor before saving.
- MP4 export / bundled ffmpeg.
- Linux packaging/testing (system-audio code path targets it, but it's
  not a build/test target yet).
- Bundled virtual audio driver for macOS system audio.
