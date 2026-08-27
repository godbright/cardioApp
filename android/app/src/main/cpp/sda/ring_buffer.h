#pragma once
#include <atomic>
#include <cstring>
#include <cstddef>

// Lock-free single-producer single-consumer ring buffer.
// Producer: Java audio callback thread (pushes samples via JNI).
// Consumer: C++ DSP worker thread (pops windows for processing).
// Uses acquire/release atomics — no mutex, no priority inversion risk.
template<typename T, size_t Capacity>
class RingBuffer {
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be a power of 2");

    T buf_[Capacity];
    std::atomic<size_t> head_{0};  // written by producer
    std::atomic<size_t> tail_{0};  // written by consumer

public:
    // Push up to n elements. Returns true if all were written, false if overflow
    // (producer must not block — drop oldest or skip on overflow).
    bool push(const T* src, size_t n) noexcept {
        const size_t h = head_.load(std::memory_order_relaxed);
        const size_t t = tail_.load(std::memory_order_acquire);
        const size_t free_slots = Capacity - (h - t);
        if (n > free_slots) return false;
        for (size_t i = 0; i < n; ++i)
            buf_[(h + i) & (Capacity - 1)] = src[i];
        head_.store(h + n, std::memory_order_release);
        return true;
    }

    // Pop up to max elements. Returns how many were actually read.
    size_t pop(T* dst, size_t max) noexcept {
        const size_t t = tail_.load(std::memory_order_relaxed);
        const size_t h = head_.load(std::memory_order_acquire);
        const size_t avail = h - t;
        const size_t n = avail < max ? avail : max;
        for (size_t i = 0; i < n; ++i)
            dst[i] = buf_[(t + i) & (Capacity - 1)];
        tail_.store(t + n, std::memory_order_release);
        return n;
    }

    // Peek without consuming (used to check window readiness).
    size_t available() const noexcept {
        const size_t h = head_.load(std::memory_order_acquire);
        const size_t t = tail_.load(std::memory_order_relaxed);
        return h - t;
    }

    void reset() noexcept {
        head_.store(0, std::memory_order_relaxed);
        tail_.store(0, std::memory_order_relaxed);
    }
};
