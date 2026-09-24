#pragma once
#include "ring_buffer.h"
#include "filter.h"
#include "sqa_payload.h"
#include <atomic>
#include <thread>
#include <cstdint>

// Maximum supported sample rate for pre-allocated window buffers (Hz).
// Must be >= the highest rate the hardware sends (HLink/CardioSleeve: 2 kHz).
static constexpr int    MAX_SAMPLE_RATE  = 2000;
// 2.0-second window at MAX_SAMPLE_RATE
static constexpr size_t MAX_WINDOW       = MAX_SAMPLE_RATE * 2; // 4000 samples
// Ring buffer capacity (power-of-2, ~4s at 2 kHz)
static constexpr size_t RING_CAP        = 8192;

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
    // Schedules a full state reset; the actual flush runs on the worker thread
    // to avoid concurrent writes to the ring buffers or filter state.
    void reset() noexcept;

    // Seqlock-protected read — safe to call from any thread (JSI/JS thread).
    // Retries if a publish() is in flight so the caller never sees a torn struct.
    SqaPayload read() noexcept;

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
    // Seqlock per slot: even = stable, odd = write in progress.
    // publish() increments before and after the struct write; read() retries on odd.
    std::atomic<uint32_t>  slot_seq_[2] = {};

    std::atomic<SqaMode>   mode_{SqaMode::PCG};
    std::atomic<int>       sample_rate_{500};
    std::atomic<bool>      rate_set_{false};
    std::atomic<bool>      stop_{false};
    // Timestamp of the most recent push() call — used by the worker to detect
    // genuine signal loss vs. normal ring-buffer drain between window computations.
    std::atomic<int64_t>   last_push_ms_{0};
    // Deferred reset flag: set by reset() or push() on rate change; consumed by
    // workerLoop() so the flush runs on the worker thread, not the caller thread.
    std::atomic<bool>      reset_pending_{false};

    // Scratch window buffers — pre-allocated, used only by worker thread.
    float pcg_win_[MAX_WINDOW];
    float ecg_win_[MAX_WINDOW];

    std::thread worker_;
};
