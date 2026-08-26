/**
 * Signal quality pipeline.
 *
 * Runs lightweight DSP checks on the incoming audio stream continuously.
 * Architecturally separate from Stage 1 inference — distinct, cheaper step
 * tuned independently of the ML model.
 *
 * Accepts a `mode` parameter (PCG or ECG) so the same pipeline applies
 * appropriate checks per capture context without duplication.
 *
 * Real DSP should run in a Kotlin native module backed by a C/C++ library
 * or Android's audio APIs. This JS implementation is a prototype-fidelity
 * stand-in that produces the same quality signal shape for UI development.
 */

export type QualityMode = 'pcg' | 'ecg';

export interface QualityResult {
  score: number;       // 0–100
  sufficient: boolean; // score >= QUALITY_THRESHOLD
  hint: string;        // actionable feedback string key (see tts.ts)
}

const QUALITY_THRESHOLD = 80;

// Running state — one per active capture session
let _rms = 0;
let _periodicity = 0;
let _bandEnergy = 0;

export function resetQualityState() {
  _rms = 0;
  _periodicity = 0;
  _bandEnergy = 0;
}

/**
 * Feed a batch of samples and get a quality score.
 * In production this runs in the native module at ~220 Hz.
 */
export function assessQuality(samples: number[], mode: QualityMode): QualityResult {
  if (!samples.length) return { score: 0, sufficient: false, hint: 'quality.weak' };

  // RMS energy check (clipping / floor detection)
  const sumSq = samples.reduce((acc, s) => acc + s * s, 0);
  const rms = Math.sqrt(sumSq / samples.length);
  _rms = _rms * 0.85 + rms * 0.15;

  // Crude periodicity estimate — zero-crossing rate proxy
  let zc = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] * samples[i] < 0) zc++;
  }
  const zcRate = zc / samples.length;
  const expectedZcMin = mode === 'pcg' ? 0.05 : 0.10;
  const expectedZcMax = mode === 'pcg' ? 0.45 : 0.55;
  const periodicScore = zcRate >= expectedZcMin && zcRate <= expectedZcMax ? 1 : 0;
  _periodicity = _periodicity * 0.9 + periodicScore * 0.1;

  // Band energy ratio (simplified — no real FFT here)
  _bandEnergy = _bandEnergy * 0.9 + Math.min(1, _rms * 4) * 0.1;

  // Composite score
  const score = Math.round(
    20 * Math.min(1, _rms / 0.3) +       // energy floor
    40 * _periodicity +                    // periodicity
    40 * _bandEnergy,                      // band energy
  );

  const clamped = Math.max(0, Math.min(100, score));
  const sufficient = clamped >= QUALITY_THRESHOLD;
  const hint = clamped < 30 ? 'quality.weak' : clamped < QUALITY_THRESHOLD ? 'quality.moving' : 'quality.ready.auto';

  return { score: clamped, sufficient, hint };
}
