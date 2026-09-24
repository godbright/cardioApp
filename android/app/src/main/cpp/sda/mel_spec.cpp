#include "mel_spec.h"
#include <cmath>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <algorithm>
#include <android/log.h>

#define LOG_TAG "MelSpec"
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ── Spectrogram parameters ────────────────────────────────────────────────────
static constexpr int   N_FFT      = 256;
static constexpr int   HOP        = 64;
static constexpr int   N_MELS     = MEL_N_MELS;
static constexpr int   N_FRAMES   = MEL_N_FRAMES;
static constexpr int   TARGET_SR  = 2000;
static constexpr float FMIN       = 25.0f;
static constexpr float FMAX       = 800.0f;
static constexpr float LOG_EPS    = 1e-9f;
static constexpr int   N_BINS     = N_FFT / 2 + 1;     // 129

// Samples needed for N_FRAMES frames: N_FFT + (N_FRAMES-1)*HOP = 4224
static constexpr int   NEEDED     = N_FFT + (N_FRAMES - 1) * HOP;

// ── WAV reader ────────────────────────────────────────────────────────────────

static uint16_t readLE16(const uint8_t* p) {
    return (uint16_t)(p[0] | (p[1] << 8));
}
static uint32_t readLE32(const uint8_t* p) {
    return (uint32_t)(p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24));
}

struct WavInfo {
    int      sample_rate;
    int      channels;
    int      bits;
    long     data_offset;
    uint32_t data_bytes;
};

static bool parseWav(FILE* f, WavInfo& w) {
    char tag[4];
    uint8_t hdr[12];

    if (fread(hdr, 1, 12, f) != 12) return false;
    if (memcmp(hdr,     "RIFF", 4) != 0) return false;
    if (memcmp(hdr + 8, "WAVE", 4) != 0) return false;

    uint8_t buf[8];
    bool got_fmt = false, got_data = false;
    while (!got_data && fread(buf, 1, 8, f) == 8) {
        memcpy(tag, buf, 4);
        uint32_t sz = readLE32(buf + 4);

        if (memcmp(tag, "fmt ", 4) == 0 && sz >= 16) {
            uint8_t fmt[16];
            if (fread(fmt, 1, 16, f) != 16) return false;
            if (readLE16(fmt) != 1) return false;          // PCM only
            w.channels    = (int)readLE16(fmt + 2);
            w.sample_rate = (int)readLE32(fmt + 4);
            w.bits        = (int)readLE16(fmt + 14);
            if (sz > 16) fseek(f, (long)(sz - 16), SEEK_CUR);
            got_fmt = true;
        } else if (memcmp(tag, "data", 4) == 0) {
            w.data_offset = ftell(f);
            w.data_bytes  = sz;
            got_data = true;
        } else {
            fseek(f, (long)sz, SEEK_CUR);
        }
    }
    return got_fmt && got_data;
}

// ── FFT (radix-2 DIT Cooley-Tukey; N must be a power of 2) ───────────────────

static void fft(float* re, float* im, int N) {
    // bit-reversal permutation
    for (int i = 1, j = 0; i < N; i++) {
        int bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { std::swap(re[i], re[j]); std::swap(im[i], im[j]); }
    }
    // butterfly stages
    for (int len = 2; len <= N; len <<= 1) {
        const float ang = -(float)M_PI * 2.0f / (float)len;
        const float wR  = cosf(ang), wI = sinf(ang);
        for (int i = 0; i < N; i += len) {
            float pR = 1.0f, pI = 0.0f;
            for (int j = 0; j < len / 2; j++) {
                float uR = re[i + j],           uI = im[i + j];
                float vR = re[i+j+len/2]*pR - im[i+j+len/2]*pI;
                float vI = re[i+j+len/2]*pI + im[i+j+len/2]*pR;
                re[i + j]         = uR + vR;  im[i + j]         = uI + vI;
                re[i+j+len/2]     = uR - vR;  im[i+j+len/2]     = uI - vI;
                float nR = pR*wR - pI*wI;
                pI = pR*wI + pI*wR;
                pR = nR;
            }
        }
    }
}

// ── Mel filterbank (built once, reused across calls) ─────────────────────────

static float MEL_FB[N_MELS][N_BINS];
static float HANN[N_FFT];
static bool  STATICS_BUILT = false;

static float hzToMel(float hz) { return 2595.0f * log10f(1.0f + hz / 700.0f); }
static float melToHz(float mel) { return 700.0f * (powf(10.0f, mel / 2595.0f) - 1.0f); }

static void buildStatics() {
    if (STATICS_BUILT) return;

    // Hann window
    for (int i = 0; i < N_FFT; i++) {
        HANN[i] = 0.5f * (1.0f - cosf(2.0f * (float)M_PI * i / (float)(N_FFT - 1)));
    }

    // Mel filterbank: N_MELS+2 equally-spaced mel-scale points → triangular filters
    const float mel_lo = hzToMel(FMIN);
    const float mel_hi = hzToMel(FMAX);

    float pts_hz[N_MELS + 2];
    for (int i = 0; i < N_MELS + 2; i++) {
        float mel = mel_lo + (mel_hi - mel_lo) * i / (float)(N_MELS + 1);
        pts_hz[i] = melToHz(mel);
    }

    // Continuous FFT bin index for each mel point
    float pts_bin[N_MELS + 2];
    for (int i = 0; i < N_MELS + 2; i++) {
        pts_bin[i] = pts_hz[i] * (float)N_FFT / (float)TARGET_SR;
    }

    memset(MEL_FB, 0, sizeof(MEL_FB));
    for (int m = 0; m < N_MELS; m++) {
        const float lo  = pts_bin[m];
        const float ctr = pts_bin[m + 1];
        const float hi  = pts_bin[m + 2];
        for (int k = 0; k < N_BINS; k++) {
            const float fk = (float)k;
            if (fk >= lo  && fk <= ctr && ctr > lo)
                MEL_FB[m][k] = (fk - lo)  / (ctr - lo);
            else if (fk > ctr && fk <= hi && hi > ctr)
                MEL_FB[m][k] = (hi - fk)  / (hi - ctr);
        }
    }
    STATICS_BUILT = true;
}

// ── Public entry point ────────────────────────────────────────────────────────

MelResult computeMelSpec(const char* wav_path) {
    MelResult out{};
    out.ok = false;

    buildStatics();

    FILE* f = fopen(wav_path, "rb");
    if (!f) { LOGE("Cannot open WAV: %s", wav_path); return out; }

    WavInfo wi{};
    if (!parseWav(f, wi)) {
        LOGE("Bad WAV format: %s", wav_path); fclose(f); return out;
    }
    if (wi.bits != 16) {
        LOGE("Only 16-bit WAV supported (got %d)", wi.bits); fclose(f); return out;
    }

    const int frame_bytes   = wi.channels * 2;
    const int total_frames  = (int)(wi.data_bytes / (uint32_t)frame_bytes);

    // Resample to TARGET_SR via linear interpolation
    const double ratio      = (double)TARGET_SR / wi.sample_rate;
    const int    n_resampled = (int)(total_frames * ratio);

    if (n_resampled < NEEDED) {
        LOGE("WAV too short: %d resampled samples, need %d", n_resampled, NEEDED);
        fclose(f); return out;
    }

    // Read raw 16-bit samples from file
    const int n_raw = total_frames * wi.channels;
    int16_t* raw    = (int16_t*)malloc(n_raw * sizeof(int16_t));
    if (!raw) { fclose(f); return out; }

    fseek(f, wi.data_offset, SEEK_SET);
    fread(raw, sizeof(int16_t), n_raw, f);
    fclose(f);

    // Convert to float mono
    float* mono = (float*)malloc(total_frames * sizeof(float));
    if (!mono) { free(raw); return out; }
    for (int i = 0; i < total_frames; i++) {
        float s = 0.0f;
        for (int ch = 0; ch < wi.channels; ch++)
            s += (float)raw[i * wi.channels + ch] / 32768.0f;
        mono[i] = s / wi.channels;
    }
    free(raw);

    // Resample
    float* resampled = (float*)malloc(n_resampled * sizeof(float));
    if (!resampled) { free(mono); return out; }
    for (int i = 0; i < n_resampled; i++) {
        const double pos = i / ratio;
        const int    i0  = (int)pos;
        const int    i1  = std::min(i0 + 1, total_frames - 1);
        const float  a   = (float)(pos - i0);
        resampled[i] = mono[i0] * (1.0f - a) + mono[i1] * a;
    }
    free(mono);

    // Take center segment of NEEDED samples
    const int offset = (n_resampled - NEEDED) / 2;

    // STFT + mel filterbank + log compression
    float frame_re[N_FFT], frame_im[N_FFT];
    for (int t = 0; t < N_FRAMES; t++) {
        const int start = offset + t * HOP;
        for (int i = 0; i < N_FFT; i++) {
            frame_re[i] = resampled[start + i] * HANN[i];
            frame_im[i] = 0.0f;
        }
        fft(frame_re, frame_im, N_FFT);

        // Power spectrum for positive-frequency bins
        float power[N_BINS];
        for (int k = 0; k < N_BINS; k++) {
            power[k] = frame_re[k]*frame_re[k] + frame_im[k]*frame_im[k];
        }

        // Mel filterbank → log-compress → store row-major [mel][frame]
        for (int m = 0; m < N_MELS; m++) {
            float e = 0.0f;
            for (int k = 0; k < N_BINS; k++) e += MEL_FB[m][k] * power[k];
            out.data[m * N_FRAMES + t] = logf(e + LOG_EPS);
        }
    }

    free(resampled);

    // Per-spectrogram z-score normalization.
    // Training preprocessing assumption: (logmel - mean) / (std + ε).
    // This is the most common convention for MobileNet/CNN phonocardiogram models.
    // If the training pipeline uses global dataset statistics instead, replace
    // GLOBAL_MEAN / GLOBAL_STD constants here once the values are exported from training.
    {
        float sum = 0.0f, sq_sum = 0.0f;
        for (int i = 0; i < MEL_OUT_SIZE; i++) sum += out.data[i];
        const float mean = sum / MEL_OUT_SIZE;
        for (int i = 0; i < MEL_OUT_SIZE; i++) {
            const float d = out.data[i] - mean;
            sq_sum += d * d;
        }
        const float std_dev = sqrtf(sq_sum / MEL_OUT_SIZE + 1e-8f);
        for (int i = 0; i < MEL_OUT_SIZE; i++)
            out.data[i] = (out.data[i] - mean) / std_dev;
    }

    out.ok = true;
    return out;
}
