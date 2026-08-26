# SDA Module — Implementation Plan

Signal Data Acquisition native module: C++ DSP engine + React Native JSI binding + `useCardioSQI` hook.

---

## Architecture overview

```
CardioSleeve HW
      │  Bluetooth
      ▼
Rijuven Java SDK (Android Service)
      │  JNI
      ▼
C++ DSP & Real-Time SQA Engine
  ├─ Thread-Safe SPSC Ring Buffer
  ├─ 2.0 s Sliding Window (50 % overlap)
  ├─ Bandpass + 50 Hz Notch (IIR Biquad Cascade)
  ├─ ECG metrics: bSQI · kSQI · basSQI
  ├─ PCG metrics: serSQI · eSQI · aSQI
  └─ Multi-Modal Rules Engine → SQA Payload (atomic double-buffer)
      │  JSI
      ▼
C++ Host Object (jsi::HostObject)
  └─ Synchronous zero-copy read
      │
      ▼
useCardioSQI() — React Native hook (25 Hz poll)
      │
      ▼
CaptureScreen  ←  signal-quality bar, voice gate, recording trigger
```

---

## Directory layout

```
android/src/main/
  java/com/cardiosleeve/diagnosticapp/sda/
    CardioSleeveService.kt      ← Rijuven SDK bridge, Android bound service
    SdaJni.kt                   ← Kotlin JNI wrapper (pushSamples, setMode, reset)
  cpp/sda/
    ring_buffer.h               ← SPSC lock-free ring buffer (std::atomic)
    sliding_window.h            ← 2.0 s window extractor
    filter.h / filter.cpp       ← IIR biquad cascade (bandpass + 50 Hz notch)
    ecg_sqi.h / ecg_sqi.cpp     ← bSQI, kSQI, basSQI
    pcg_sqi.h / pcg_sqi.cpp     ← serSQI, eSQI, aSQI (FFT via pffft)
    sqa_engine.h / sqa_engine.cpp ← rules engine, atomic ping-pong payload
    sqa_payload.h               ← plain struct, no virtual methods
    sqa_host_object.h / sqa_host_object.cpp ← jsi::HostObject
    sda_module.cpp              ← JSI module registration
    pffft/                      ← vendored FFT library (BSD-3)
  CMakeLists.txt

src/
  native/NativeSda.ts           ← TypeScript types for the JSI host object
  hooks/useCardioSQI.ts         ← 25 Hz polling hook
```

---

## Layer 1 — Android Service (Rijuven SDK bridge)

`CardioSleeveService.kt` is an Android **bound service** that receives raw PCG + ECG callbacks from the Rijuven SDK and forwards them to the C++ ring buffer via JNI. This is the **only** file that imports Rijuven types; swapping the SDK is a one-file change.

```kotlin
// SdaJni.kt — JNI surface
object SdaJni {
    init { System.loadLibrary("CardioSda") }

    // Called from CardioSleeveService on its audio callback thread
    external fun pushSamples(
        pcm: FloatArray, pcmLen: Int,
        ecg: FloatArray, ecgLen: Int,
        rateHz: Int,
    )
    external fun setMode(mode: Int)   // 0=PCG  1=ECG  2=DUAL
    external fun reset()
}
```

> **Open question:** The exact Rijuven callback signature (sample rate, interleaved vs separate channels, int16 vs float32) is unknown until the SDK arrives. Define a stable internal interface `onSamples(pcm: FloatArray, ecg: FloatArray, rateHz: Int)` so the JNI side is insulated from SDK type changes.

---

## Layer 2 — C++ DSP Engine

### Ring buffer

Single-producer single-consumer (SPSC) with two `std::atomic<size_t>` indices. The Java audio callback is the producer; the DSP window thread is the consumer. No mutex — acquire/release ordering is sufficient and avoids priority inversion on the audio thread.

```cpp
template<typename T, size_t Capacity>
class RingBuffer {
    T    buf_[Capacity];
    std::atomic<size_t> head_{0}, tail_{0};
public:
    bool   push(const T* src, size_t n) noexcept;   // producer
    size_t pop(T* dst, size_t max) noexcept;          // consumer
    size_t available() const noexcept;
};
```

Capacity: `4 × sample_rate` = 2 000 samples per channel at 500 Hz (4 seconds of headroom).

### Sliding window

2.0 s at 500 Hz = 1 000 samples per channel. The DSP worker thread sleeps on a semaphore and wakes when ≥ 1 000 new samples are ready. 50 % overlap is suppressed — window fires on full stride, giving ~2 s latency between quality assessments.

### IIR biquad cascade filter

Direct Form II Transposed — numerically stable for the narrow 50 Hz notch. Coefficients are computed once at module init from the sample rate. **Two separate filter chains** (one ECG, one PCG) maintain independent delay-line state.

```
ECG chain:  0.5 – 40 Hz Butterworth bandpass (4th order) + 50 Hz notch
PCG chain: 25   – 400 Hz Butterworth bandpass (4th order) + 50 Hz notch
```

Use **50 Hz notch** — Rwanda's mains frequency. Not 60 Hz.

---

## Layer 3 — SQI metrics

All six metrics produce a score in **[0, 1]** computed per 2 s window.

### ECG

| Metric | Full name | Method |
|--------|-----------|--------|
| **bSQI** | Beat-based SQI | Pan-Tompkins R-peak detection. Score = `detected_beats / expected_beats` (expected = window_duration × 75 bpm / 60), clamped to [0, 1]. |
| **kSQI** | Kurtosis SQI | Kurtosis of filtered ECG. Sharp R-peaks → kurtosis > 5. Score = `clamp(kurt / 10, 0, 1)`. Low kurtosis = noisy or flat. |
| **basSQI** | Baseline wander SQI | Power ratio: energy below 0.5 Hz / total. Score = `1 − ratio`. High ratio = respiration artifact. |

### PCG

| Metric | Full name | Method |
|--------|-----------|--------|
| **serSQI** | Spectral entropy ratio SQI | Spectral entropy in cardiac band (25–400 Hz) / full spectrum. Structured heart sounds concentrate energy → high score. Computed via pffft. |
| **eSQI** | Energy SQI | RMS of windowed PCG. Score peaks in the clinical range `[RMS_MIN, RMS_MAX]`, falls toward rails (too quiet = poor contact; clipping = saturation). |
| **aSQI** | Amplitude SQI | Peak-to-peak amplitude as fraction of ADC range, combined with autocorrelation periodicity score. Periodic signal at plausible HR → high score. |

---

## Layer 4 — Multi-Modal Rules Engine & SQA Payload

```cpp
// sqa_payload.h
struct SqaPayload {
    float   overall_score;   // 0.0 – 1.0
    float   pcg_score;       // weighted PCG composite
    float   ecg_score;       // weighted ECG composite
    float   ser_sqi, e_sqi, a_sqi;
    float   b_sqi,   k_sqi,  bas_sqi;
    bool    ready;           // true = above threshold → gate recording
    int64_t timestamp_ms;
    uint8_t mode;            // 0=PCG  1=ECG  2=DUAL
};
```

```cpp
// sqa_engine.cpp (simplified)
SqaPayload SqaEngine::compute(const Window& w) {
    SqaPayload p{};
    // ... compute individual metrics ...
    p.ecg_score = 0.40f*p.b_sqi + 0.35f*p.k_sqi + 0.25f*p.bas_sqi;
    p.pcg_score = 0.40f*p.ser_sqi + 0.35f*p.e_sqi + 0.25f*p.a_sqi;

    p.overall_score = (mode_ == Mode::DUAL)
        ? 0.5f*p.pcg_score + 0.5f*p.ecg_score
        : (mode_ == Mode::PCG ? p.pcg_score : p.ecg_score);

    constexpr float THRESH = 0.65f;
    p.ready = p.overall_score >= THRESH;
    p.timestamp_ms = now_ms();
    p.mode = static_cast<uint8_t>(mode_);
    publishAtomic(p);   // ping-pong swap
    return p;
}
```

**Atomic ping-pong:** the DSP thread writes to the shadow slot, then atomically swaps `std::atomic<SqaPayload*>` with `memory_order_release`. The JSI reader uses `memory_order_acquire`. Both slots are pre-allocated — no heap allocation on the hot path.

---

## Layer 5 — JSI Host Object

Installed synchronously on the JS thread at app launch. `getPayload()` reads the atomic slot directly — no bridge, no serialization.

```cpp
// sqa_host_object.cpp
jsi::Value SqaHostObject::get(jsi::Runtime& rt, const jsi::PropNameID& prop) {
    auto name = prop.utf8(rt);

    if (name == "getPayload") {
        return jsi::Function::createFromHostFunction(rt, prop, 0,
            [this](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) {
                auto p   = engine_.readAtomic();
                auto obj = jsi::Object(rt);
                obj.setProperty(rt, "ready",    p.ready);
                obj.setProperty(rt, "score",    (double)p.overall_score);
                obj.setProperty(rt, "pcgScore", (double)p.pcg_score);
                obj.setProperty(rt, "ecgScore", (double)p.ecg_score);
                obj.setProperty(rt, "tsMs",     (double)p.timestamp_ms);
                return obj;
            });
    }
    if (name == "setMode") { /* 0/1/2 → PCG/ECG/DUAL */ }
    if (name == "reset")   { /* flush buffers, zero state */ }
    return jsi::Value::undefined();
}
```

---

## Layer 6 — useCardioSQI hook

```typescript
// src/hooks/useCardioSQI.ts
export interface SqaPayload {
  ready:    boolean;
  score:    number;    // 0 – 1
  pcgScore: number;
  ecgScore: number;
  tsMs:     number;
}

const native = (global as any).CardioSqaModule as {
  getPayload(): SqaPayload;
  setMode(m: number): void;
  reset(): void;
} | undefined;

export function useCardioSQI(
  active: boolean,
  mode:  'pcg' | 'ecg' | 'dual' = 'pcg',
): SqaPayload | null {
  const [payload, setPayload] = useState<SqaPayload | null>(null);

  useEffect(() => {
    if (!active || !native) return;
    native.setMode(mode === 'pcg' ? 0 : mode === 'ecg' ? 1 : 2);
    // 25 Hz poll — JSI is synchronous, zero async overhead
    const id = setInterval(() => setPayload(native.getPayload()), 40);
    return () => { clearInterval(id); native.reset(); };
  }, [active, mode]);

  return payload;
}
```

When `native` is `undefined` (JS-only reload, module not yet built), the hook returns `null`. `CaptureScreen` should treat `null` as zero quality — it won't gate recording or crash.

---

## CMakeLists.txt (key points)

```cmake
cmake_minimum_required(VERSION 3.22)
project(CardioSda)

add_library(CardioSda SHARED
    sda/ring_buffer.cpp
    sda/filter.cpp
    sda/ecg_sqi.cpp
    sda/pcg_sqi.cpp
    sda/sqa_engine.cpp
    sda/sqa_host_object.cpp
    sda/sda_module.cpp
    sda/pffft/pffft.c
)

target_include_directories(CardioSda PRIVATE sda sda/pffft)

target_compile_options(CardioSda PRIVATE -O2 -ffast-math)

find_library(log-lib log)
target_link_libraries(CardioSda android jsi ${log-lib})
```

---

## Best practices

1. **No heap allocation on the audio thread.** Pre-allocate all buffers at module init. The ring buffer uses a fixed-size array.
2. **SPSC ring buffer only — no mutex on the hot path.** `std::atomic` with acquire/release is sufficient; a mutex risks priority inversion on the audio callback.
3. **IIR Direct Form II Transposed for all filters.** More numerically stable than Direct Form I or II, especially for the narrow 50 Hz notch. Verify poles inside the unit circle at init.
4. **50 Hz notch, not 60 Hz.** Rwanda mains frequency is 50 Hz.
5. **Mode parameter gates which metrics run.** In PCG-only mode the ECG metric chain is skipped entirely (saves CPU). Mirrors CLAUDE.md requirement: "accept a mode parameter (PCG or ECG)."
6. **Atomic ping-pong — no mutex on JSI reads.** DSP and JS threads proceed without blocking each other.
7. **pffft for spectral computation.** BSD-3, ~1 000 lines of C, no LGPL complications. Used only for serSQI.
8. **Rijuven SDK isolation.** `CardioSleeveService.kt` is the only file that imports Rijuven types. When the real SDK arrives, only this file changes.
9. **Graceful degradation.** Hook returns `null` when native is absent; CaptureScreen treats `null` as zero quality.
10. **DEMO_MODE bypass.** When `DEMO_MODE = true`, the hook can return a synthetic ramp payload (0 → 1 over 3 s) so the signal-quality UI is exercisable without hardware.

---

## Build order

| Step | Deliverable | Verification |
|------|-------------|--------------|
| 1 | Stub `NativeSda.ts` + `useCardioSQI` returning synthetic payload | Quality bar UI visible in CaptureScreen |
| 2 | Ring buffer, sliding window, filter chain | Unit test: 25 Hz sine through PCG bandpass passes; 50 Hz sine ≥ 40 dB attenuated |
| 3 | SQI metrics | Unit test: synthetic ECG at 75 bpm → bSQI ≥ 0.90; pure noise → bSQI ≤ 0.15 |
| 4 | JSI binding | `global.CardioSqaModule.getPayload()` returns correct values in Flipper |
| 5 | Rijuven integration | Replace synthetic source in `CardioSleeveService.kt` — no other files change |
