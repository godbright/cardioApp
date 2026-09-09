# WAV Recording Pipeline — Implementation Plan

## Context

The mobile app has a `recording_path` and `recording_sha256` field on every `captures` DB row,
and the Stage 2 sync worker is designed to attach the WAV file as multipart/form-data when
uploading to the backend. However, the file is never actually written during development because:

1. The **real CardioSleeve path** (`BluetoothService.onRecordingComplete`) fires when the
   Rijuven HLink protocol delivers a complete audio buffer over BLE — this path is fully
   implemented in `App.tsx` and works correctly once real hardware is present.

2. The **synthetic stream path** (used for development/testing) pushes samples through
   `onData` continuously but never fires `onRecordingComplete`, so the WAV is never written,
   `recording_path` stays `''`, and the sync worker submits captures with no audio attached.

There is also a **sequencing race condition**: the `sync_queue` row is currently created inside
`saveCapture()` before `recording_path` is set. The sync worker can fire within 30 seconds
and submit an audio-less payload before `updateRecordingPath()` is ever called.

This document describes the four-phase plan to close both gaps.

---

## Architecture after implementation

```
Synthetic stream (dev)  OR  real CardioSleeve over HLink (prod)
        ↓ CardioSleeveService.onSamples()
WavRecorder.feed(pcm, rateHz)     ← taps here; no-op unless recording is active
        ↓ capturePhase transitions 'ready' → 'recording'
WavRecorder.start(captureId, sampleRate)
        ↓ capturePhase transitions 'recording' → 'analyzing'
WavRecorder.stop(context)
        → writes  <filesDir>/recordings/<captureId>.wav       (for Stage 2 upload + SHA-256)
        → writes  <filesDir>/recordings/<captureId>_play.wav  (for in-app playback)
        → computes SHA-256 via MessageDigest
        ↓
updateRecordingPath(captureId, path, sha256)    ← NEW: also enqueues sync here
        ↓
sync_queue row created  →  syncWorker picks up  →  multipart POST with audio file attached
        ↓
backend validates SHA-256  →  storage.upload_recording()  →  S3
```

The `onRecordingComplete` handler in `App.tsx` (production BLE path) is unchanged — it also
calls `updateRecordingPath()`, which now creates the sync queue row, so both paths land in the
same place.

---

## Phase 1 — Fix sync sequencing (`captureService.ts`)

**Problem:** `sync_queue` row is created in `saveCapture()` before the WAV exists.  
**Fix:** Move `sync_queue` creation into `updateRecordingPath()`.

After patching `recording_path` and `recording_sha256`, query `stage1_results` for that
`captureId`. If the verdict is `'abnormal'`, create the `sync_queue` row there. Remove the
enqueue block from `saveCapture()`.

This guarantees the sync worker never sees a capture with an empty recording path.

**Files changed:** `src/services/captureService.ts` only.

---

## Phase 2 — Kotlin WAV recorder + React Native bridge

### `android/app/src/main/java/com/cardiosleeve/audio/WavRecorder.kt`

Pure recording logic — no React Native dependency.

```
object WavRecorder {
    fun start(captureId: String, sampleRate: Int)
    fun feed(pcm: FloatArray, rateHz: Int)   // no-op when not recording
    fun stop(context: Context): WavResult?   // null if not started or empty
}

data class WavResult(
    val path: String,
    val playPath: String,
    val sha256: String,
    val durationMs: Long,
)
```

**WAV format:** 16-bit signed PCM, mono, RIFF header (44 bytes). Convert incoming float
samples `[-1, 1]` to `Short` range `[-32768, 32767]`.

**File locations:**
- Original: `<context.filesDir>/recordings/<captureId>.wav` — sent to backend, SHA-256 computed over this
- Playback: `<context.filesDir>/recordings/<captureId>_play.wav` — referenced by `getCaptureForSite()` via the `_play.wav` convention already in the codebase

**SHA-256:** `MessageDigest.getInstance("SHA-256")` over the raw file bytes before writing.

**Buffer cap:** 60 seconds × sample_rate × 2 bytes. If the recording window somehow exceeds
the cap, stop accepting new samples silently — do not crash.

### `android/app/src/main/java/com/cardiosleeve/audio/WavRecorderModule.kt`

React Native bridge module:

| Method | Signature | Notes |
|---|---|---|
| `startRecording` | `(captureId: String)` → void | Calls `WavRecorder.start()` |
| `stopRecording` | `()` → Promise `{path, playPath, sha256, durationMs}` | Calls `WavRecorder.stop()`, rejects if nothing was recorded |

### `android/app/src/main/java/com/cardiosleeve/audio/WavRecorderPackage.kt`

Standard `ReactPackage` implementation — registers `WavRecorderModule`.

### `android/app/src/main/java/com/cardiosleeve/MainApplication.kt`

Add `WavRecorderPackage()` to `getPackages()`.

### `android/app/src/main/java/com/cardiosleeve/sda/CardioSleeveService.kt`

Add one line to tap the sample stream:

```kotlin
fun onSamples(pcm: FloatArray, ecg: FloatArray, rateHz: Int) {
    SdaJni.nativePushSamples(pcm, pcm.size, ecg, ecg.size, rateHz)
    WavRecorder.feed(pcm, rateHz)   // ← new: buffers during active recording window
}
```

---

## Phase 3 — JS hook (`src/hooks/useWavRecorder.ts`)

Thin wrapper over `NativeModules.WavRecorder`:

```typescript
interface WavResult {
  path:       string;
  playPath:   string;
  sha256:     string;
  durationMs: number;
}

export function useWavRecorder() {
  const startRecording = (captureId: string): void => { ... }
  const stopAndSave   = (): Promise<WavResult> => { ... }
  return { startRecording, stopAndSave };
}
```

Guard against the native module being absent (e.g. in tests) so the JS layer doesn't hard-crash
when the module hasn't been registered.

---

## Phase 4 — Wire into capture phase transitions

The `capturePhase` state machine in `AppContext.tsx` drives everything:

| Phase transition | Action |
|---|---|
| `'ready'` → `'recording'` | `startRecording(pendingCaptureId)` — ID is already stored in `recordingStore` by `_commitResult` |
| `'recording'` → `'analyzing'` | `stopAndSave()` → `updateRecordingPath(captureId, path, sha256)` → `setLastSavedPath(playPath)` |

`setLastSavedPath` notifies the `ResultScreen` (existing `recordingStore` listener pattern —
no change needed there).

The `durationMs` returned by `stopAndSave()` should also be written to the `captures` row via a
small extension to `updateRecordingPath()` so the backend receives an accurate duration.

---

## What remains after this plan is complete

- **S3 credentials** in `Dashboard/backend/.env` — config only, no code change. Once set,
  `storage.upload_recording()` will persist audio to the bucket automatically.
- **Rijuven SDK integration** — when the real SDK arrives, `CardioSleeveService.onSamples()`
  is already the correct tap point. No changes needed to the recording pipeline.
- **ECG recording** — this plan covers PCG only. The ECG pipeline is an open question per
  `CLAUDE.md`; the same `WavRecorder` pattern can be extended to a second channel if needed.

---

## Files touched summary

| File | Change |
|---|---|
| `src/services/captureService.ts` | Move `sync_queue` creation from `saveCapture()` to `updateRecordingPath()` |
| `android/.../audio/WavRecorder.kt` | **New** — core PCM accumulator + WAV writer |
| `android/.../audio/WavRecorderModule.kt` | **New** — RN bridge (`startRecording`, `stopRecording`) |
| `android/.../audio/WavRecorderPackage.kt` | **New** — package registration |
| `android/.../MainApplication.kt` | Register `WavRecorderPackage` |
| `android/.../sda/CardioSleeveService.kt` | Add `WavRecorder.feed()` tap in `onSamples()` |
| `src/hooks/useWavRecorder.ts` | **New** — JS hook wrapping the native module |
| `src/context/AppContext.tsx` | Call `startRecording` / `stopAndSave` on phase transitions |
