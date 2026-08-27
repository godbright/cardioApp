#include <jni.h>
#include <jsi/jsi.h>
#include <android/log.h>
#include <memory>
#include "sqa_engine.h"
#include "sqa_host_object.h"

#define LOG_TAG "SdaModule"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// Singleton engine — lives for the app lifetime.
// Shared_ptr is safe: host object and JNI layer both hold a reference.
static std::shared_ptr<SqaEngine> g_engine;

// ── JNI entry points (called from Kotlin SdaJni) ─────────────────────────────

extern "C" {

// Install the JSI host object on global.CardioSqaModule.
// runtimePtr is the jsi::Runtime* cast to jlong (from JavaScriptContextHolder.get()).
JNIEXPORT void JNICALL
Java_com_cardiosleeve_sda_SdaJni_nativeInstall(JNIEnv*, jobject, jlong runtimePtr) {
    if (runtimePtr == 0) {
        LOGE("nativeInstall: null runtime pointer");
        return;
    }
    auto& runtime = *reinterpret_cast<facebook::jsi::Runtime*>(runtimePtr);
    g_engine = std::make_shared<SqaEngine>();

    auto hostObj = std::make_shared<SqaHostObject>(g_engine);
    runtime.global().setProperty(
        runtime,
        "CardioSqaModule",
        facebook::jsi::Object::createFromHostObject(runtime, std::move(hostObj))
    );
    LOGI("CardioSqaModule installed on JSI global");
}

// Push raw samples from the Java audio callback thread.
JNIEXPORT void JNICALL
Java_com_cardiosleeve_sda_SdaJni_nativePushSamples(
        JNIEnv* env, jobject,
        jfloatArray j_pcg, jint pcg_len,
        jfloatArray j_ecg, jint ecg_len,
        jint rate_hz) {
    if (!g_engine) return;

    jfloat* pcm_ptr = j_pcg ? env->GetFloatArrayElements(j_pcg, nullptr) : nullptr;
    jfloat* ecg_ptr = j_ecg ? env->GetFloatArrayElements(j_ecg, nullptr) : nullptr;

    g_engine->push(
        pcm_ptr, static_cast<size_t>(pcg_len),
        ecg_ptr, static_cast<size_t>(ecg_len),
        static_cast<int>(rate_hz)
    );

    if (pcm_ptr) env->ReleaseFloatArrayElements(j_pcg, pcm_ptr, JNI_ABORT);
    if (ecg_ptr) env->ReleaseFloatArrayElements(j_ecg, ecg_ptr, JNI_ABORT);
}

// Set operating mode (0=PCG, 1=ECG, 2=DUAL).
JNIEXPORT void JNICALL
Java_com_cardiosleeve_sda_SdaJni_nativeSetMode(JNIEnv*, jobject, jint mode) {
    if (!g_engine) return;
    g_engine->setMode(mode == 1 ? SqaMode::ECG
                    : mode == 2 ? SqaMode::DUAL
                                : SqaMode::PCG);
}

// Reset — flush buffers and zero state.
JNIEXPORT void JNICALL
Java_com_cardiosleeve_sda_SdaJni_nativeReset(JNIEnv*, jobject) {
    if (g_engine) g_engine->reset();
}

} // extern "C"
