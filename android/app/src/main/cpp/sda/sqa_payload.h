#pragma once
#include <cstdint>

// Plain data struct — no virtual methods, trivially copyable.
// Shared between the DSP engine and the JSI host object read path.
struct SqaPayload {
    float   overall_score = 0.0f;  // 0.0–1.0 weighted composite
    float   pcg_score     = 0.0f;  // weighted PCG composite
    float   ecg_score     = 0.0f;  // weighted ECG composite
    // Individual metrics
    float   ser_sqi = 0.0f;  // spectral energy ratio (PCG)
    float   e_sqi   = 0.0f;  // energy / RMS (PCG)
    float   a_sqi   = 0.0f;  // amplitude + periodicity (PCG)
    float   b_sqi   = 0.0f;  // beat detection (ECG)
    float   k_sqi   = 0.0f;  // kurtosis (ECG)
    float   bas_sqi = 0.0f;  // baseline wander suppression (ECG)
    bool    ready   = false; // true when overall_score >= threshold
    int64_t timestamp_ms = 0;
    uint8_t mode    = 0;     // 0=PCG 1=ECG 2=DUAL
};
