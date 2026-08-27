#include "filter.h"
#include <cmath>

static constexpr double PI = 3.14159265358979323846;

// 2nd-order Butterworth LP biquad via bilinear transform (Q=1/√2).
static Biquad makeLowPass(double fc_hz, double fs) {
    const double K    = std::tan(PI * fc_hz / fs);
    const double norm = K * K + K * M_SQRT2 + 1.0;
    Biquad b;
    b.b0 =  (K * K) / norm;
    b.b1 =  2.0 * b.b0;
    b.b2 =  b.b0;
    b.a1 =  2.0 * (K * K - 1.0) / norm;
    b.a2 =  (K * K - K * M_SQRT2 + 1.0) / norm;
    return b;
}

// 2nd-order Butterworth HP biquad via bilinear transform (Q=1/√2).
static Biquad makeHighPass(double fc_hz, double fs) {
    const double K    = std::tan(PI * fc_hz / fs);
    const double norm = K * K + K * M_SQRT2 + 1.0;
    Biquad b;
    b.b0 =  1.0 / norm;
    b.b1 = -2.0 * b.b0;
    b.b2 =  b.b0;
    b.a1 =  2.0 * (K * K - 1.0) / norm;
    b.a2 =  (K * K - K * M_SQRT2 + 1.0) / norm;
    return b;
}

// Audio EQ Cookbook notch.
Biquad FilterChain::makeNotch(double f0_hz, double Q, double fs) {
    const double w0    = 2.0 * PI * f0_hz / fs;
    const double alpha = std::sin(w0) / (2.0 * Q);
    const double cw    = std::cos(w0);
    const double a0    = 1.0 + alpha;
    Biquad b;
    b.b0 =  1.0       / a0;
    b.b1 = -2.0 * cw  / a0;
    b.b2 =  1.0       / a0;
    b.a1 = -2.0 * cw  / a0;
    b.a2 = (1.0 - alpha) / a0;
    return b;
}

// 4-stage cascade: HP(fc_low) → HP(fc_low) → LP(fc_high) → LP(fc_high)
// Gives effective 4th-order roll-off at each cutoff with Butterworth response.
FilterChain FilterChain::makeBandpass(double fc_low_hz, double fc_high_hz, double fs) {
    // Clamp cutoffs to valid range (must be < Nyquist)
    const double nyq = fs / 2.0;
    if (fc_low_hz  < 0.1)     fc_low_hz  = 0.1;
    if (fc_high_hz > nyq - 1) fc_high_hz = nyq - 1;

    FilterChain chain;
    chain.stages[0] = makeHighPass(fc_low_hz,  fs);
    chain.stages[1] = makeHighPass(fc_low_hz,  fs);
    chain.stages[2] = makeLowPass(fc_high_hz,  fs);
    chain.stages[3] = makeLowPass(fc_high_hz,  fs);
    return chain;
}
