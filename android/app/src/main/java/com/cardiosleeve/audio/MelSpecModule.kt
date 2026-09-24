package com.cardiosleeve.audio

import com.cardiosleeve.sda.SdaJni
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Exposes nativeComputeMelSpec to JS as NativeModules.MelSpec.computeMelSpec(path).
 * Resolves with a JS number array of 4032 floats (64 mel bins × 63 frames),
 * or null if the WAV file could not be processed.
 */
class MelSpecModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MelSpec"

    @ReactMethod
    fun computeMelSpec(wavPath: String, promise: Promise) {
        Thread {
            try {
                val floats = SdaJni.nativeComputeMelSpec(wavPath)
                if (floats == null) {
                    promise.resolve(null)
                    return@Thread
                }
                val arr = Arguments.createArray()
                for (v in floats) arr.pushDouble(v.toDouble())
                promise.resolve(arr)
            } catch (e: Exception) {
                promise.reject("MEL_SPEC_ERROR", e.message ?: "Unknown error", e)
            }
        }.apply { name = "MelSpec-compute" }.start()
    }
}
