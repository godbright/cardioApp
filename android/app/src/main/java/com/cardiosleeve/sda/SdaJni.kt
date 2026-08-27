package com.cardiosleeve.sda

/**
 * JNI surface into the C++ SDA engine.
 *
 * nativeInstall is called once at app start (from SdaJSIPackage on the JS thread)
 * to install global.CardioSqaModule into the Hermes runtime.
 *
 * nativePushSamples is called on the audio callback thread from CardioSleeveService
 * as raw PCG + ECG samples arrive from the hardware.
 */
object SdaJni {
    init {
        System.loadLibrary("CardioSda")
    }

    // Install JSI host object. runtimePtr = JavaScriptContextHolder.get().
    external fun nativeInstall(runtimePtr: Long)

    // Push samples from the audio callback thread (producer side of ring buffer).
    // pcm = PCG float array [-1,1], ecg = ECG float array [-1,1], rateHz = sample rate.
    external fun nativePushSamples(
        pcm: FloatArray?, pcmLen: Int,
        ecg: FloatArray?, ecgLen: Int,
        rateHz: Int,
    )

    // 0 = PCG-only, 1 = ECG-only, 2 = DUAL
    external fun nativeSetMode(mode: Int)

    // Flush ring buffers and zero all DSP state.
    external fun nativeReset()
}
