/**
 * Stage 1 on-device TFLite inference.
 *
 * Embeds the exported, quantized (INT8) MobileNetV3-Small model as a
 * bundled asset. The model version that produced each result is logged
 * for clinical pilot traceability.
 *
 * Low-confidence results are treated as a third state ("inconclusive")
 * rather than forced binary classification.
 *
 * Stub implementation — wires up react-native-fast-tflite once the
 * trained/exported model artifact is available.
 */

export type Stage1Result =
  | { verdict: 'normal';       confidence: number; modelVersion: string }
  | { verdict: 'abnormal';     confidence: number; modelVersion: string }
  | { verdict: 'inconclusive'; confidence: number; modelVersion: string };

// Model version string must match the filename of the bundled .tflite asset.
// Update this constant each time a new model is exported and bundled.
const MODEL_VERSION = 'v0.4.1';

// Confidence threshold below which a result is treated as inconclusive.
const INCONCLUSIVE_THRESHOLD = 0.65;

/**
 * Run Stage 1 inference on a captured PCG recording.
 * `pcmSamples` is the raw PCM buffer from the quality-gated recording.
 *
 * Returns a promise that resolves with the inference result within ~2s
 * on target hardware.
 */
export async function runStage1(_pcmSamples: Float32Array): Promise<Stage1Result> {
  // STUB — real implementation:
  // 1. Extract mel-spectrogram from pcmSamples (native DSP module)
  // 2. Load/reuse the TFLite model via react-native-fast-tflite
  // 3. Run inference
  // 4. Apply INCONCLUSIVE_THRESHOLD logic
  // 5. Log modelVersion + result for pilot traceability

  console.warn('[Stage1] Inference stub — model not yet bundled');

  // Simulate a 1.7s inference delay
  await new Promise(r => setTimeout(r, 1700));

  return {
    verdict: 'abnormal',
    confidence: 0.86,
    modelVersion: MODEL_VERSION,
  };
}

/**
 * Apply the inconclusive threshold to a raw model output.
 * Centralised here so threshold changes don't require hunting across files.
 */
export function applyThreshold(rawProb: number, modelVersion: string): Stage1Result {
  if (rawProb >= INCONCLUSIVE_THRESHOLD) {
    return { verdict: 'abnormal', confidence: rawProb, modelVersion };
  }
  if (rawProb <= 1 - INCONCLUSIVE_THRESHOLD) {
    return { verdict: 'normal', confidence: 1 - rawProb, modelVersion };
  }
  return { verdict: 'inconclusive', confidence: rawProb, modelVersion };
}
