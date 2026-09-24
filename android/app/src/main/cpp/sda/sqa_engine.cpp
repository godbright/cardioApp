#include "sqa_engine.h"
#include "ecg_sqi.h"
#include "pcg_sqi.h"
#include <chrono>
#include <thread>
#include <android/log.h>

#define LOG_TAG "SqaEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)

static constexpr float THRESHOLD_PCG  = 0.65f;
static constexpr float THRESHOLD_ECG  = 0.60f;
static constexpr float THRESHOLD_DUAL = 0.65f;

// Weights for composite scores
static constexpr float W_SER = 0.40f, W_E = 0.35f, W_A = 0.25f;
static constexpr float W_B   = 0.40f, W_K = 0.35f, W_BAS = 0.25f;

static int64_t nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
}

SqaEngine::SqaEngine() {
    // Zero-init both payload slots
    slots_[0] = {}; slots_[1] = {};
    // Default filters at 500 Hz until first pushSamples call
    reconfigureFilters(500);
    worker_ = std::thread(&SqaEngine::workerLoop, this);
}

SqaEngine::~SqaEngine() {
    stop_.store(true, std::memory_order_release);
    if (worker_.joinable()) worker_.join();
}

void SqaEngine::reconfigureFilters(int rate_hz) {
    const double fs = static_cast<double>(rate_hz);
    // ECG: 0.5–40 Hz bandpass + 50 Hz notch
    ecg_filter_ = FilterChain::makeBandpass(0.5, 40.0, fs);
    ecg_notch_  = FilterChain::makeNotch(50.0, 30.0, fs);
    // PCG: 25–min(200,Nyquist-1) Hz bandpass + 50 Hz notch
    const double pcg_hi = std::min(200.0, fs / 2.0 - 1.0);
    pcg_filter_ = FilterChain::makeBandpass(25.0, pcg_hi, fs);
    pcg_notch_  = FilterChain::makeNotch(50.0, 30.0, fs);

    ecg_filter_.reset(); ecg_notch_.reset();
    pcg_filter_.reset(); pcg_notch_.reset();
    LOGI("Filters reconfigured for %d Hz (PCG hi=%.0f Hz)", rate_hz, pcg_hi);
}

void SqaEngine::push(const float* pcg, size_t pcg_n,
                     const float* ecg, size_t ecg_n,
                     int rate_hz) noexcept {
    // Reconfigure filters on first call or rate change
    const int prev = sample_rate_.load(std::memory_order_relaxed);
    if (!rate_set_.load(std::memory_order_relaxed) || prev != rate_hz) {
        sample_rate_.store(rate_hz, std::memory_order_relaxed);
        rate_set_.store(true, std::memory_order_relaxed);
        // Ring flush must run on the worker thread — calling reset() from the producer
        // races with the consumer's concurrent pop(). Signal workerLoop() to drain.
        reset_pending_.store(true, std::memory_order_release);
    }
    if (pcg && pcg_n > 0) pcg_ring_.push(pcg, pcg_n);
    if (ecg && ecg_n > 0) ecg_ring_.push(ecg, ecg_n);
    // Record push time so the worker can distinguish genuine signal loss
    // (no pushes for >500 ms) from normal ring-buffer drain between windows.
    last_push_ms_.store(nowMs(), std::memory_order_relaxed);
}

void SqaEngine::reset() noexcept {
    // Defer the actual flush to workerLoop() — direct ring/filter manipulation
    // from the JSI thread races with the worker's concurrent pop()/computeWindow().
    reset_pending_.store(true, std::memory_order_release);
}

SqaPayload SqaEngine::read() noexcept {
    // Seqlock: spin until publish_seq_ is even (no write in progress) and stable
    // across the struct copy. Prevents a torn read if publish() runs concurrently.
    while (true) {
        const int slot = active_.load(std::memory_order_acquire);
        const uint32_t seq1 = slot_seq_[slot].load(std::memory_order_acquire);
        if (seq1 & 1u) continue;  // odd → publish in progress, retry
        const SqaPayload p = slots_[slot];
        std::atomic_thread_fence(std::memory_order_acquire);
        const uint32_t seq2 = slot_seq_[slot].load(std::memory_order_relaxed);
        if (seq1 == seq2) return p;
        // seq changed during copy → retry
    }
}

void SqaEngine::publish(const SqaPayload& p) noexcept {
    const int write_slot = 1 - active_.load(std::memory_order_relaxed);
    // Seqlock: odd seq signals "write in progress" so read() retries rather than
    // seeing a partially-written struct.
    slot_seq_[write_slot].fetch_add(1, std::memory_order_release);  // → odd
    slots_[write_slot] = p;
    slot_seq_[write_slot].fetch_add(1, std::memory_order_release);  // → even (stable)
    active_.store(write_slot, std::memory_order_release);
}

SqaPayload SqaEngine::computeWindow(const float* pcg, const float* ecg,
                                     size_t n, int rate_hz) {
    SqaPayload p{};
    p.timestamp_ms = nowMs();
    p.mode = static_cast<uint8_t>(mode_.load(std::memory_order_relaxed));

    // Apply filters in-place on local scratch copies
    static float f_pcg[MAX_WINDOW], f_ecg[MAX_WINDOW];
    for (size_t i = 0; i < n; ++i) {
        f_pcg[i] = pcg_notch_.process(pcg_filter_.processSample(pcg[i]));
        f_ecg[i] = ecg_notch_.process(ecg_filter_.processSample(ecg[i]));
    }

    const SqaMode mode = mode_.load(std::memory_order_relaxed);

    if (mode == SqaMode::PCG || mode == SqaMode::DUAL) {
        p.ser_sqi = PcgSqi::serSQI(f_pcg, n, rate_hz);
        p.e_sqi   = PcgSqi::eSQI  (f_pcg, n);
        p.a_sqi   = PcgSqi::aSQI  (f_pcg, n, rate_hz);
        p.pcg_score = W_SER*p.ser_sqi + W_E*p.e_sqi + W_A*p.a_sqi;
    }
    if (mode == SqaMode::ECG || mode == SqaMode::DUAL) {
        p.b_sqi   = EcgSqi::bSQI  (f_ecg, n, rate_hz);
        p.k_sqi   = EcgSqi::kSQI  (f_ecg, n);
        p.bas_sqi = EcgSqi::basSQI(f_ecg, n, rate_hz);
        p.ecg_score = W_B*p.b_sqi + W_K*p.k_sqi + W_BAS*p.bas_sqi;
    }

    switch (mode) {
        case SqaMode::PCG:  p.overall_score = p.pcg_score; break;
        case SqaMode::ECG:  p.overall_score = p.ecg_score; break;
        case SqaMode::DUAL: p.overall_score = 0.5f*p.pcg_score + 0.5f*p.ecg_score; break;
    }

    const float thresh = (mode == SqaMode::PCG)  ? THRESHOLD_PCG
                       : (mode == SqaMode::ECG)  ? THRESHOLD_ECG
                                                  : THRESHOLD_DUAL;
    p.ready = (p.overall_score >= thresh);
    return p;
}

void SqaEngine::workerLoop() {
    int last_rate = -1;
    // Publish a zeroed payload after NO_DATA_TIMEOUT_MS of no *pushes* so the UI
    // does not display a stale green reading from a previous session.
    //
    // IMPORTANT: measure time-since-last-PUSH, not time-since-last-WINDOW.
    // After computing a 2-second window the ring buffer is empty and takes another
    // 2 seconds to refill at 8 kHz.  If we measured from last-window-compute the
    // 500 ms timeout would fire in the middle of every normal refill cycle, zeroing
    // the score on every computation — producing the yes/no oscillation the CHW sees.
    // Pushes arrive every ~16 ms during streaming, so last_push_ms_ stays current
    // during normal operation and only ages out when BLE actually disconnects.
    static constexpr int64_t NO_DATA_TIMEOUT_MS = 500;
    bool stale_zeroed = false; // avoid re-publishing zero on every idle tick

    while (!stop_.load(std::memory_order_acquire)) {
        const int rate = sample_rate_.load(std::memory_order_relaxed);
        if (!rate_set_.load(std::memory_order_relaxed)) {
            std::this_thread::sleep_for(std::chrono::milliseconds(20));
            continue;
        }

        // Consume a pending reset — drain rings and reset filter state here on the
        // worker thread, where it is safe to do so without racing push() or pop().
        if (reset_pending_.load(std::memory_order_acquire)) {
            reset_pending_.store(false, std::memory_order_relaxed);
            pcg_ring_.drain();
            ecg_ring_.drain();
            ecg_filter_.reset(); ecg_notch_.reset();
            pcg_filter_.reset(); pcg_notch_.reset();
            slots_[0] = {}; slots_[1] = {};
            slot_seq_[0].store(0, std::memory_order_relaxed);
            slot_seq_[1].store(0, std::memory_order_relaxed);
            last_rate = -1;    // force filter reconfigure on next window
            stale_zeroed = false;
            continue;
        }

        // Reconfigure filters if rate changed
        if (rate != last_rate) {
            reconfigureFilters(rate);
            last_rate = rate;
        }

        const size_t window_n = static_cast<size_t>(2.0 * rate); // 2-second window
        const size_t needed   = window_n < MAX_WINDOW ? window_n : MAX_WINDOW;

        if (pcg_ring_.available() >= needed && ecg_ring_.available() >= needed) {
            pcg_ring_.pop(pcg_win_, needed);
            ecg_ring_.pop(ecg_win_, needed);
            const auto payload = computeWindow(pcg_win_, ecg_win_, needed, rate);
            publish(payload);
            stale_zeroed = false;
        } else {
            // Not enough data yet — check whether pushes have actually stopped.
            const int64_t last_push = last_push_ms_.load(std::memory_order_relaxed);
            const bool no_signal = (last_push > 0) &&
                                   ((nowMs() - last_push) > NO_DATA_TIMEOUT_MS);
            if (no_signal && !stale_zeroed) {
                SqaPayload zero{};
                zero.timestamp_ms = nowMs();
                publish(zero);
                stale_zeroed = true;
                LOGW("No pushes for >%lld ms — zeroing SQI payload",
                     (long long)NO_DATA_TIMEOUT_MS);
            }
        }

        // Poll at ~50 Hz — plenty for 25 Hz JSI read rate
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
}
