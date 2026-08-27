#pragma once
#include <array>
#include <cmath>

// Direct Form II Transposed biquad section.
// Numerically stable for narrow notch coefficients.
struct Biquad {
    double b0 = 1, b1 = 0, b2 = 0;
    double a1 = 0, a2 = 0;
    double s1 = 0, s2 = 0;  // delay-line state

    float process(float x) noexcept {
        const double y = b0 * x + s1;
        s1 = b1 * x - a1 * y + s2;
        s2 = b2 * x - a2 * y;
        return static_cast<float>(y);
    }

    void reset() noexcept { s1 = s2 = 0; }
};

// 4-stage cascade (4th-order effective response per section type).
// Usage: push samples through processSample() one at a time.
class FilterChain {
public:
    static constexpr int STAGES = 4;
    std::array<Biquad, STAGES> stages;

    float processSample(float x) noexcept {
        for (auto& s : stages) x = s.process(x);
        return x;
    }

    void reset() noexcept { for (auto& s : stages) s.reset(); }

    // Build a bandpass from a 2nd-order Butterworth HP cascaded with a LP.
    // Coefficients computed via bilinear transform.
    static FilterChain makeBandpass(double fc_low_hz, double fc_high_hz, double fs);

    // 2nd-order IIR notch (Audio EQ Cookbook), Q controls bandwidth.
    static Biquad makeNotch(double f0_hz, double Q, double fs);
};

// Utility: clamp to [0,1]
inline float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
