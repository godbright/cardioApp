#pragma once

// Output dimensions — must match Stage 1 training pipeline exactly.
static constexpr int MEL_N_MELS    = 64;
static constexpr int MEL_N_FRAMES  = 63;
static constexpr int MEL_OUT_SIZE  = MEL_N_MELS * MEL_N_FRAMES;  // 4032 floats

struct MelResult {
    bool  ok;
    float data[MEL_OUT_SIZE];   // row-major: data[mel * N_FRAMES + frame]
};

// Read a WAV file, resample to 2000 Hz, compute log-mel spectrogram.
// Returns ok=false on file-not-found, format error, or too-short audio.
MelResult computeMelSpec(const char* wav_path);
