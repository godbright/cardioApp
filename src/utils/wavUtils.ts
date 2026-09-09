import { Buffer } from 'buffer';

export interface WavInfo {
  sampleRate:    number;
  numChannels:   number;
  bitsPerSample: number;
  dataOffset:    number; // byte offset where PCM data begins
  dataLength:    number; // byte length of PCM data
}

/** Parse the RIFF/WAV header. Returns null if the buffer is not a valid WAV. */
export function parseWavHeader(buf: Buffer): WavInfo | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  const numChannels   = buf.readUInt16LE(22);
  const sampleRate    = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  // Walk chunks to find 'data' (handles files with extra fmt metadata).
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id   = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      return { sampleRate, numChannels, bitsPerSample, dataOffset: offset + 8, dataLength: size };
    }
    offset += 8 + size;
  }
  return null;
}

/**
 * Wrap raw (headerless) PCM bytes in a minimal RIFF/WAV container.
 * Used when the BLE peripheral sends raw PCM rather than a .wav file.
 */
function wrapPcmAsWav(
  pcm: Buffer,
  sampleRate: number,
  bitsPerSample: number,
  numChannels: number,
): Buffer {
  const frameSize = numChannels * (bitsPerSample / 8);
  const byteRate  = sampleRate * frameSize;
  const out       = Buffer.alloc(44 + pcm.length);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + pcm.length, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);            // PCM format
  out.writeUInt16LE(numChannels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(frameSize, 32);
  out.writeUInt16LE(bitsPerSample, 34);
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(pcm.length, 40);
  pcm.copy(out, 44);
  return out;
}

/**
 * Return a WAV buffer that Android MediaPlayer can open.
 *
 * Handles two input cases:
 *  1. Raw PCM (no RIFF header) — common when the BLE peripheral sends naked
 *     sample bytes. We wrap it with the given fallback parameters first.
 *  2. A proper WAV file — used directly, but upsampled if sample rate < 4000 Hz.
 *
 * Android's AudioTrack minimum is 4000 Hz. Sources below that are upsampled
 * (smallest integer factor reaching ≥ 8000 Hz) using linear interpolation so
 * S1/S2 transients remain audible.
 *
 * The original buffer is never modified — the caller keeps it for upload.
 */
export function ensurePlayableWav(
  buf: Buffer,
  fallbackSampleRate: number  = 2000,
  fallbackBits: number        = 16,
  fallbackChannels: number    = 1,
): Buffer {
  const isRiff = buf.length >= 4 && buf.toString('ascii', 0, 4) === 'RIFF';
  const wavBuf = isRiff
    ? buf
    : wrapPcmAsWav(buf, fallbackSampleRate, fallbackBits, fallbackChannels);
  return upsampleWavForPlayback(wavBuf);
}

/**
 * Return a new WAV buffer suitable for Android playback.
 *
 * Android's AudioTrack minimum is 4000 Hz. If the source is below that (e.g.
 * 2 kHz) we upsample by the smallest integer factor that reaches >= 8000 Hz,
 * using linear interpolation so S1/S2 transients remain audible.
 *
 * Only 16-bit mono PCM is handled — anything else is returned unchanged and
 * will fail to load; the caller can surface an appropriate error in that case.
 *
 * The original buffer is never modified — the caller keeps it for upload.
 */
export function upsampleWavForPlayback(buf: Buffer, targetRate: number = 8000): Buffer {
  const info = parseWavHeader(buf);
  if (!info) return buf;

  const { sampleRate, numChannels, bitsPerSample, dataOffset, dataLength } = info;

  if (sampleRate >= 4000) return buf; // already playable, no work needed
  if (bitsPerSample !== 16 || numChannels !== 1) return buf; // unsupported format

  const factor          = Math.ceil(targetRate / sampleRate);   // 4 for 2 kHz → 8 kHz
  const outSampleRate   = sampleRate * factor;
  const frameSize       = 2; // 16-bit mono = 2 bytes per frame
  const numFrames       = Math.floor(dataLength / frameSize);
  const outNumFrames    = numFrames * factor;
  const outDataLength   = outNumFrames * frameSize;

  const out = Buffer.alloc(44 + outDataLength);

  // ── WAV header ────────────────────────────────────────────────────────────
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + outDataLength, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16);              // fmt chunk size
  out.writeUInt16LE(1,  20);              // PCM
  out.writeUInt16LE(1,  22);              // mono
  out.writeUInt32LE(outSampleRate, 24);   // new sample rate
  out.writeUInt32LE(outSampleRate * 2, 28); // byte rate
  out.writeUInt16LE(2,  32);              // block align
  out.writeUInt16LE(16, 34);             // bits per sample
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(outDataLength, 40);

  // ── Linear interpolation upsample ─────────────────────────────────────────
  let outPos = 44;
  for (let i = 0; i < numFrames - 1; i++) {
    const s0 = buf.readInt16LE(dataOffset + i * frameSize);
    const s1 = buf.readInt16LE(dataOffset + (i + 1) * frameSize);
    for (let j = 0; j < factor; j++) {
      const v = Math.round(s0 + (s1 - s0) * j / factor);
      out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), outPos);
      outPos += 2;
    }
  }
  // Repeat last frame for the tail
  const lastSample = numFrames > 0
    ? buf.readInt16LE(dataOffset + (numFrames - 1) * frameSize)
    : 0;
  for (let j = 0; j < factor; j++) {
    out.writeInt16LE(lastSample, outPos);
    outPos += 2;
  }

  return out;
}
