/**
 * SignalBus — module-level JS ring buffer for raw PCG/ECG samples.
 *
 * Producers: BLE / Classic BT onData callbacks (called from BtAdapter in App.tsx)
 * Consumers: WaveformView — drains on an 80ms animation timer
 *            SDA engine — samples are also pushed to JSI pushSamples before
 *                         landing here, so this bus is waveform-display-only
 *
 * The bus holds the last MAX_SAMPLES samples per channel. When the consumer
 * drains it, it receives all accumulated samples since the last drain.
 */

import type { RawSample } from './bluetooth';

const MAX_SAMPLES = 2000; // 1 second at 2 kHz — keeps memory bounded

export interface DrainResult {
  pcm: Float32Array;
  ecg: Float32Array;
  count: number; // number of samples in the drain
}

let _pcmBuf = new Float32Array(MAX_SAMPLES);
let _ecgBuf = new Float32Array(MAX_SAMPLES);
let _head = 0;  // write index (wraps at MAX_SAMPLES)
let _count = 0; // total unread samples (capped at MAX_SAMPLES)

let _debugLoggedFirstSample = false;

/** Push one sample into the bus. */
export function push(sample: RawSample): void {
  if (!_debugLoggedFirstSample) {
    console.log('[SignalBus] first real sample received — pcm:', sample.pcm.toFixed(4), 'ecg:', sample.ecg.toFixed(4));
    _debugLoggedFirstSample = true;
  }
  _pcmBuf[_head] = sample.pcm;
  _ecgBuf[_head] = sample.ecg;
  _head = (_head + 1) % MAX_SAMPLES;
  if (_count < MAX_SAMPLES) _count++;
}

/**
 * Push an entire chunk of samples in one call.
 * Use this instead of calling push() in a loop — it avoids one function-call
 * overhead per sample (which, at 250 samples per BLE chunk, is significant).
 */
export function pushBatch(pcm: Float32Array, ecg: Float32Array, count: number): void {
  if (!_debugLoggedFirstSample && count > 0) {
    console.log('[SignalBus] first batch received — samples:', count, 'pcm[0]:', pcm[0].toFixed(4));
    _debugLoggedFirstSample = true;
  }
  for (let i = 0; i < count; i++) {
    _pcmBuf[_head] = pcm[i];
    _ecgBuf[_head] = ecg[i] ?? 0;
    _head = (_head + 1) % MAX_SAMPLES;
    if (_count < MAX_SAMPLES) _count++;
  }
}

/**
 * Drain all accumulated samples into caller-supplied Float32Arrays.
 * Returns a view into internal memory — copy before the next push call if you
 * need to keep the data around.
 */
export function drain(): DrainResult {
  if (_count === 0) return { pcm: new Float32Array(0), ecg: new Float32Array(0), count: 0 };

  const count = _count;
  const tail = (_head - count + MAX_SAMPLES) % MAX_SAMPLES;

  const pcm = new Float32Array(count);
  const ecg = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const idx = (tail + i) % MAX_SAMPLES;
    pcm[i] = _pcmBuf[idx];
    ecg[i] = _ecgBuf[idx];
  }

  _count = 0; // mark as drained
  return { pcm, ecg, count };
}

/** Returns true if there are samples waiting to be drained. */
export function hasData(): boolean {
  return _count > 0;
}

/** Clear all buffered samples (call on disconnect or session reset). */
export function flush(): void {
  _head = 0;
  _count = 0;
}
