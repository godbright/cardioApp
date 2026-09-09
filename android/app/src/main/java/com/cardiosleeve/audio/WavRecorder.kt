package com.cardiosleeve.audio

import android.content.Context
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.UUID

/**
 * Thread-safe singleton that buffers PCM samples delivered by the CardioSleeve
 * audio callback and writes a properly-formatted WAV file when stopped.
 *
 * Usage:
 *   WavRecorder.start()                  // call once when recording phase begins
 *   WavRecorder.feed(pcm, rateHz)        // call from the audio producer thread
 *   val result = WavRecorder.stop(ctx)   // call from any thread; returns null on error
 */
object WavRecorder {
    private const val TAG           = "WavRecorder"
    private const val BITS_PER_SAMPLE = 16
    private const val CHANNELS        = 1

    private val lock = Any()
    private var buffer: ByteArrayOutputStream? = null
    private var sampleRate  = 0
    private var startTimeMs = 0L
    private var recording   = false

    data class WavResult(val path: String, val sha256: String, val durationMs: Long)

    fun start() {
        synchronized(lock) {
            buffer      = ByteArrayOutputStream()
            sampleRate  = 0
            startTimeMs = System.currentTimeMillis()
            recording   = true
        }
        Log.i(TAG, "Recording started")
    }

    /**
     * Appends PCM samples from the audio producer thread.
     * Converts float [-1, 1] to signed 16-bit little-endian shorts.
     * No-ops when not recording (safe to call unconditionally in onSamples).
     */
    fun feed(pcm: FloatArray, rateHz: Int) {
        synchronized(lock) {
            if (!recording) return
            if (sampleRate == 0) sampleRate = rateHz

            val bytes = ByteArray(pcm.size * 2)
            val bb    = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            for (s in pcm) {
                bb.putShort((s.coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort())
            }
            buffer!!.write(bytes)
        }
    }

    /**
     * Stops recording, writes the WAV file to
     * <ExternalFilesDir>/recordings/<uuid>.wav, and returns the result.
     * Returns null if no samples were captured or if the write fails.
     * Safe to call from any thread.
     */
    fun stop(context: Context): WavResult? {
        val pcmData: ByteArray
        val rate:    Int
        val elapsed: Long

        synchronized(lock) {
            recording = false
            pcmData   = buffer?.toByteArray() ?: return null
            rate      = if (sampleRate > 0) sampleRate else return null
            elapsed   = System.currentTimeMillis() - startTimeMs
            buffer    = null
        }

        if (pcmData.isEmpty()) {
            Log.w(TAG, "stop() called with empty buffer — no WAV written")
            return null
        }

        return try {
            val dir  = File(context.getExternalFilesDir(null), "recordings").also { it.mkdirs() }
            val file = File(dir, "${UUID.randomUUID()}.wav")

            val wavBytes = buildWav(pcmData, rate)
            FileOutputStream(file).use { it.write(wavBytes) }

            val sha256 = sha256Hex(wavBytes)
            Log.i(TAG, "WAV saved → ${file.absolutePath} (${wavBytes.size} bytes, ${elapsed} ms, sha256=${sha256.take(12)}…)")
            WavResult(file.absolutePath, sha256, elapsed)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write WAV: ${e.message}")
            null
        }
    }

    private fun buildWav(pcmData: ByteArray, rate: Int): ByteArray {
        val dataSize   = pcmData.size
        val byteRate   = rate * CHANNELS * BITS_PER_SAMPLE / 8
        val blockAlign = CHANNELS * BITS_PER_SAMPLE / 8
        val buf = ByteBuffer.allocate(44 + dataSize).order(ByteOrder.LITTLE_ENDIAN)

        buf.put("RIFF".toByteArray(Charsets.US_ASCII))
        buf.putInt(36 + dataSize)           // ChunkSize = total - 8
        buf.put("WAVE".toByteArray(Charsets.US_ASCII))
        buf.put("fmt ".toByteArray(Charsets.US_ASCII))
        buf.putInt(16)                      // Subchunk1Size (PCM)
        buf.putShort(1)                     // AudioFormat: PCM
        buf.putShort(CHANNELS.toShort())
        buf.putInt(rate)
        buf.putInt(byteRate)
        buf.putShort(blockAlign.toShort())
        buf.putShort(BITS_PER_SAMPLE.toShort())
        buf.put("data".toByteArray(Charsets.US_ASCII))
        buf.putInt(dataSize)
        buf.put(pcmData)

        return buf.array()
    }

    private fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }
}
