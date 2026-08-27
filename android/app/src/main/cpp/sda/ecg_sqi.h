#pragma once
#include "sqa_payload.h"

// Computes the three ECG signal quality index metrics on a filtered window.
// All scores are in [0, 1].
class EcgSqi {
public:
    // bSQI — beat-based: ratio of detected R-peaks to expected beats.
    static float bSQI(const float* ecg, size_t n, int sample_rate_hz);

    // kSQI — kurtosis: sharp R-peaks → high kurtosis → high score.
    static float kSQI(const float* ecg, size_t n);

    // basSQI — baseline wander: low baseline power relative to signal → high score.
    static float basSQI(const float* ecg, size_t n, int sample_rate_hz);
};
