How React Native native modules work
React Native runs your TypeScript in a JavaScript engine (Hermes on Android). Separately, the Android app has a full Kotlin/Java runtime. The two sides talk through a bridge: TypeScript calls a native method, the bridge serialises the arguments, Kotlin runs the actual work, then either resolves a Promise or fires an Event back to the JS side.


TypeScript (JS thread)
       │
       │  NativeModules.SignalQuality.analyzeChunk(data)
       │
       ▼
   RN Bridge (serialise args)
       │
       ▼
   Kotlin (main/background thread)
       │  ← your actual DSP code lives here
       │  ← Rijuven SDK calls live here
       │
       ▼
   Bridge (serialise result)
       │
       ▼
TypeScript receives Promise result or Event
You write the Kotlin side, register it with React Native, then call it from TypeScript like any async function. That's it.

What the file structure looks like

android/
└── app/
    └── src/
        └── main/
            └── java/
                └── com/cardiosleeve/app/
                    ├── MainApplication.kt        ← registers your modules
                    │
                    ├── modules/
                    │   ├── SignalQualityModule.kt
                    │   ├── SignalQualityPackage.kt
                    │   ├── CardioSleeveModule.kt  ← replaces/wraps Rijuven SDK
                    │   └── CardioSleevePackage.kt
                    │
                    └── libs/                     ← Rijuven SDK .aar goes here
                        └── cardiosleeve-sdk.aar

src/
└── native/
    ├── NativeSignalQuality.ts   ← TS wrapper that calls Kotlin
    └── NativeCardioSleeve.ts    ← TS wrapper (replaces bluetooth.ts eventually)
The DSP signal quality module
Kotlin side — SignalQualityModule.kt:


package com.cardiosleeve.app.modules

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.*

@ReactModule(name = SignalQualityModule.NAME)
class SignalQualityModule(private val ctx: ReactApplicationContext)
  : ReactContextBaseJavaModule(ctx) {

  companion object { const val NAME = "SignalQuality" }
  override fun getName() = NAME

  /**
   * Analyse one chunk of raw PCG samples.
   * Called from JS every ~100 ms with the latest buffer from the BT stream.
   * Returns a quality map so JS can drive voice guidance and the recording gate.
   */
  @ReactMethod
  fun analyzeChunk(samplesArray: ReadableArray, sampleRate: Int, promise: Promise) {
    // Collect Float samples from the JS array
    val samples = FloatArray(samplesArray.size()) { samplesArray.getDouble(it).toFloat() }

    try {
      val rms        = computeRms(samples)
      val clipping   = detectClipping(samples)
      val bandEnergy = bandEnergyRatio(samples, sampleRate)
      val periodicity = periodicityScore(samples, sampleRate)

      // Composite quality 0.0 – 1.0
      val quality = when {
        clipping          -> 0.0f
        rms < RMS_FLOOR   -> 0.0f
        else -> (bandEnergy * 0.5f + periodicity * 0.5f).coerceIn(0f, 1f)
      }

      val result = Arguments.createMap().apply {
        putDouble("quality",     quality.toDouble())
        putDouble("rms",         rms.toDouble())
        putBoolean("clipping",   clipping)
        putDouble("bandEnergy",  bandEnergy.toDouble())
        putDouble("periodicity", periodicity.toDouble())
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("DSP_ERROR", e.message, e)
    }
  }

  /**
   * Start continuous quality monitoring on a background thread.
   * Emits "onQualityUpdate" events to JS rather than using polling promises —
   * better for a real-time feedback loop driving voice guidance.
   */
  @ReactMethod
  fun startMonitoring(sampleRate: Int) {
    // In the real implementation this registers a listener on the
    // BT data stream and processes chunks on a HandlerThread.
    // Events fire at ~10 Hz — fast enough for voice feedback without
    // flooding the bridge.
  }

  @ReactMethod fun stopMonitoring() { /* tear down listener */ }

  // Required boilerplate for event emitters
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  // ── DSP helpers ────────────────────────────────────────────────────────────

  private fun computeRms(samples: FloatArray): Float {
    val sum = samples.fold(0.0) { acc, s -> acc + s * s }
    return sqrt(sum / samples.size).toFloat()
  }

  private fun detectClipping(samples: FloatArray): Boolean =
    samples.count { abs(it) > CLIP_THRESHOLD }.toFloat() / samples.size > 0.01f

  private fun bandEnergyRatio(samples: FloatArray, sampleRate: Int): Float {
    // FFT → sum energy in the PCG band (20–950 Hz) vs total energy.
    // Android's built-in FFT via AudioRecord is available here;
    // or use KissFFT / FFTW via JNI for a more complete implementation.
    // Stub returns 0.5 until wired to a real FFT.
    return 0.5f
  }

  private fun periodicityScore(samples: FloatArray, sampleRate: Int): Float {
    // Autocorrelation at expected cardiac lags (0.5–2.0 s at this sample rate).
    // A high peak at a physiologically plausible lag = periodic cardiac signal.
    return 0.5f
  }

  companion object {
    private const val RMS_FLOOR       = 0.01f   // below this = no contact
    private const val CLIP_THRESHOLD  = 0.95f   // normalised sample magnitude
  }
}
Registration — SignalQualityPackage.kt:


package com.cardiosleeve.app.modules

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SignalQualityPackage : ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
    listOf(SignalQualityModule(ctx))
  override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
Wire it into MainApplication.kt:


override fun getPackages(): List<ReactPackage> = listOf(
  MainReactPackage(),
  SignalQualityPackage(),   // ← add this
  CardioSleevePackage(),    // ← and this (see below)
)
TypeScript wrapper — src/native/NativeSignalQuality.ts:


import { NativeModules, NativeEventEmitter } from 'react-native';

const { SignalQuality } = NativeModules;
const emitter = new NativeEventEmitter(SignalQuality);

export interface QualityResult {
  quality:     number;   // 0.0 – 1.0 composite score
  rms:         number;
  clipping:    boolean;
  bandEnergy:  number;
  periodicity: number;
}

/** One-shot analysis of a PCG chunk. Use for testing / debug views. */
export function analyzeChunk(samples: number[], sampleRate: number): Promise<QualityResult> {
  return SignalQuality.analyzeChunk(samples, sampleRate);
}

/** Subscribe to continuous quality events. Returns an unsubscribe function. */
export function onQualityUpdate(cb: (result: QualityResult) => void): () => void {
  const sub = emitter.addListener('onQualityUpdate', cb);
  SignalQuality.startMonitoring(4000);  // 4 kHz PCG sample rate
  return () => {
    SignalQuality.stopMonitoring();
    sub.remove();
  };
}
The CaptureScreen calls onQualityUpdate() on mount and gets live quality scores to drive voice guidance. No polling, no JS-side DSP math.

The CardioSleeve SDK module
When Rijuven delivers their SDK as an .aar file, this is how it slots in:

android/app/build.gradle — reference the SDK:


dependencies {
  implementation fileTree(dir: 'libs', include: ['*.aar', '*.jar'])
  // ... existing deps
}
CardioSleeveModule.kt — wraps the SDK and exposes it to JS:


package com.cardiosleeve.app.modules

import com.rijuven.cardiosleeve.CardioSleeveSDK     // ← Rijuven's actual class
import com.rijuven.cardiosleeve.CardioSleeveListener
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

@ReactModule(name = CardioSleeveModule.NAME)
class CardioSleeveModule(private val ctx: ReactApplicationContext)
  : ReactContextBaseJavaModule(ctx) {

  companion object { const val NAME = "CardioSleeveNative" }
  override fun getName() = NAME

  private var sdk: CardioSleeveSDK? = null

  @ReactMethod
  fun connect(address: String, promise: Promise) {
    try {
      sdk = CardioSleeveSDK.connect(address, object : CardioSleeveListener {
        override fun onPcgSample(sample: FloatArray, timestampMs: Long) {
          // Forward raw PCG samples to JS as a ReadableArray event
          val arr = Arguments.createArray()
          sample.forEach { arr.pushDouble(it.toDouble()) }
          emit("onPcgData", Arguments.createMap().apply {
            putArray("samples", arr)
            putDouble("ts", timestampMs.toDouble())
          })
        }
        override fun onEcgSample(sample: FloatArray, timestampMs: Long) {
          val arr = Arguments.createArray()
          sample.forEach { arr.pushDouble(it.toDouble()) }
          emit("onEcgData", Arguments.createMap().apply {
            putArray("samples", arr)
            putDouble("ts", timestampMs.toDouble())
          })
        }
        override fun onDisconnected() {
          emit("onDisconnected", Arguments.createMap())
        }
        override fun onError(message: String) {
          emit("onError", Arguments.createMap().apply { putString("message", message) })
        }
      })
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("CONNECT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    sdk?.disconnect()
    sdk = null
    promise.resolve(null)
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  private fun emit(event: String, data: WritableMap) {
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, data)
  }
}
TypeScript side — src/native/NativeCardioSleeve.ts:


import { NativeModules, NativeEventEmitter } from 'react-native';

const { CardioSleeveNative } = NativeModules;
const emitter = new NativeEventEmitter(CardioSleeveNative);

export interface PcgDataEvent { samples: number[]; ts: number; }
export interface EcgDataEvent { samples: number[]; ts: number; }

export const CardioSleeveDriver = {
  connect:    (address: string) => CardioSleeveNative.connect(address)    as Promise<void>,
  disconnect: ()                => CardioSleeveNative.disconnect()         as Promise<void>,

  onPcgData:      (cb: (e: PcgDataEvent) => void) => emitter.addListener('onPcgData',      cb),
  onEcgData:      (cb: (e: EcgDataEvent) => void) => emitter.addListener('onEcgData',      cb),
  onDisconnected: (cb: () => void)                 => emitter.addListener('onDisconnected', cb),
  onError:        (cb: (e: { message: string }) => void) => emitter.addListener('onError', cb),
};
The existing bluetooth.ts service calls CardioSleeveDriver.connect() instead of react-native-bluetooth-classic once the SDK lands. The rest of the app doesn't change — it still talks to BluetoothService, which internally switches its implementation.

Where C/C++ fits in (JNI)
For the FFT and autocorrelation in the DSP module, pure Kotlin is fine for a prototype but gets slow on a budget tablet once you need real-time 4 kHz processing. The option is to drop a C library (FFTW, KissFFT, or Oboe) into the native layer:


android/app/src/main/
├── cpp/
│   ├── CMakeLists.txt
│   ├── dsp.cpp          ← FFT + mel-spectrogram in C++
│   └── dsp.h
└── java/com/cardiosleeve/app/modules/
    └── SignalQualityModule.kt   ← calls System.loadLibrary("dsp") then JNI methods
SignalQualityModule.kt loads the native library once and delegates the heavy math to it:


external fun nativeAnalyzeChunk(samples: FloatArray, sampleRate: Int): FloatArray

companion object {
  init { System.loadLibrary("dsp") }
}
This is exactly how TensorFlow Lite works in react-native-fast-tflite — Kotlin module on top, native C++ inference engine underneath, TypeScript calls Kotlin, Kotlin calls C++.

Summary of the two-module plan
Module	Kotlin file	What it does	Replaces
SignalQualityModule	SignalQualityModule.kt	FFT, band-energy ratio, RMS, clipping, periodicity — emits quality score events	JS-side quality stubs in CaptureScreen
CardioSleeveModule	CardioSleeveModule.kt	Wraps Rijuven SDK, emits PCG + ECG sample events	react-native-bluetooth-classic for data streaming
Both modules are isolated: TypeScript only sees the exported functions and events. Swapping the Rijuven SDK in is a change inside CardioSleeveModule.kt — the JS side (bluetooth.ts and CaptureScreen) don't change at all.