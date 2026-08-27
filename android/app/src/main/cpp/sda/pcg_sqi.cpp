#include "pcg_sqi.h"
#include "filter.h"
#include <cmath>
#include <complex>
#include <algorithm>

static constexpr double PI = 3.14159265358979323846;

// ── Minimal radix-2 FFT (power-of-2 size only) ────────────────────────────────

static void fft(std::complex<float>* x, size_t N) {
    // Bit-reversal permutation
    for (size_t i = 1, j = 0; i < N; ++i) {
        size_t bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) std::swap(x[i], x[j]);
    }
    // Cooley-Tukey butterfly
    for (size_t len = 2; len <= N; len <<= 1) {
        const float ang = static_cast<float>(-2.0 * PI / len);
        const std::complex<float> wlen(std::cos(ang), std::sin(ang));
        for (size_t i = 0; i < N; i += len) {
            std::complex<float> w(1.f, 0.f);
            for (size_t k = 0; k < len / 2; ++k) {
                const auto u = x[i + k];
                const auto v = x[i + k + len / 2] * w;
                x[i + k]            = u + v;
                x[i + k + len / 2]  = u - v;
                w *= wlen;
            }
        }
    }
}

// Next power of 2 ≥ n, capped at 4096.
static size_t nextPow2(size_t n) {
    size_t p = 1;
    while (p < n && p < 4096) p <<= 1;
    return p;
}

// ── serSQI: spectral energy ratio in cardiac band ─────────────────────────────

float PcgSqi::serSQI(const float* pcg, size_t n, int fs) {
    if (n < 16) return 0.f;

    const size_t N = nextPow2(n);
    // Stack buffer capped at 4096 points
    static std::complex<float> buf[4096];
    for (size_t i = 0; i < N; ++i) {
        // Hann window
        const float w = 0.5f - 0.5f * std::cos(static_cast<float>(2.0 * PI * i / (N - 1)));
        buf[i] = {(i < n ? pcg[i] * w : 0.f), 0.f};
    }

    fft(buf, N);

    const size_t half = N / 2;
    // Cardiac band: 25 Hz – min(200 Hz, Nyquist-1)
    const float hz_per_bin = static_cast<float>(fs) / N;
    const size_t lo = static_cast<size_t>(25.f  / hz_per_bin);
    const size_t hi = static_cast<size_t>(std::min(200.f, (float)fs / 2.f - 1.f) / hz_per_bin);

    double total = 0, cardiac = 0;
    for (size_t k = 1; k < half; ++k) {
        const double p = std::norm(buf[k]);
        total += p;
        if (k >= lo && k <= hi) cardiac += p;
    }
    if (total < 1e-12) return 0.f;
    return clamp01(static_cast<float>(cardiac / total));
}

// ── eSQI: RMS energy in clinically useful range ───────────────────────────────

float PcgSqi::eSQI(const float* pcg, size_t n) {
    if (n < 2) return 0.f;
    double sum2 = 0;
    for (size_t i = 0; i < n; ++i) sum2 += (double)pcg[i] * pcg[i];
    const float rms = static_cast<float>(std::sqrt(sum2 / n));

    // Samples arrive pre-normalized to ±1. Clinically useful: 0.02–0.85.
    // Score is 1.0 at the sweet spot (~0.15 RMS), falls off toward rails.
    constexpr float RMS_MIN = 0.02f, RMS_OPT = 0.15f, RMS_MAX = 0.85f;
    if (rms < RMS_MIN || rms > RMS_MAX) return 0.f;
    if (rms <= RMS_OPT)
        return clamp01((rms - RMS_MIN) / (RMS_OPT - RMS_MIN));
    else
        return clamp01(1.f - (rms - RMS_OPT) / (RMS_MAX - RMS_OPT));
}

// ── aSQI: amplitude + periodicity via autocorrelation ─────────────────────────

float PcgSqi::aSQI(const float* pcg, size_t n, int fs) {
    if (n < 16 || fs <= 0) return 0.f;

    // Heartbeat period range: 40–200 bpm → 0.3–1.5 s
    const size_t lag_lo = static_cast<size_t>(0.3f * fs);
    const size_t lag_hi = static_cast<size_t>(1.5f * fs);
    if (lag_lo >= n || lag_hi >= n) return 0.f;

    // Normalize signal
    double mean = 0;
    for (size_t i = 0; i < n; ++i) mean += pcg[i];
    mean /= n;

    double r0 = 0;
    for (size_t i = 0; i < n; ++i) {
        const double d = pcg[i] - mean;
        r0 += d * d;
    }
    if (r0 < 1e-12) return 0.f;

    // Find peak autocorrelation in the HR lag range
    float best_r = 0.f;
    const size_t step = std::max<size_t>(1, (lag_hi - lag_lo) / 40); // sample 40 lags
    for (size_t lag = lag_lo; lag <= lag_hi && lag < n; lag += step) {
        double r = 0;
        for (size_t i = 0; i + lag < n; ++i)
            r += (pcg[i] - mean) * (pcg[i + lag] - mean);
        const float rn = static_cast<float>(r / r0);
        if (rn > best_r) best_r = rn;
    }

    return clamp01(best_r);
}
