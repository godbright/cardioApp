#pragma once
#include <cstddef>

// Computes the three PCG signal quality index metrics on a filtered window.
// All scores are in [0, 1].
class PcgSqi {
public:
    // serSQI — spectral energy ratio: fraction of power in the cardiac band.
    static float serSQI(const float* pcg, size_t n, int sample_rate_hz);

    // eSQI — energy: RMS in the clinically useful range (not too quiet, not clipping).
    static float eSQI(const float* pcg, size_t n);

    // aSQI — amplitude + periodicity via autocorrelation peak in HR-plausible lag range.
    static float aSQI(const float* pcg, size_t n, int sample_rate_hz);
};
