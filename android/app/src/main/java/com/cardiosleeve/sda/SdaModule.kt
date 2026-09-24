package com.cardiosleeve.sda

import android.util.Log
import com.cardiosleeve.audio.WavRecorder
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Installs global.CardioSqaModule into the Hermes JSI runtime and provides
 * a bridge method for the BLE data callback to feed PCM samples into the
 * C++ SQI engine.
 *
 * pushBatch() is called from the JS BLE data callback (App.tsx) with each
 * chunk of decoded PCM samples so the SQI engine runs on real audio data.
 * It runs on the React Native native-modules background thread (a single
 * serial thread), which satisfies the SPSC producer constraint as long as
 * CardioSleeveService.onSamples() (the Rijuven SDK path) is not simultaneously
 * active.
 */
class SdaModule(private val ctx: ReactApplicationContext)
    : ReactContextBaseJavaModule(ctx) {

    override fun getName(): String = "CardioSdaInstaller"

    override fun initialize() {
        super.initialize()
        ctx.runOnJSQueueThread {
            try {
                val holder = ctx.javaScriptContextHolder
                val ptr = holder?.get() ?: 0L
                if (ptr != 0L) {
                    SdaJni.nativeInstall(ptr)
                    Log.i(TAG, "CardioSqaModule installed (runtimePtr=0x${ptr.toString(16)})")
                } else {
                    Log.w(TAG, "JSI context unavailable at initialize() — CardioSqaModule not installed")
                }
            } catch (e: Throwable) {
                Log.e(TAG, "CardioSqaModule install failed: ${e.message}", e)
            }
        }
    }

    /**
     * Feed a chunk of PCM samples from the BLE data callback into the C++ SQI engine.
     *
     * @param pcmBase64  Little-endian float32 PCM samples encoded as base64.
     * @param count      Number of samples (pcmBase64 must contain count × 4 bytes).
     * @param rateHz     Sample rate in Hz (2000 for the HLink BLE stream).
     *
     * ECG is not carried in the BLE stream — passes an all-zero ECG channel so
     * the engine evaluates PCG SQI (mode must be set to PCG or DUAL by JS).
     */
    @ReactMethod
    fun pushBatch(pcmBase64: String, count: Int, rateHz: Int) {
        if (count <= 0) return
        try {
            val pcmBytes = android.util.Base64.decode(pcmBase64, android.util.Base64.NO_WRAP)
            val bb = ByteBuffer.wrap(pcmBytes).order(ByteOrder.LITTLE_ENDIAN)
            val pcmArr = FloatArray(count) { if (bb.hasRemaining()) bb.float else 0f }
            val ecgArr = FloatArray(count) // ECG not in BLE stream
            SdaJni.nativePushSamples(pcmArr, count, ecgArr, count, rateHz)
            // Also feed the on-device WAV recorder so it captures real BLE audio
            // when the user presses Record. WavRecorder.feed() is a no-op when not
            // recording (start() hasn't been called yet), so it is safe to call here
            // continuously throughout the BLE session.
            WavRecorder.feed(pcmArr, rateHz)
        } catch (e: Throwable) {
            Log.w(TAG, "pushBatch failed: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "SdaModule"
    }
}
