#pragma once
#include "ring_buffer.h"
#include "filter.h"
#include "sqa_payload.h"
#include <atomic>
#include <thread>
#include <cstdint>

// Maximum supported sample rate for pre-allocated window buffers (Hz).
static constexpr int    MAX_SAMPLE_RATE  = 4000;
// 2.0-second window at MAX_SAMPLE_RATE
static constexpr size_t MAX_WINDOW       = MAX_SAMPLE_RATE * 2;
// Ring buffer capacity (power-of-2, ~8s at 4 kHz)
static constexpr size_t RING_CAP        = 32768;

// Operating mode — must match JNI contract (0/1/2 in Kotlin).
enum class SqaMode : uint8_t { PCG = 0, ECG = 1, DUAL = 2 };

class SqaEngine {
public:
    SqaEngine();
    ~SqaEngine();

    // Called from JNI pushSamples — producer thread (audio callback).
    void push(const float* pcg, size_t pcg_n,
              const float* ecg, size_t ecg_n,
              int rate_hz) noexcept;

    void setMode(SqaMode m) noexcept { mode_.store(m, std::memory_order_relaxed); }
    void reset() noexcept;

    // Lock-free read — safe to call from any thread (JSI/JS thread).
    SqaPayload read() const noexcept {
        return slots_[active_.load(std::memory_order_acquire)];
    }

private:
    void workerLoop();
    void reconfigureFilters(int rate_hz);
    SqaPayload computeWindow(const float* pcg, const float* ecg,
                              size_t n, int rate_hz);
    void publish(const SqaPayload& p) noexcept;

    RingBuffer<float, RING_CAP> pcg_ring_;
    RingBuffer<float, RING_CAP> ecg_ring_;

    FilterChain pcg_filter_;
    FilterChain ecg_filter_;
    Biquad      pcg_notch_;
    Biquad      ecg_notch_;

    // Atomic ping-pong: DSP writes to shadow slot, swaps active_ atomically.
    SqaPayload             slots_[2];
    std::atomic<int>       active_{0};

    std::atomic<SqaMode>   mode_{SqaMode::PCG};
    std::atomic<int>       sample_rate_{500};
    std::atomic<bool>      rate_set_{false};
    std::atomic<bool>      stop_{false};

    // Scratch window buffers — pre-allocated, used only by worker thread.
    float pcg_win_[MAX_WINDOW];
    float ecg_win_[MAX_WINDOW];

    std::thread worker_;
};
