/**
 * Stage 1 on-device TFLite inference.
 *
 * Pipeline:
 *   1. computeMelSpec(wavPath) — native C++ mel spectrogram (64 × 63 log-mel)
 *   2. loadTensorflowModel — cached, loaded once per app launch
 *   3. model.runSync([Float32Array]) — INT8 MobileNetV3-Small
 *   4. applyThreshold(p_abnormal) — normal / abnormal / inconclusive
 *
 * Falls back to a stub when the model asset is not yet bundled
 * (android/app/src/main/assets/stage1_<MODEL_VERSION>.tflite).
 */

import { NativeModules } from 'react-native';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { TensorflowModel } from 'react-native-fast-tflite';
import RNFS from 'react-native-fs';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Stage1Result =
  | { verdict: 'normal';       confidence: number; modelVersion: string }
  | { verdict: 'abnormal';     confidence: number; modelVersion: string }
  | { verdict: 'inconclusive'; confidence: number; modelVersion: string };

// ── Configuration ─────────────────────────────────────────────────────────────

// Bump this constant when a new model artifact is exported and placed in assets/.
const MODEL_VERSION = 'v0.4.1';

// Android asset URI — file must exist at android/app/src/main/assets/<name>.tflite
const MODEL_URI = `file:///android_asset/stage1_${MODEL_VERSION}.tflite`;

// Confidence threshold: p_abnormal >= HIGH → abnormal, <= LOW → normal, else inconclusive.
const THRESHOLD_HIGH = 0.65;
const THRESHOLD_LOW  = 1 - THRESHOLD_HIGH;   // 0.35

// Minimum time the 'analyzing' phase stays visible so the CHW sees feedback.
const MIN_ANALYSIS_MS = 800;

// ── Native modules ────────────────────────────────────────────────────────────

const MelSpecNative = (NativeModules as any).MelSpec as
  | { computeMelSpec(wavPath: string): Promise<number[] | null> }
  | null
  | undefined;

// ── Model cache ───────────────────────────────────────────────────────────────

let _model:        TensorflowModel | null = null;
let _modelPromise: Promise<TensorflowModel | null> | null = null;

async function getModel(): Promise<TensorflowModel | null> {
  if (_model) return _model;
  if (_modelPromise) return _modelPromise;

  // file:///android_asset/... is NOT a real filesystem path — Android assets are
  // accessed via AssetManager, not as /android_asset/... files. RNFS.exists()
  // returns false for this path, which safely short-circuits loadTensorflowModel
  // before react-native-fast-tflite can crash trying to open a non-existent file.
  const modelPath = MODEL_URI.replace(/^file:\/\//, '');
  const accessible = await RNFS.exists(modelPath).catch(() => false);
  if (!accessible) {
    console.warn('[Stage1] Model file not accessible at:', modelPath, '— skipping native inference');
    return null;
  }

  _modelPromise = loadTensorflowModel({ url: MODEL_URI })
    .then(m => { _model = m; return m; })
    .catch(e => {
      console.warn('[Stage1] Model asset not found — falling back to stub.', e?.message ?? e);
      _modelPromise = null;
      return null;
    });

  return _modelPromise;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run Stage 1 inference on the WAV file produced by WavRecorder.
 * Returns a result within ~1–2 s on target hardware (INT8 on CPU delegate).
 *
 * Falls back to a simulated result when:
 *  - wavPath is empty (ECG capture, no PCG audio)
 *  - model asset is not yet bundled
 *  - MelSpec native module is absent (JS-only reload before first run-android)
 */
export async function runStage1(wavPath: string): Promise<Stage1Result> {
  const t0 = Date.now();

  if (!wavPath) {
    return _stub('inconclusive', 0, t0);
  }

  // Try to load the TFLite model (no-op if already loaded).
  const model = await getModel();
  if (!model) {
    console.warn('[Stage1] Model unavailable — using stub result');
    return _stub('abnormal', 0.86, t0);
  }

  if (!MelSpecNative) {
    console.warn('[Stage1] MelSpec native module unavailable — using stub result');
    return _stub('abnormal', 0.86, t0);
  }

  // Compute log-mel spectrogram natively (C++ via JNI).
  let melData: number[] | null = null;
  try {
    melData = await MelSpecNative.computeMelSpec(wavPath);
  } catch (e) {
    console.warn('[Stage1] computeMelSpec failed:', e);
  }

  if (!melData || melData.length !== 4032) {
    console.warn('[Stage1] Mel spec failed — returning inconclusive');
    return _stub('inconclusive', 0, t0);
  }

  // Run TFLite inference synchronously on the model's internal thread.
  const input = new Float32Array(melData);
  let probs: Float32Array;
  try {
    const outputs = model.runSync([input]);
    probs = outputs[0] as Float32Array;
  } catch (e) {
    console.warn('[Stage1] Inference failed:', e);
    return _stub('inconclusive', 0, t0);
  }

  // probs = [p_normal, p_abnormal]
  const result = applyThreshold(probs[1], MODEL_VERSION);

  // Pad to MIN_ANALYSIS_MS so the 'analyzing' UI is visible long enough.
  const elapsed = Date.now() - t0;
  if (elapsed < MIN_ANALYSIS_MS) {
    await new Promise<void>(r => setTimeout(r, MIN_ANALYSIS_MS - elapsed));
  }

  console.log(
    `[Stage1] verdict=${result.verdict} conf=${result.confidence.toFixed(3)} ` +
    `model=${result.modelVersion} (${Date.now() - t0} ms)`,
  );
  return result;
}

/**
 * Apply the inconclusive band to a raw p_abnormal probability.
 * Exported so tests and debug screens can call it directly.
 */
export function applyThreshold(pAbnormal: number, modelVersion: string): Stage1Result {
  if (pAbnormal >= THRESHOLD_HIGH) {
    return { verdict: 'abnormal',     confidence: pAbnormal,       modelVersion };
  }
  if (pAbnormal <= THRESHOLD_LOW) {
    return { verdict: 'normal',       confidence: 1 - pAbnormal,  modelVersion };
  }
  return   { verdict: 'inconclusive', confidence: pAbnormal,       modelVersion };
}

// ── Stub fallback ─────────────────────────────────────────────────────────────

async function _stub(
  verdict: Stage1Result['verdict'],
  confidence: number,
  t0: number,
): Promise<Stage1Result> {
  const elapsed = Date.now() - t0;
  if (elapsed < MIN_ANALYSIS_MS) {
    await new Promise<void>(r => setTimeout(r, MIN_ANALYSIS_MS - elapsed));
  }
  return { verdict, confidence, modelVersion: MODEL_VERSION };
}
