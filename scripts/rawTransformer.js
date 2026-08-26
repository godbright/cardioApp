/**
 * Metro transformer for .raw files (ASCII CSV of ADC integer samples).
 *
 * Drop a .raw file in src/demo/ — no manual conversion needed.
 * The file must contain comma-separated integers (no header, no newlines),
 * produced by a 12-bit or 16-bit ADC. This transformer:
 *   1. Parses the CSV integers
 *   2. Removes DC offset (subtracts mean)
 *   3. Peak-normalizes to [-1, 1]
 *   4. Exports the result as a plain JS number array
 *
 * Usage in index.ts:
 *   import pcgSamples from './pcg_aortic.raw';
 *   import ecgSamples from './ecg_aortic.raw';
 */

const upstreamTransformer = require('@react-native/metro-babel-transformer');

module.exports.transform = function (params) {
  if (params.filename.endsWith('.raw')) {
    const src = typeof params.src === 'string' ? params.src : '';

    // Parse comma-separated integers
    const ints = src
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));

    if (ints.length === 0) {
      const code = 'module.exports = [];';
      return upstreamTransformer.transform({ ...params, src: code });
    }

    // DC removal
    const mean = ints.reduce((a, b) => a + b, 0) / ints.length;
    const centered = ints.map(v => v - mean);

    // Peak normalization (avoid spread operator on large arrays — it stack-overflows)
    let peak = 0;
    for (let i = 0; i < centered.length; i++) {
      const abs = Math.abs(centered[i]);
      if (abs > peak) peak = abs;
    }
    const samples =
      peak > 0
        ? centered.map(v => Math.round((v / peak) * 1e5) / 1e5)
        : centered;

    const code = `module.exports = ${JSON.stringify(samples)};`;
    return upstreamTransformer.transform({ ...params, src: code });
  }

  return upstreamTransformer.transform(params);
};
