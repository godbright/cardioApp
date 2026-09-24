#include "ecg_sqi.h"
#include "filter.h"
#include <cmath>
#include <cstring>
#include <algorithm>

static constexpr float  NOMINAL_HR_BPM = 75.0f;
static constexpr size_t MAX_WINDOW     = 4000;  // 2 s at 2 kHz

// ── bSQI: simplified Pan-Tompkins beat detector ───────────────────────────────

float EcgSqi::bSQI(const float* ecg, size_t n, int fs) {
    if (n < 10) return 0.0f;

    // 1. Differentiate
    static float d[MAX_WINDOW];
    for (size_t i = 2; i < n - 2; ++i)
        d[i] = (2.f*ecg[i+2] + ecg[i+1] - ecg[i-1] - 2.f*ecg[i-2]) / 8.f;
    d[0] = d[1] = d[2]; d[n-2] = d[n-1] = d[n-3];

    // 2. Square
    for (size_t i = 0; i < n; ++i) d[i] *= d[i];

    // 3. Moving window integration (~150 ms)
    const size_t win = static_cast<size_t>(0.15 * fs);
    static float mwi[MAX_WINDOW];
    float acc = 0.f;
    for (size_t i = 0; i < win && i < n; ++i) acc += d[i];
    mwi[0] = acc / win;
    for (size_t i = 1; i < n; ++i) {
        if (i >= win) acc -= d[i - win];
        if (i + win - 1 < n) acc += d[i + win - 1];
        mwi[i] = acc / win;
    }

    // 4. Adaptive threshold (56% of running max)
    float peak_max = 0.f;
    for (size_t i = 0; i < n; ++i) if (mwi[i] > peak_max) peak_max = mwi[i];
    const float thresh = 0.56f * peak_max;
    if (peak_max < 1e-9f) return 0.0f;

    // 5. Count peaks (refractory period ~200 ms)
    // first_peak skips the refractory guard for the very first detected beat;
    // without this, beat 0 at sample 1 would be blocked by i - last_peak (1 - 0 = 1)
    // never exceeding the refractory window, and the first R-peak would be dropped.
    const size_t refractory = static_cast<size_t>(0.2 * fs);
    int beats = 0;
    size_t last_peak = 0;
    bool above = false;
    bool first_peak = true;
    for (size_t i = 1; i < n; ++i) {
        if (mwi[i] > thresh) {
            if (!above && (first_peak || i - last_peak > refractory)) {
                ++beats;
                last_peak = i;
                first_peak = false;
            }
            above = true;
        } else {
            above = false;
        }
    }

    const float window_sec  = static_cast<float>(n) / fs;
    const float expected    = NOMINAL_HR_BPM / 60.f * window_sec;
    return clamp01(static_cast<float>(beats) / expected);
}

// ── kSQI: kurtosis ────────────────────────────────────────────────────────────

float EcgSqi::kSQI(const float* ecg, size_t n) {
    if (n < 4) return 0.f;
    double sum = 0;
    for (size_t i = 0; i < n; ++i) sum += ecg[i];
    const double mu = sum / n;

    double m2 = 0, m4 = 0;
    for (size_t i = 0; i < n; ++i) {
        const double d = ecg[i] - mu;
        const double d2 = d * d;
        m2 += d2;
        m4 += d2 * d2;
    }
    m2 /= n; m4 /= n;
    if (m2 < 1e-12) return 0.f;
    const double kurt = m4 / (m2 * m2);
    // Sharp R-peaks → kurt ≫ 3. Normalize: expect ~7–15 for clean ECG; 10 → 1.0
    return clamp01(static_cast<float>(kurt / 10.0));
}

// ── basSQI: baseline wander suppression ──────────────────────────────────────

float EcgSqi::basSQI(const float* ecg, size_t n, int fs) {
    if (n < 2) return 0.f;
    // Estimate baseline as slow-moving average (500 ms window)
    const size_t half = static_cast<size_t>(0.25 * fs);

    double sig_power = 0, bas_power = 0;
    for (size_t i = 0; i < n; ++i) {
        double acc = 0;
        const size_t lo = i < half ? 0 : i - half;
        const size_t hi = (i + half < n) ? i + half : n - 1;
        for (size_t j = lo; j <= hi; ++j) acc += ecg[j];
        const float baseline = static_cast<float>(acc / (hi - lo + 1));
        bas_power += (double)baseline * baseline;
        sig_power += (double)ecg[i] * ecg[i];
    }
    if (sig_power < 1e-12) return 0.f;
    const float ratio = static_cast<float>(bas_power / sig_power);
    return clamp01(1.f - ratio);
}
