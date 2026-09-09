package com.cardiosleeve.sda

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import com.cardiosleeve.audio.WavRecorder
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Stubbed Android bound service that will bridge the Rijuven CardioSleeve SDK
 * into the C++ SDA engine once the SDK is available.
 *
 * OPEN QUESTION (CLAUDE.md): The Rijuven SDK delivery format (compiled AAR,
 * plain protocol doc, or header-only) is not yet confirmed.  The internal
 * callback interface below is stable — only this file changes when the real
 * SDK arrives.
 *
 * Stable internal interface the JNI layer depends on:
 *   onSamples(pcm: FloatArray, ecg: FloatArray, rateHz: Int)
 *
 * When the SDK is integrated, register this service in AndroidManifest.xml and
 * bind to it from the Bluetooth connection layer.
 */
class CardioSleeveService : Service() {

    companion object {
        private const val TAG = "CardioSleeveService"

        // Simulated sample rate until SDK confirms the actual value.
        // Update this when the Rijuven protocol documentation arrives.
        const val SIMULATED_RATE_HZ = 500

        // Frame size fed to the ring buffer every 20 ms at 500 Hz.
        private const val SYNTHETIC_FRAME_SAMPLES = 128
        private const val SYNTHETIC_FRAME_INTERVAL_MS = 20L
    }

    private val syntheticRunning = AtomicBoolean(false)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "CardioSleeveService created (SDK stub — awaiting Rijuven integration)")
    }

    override fun onDestroy() {
        super.onDestroy()
        stopSyntheticStream()
        SdaJni.nativeReset()
    }

    /**
     * Called by the Rijuven SDK audio callback (producer thread).
     * Forwards raw float samples into the C++ ring buffer.
     *
     * pcm  — PCG audio samples, normalised to [-1, 1]
     * ecg  — ECG samples, normalised to [-1, 1], same length as pcm
     * rateHz — sample rate in Hz (both channels share the same clock)
     */
    fun onSamples(pcm: FloatArray, ecg: FloatArray, rateHz: Int) {
        SdaJni.nativePushSamples(pcm, pcm.size, ecg, ecg.size, rateHz)
        // Feed PCM into the WAV recorder; no-ops when not recording.
        WavRecorder.feed(pcm, rateHz)
    }

    // ── Stub helpers for development / demo testing ───────────────────────────

    /**
     * Starts a background thread that pushes synthetic frames every 20 ms,
     * exercising the full C++ ring-buffer → filter → SQI → JSI pipeline
     * without real hardware. Call once; safe to call again after stop.
     * Remove once the real SDK is integrated.
     */
    fun startSyntheticStream() {
        if (!syntheticRunning.compareAndSet(false, true)) return
        Thread({
            Log.i(TAG, "Synthetic stream started at ${SIMULATED_RATE_HZ} Hz")
            while (syntheticRunning.get()) {
                pushSyntheticFrame()
                Thread.sleep(SYNTHETIC_FRAME_INTERVAL_MS)
            }
            Log.i(TAG, "Synthetic stream stopped")
        }, "CardioSleeve-SyntheticStream").apply { isDaemon = true; start() }
    }

    fun stopSyntheticStream() {
        syntheticRunning.set(false)
    }

    /**
     * Feed one synthetic frame into the ring buffer.
     * Used during development to exercise the DSP pipeline before the real SDK.
     * Remove once the SDK is integrated.
     */
    fun pushSyntheticFrame(rateHz: Int = SIMULATED_RATE_HZ, frameSamples: Int = SYNTHETIC_FRAME_SAMPLES) {
        val pcm = FloatArray(frameSamples) { i ->
            (Math.sin(2.0 * Math.PI * 80.0 * i / rateHz) * 0.5 +
             Math.sin(2.0 * Math.PI * 160.0 * i / rateHz) * 0.2).toFloat()
        }
        val ecg = FloatArray(frameSamples) { i ->
            // Synthetic QRS-like spike every ~600 ms
            val t = (i.toDouble() / rateHz) % 0.8
            if (t < 0.02) (Math.exp(-((t - 0.01) * 500).let { it * it }) * 0.9).toFloat() else 0f
        }
        onSamples(pcm, ecg, rateHz)
    }
}
