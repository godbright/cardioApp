// Types for the CardioSqaModule JSI host object installed by SdaJSIPackage.
// The object lives on `global.CardioSqaModule` and is available synchronously —
// no bridge serialization, no async overhead.
import { NativeModules } from 'react-native';
import { Buffer } from 'buffer';

export interface SqaPayload {
  /** True when overall_score >= mode-specific threshold (0.65 for PCG/DUAL, 0.60 for ECG). */
  ready: boolean;
  /** Weighted composite quality score, 0.0–1.0. */
  score: number;
  /** PCG composite (serSQI × 0.40 + eSQI × 0.35 + aSQI × 0.25). */
  pcgScore: number;
  /** ECG composite (bSQI × 0.40 + kSQI × 0.35 + basSQI × 0.25). */
  ecgScore: number;
  /** Monotonic timestamp in ms (std::steady_clock). */
  tsMs: number;
  // ── Individual metrics ────────────────────────────────────────────────────
  /** Spectral energy ratio — fraction of PCG power in the cardiac band (25–200 Hz). */
  serSqi: number;
  /** Energy SQI — RMS in the clinically useful amplitude range. */
  eSqi: number;
  /** Amplitude + periodicity — autocorrelation peak at plausible HR lag. */
  aSqi: number;
  /** Beat-based SQI — detected R-peaks vs expected beats. */
  bSqi: number;
  /** Kurtosis SQI — sharpness of R-peaks. */
  kSqi: number;
  /** Baseline wander SQI — low baseline power relative to signal power. */
  basSqi: number;
}

export interface NativeSdaModule {
  /** Synchronous read of the latest SQA payload from the atomic ping-pong buffer. */
  getPayload(): SqaPayload;
  /** 0 = PCG-only, 1 = ECG-only, 2 = DUAL. */
  setMode(mode: 0 | 1 | 2): void;
  /** Flush ring buffers, zero filter state, reset payload. */
  reset(): void;
}

// Read from global lazily — nativeInstall runs asynchronously on the JS queue
// thread after the bridge is set up, so a top-level `const` would always capture
// undefined. Call this function inside effects, never at module evaluation time.
export function getNativeSda(): NativeSdaModule | undefined {
  return (global as any).CardioSqaModule as NativeSdaModule | undefined;
}

/**
 * Forward a PCM chunk from the BLE data callback into the C++ SQI engine.
 * Encodes the Float32Array as base64 to avoid per-sample boxing through the bridge.
 * Called at ~60 Hz from App.tsx whenever the BLE service delivers a new chunk.
 */
export function pushBatch(pcm: Float32Array, _ecg: Float32Array, count: number, rateHz: number): void {
  if (count <= 0) return;
  const pcmBase64 = Buffer.from(pcm.buffer as ArrayBuffer, pcm.byteOffset, count * 4).toString('base64');
  NativeModules.CardioSdaInstaller?.pushBatch(pcmBase64, count, rateHz);
}
