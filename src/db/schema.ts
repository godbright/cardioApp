import { appSchema, tableSchema } from '@nozbe/watermelondb';

// Schema version — bump this number when adding a migration.
export const DB_SCHEMA_VERSION = 2;

export default appSchema({
  version: DB_SCHEMA_VERSION,
  tables: [

    // ── Worker Profiles (auth roster) ─────────────────────────────────────────
    // One row per authorised health worker. Seeded at deployment by the site coordinator.
    tableSchema({
      name: 'worker_profiles',
      columns: [
        { name: 'worker_id',  type: 'string' },   // e.g. 'HW-001'
        { name: 'name',       type: 'string' },
        { name: 'role',       type: 'string' },    // 'hw' | 'supervisor'
        { name: 'site_id',    type: 'string' },    // 'CHUK' | 'KingFaisal'
        { name: 'pin_hash',   type: 'string' },    // SHA-256(CARDIOSLEEVE:id:pin)
        { name: 'active',     type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── Patients ────────────────────────────────────────────────────────────────
    // One row per patient. Soft-delete only (deleted_at != 0).
    tableSchema({
      name: 'patients',
      columns: [
        { name: 'study_code',    type: 'string' },
        { name: 'name',          type: 'string',  isOptional: true },
        { name: 'date_of_birth', type: 'string',  isOptional: true },  // YYYY-MM-DD
        { name: 'sex',           type: 'string',  isOptional: true },  // M | F | O
        { name: 'rhd_history',   type: 'string',  isOptional: true },  // yes | no | unknown
        { name: 'height_cm',     type: 'number',  isOptional: true },
        { name: 'weight_kg',     type: 'number',  isOptional: true },
        { name: 'bp_sys',        type: 'number',  isOptional: true },
        { name: 'bp_dia',        type: 'number',  isOptional: true },
        { name: 'registered_by', type: 'string' },
        { name: 'site_id',       type: 'string' },
        { name: 'deleted_at',    type: 'number',  isOptional: true },
        { name: 'created_at',    type: 'number' },
        { name: 'updated_at',    type: 'number' },
      ],
    }),

    // ── Sessions ────────────────────────────────────────────────────────────────
    // One row per screening visit. A patient can have many sessions.
    tableSchema({
      name: 'sessions',
      columns: [
        { name: 'patient_id', type: 'string' },
        { name: 'worker_id',  type: 'string' },
        { name: 'site_id',    type: 'string' },
        { name: 'opened_at',  type: 'number' },
        { name: 'closed_at',  type: 'number',  isOptional: true },
      ],
    }),

    // ── Captures ────────────────────────────────────────────────────────────────
    // One row per physical recording attempt (PCG or ECG).
    tableSchema({
      name: 'captures',
      columns: [
        { name: 'session_id',       type: 'string' },
        { name: 'patient_id',       type: 'string' },
        { name: 'modality',         type: 'string' },   // pcg | ecg
        { name: 'site',             type: 'string' },   // valve site or lead ID
        { name: 'posture',          type: 'string',  isOptional: true },
        { name: 'recording_path',   type: 'string' },
        { name: 'recording_sha256', type: 'string' },
        { name: 'duration_ms',      type: 'number',  isOptional: true },
        { name: 'peak_quality',     type: 'number',  isOptional: true },
        { name: 'cardiosleeve_id',  type: 'string',  isOptional: true },
        { name: 'app_version',      type: 'string' },
        { name: 'captured_at',      type: 'number' },
      ],
    }),

    // ── Stage 1 Results ─────────────────────────────────────────────────────────
    // One row per PCG capture that ran through Stage 1 inference.
    tableSchema({
      name: 'stage1_results',
      columns: [
        { name: 'capture_id',    type: 'string' },
        { name: 'model_version', type: 'string' },
        { name: 'verdict',       type: 'string' },   // normal | abnormal | inconclusive
        { name: 'confidence',    type: 'number' },
        { name: 'raw_logits',    type: 'string',  isOptional: true },  // JSON
        { name: 'inference_ms',  type: 'number',  isOptional: true },
        { name: 'run_at',        type: 'number' },
      ],
    }),

    // ── Stage 2 Results ─────────────────────────────────────────────────────────
    // One row per Stage 2 confirmation received from the cloud API.
    tableSchema({
      name: 'stage2_results',
      columns: [
        { name: 'capture_id',      type: 'string' },
        { name: 'remote_job_id',   type: 'string',  isOptional: true },
        { name: 'verdict',         type: 'string' },
        { name: 'confidence',      type: 'number',  isOptional: true },
        { name: 'additional_data', type: 'string',  isOptional: true },  // JSON
        { name: 'received_at',     type: 'number' },
      ],
    }),

    // ── Sync Queue ──────────────────────────────────────────────────────────────
    // Persisted queue — survives app kills. Replaces the in-memory queue.
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'capture_id',      type: 'string' },
        { name: 'status',          type: 'string' },   // pending | uploading | done | failed
        { name: 'attempts',        type: 'number' },
        { name: 'queued_at',       type: 'number' },
        { name: 'last_attempt_at', type: 'number',  isOptional: true },
        { name: 'next_retry_at',   type: 'number',  isOptional: true },
        { name: 'last_error',      type: 'string',  isOptional: true },
      ],
    }),

    // ── App Settings (v2) ───────────────────────────────────────────────────────
    // Key-value store for device-level preferences. One row per key.
    // Well-known keys: 'language', 'videoGuidesEnabled', 'lastPairedDeviceId'.
    tableSchema({
      name: 'app_settings',
      columns: [
        { name: 'key',        type: 'string' },   // unique preference key
        { name: 'value',      type: 'string' },   // JSON-encoded value
        { name: 'updated_at', type: 'number' },
      ],
    }),

  ],
});
