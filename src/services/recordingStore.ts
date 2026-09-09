/**
 * recordingStore — decouples two async events that happen in sequence but at
 * unpredictable relative timing:
 *
 *   1. _commitResult (AppContext) — saves the DB capture record and stores the
 *      new captureId here via setPendingCaptureId().
 *
 *   2. onRecordingComplete (App.tsx / BLE) — writes the WAV file to disk,
 *      stores the path here via setLastSavedPath(), and patches the DB record.
 *
 * Because the BLE store-and-forward transfer (30 s of audio) completes well
 * after the UI timer, event 1 always fires before event 2. ResultScreen
 * registers a listener via onPathAvailable() on mount; if the path is already
 * known (file arrived before mount) the callback fires immediately.
 */

// ── Pending capture tracking ──────────────────────────────────────────────────

let _pendingCaptureId = '';

export function setPendingCaptureId(id: string): void {
  _pendingCaptureId = id;
}

/** Returns and clears the stored captureId. Returns '' if none is pending. */
export function consumePendingCaptureId(): string {
  const id = _pendingCaptureId;
  _pendingCaptureId = '';
  return id;
}

// ── Last saved WAV path ───────────────────────────────────────────────────────

let _lastSavedPath = '';
let _pathListeners: Array<(path: string) => void> = [];

/**
 * Called by App.tsx once the WAV file has been written to device storage.
 * Notifies any waiting ResultScreen instances immediately.
 */
export function setLastSavedPath(path: string): void {
  _lastSavedPath = path;
  const cbs = _pathListeners.splice(0);
  cbs.forEach(cb => cb(path));
}

/** Returns the path of the most recently saved WAV, or '' if none yet. */
export function getLastSavedPath(): string {
  return _lastSavedPath;
}

/**
 * Register a callback that fires once the next WAV path is available.
 * If a path is already stored the callback fires synchronously and no listener
 * is registered — no cleanup needed in that case.
 * Returns an unsubscribe function for use in useEffect cleanup.
 */
export function onPathAvailable(cb: (path: string) => void): () => void {
  if (_lastSavedPath) {
    cb(_lastSavedPath);
    return () => {};
  }
  _pathListeners.push(cb);
  return () => {
    const idx = _pathListeners.indexOf(cb);
    if (idx !== -1) _pathListeners.splice(idx, 1);
  };
}

/** Clear the saved path (call when starting a new patient session). */
export function clearLastSavedPath(): void {
  _lastSavedPath = '';
}

// ── On-device WAV result bridge ───────────────────────────────────────────────
// Set by CaptureScreen when stopAndSave() resolves, consumed by _commitResult
// in AppContext so updateRecordingPath is called before triggerFlush().

export interface WavResult {
  path: string;
  sha256: string;
  durationMs: number;
}

let _lastWavResult: WavResult | null = null;

export function setLastWavResult(r: WavResult): void {
  _lastWavResult = r;
}

/** Returns and clears the stored WAV result. Returns null if none is pending. */
export function consumeLastWavResult(): WavResult | null {
  const r = _lastWavResult;
  _lastWavResult = null;
  return r;
}
