package com.cardiosleeve.sda

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

/**
 * Installs global.CardioSqaModule into the Hermes JSI runtime.
 *
 * initialize() is called by React Native after the bridge is created and the JS
 * thread is running. We schedule the install on the JS queue thread so the JSI
 * runtime pointer is valid when we call into C++.
 *
 * No @ReactMethod is exposed — this module exists purely as an installation hook.
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

    companion object {
        private const val TAG = "SdaModule"
    }
}
