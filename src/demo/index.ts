/**
 * Demo signal assets.
 *
 * Set DEMO_MODE = true to play back the pre-recorded signals below instead of
 * the synthetic waveform generator. Flip back to false for real-device capture.
 *
 * To update the signals: drop new .raw files in src/demo/ and rebuild.
 * The Metro transformer (scripts/rawTransformer.js) reads each .raw file
 * (comma-separated ADC integers), removes DC offset, peak-normalizes to [-1, 1],
 * and exports a float array — no manual conversion step needed.
 *
 * Sample rates are set here to match the recording device:
 *   PCG_DEMO_RATE — samples per second for the phonocardiogram (default 4000)
 *   ECG_DEMO_RATE — samples per second for the ECG (default 500)
 * Adjust if your recording was made at a different rate.
 */

import pcgSamples from './pcg_aortic.raw';
import ecgSamples from './ecg_aortic.raw';

// ── Flip this to enable demo playback ────────────────────────────────────────
export const DEMO_MODE = false;

// ── Pre-recorded signal arrays (normalized -1 to 1) ──────────────────────────
export const PCG_DEMO_SAMPLES: number[] = pcgSamples;
export const ECG_DEMO_SAMPLES: number[] = ecgSamples;

// Playback sample rates — set these to match your actual recording device.
// Both PCG and ECG files were captured synchronously on the same ADC, so
// they share the same sample rate. 500 Hz is the standard for clinical-grade
// synchronized PCG/ECG capture. If the waveform scrolls too fast or too slow,
// adjust these values to match your recording hardware.
export const PCG_DEMO_RATE = 500;
export const ECG_DEMO_RATE = 500;
