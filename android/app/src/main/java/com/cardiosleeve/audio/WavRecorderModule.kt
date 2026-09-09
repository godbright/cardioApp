package com.cardiosleeve.audio

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

class WavRecorderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WavRecorder"

    @ReactMethod
    fun start() {
        WavRecorder.start()
    }

    /**
     * Finalises the WAV file on a background thread (SHA-256 + disk write)
     * and resolves the promise with {path, sha256, durationMs} or null on error.
     */
    @ReactMethod
    fun stop(promise: Promise) {
        val ctx = reactApplicationContext
        Thread {
            try {
                val result = WavRecorder.stop(ctx)
                if (result == null) {
                    promise.resolve(null)
                    return@Thread
                }
                val map = WritableNativeMap().apply {
                    putString("path",       result.path)
                    putString("sha256",     result.sha256)
                    putDouble("durationMs", result.durationMs.toDouble())
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("WAV_STOP_ERROR", e.message ?: "Unknown error", e)
            }
        }.apply { name = "WavRecorder-stop" }.start()
    }
}
