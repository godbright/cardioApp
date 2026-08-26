# CardioSleeve RHD SCREENING App — Backend & Data Architecture

> **Status: Authoritative design spec.** This document makes concrete decisions. Where external input is still genuinely required (IRB field set, Rijuven SDK format, Stage 2 endpoint URL), those are called out in §11. Everything else is decided here.

---

## 1. Design Principles

Every decision in this document is grounded in five operating realities:

1. **Offline-first.** Connectivity at CHUK and King Faisal is intermittent. Every record must survive an indefinite offline period without data loss or corruption.
2. **Local data sovereignty.** Raw recordings and patient identifiers do not leave the device unless clinically necessary. Only Stage-1-flagged abnormal PCG recordings are synced to Stage 2. Nothing goes to third-party infrastructure.
3. **Clinical traceability.** Every result is traceable to the exact model version, capture parameters, and device that produced it. This is a research prototype — pilot data must be auditable down to the row level.
4. **hw continuity.** Sync, inference, and background operations never block the health worker from continuing to screen patients.
5. **Minimum necessary data.** Only what the IRB explicitly approves is stored. The schema is designed to accommodate the IRB's decision rather than front-running it.

---

## 2. System Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Android Device (hw Tablet)                    │
│                                                                     │
│  ┌────────────┐   audio/ECG   ┌──────────────────────────────────┐  │
│  │CardioSleeve│──────────────▶│  Signal Quality Pipeline (DSP)   │  │
│  │(Bluetooth) │               └──────────────┬───────────────────┘  │
│  └────────────┘                              │ quality-gated stream │
│                                              ▼                      │
│                               ┌──────────────────────────────────┐  │
│                               │  Stage 1 — TFLite MobileNetV3    │  │
│                               │  (quantized INT8, bundled asset) │  │
│                               └──────────────┬───────────────────┘  │
│                                              │ verdict + confidence │
│                               ┌──────────────▼───────────────────┐  │
│                               │      SQLite (SQLCipher)          │  │
│                               │   cardiosleeve.db                │  │
│                               │                                  │  │
│                               │  patients / sessions / captures  │  │
│                               │  stage1_results / stage2_results │  │
│                               │  sync_queue / settings           │  │
│                               └──────────────┬───────────────────┘  │
│                                              │                      │
│                               ┌──────────────▼───────────────────┐  │
│                               │    Sync Worker (background)      │  │
│                               │   exponential backoff, resumable │  │
│                               └──────────────┬───────────────────┘  │
└──────────────────────────────────────────────┼─────────────────────┘
                                               │ HTTPS/TLS
                                               │ abnormal PCG only
                                               ▼
                              ┌────────────────────────────────────┐
                              │     Stage 2 Cloud API              │
                              │  (CNN-BiLSTM confirmatory model)   │
                              └────────────────────────────────────┘
```

The app owns: local SQLite database, audio file storage, Stage 1 inference, and the Stage 2 HTTP client.  
The app does **not** own: Stage 2 model training or hosting, any EHR or patient registry, Rijuven cloud services.

---

## 3. Database — SQLite with SQLCipher Encryption

**Library:** `react-native-sqlite-storage` built against SQLCipher.  
**Encryption:** AES-256 at rest. The database key is derived from the device's Android Keystore — not hardcoded. This is non-negotiable for clinical data on a tablet that could be lost or shared.  
**Database file:** `cardiosleeve.db` in the app's sandboxed private directory.  
**Initialization:** `openDb()` is called once at app launch, before any screen renders. It opens the encrypted DB, runs outstanding migrations, and resets any stale `'uploading'` sync-queue rows (from a previous app kill). All subsequent DB access goes through an internal getter that throws if initialization was skipped.

### 3.1 Schema — Seven Tables

---

#### `patients`

One row per patient. Created once. Never hard-deleted during the pilot (soft-delete only, requires IRB sign-off to purge).

```sql
CREATE TABLE IF NOT EXISTS patients (
  id            TEXT    PRIMARY KEY,
  -- IRB-approved identifier (see §11 for field-set decisions)
  study_code    TEXT    NOT NULL UNIQUE,
  name          TEXT,                        -- real name — include only if IRB permits PII
  date_of_birth TEXT,                        -- YYYY-MM-DD; age derived at query time
  sex           TEXT    CHECK(sex IN ('M','F','O')),
  rhd_history   TEXT    CHECK(rhd_history IN ('yes','no','unknown')),
  -- vitals (optional per IRB)
  height_cm     REAL,
  weight_kg     REAL,
  bp_sys        INTEGER,
  bp_dia        INTEGER,
  -- attribution
  registered_by TEXT    NOT NULL,            -- hw_id of worker who created this record
  site_id       TEXT    NOT NULL,            -- 'CHUK' | 'KingFaisal'
  -- soft delete
  deleted_at    INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_patients_study_code ON patients(study_code);
CREATE INDEX IF NOT EXISTS idx_patients_site       ON patients(site_id);
```

**Key decisions:**
- `id` is a UUID v4 generated by the app, never auto-increment. This makes rows mergeable if multi-device sync is ever added.
- `study_code` is the primary lookup key during a session — the hw searches by this, not by name. It is always present, IRB-assigned.
- `name` and `date_of_birth` are nullable because IRB may restrict PII. The schema supports both outcomes without a migration.
- Age is derived at query time: `(julianday('now') - julianday(date_of_birth)) / 365.25`. Do not store it as a column — it changes and would go stale.
- `deleted_at` is the soft-delete timestamp. All queries filter `WHERE deleted_at IS NULL`. Hard-deleting pilot data requires explicit IRB sign-off and a supervisor action.

---

#### `sessions`

One screening visit = one session. A patient may have many sessions across follow-up visits. This table exists because the pilot may be longitudinal and because it provides the clean anchor point for grouping captures.

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY,
  patient_id  TEXT    NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hw_id      TEXT    NOT NULL,
  site_id     TEXT    NOT NULL,
  opened_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  closed_at   INTEGER                    -- NULL while the hw is actively on this patient
);

CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_hw     ON sessions(hw_id);
```

A session is opened when the hw enters the Patient Session Hub screen. `closed_at` is set when they tap "Done with patient". An open session (NULL `closed_at`) is one the hw is currently working.

---

#### `captures`

One physical recording attempt = one row. A session can have many captures across both modalities, multiple valve sites, and retries.

```sql
CREATE TABLE IF NOT EXISTS captures (
  id                TEXT    PRIMARY KEY,
  session_id        TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  patient_id        TEXT    NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  modality          TEXT    NOT NULL CHECK(modality IN ('pcg','ecg')),
  site              TEXT    NOT NULL,        -- valve site ID or ECG lead ID
  posture           TEXT    CHECK(posture IN ('sitting','supine','left-lateral')),
  recording_path    TEXT    NOT NULL,        -- absolute path inside app private storage
  recording_sha256  TEXT    NOT NULL,        -- hex SHA-256, computed after file write
  duration_ms       INTEGER NOT NULL,
  peak_quality      REAL    NOT NULL,        -- 0.0–1.0 best DSP quality score during capture
  cardiosleeve_id   TEXT    NOT NULL,        -- Bluetooth MAC of the CardioSleeve used
  app_version       TEXT    NOT NULL,        -- semver of the app build
  captured_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_captures_session  ON captures(session_id);
CREATE INDEX IF NOT EXISTS idx_captures_patient  ON captures(patient_id);
CREATE INDEX IF NOT EXISTS idx_captures_modality ON captures(modality);
```

**Key decisions:**
- A "retry" is a new capture row with a new UUID, not an overwrite. History is never erased. The active capture for a given session + site is the most recent one with a passing Stage 1 result (or simply the most recent if no result yet).
- `recording_sha256` is computed immediately after the file is fully written, before any processing. It is the integrity anchor for uploads.
- `cardiosleeve_id` records which physical device captured this recording. If a hw rotates between two CardioSleeve units, the data is still traceable.

---

#### `stage1_results`

One row per PCG capture that ran through Stage 1 inference. ECG captures have no Stage 1 result until the ECG analysis pipeline is defined.

```sql
CREATE TABLE IF NOT EXISTS stage1_results (
  id             TEXT    PRIMARY KEY,
  capture_id     TEXT    NOT NULL UNIQUE REFERENCES captures(id) ON DELETE CASCADE,
  model_version  TEXT    NOT NULL,           -- e.g. 'mobilenetv3s-int8-v1.2.0'
  verdict        TEXT    NOT NULL CHECK(verdict IN ('normal','abnormal','inconclusive')),
  confidence     REAL    NOT NULL,           -- posterior probability for the predicted class
  raw_logits     TEXT    NOT NULL,           -- JSON array, e.g. '[0.12, 0.88]'
  inference_ms   INTEGER NOT NULL,           -- wall-clock inference time on this device
  run_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
```

**Key decisions:**
- `model_version` on every row is mandatory. The Stage 1 model will be retrained multiple times during the pilot. Pilot data must be traceable to the specific model version that scored it — aggregate accuracy numbers are meaningless without this.
- `raw_logits` is stored as a JSON string, not just the argmax. Per-class sensitivity analysis (especially on the rare abnormal class) requires the full distribution, not just the binary verdict.
- `UNIQUE` on `capture_id` enforces one Stage 1 result per physical recording. Re-running inference on a different recording means a new `captures` row.
- Confidence threshold for "inconclusive" is **0.65** (below this, the verdict is `'inconclusive'` regardless of argmax). This value must be validated with the ML team and is stored in the `settings` table as `stage1_confidence_threshold` so it can be updated without a code release.

---

#### `stage2_results`

One row per Stage 2 confirmation received from the cloud API. Only `abnormal` Stage 1 verdicts ever have a row here.

```sql
CREATE TABLE IF NOT EXISTS stage2_results (
  id               TEXT    PRIMARY KEY,
  capture_id       TEXT    NOT NULL UNIQUE REFERENCES captures(id) ON DELETE CASCADE,
  remote_job_id    TEXT    NOT NULL,         -- server-assigned correlation ID
  verdict          TEXT    NOT NULL CHECK(verdict IN ('normal','abnormal-as-confirmed','inconclusive')),
  confidence       REAL    NOT NULL,
  additional_data  TEXT,                     -- JSON blob for any extra fields the API returns
  received_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
```

`additional_data` is a JSON safety valve — the Stage 2 API contract is not yet finalised. New server-side fields can arrive without requiring a schema migration.

---

#### `sync_queue`

Persisted sync queue. **The current in-memory implementation in `syncQueue.ts` is replaced by this table.** In-memory queues do not survive app kills — which will happen in the field.

```sql
CREATE TABLE IF NOT EXISTS sync_queue (
  id               TEXT    PRIMARY KEY,
  capture_id       TEXT    NOT NULL UNIQUE REFERENCES captures(id) ON DELETE CASCADE,
  status           TEXT    NOT NULL DEFAULT 'pending'
                           CHECK(status IN ('pending','uploading','done','failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  queued_at        INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_attempt_at  INTEGER,
  next_retry_at    INTEGER,                  -- pre-computed: last_attempt_at + backoff_ms
  last_error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_status      ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_next_retry  ON sync_queue(next_retry_at);
```

**Key decisions:**
- `status = 'uploading'` is set at the start of an upload and reset to `'pending'` if the app is killed mid-transfer. On startup, `openDb()` resets all stale `'uploading'` rows to `'pending'` before the sync worker starts.
- `next_retry_at` is pre-computed at each failure so the retry query is a simple index scan: `WHERE status='pending' AND next_retry_at <= strftime('%s','now')`.
- `status = 'done'` rows are retained for 30 days for audit, then pruned by a scheduled cleanup. They are not deleted immediately — a supervisor may need to verify that a capture was successfully delivered.
- `status = 'failed'` (after 8 attempts) is surfaced in the Settings > Sync Status screen so a supervisor can manually retry.

---

#### `settings`

Key-value store for app-level preferences that need to coexist with the clinical database (and be encrypted alongside it via SQLCipher). This replaces AsyncStorage entirely.

```sql
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
```

**Predefined keys:**

| Key | Type | Description |
|---|---|---|
| `db_version` | integer string | Current schema version (migration runner) |
| `lang` | string | UI and TTS language code (`en`, `rw`, `fr`, `sw`) |
| `hw_id` | string | Logged-in hw identifier |
| `last_bt_device` | string | Bluetooth address of last-paired CardioSleeve |
| `video_guides` | `'on'` / `'off'` | Whether positioning guide videos are shown |
| `stage2_token` | string | Bearer token for Stage 2 API (see §6.2) |
| `stage2_endpoint` | string | Base URL of Stage 2 API (updatable without code release) |
| `stage1_confidence_threshold` | float string | Below this confidence, verdict = `'inconclusive'` (default `'0.65'`) |
| `site_id` | string | Deployment site identifier (`'CHUK'` or `'KingFaisal'`) |

---

### 3.2 Schema Diagram

```
patients
  │
  ├─< sessions (many sessions per patient, one per visit)
  │     │
  │     └─< captures (many captures per session)
  │           │
  │           ├── stage1_results  (0 or 1 per PCG capture)
  │           ├── stage2_results  (0 or 1 per abnormal PCG capture)
  │           └── sync_queue      (0 or 1 per abnormal PCG capture)
  │
settings (standalone key-value, encrypted with DB)
```

---

### 3.3 Schema Migrations

Migrations run inside `openDb()` before anything else. The strategy is a sequential version-number runner stored in `settings.db_version`.

```typescript
// src/services/migrations.ts

import type { SQLiteDatabase } from 'react-native-sqlite-storage';

const MIGRATIONS: Record<number, string[]> = {
  1: [
    CREATE_PATIENTS,
    CREATE_SESSIONS,
    CREATE_CAPTURES,
    CREATE_STAGE1_RESULTS,
    CREATE_STAGE2_RESULTS,
    CREATE_SYNC_QUEUE,
    CREATE_SETTINGS,
    `INSERT OR IGNORE INTO settings(key,value) VALUES ('db_version','1')`,
    `INSERT OR IGNORE INTO settings(key,value) VALUES ('stage1_confidence_threshold','0.65')`,
  ],
  // 2: [`ALTER TABLE patients ADD COLUMN ...`],
};

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const [[r]] = await db.executeSql(
    `SELECT value FROM settings WHERE key='db_version'`
  );
  const current = r.rows.length ? parseInt(r.rows.item(0).value, 10) : 0;
  const pending = Object.keys(MIGRATIONS)
    .map(Number)
    .filter(v => v > current)
    .sort((a, b) => a - b);

  for (const v of pending) {
    for (const sql of MIGRATIONS[v]) {
      await db.executeSql(sql);
    }
    await db.executeSql(
      `INSERT OR REPLACE INTO settings(key,value) VALUES ('db_version',?)`,
      [String(v)]
    );
  }
}
```

**Rules:**
- Migrations are append-only. Never modify a migration that has shipped to a device.
- `ALTER TABLE ... ADD COLUMN` is safe on SQLite. Dropping or renaming columns requires a three-step table rebuild — add a new migration, do not modify an existing one.
- Each migration version is an atomic transaction. If any statement in a version fails, the version is rolled back and the app shows an error screen rather than launching with a partial schema.

---

## 4. File Storage — Audio Recordings

SQLite stores metadata only. Raw audio lives on the filesystem in the app's private data directory.

### 4.1 Directory Layout

```
/data/data/com.cardiosleeve.app/files/
└── recordings/
    ├── <capture_id>.pcg.wav     ← PCG recording
    ├── <capture_id>.ecg.bin     ← Synchronized ECG binary stream
    └── <capture_id>.meta.json   ← Capture parameters snapshot (convenience, not authoritative)
```

### 4.2 Formats

| Stream | Format | Sample rate | Bit depth | Channels |
|---|---|---|---|---|
| PCG (phonocardiogram) | WAV (PCM) | 4 000 Hz | 16-bit signed | Mono |
| ECG | Raw int16 little-endian with 8-byte header | 500 Hz | 16-bit signed | 1 lead per file |

The ECG header (8 bytes): `[uint16 sample_rate][uint16 lead_id][uint32 sample_count]`.

These formats are chosen for compatibility with standard audio/signal processing tooling. **Confirm against Rijuven CardioSleeve hardware spec before locking — if the hardware outputs at a different native rate, capture at native and note the discrepancy in `captures.recording_path`'s sidecar.**

### 4.3 File Lifecycle

- Files are written incrementally as the CardioSleeve streams data during the recording phase.
- After recording stops, the file is finalised and `SHA-256` is computed. Only after both steps succeed is the `captures` row written to the DB. If the device dies mid-recording, there is no DB row pointing to a partial file.
- On soft-delete of a patient, the associated audio files are deleted from disk immediately (no orphan files in storage). The DB row is soft-deleted.
- Files for Stage-2-synced captures are **not** deleted after a successful upload. The hw may need to review or re-transmit. Storage is not a constraint on a modern Android tablet.

### 4.4 Storage Estimate

- PCG at 4 kHz, 16-bit mono, 30 s: **~240 KB per capture**
- ECG at 500 Hz, 16-bit, 30 s: **~30 KB per capture**
- 25 patients/day × 3 captures avg = ~20 MB/day. A 32 GB tablet holds over 4 years of recordings at this rate.

---

## 5. Sync Architecture

### 5.1 What Gets Synced

| Data | Synced? | Reason |
|---|---|---|
| PCG captures where Stage 1 = `'abnormal'` | **Yes** | Required for Stage 2 confirmatory inference |
| PCG captures where Stage 1 = `'normal'` | No | Design intent: two-stage cascade exists precisely to avoid syncing these |
| PCG captures where Stage 1 = `'inconclusive'` | No | Low-quality — recapture is required first |
| ECG captures | No | No cloud pipeline defined yet |
| Patient demographic data | **No** | Only `study_code` travels with the recording, never name/DOB |
| Stage 1 result fields | Yes, as upload metadata | Context for Stage 2 scoring |

### 5.2 Queue Lifecycle

```
PCG capture completes
        │
        ▼
Stage 1 inference
        │
   ┌────┴────────────────┐
 normal          abnormal        inconclusive
   │                 │                │
 no sync     INSERT sync_queue    no sync
              status='pending'   (recapture prompt)
                     │
         ┌───────────▼──────────────────────────────────┐
         │  Sync Worker polls every 30 s                │
         │  SELECT WHERE status='pending'               │
         │    AND next_retry_at <= now()                │
         │  (up to 5 items per flush to avoid           │
         │   saturating a weak rural connection)        │
         └───────────┬──────────────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │   _upload(item)       │
         │   status='uploading'  │
         └───────────┬───────────┘
                     │
        ┌────────────┴──────────────┐
      success                    failure
        │                           │
  INSERT stage2_results       attempts++
  status='done'               next_retry_at = now + backoff
  fire in-app notification    (status stays 'pending')
  speak TTS result            if attempts >= 8: status='failed'
```

### 5.3 Backoff Schedule

```
backoff_ms = 15_000 * (2 ^ attempts)
```

| Attempt | Wait before retry |
|---|---|
| 1 | 15 s |
| 2 | 30 s |
| 3 | 1 min |
| 4 | 2 min |
| 5 | 4 min |
| 6 | 8 min |
| 7 | 17 min |
| 8 | 34 min |
| > 8 | `status = 'failed'` — no more automatic retries |

A hw supervisor can reset failed items from **Settings > Sync Status**, which sets `attempts = 0` and `next_retry_at = now` for all `'failed'` rows.

### 5.4 Sync Worker — Implementation

```typescript
// src/services/syncQueue.ts (replaces the current in-memory implementation)

import { db } from './storage';
import { uploadToStage2 } from './stage2Api';
import { saveStage2Result } from './storage';
import { triggerResultNotification, speakResult } from './resultNotifier';
import { v4 as uuid } from 'uuid';

const MAX_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 5;
let _running = false;

export async function startSyncWorker(): Promise<void> {
  // Reset rows stuck in 'uploading' from a previous app kill
  await db().executeSql(
    `UPDATE sync_queue SET status='pending' WHERE status='uploading'`
  );
  setInterval(flush, POLL_INTERVAL_MS);
  flush(); // run immediately on launch too
}

export async function enqueue(captureId: string): Promise<void> {
  await db().executeSql(`
    INSERT OR IGNORE INTO sync_queue(id, capture_id, status, queued_at)
    VALUES (?, ?, 'pending', strftime('%s','now'))
  `, [uuid(), captureId]);
  flush();
}

async function flush(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const [result] = await db().executeSql(`
      SELECT sq.id AS qid, sq.capture_id, sq.attempts,
             c.recording_path, c.recording_sha256, c.site, c.app_version,
             s1.model_version, s1.confidence AS s1_confidence,
             p.study_code
      FROM sync_queue sq
      JOIN captures c    ON c.id  = sq.capture_id
      JOIN stage1_results s1 ON s1.capture_id = sq.capture_id
      JOIN sessions se   ON se.id = c.session_id
      JOIN patients p    ON p.id  = se.patient_id
      WHERE sq.status = 'pending'
        AND (sq.next_retry_at IS NULL OR sq.next_retry_at <= strftime('%s','now'))
      ORDER BY sq.queued_at ASC
      LIMIT ?
    `, [BATCH_SIZE]);

    for (let i = 0; i < result.rows.length; i++) {
      await attemptUpload(result.rows.item(i));
    }
  } finally {
    _running = false;
  }
}

async function attemptUpload(row: any): Promise<void> {
  await db().executeSql(
    `UPDATE sync_queue SET status='uploading', last_attempt_at=strftime('%s','now')
     WHERE id=?`, [row.qid]
  );
  try {
    const stage2 = await uploadToStage2(row);
    await saveStage2Result({
      capture_id:     row.capture_id,
      remote_job_id:  stage2.job_id,
      verdict:        stage2.verdict,
      confidence:     stage2.confidence,
      additional_data: JSON.stringify(stage2.findings ?? {}),
    });
    await db().executeSql(
      `UPDATE sync_queue SET status='done' WHERE id=?`, [row.qid]
    );
    triggerResultNotification(row.capture_id, stage2.verdict);
    speakResult(stage2.verdict);
  } catch (err: any) {
    const attempts = row.attempts + 1;
    const backoffMs = 15_000 * Math.pow(2, attempts);
    const nextRetry = Math.floor((Date.now() + backoffMs) / 1000);
    const newStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await db().executeSql(`
      UPDATE sync_queue
      SET status=?, attempts=?, next_retry_at=?, last_error=?
      WHERE id=?
    `, [newStatus, attempts, nextRetry, String(err?.message ?? err), row.qid]);
  }
}

export async function getSyncStats() {
  const [r] = await db().executeSql(`
    SELECT status, COUNT(*) as count FROM sync_queue GROUP BY status
  `);
  const stats: Record<string, number> = { pending: 0, uploading: 0, done: 0, failed: 0 };
  for (let i = 0; i < r.rows.length; i++) {
    const { status, count } = r.rows.item(i);
    stats[status] = count;
  }
  return stats;
}

export async function resetFailedItems(): Promise<void> {
  await db().executeSql(`
    UPDATE sync_queue
    SET status='pending', attempts=0, next_retry_at=NULL, last_error=NULL
    WHERE status='failed'
  `);
  flush();
}
```

---

## 6. Stage 2 API Contract

This section is the authoritative specification for everything between the Android app and the cloud Stage 2 service. It covers the complete flow from a completed capture on-device through to a result appearing on the hw's screen, including every API endpoint, the server-side processing pipeline, error taxonomy, async polling strategy, and all supporting endpoints (metrics, roster sync, supervisor dashboard).

---

### 6.0 End-to-End Flow

The full lifecycle of an abnormal PCG recording — from the moment the hw taps "Done" on the Capture screen to the moment the result appears as "confirmed" in the patient list:

```
hw taps "Done" on Capture screen
         │
         ▼
Stage 1 on-device inference (TFLite, offline)
         │
    ┌────┴──────────────────┬──────────────────┐
  normal               abnormal           inconclusive
    │                      │                   │
  stored locally    INSERT sync_queue      recapture
  no upload          status='pending'      prompt
                           │
                           ▼
              AppContext calls triggerFlush()
                           │
                           ▼
              ┌──────────────────────────────┐
              │     Sync Worker (_flush)      │
              │  SELECT pending rows WHERE   │
              │  next_retry_at <= now()       │
              └────────────┬─────────────────┘
                           │
              ┌────────────▼─────────────────┐
              │  GET /v1/health              │
              │  (liveness check before      │
              │   wasting the upload)        │
              └────────────┬─────────────────┘
                      ┌────┴────┐
                   online     offline
                      │          │
                      │       backoff, retry later
                      ▼
              ┌──────────────────────────────┐
              │  POST /v1/captures/submit    │
              │  multipart: audio file +     │
              │  capture metadata            │
              │  status → 'uploading'        │
              └────────────┬─────────────────┘
                           │
              ┌────────────┴──────────────────────────────┐
            200 OK                202 Accepted          error
              │                      │                    │
         result now           job queued              backoff /
              │               poll after N s          mark failed
              │                      │
              │          ┌───────────▼──────────────────┐
              │          │  GET /v1/captures/{job_id}   │
              │          │       /result  (poll loop)   │
              │          │  max 12 polls, 20 s apart    │
              │          └───────────┬──────────────────┘
              │                 200 OK (verdict)
              └──────────────────────┘
                           │
              ┌────────────▼──────────────────────────────┐
              │  INSERT stage2_results                    │
              │  UPDATE sync_queue status='done'          │
              │  fire onStage2Result() callback           │
              └────────────┬──────────────────────────────┘
                           │
              ┌────────────▼──────────────────────────────┐
              │  AppContext reloads patients from DB      │
              │  resolveHsStatus finds stage2_results row │
              │  patient.hs: 'abnormal-pending'           │
              │            → 'abnormal-confirmed'         │
              └────────────┬──────────────────────────────┘
                           │
              ┌────────────▼──────────────────────────────┐
              │  TTS speaks result                        │
              │  "Confirmation received.                  │
              │   Aortic stenosis is suspected.           │
              │   Please refer this patient."            │
              └───────────────────────────────────────────┘
```

**Key invariants:**
- The hw is never blocked at any step. All of the above happens in the background while they continue screening other patients.
- No patient name or DOB ever leaves the device. Only `study_code` (the pseudonym) travels with the audio file.
- If the app is killed at any step, the `sync_queue` row survives in SQLite. On the next launch, the sync worker picks up exactly where it left off.

---

### 6.1 Base URL and Versioning

The endpoint base URL is stored in `settings.stage2_endpoint` (in the SQLCipher `settings` table) so it can be updated over-the-air without a code release. The staging default is set at build time; the production URL is written to the tablet at deployment.

```
Staging:    https://stage2-staging.cardiosleeve.internal/v1
Production: https://stage2.cardiosleeve.internal/v1
```

All endpoints are prefixed with `/v1/`. The app ships pinned to `v1`. When a `v2` is needed, the server supports both simultaneously during a transition window — the old path is never broken while tablets are in the field.

**Version negotiation header** (optional, for future use):
```
X-App-Version: 1.4.2
X-Model-Version: mobilenetv3s-int8-v1.2.0
```

The server logs these for compatibility analysis but does not gate on them during the pilot.

---

### 6.2 Authentication

#### 6.2.1 Mechanism — Site-Scoped JWT

Every API call carries a signed JWT in the `Authorization: Bearer` header. One JWT per deployment site is issued at pilot setup. The JWT body:

```json
{
  "iss": "cardiosleeve-admin",
  "sub": "site:CHUK",
  "site_id": "CHUK",
  "device_class": "field-tablet",
  "iat": 1751500000,
  "exp": 1783036000
}
```

Signed with **RS256** — the server holds the private key; tablets only need the token string itself. Tokens live inside the encrypted SQLCipher `settings` table under key `stage2_token`. They are never written to `SharedPreferences`, log output, or any world-readable path.

#### 6.2.2 Token Lifecycle

```
Pilot setup
    │
    ▼
Admin generates site token (private key on server)
    │
    ▼
Token written to tablet settings at deployment
    │    (adb shell or QR-code provisioning tool)
    │
    ▼
Token used for all API calls until expiry
    │
    ├── Annual rotation: admin issues new token →
    │   tablets pull updated roster (which includes new token field)
    │   next /v1/roster sync writes new token to settings
    │
    └── Emergency revocation: server invalidates sub claim →
        all calls with old token receive 401 →
        app surfaces "Sync paused — contact supervisor" banner
        (does not block capture or local screening)
```

#### 6.2.3 What the Token Does NOT Grant

The site token authorises capture submissions from that site only. It does not grant:
- Access to another site's data
- Access to the supervisor dashboard
- The ability to modify or delete existing results

Supervisor dashboard access uses a separate short-lived credential issued via `POST /auth/login` (see §6.6).

---

### 6.3 Endpoints — Full Specification

#### 6.3.1 `GET /v1/health`

Lightweight liveness probe. Called by the sync worker **before** each flush attempt to avoid wasting a multipart upload attempt on a server that is down.

**Request:** No body. JWT required.

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-07-07T10:22:00Z",
  "model_loaded": true,
  "queue_depth": 3
}
```

`model_loaded` — whether the Stage 2 CNN-BiLSTM model is in memory and ready to run inference. If `false`, a submit will succeed but will definitely return 202 (async).  
`queue_depth` — number of jobs currently in the inference queue. The app uses this to decide whether to expect a 200 or 202 response and adjust TTS messaging.

**Response 503:** Server undergoing maintenance. App treats this as a transient failure and does not flush.

**App behavior:** If `/health` returns non-200 or times out in < 5 seconds, the flush cycle is aborted entirely. The sync_queue rows stay `'pending'` and will be retried on the next poll interval. This prevents 8 individual upload failures from each consuming a retry attempt against the MAX_ATTEMPTS budget.

---

#### 6.3.2 `POST /v1/captures/submit`

Submit a quality-gated, Stage-1-abnormal PCG recording for Stage 2 confirmatory inference.

**Request** — `multipart/form-data`:

| Field | Type | Constraints | Description |
|---|---|---|---|
| `audio` | binary | WAV, max 5 MB, PCM 16-bit | `.pcg.wav` recording file |
| `capture_id` | string | UUID v4 | App-generated idempotency key — server returns the same result for duplicate submissions |
| `patient_ref` | string | 3–32 chars, alphanumeric + hyphens | `study_code` pseudonym. Never patient name or DOB |
| `site` | string | enum: `aortic`, `erb`, `mitral`, `pulmonary`, `tricuspid` | Valve site — informs the model's attention region |
| `posture` | string | enum: `sitting`, `supine`, `left-lateral` | Patient posture during capture |
| `model_version` | string | semver string | Stage 1 model version that produced the abnormal verdict |
| `s1_confidence` | float string | 0.0–1.0 | Stage 1 raw confidence for the abnormal class |
| `s1_raw_logits` | string | JSON array, e.g. `"[0.12, 0.88]"` | Full Stage 1 output distribution — enables server-side calibration analysis |
| `recording_sha256` | string | 64-char hex | SHA-256 of the audio file, computed before upload. Server rejects if mismatch |
| `duration_ms` | integer string | 1000–60000 | Recording duration in milliseconds |
| `captured_at` | string | ISO-8601 UTC | When the recording was made on-device |
| `cardiosleeve_id` | string | Bluetooth MAC | Which physical CardioSleeve unit captured this |
| `hw_id` | string | 3–32 chars | hw identifier — audit trail only, not an auth credential |
| `site_id` | string | enum: `CHUK`, `KingFaisal` | Deployment site |
| `app_version` | string | semver string | App build version — for compatibility tracking |
| `peak_quality` | float string | 0.0–1.0 | Best DSP quality score achieved during the recording |

**Response 200** — synchronous result (model ran immediately):

```json
{
  "capture_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "job_id": "srv-7f2c8a19",
  "verdict": "abnormal-as-confirmed",
  "confidence": 0.91,
  "findings": {
    "spectral_features": "elevated low-frequency energy consistent with AS murmur",
    "note": "findings field is provisional — content subject to change"
  },
  "processed_at": "2026-07-07T10:22:05Z"
}
```

`verdict` values:
- `"abnormal-as-confirmed"` — Stage 2 confirms AS suspicion. Patient should be referred.
- `"normal"` — Stage 2 does not confirm. Stage 1 was likely a false positive.
- `"inconclusive"` — Recording quality insufficient for Stage 2 analysis. App should prompt recapture.

**Response 202** — asynchronous (model queue is busy):

```json
{
  "capture_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "job_id": "srv-7f2c8a19",
  "status": "processing",
  "poll_after_seconds": 20
}
```

The sync_queue row stays `'uploading'`. The app polls `GET /v1/captures/{job_id}/result` after `poll_after_seconds`. See §6.4 for the full polling implementation.

**Response 409** — duplicate submission (idempotency hit):

```json
{
  "capture_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "job_id": "srv-7f2c8a19",
  "message": "Already processed",
  "result_url": "/v1/captures/srv-7f2c8a19/result"
}
```

The app fetches the result from `result_url` and writes it to `stage2_results` as if it had just arrived. This handles the case where the upload succeeded, the server processed it, but the app was killed before it could write the local result row — on the next launch, the 409 recovers the result cleanly.

**Server-side validation before inference runs:**

```
1. Verify JWT (site_id in token matches site_id in body)
2. Verify recording_sha256 matches the uploaded file
3. Verify capture_id not already in the results table (→ 409 if found)
4. Verify audio file is a valid WAV (magic bytes, PCM format)
5. Verify audio duration within bounds (1–60 s)
6. Log audit row: capture_id, site_id, hw_id, received_at, app_version, model_version
7. Route to inference queue or run synchronously based on queue depth
```

---

#### 6.3.3 `GET /v1/captures/{job_id}/result`

Poll for the result of a 202-deferred submission.

**Request:** No body. JWT required. `{job_id}` is the server-assigned job identifier from the 202 response.

**Response 200** — terminal result:
```json
{
  "capture_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "job_id": "srv-7f2c8a19",
  "verdict": "abnormal-as-confirmed",
  "confidence": 0.91,
  "findings": {},
  "processed_at": "2026-07-07T10:22:27Z"
}
```

**Response 202** — still processing:
```json
{
  "job_id": "srv-7f2c8a19",
  "status": "processing",
  "poll_after_seconds": 15,
  "position_in_queue": 2
}
```

`position_in_queue` — informational; the app logs it but does not display it.

**Response 404** — job unknown. This means either the job_id was malformed or the server lost state (e.g., a Redis restart before the job completed). The app treats this as a terminal failure for the poll loop, resets the sync_queue row to `status='pending', attempts=0, next_retry_at=NULL` so the upload is retried from scratch on the next flush.

**Response 410 Gone** — job existed but result has been purged (server retention policy). The app treats this the same as 404 — reset and resubmit.

---

#### 6.3.4 `POST /v1/metrics/daily`

Submit anonymised aggregate daily counts. Contains **no patient-level data** — only site-level totals. This feeds the supervisor dashboard without creating a patient data pipeline.

Called by a separate background worker (not the sync_queue worker) once per day when connectivity is available.

**Request** — `application/json`:

```json
{
  "site_id": "CHUK",
  "date": "2026-07-07",
  "hw_id": "hw-004",
  "counts": {
    "sessions_opened": 18,
    "sessions_closed": 17,
    "pcg_captures_total": 42,
    "pcg_normal": 31,
    "pcg_abnormal": 8,
    "pcg_inconclusive": 3,
    "ecg_captures_total": 14,
    "stage2_queued": 8,
    "stage2_confirmed": 5,
    "stage2_pending": 3,
    "stage2_failed": 0
  },
  "app_version": "1.4.2",
  "reported_at": "2026-07-07T23:55:00Z"
}
```

**Response 200:**
```json
{ "status": "received", "date": "2026-07-07", "site_id": "CHUK" }
```

**Response 409** — metrics for this site+date already received. Server accepts the second submission and updates (last-write-wins) rather than rejecting. The app treats 409 as success.

**Idempotency:** The composite key `(site_id, date)` is unique on the server. Resubmitting the same date's metrics is safe.

**What this data enables on the dashboard:**
- Daily screening throughput per site
- Stage 1 normal/abnormal/inconclusive breakdown over time
- Referral rate trend
- Sync queue health (how many abnormal results are still awaiting confirmation)

---

#### 6.3.5 `GET /v1/roster/{site_id}`

Pull the current active hw roster for a site. The app caches this locally in SQLite and uses it for offline PIN validation.

**Request:** JWT required. `{site_id}` must match the JWT's `site_id` claim.

**Response 200:**
```json
{
  "site_id": "CHUK",
  "roster": [
    { "hw_id": "hw-001", "name": "Aimée Uwimana", "active": true,  "last_modified": "2026-06-01T00:00:00Z" },
    { "hw_id": "hw-002", "name": "Jean Habimana",  "active": true,  "last_modified": "2026-06-01T00:00:00Z" },
    { "hw_id": "hw-003", "name": "Grace Mutoni",   "active": false, "last_modified": "2026-07-01T00:00:00Z" }
  ],
  "fetched_at": "2026-07-07T10:22:00Z",
  "next_sync_after_seconds": 86400
}
```

`active: false` — hw has been deactivated centrally. On the next roster sync the app prevents this hw from logging in. Already-open sessions are not terminated mid-shift.

`next_sync_after_seconds` — the server's recommendation for when to sync again. The app respects this to avoid unnecessary polling.

**App-side caching:** The roster JSON is written to `settings` table under key `hw_roster_cache`. The app falls back to the cache if the server is unreachable. Cache includes a `last_synced` timestamp. If the cache is older than 30 days, the app shows a banner: "hw list may be outdated — connect to sync."

---

#### 6.3.6 `GET /v1/model/latest/{site_id}` *(Model version check — tablet)*

Called by the sync worker at the end of each successful flush cycle to check whether a newer Stage 1 TFLite model is available for this site. The tablet compares `current_semver` with its locally active model version (stored in `settings.stage1_model_version`) and downloads if different.

**Request:** JWT required (site token). `{site_id}` must match JWT `site_id` claim.

**Response 200:**
```json
{
  "site_id": "CHUK",
  "semver": "mobilenetv3s-int8-v1.3.0",
  "download_url": "https://models.cardiosleeve.internal/mobilenetv3s-int8-v1.3.0.tflite",
  "download_sha256": "a4f2c8...64hex...",
  "size_bytes": 4310016,
  "activated_at": "2026-07-01T00:00:00Z",
  "description": "Retrained on CinC2016 + 400 pilot recordings; improved sensitivity on tricuspid site"
}
```

**Response 204 No Content:** The currently active model for this site is the latest. No download needed.

**App-side behaviour:**
```typescript
// In syncQueue.ts — called after a successful flush cycle
async function checkModelUpdate(): Promise<void> {
  const { endpoint, token, siteId } = await getStage2Config();
  const currentVersion = await SettingsService.get('stage1_model_version') ?? '';

  const resp = await fetchWithTimeout(
    `${endpoint}/v1/model/latest/${siteId}`,
    { headers: { Authorization: `Bearer ${token}` } },
    10_000,
  );

  if (resp.status === 204) return;   // already up to date
  if (!resp.ok) {
    console.warn(`[ModelSync] version check returned HTTP ${resp.status}`);
    return;
  }

  const body = await resp.json();
  if (body.semver === currentVersion) return;

  // Download the new model to a staging path, verify SHA-256, then swap atomically
  await downloadAndVerifyModel(body.download_url, body.download_sha256, body.semver);
}

async function downloadAndVerifyModel(url: string, expectedSha256: string, semver: string): Promise<void> {
  const stagingPath = `${RNFS.DocumentDirectoryPath}/models/${semver}.tflite.staging`;
  const finalPath   = `${RNFS.DocumentDirectoryPath}/models/${semver}.tflite`;

  // Download
  await RNFS.downloadFile({ fromUrl: url, toFile: stagingPath }).promise;

  // Verify integrity before swapping
  const actualHash = await RNFS.hash(stagingPath, 'sha256');
  if (actualHash !== expectedSha256) {
    await RNFS.unlink(stagingPath);
    throw new Error(`Model download SHA-256 mismatch for ${semver}`);
  }

  // Atomic rename — either the old model or the new model is active, never a partial file
  await RNFS.moveFile(stagingPath, finalPath);
  await SettingsService.set('stage1_model_version', semver);
  await SettingsService.set('stage1_model_path', finalPath);

  console.log(`[ModelSync] updated to ${semver}`);
}
```

The old model file is deleted only after the new one passes SHA-256 verification and is written to its final path. If the download or verification fails, the staging file is cleaned up and the existing model remains active.

---

### 6.4 Async Polling Strategy

When the Stage 2 server returns 202, the sync worker enters a poll loop for that specific job. The logic:

```typescript
// src/services/stage2Api.ts

const MAX_POLLS     = 12;       // max 12 polls before giving up this attempt
const POLL_GAP_S    = 20;       // default gap between polls if server doesn't specify
const POLL_TIMEOUT_S = 5;       // per-poll HTTP timeout

async function pollUntilDone(
  endpoint: string,
  token:    string,
  jobId:    string,
  initialDelaySec: number,
): Promise<Stage2Response> {
  // Respect the server's initial estimate before first poll
  await sleep(initialDelaySec * 1000);

  for (let i = 0; i < MAX_POLLS; i++) {
    let resp: Response;
    try {
      resp = await fethwithTimeout(
        `${endpoint}/v1/captures/${jobId}/result`,
        { headers: { Authorization: `Bearer ${token}` } },
        POLL_TIMEOUT_S * 1000,
      );
    } catch (networkErr) {
      // Transient network error during poll — treat as still-pending, wait and retry
      await sleep(POLL_GAP_S * 1000);
      continue;
    }

    if (resp.status === 404 || resp.status === 410) {
      // Server lost the job — throw so the caller resets and resubmits from scratch
      throw Object.assign(new Error('Stage2 job not found — will resubmit'), { resubmit: true });
    }

    if (!resp.ok) {
      throw Object.assign(new Error(`Stage2 poll HTTP ${resp.status}`), { status: resp.status });
    }

    const body = await resp.json();

    if (body.verdict) {
      // Terminal result received
      return body as Stage2Response;
    }

    // Still processing — wait for server's guidance or default gap
    const nextWait = (body.poll_after_seconds ?? POLL_GAP_S) * 1000;
    await sleep(nextWait);
  }

  // Exhausted poll budget — throw so the sync worker increments attempts
  // and retries the entire upload on the next backoff interval.
  throw new Error('Stage2 polling timed out after max polls');
}

function fethwithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Worst-case timing:** 12 polls × 20 seconds = ~4 minutes maximum wait before the sync_queue row gets its `attempts` incremented and a new backoff is applied. In practice the Stage 2 model takes 5–15 seconds for a 30-second PCG recording, so most 202s resolve within 2–3 polls.

**The `resubmit: true` flag:** When `pollUntilDone` throws with this flag set, the `_processRow` error handler in `syncQueue.ts` resets the row to `attempts=0` rather than incrementing — since the upload itself succeeded, the job was just lost server-side. This prevents a valid upload from burning through its retry budget.

---

### 6.5 Complete Stage 2 HTTP Client

```typescript
// src/services/stage2Api.ts

import RNFS from 'react-native-fs';

export interface Stage2SubmitRow {
  capture_id:       string;
  patient_id:       string;      // WatermelonDB internal ID (not study_code)
  recording_path:   string;
  recording_sha256: string;
  site:             string;
  posture:          string | null;
  app_version:      string;
  model_version:    string;
  s1_confidence:    number;
  s1_raw_logits:    string | null;
  duration_ms:      number | null;
  peak_quality:     number | null;
  captured_at:      Date;
  cardiosleeve_id:  string | null;
  study_code:       string;      // resolved from patients table by syncQueue.ts
}

export interface Stage2Response {
  job_id:      string;
  verdict:     'normal' | 'abnormal-as-confirmed' | 'inconclusive';
  confidence:  number;
  findings:    Record<string, unknown>;
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

async function getStage2Config(): Promise<{ endpoint: string; token: string; siteId: string; hwId: string }> {
  // Read from WatermelonDB app_settings table via SettingsService
  const { SettingsService } = await import('./settingsService');
  const endpoint = await SettingsService.get('stage2_endpoint');
  const token    = await SettingsService.get('stage2_token');
  const siteId   = await SettingsService.get('site_id');
  const hwId    = await SettingsService.get('hw_id');

  if (!endpoint) throw new Error('stage2_endpoint not configured — set via Settings sync');
  if (!token)    throw new Error('stage2_token not configured — deploy site token to tablet');

  return { endpoint, token, siteId: siteId ?? '', hwId: hwId ?? '' };
}

// ─── Liveness check ───────────────────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    const { endpoint, token } = await getStage2Config();
    const resp = await fethwithTimeout(
      `${endpoint}/v1/health`,
      { headers: { Authorization: `Bearer ${token}` } },
      5_000,
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Submit ───────────────────────────────────────────────────────────────────

export async function uploadToStage2(row: Stage2SubmitRow): Promise<Stage2Response> {
  const { endpoint, token, siteId, hwId } = await getStage2Config();

  // Verify the audio file exists before attempting upload
  const fileExists = await RNFS.exists(row.recording_path);
  if (!fileExists) throw new Error(`Recording file not found: ${row.recording_path}`);

  const formData = new FormData();
  formData.append('audio', {
    uri:  `file://${row.recording_path}`,
    name: `${row.capture_id}.pcg.wav`,
    type: 'audio/wav',
  } as any);
  formData.append('capture_id',       row.capture_id);
  formData.append('patient_ref',      row.study_code);
  formData.append('site',             row.site);
  formData.append('posture',          row.posture ?? 'sitting');
  formData.append('model_version',    row.model_version);
  formData.append('s1_confidence',    String(row.s1_confidence));
  formData.append('s1_raw_logits',    row.s1_raw_logits ?? '[]');
  formData.append('recording_sha256', row.recording_sha256);
  formData.append('duration_ms',      String(row.duration_ms ?? 0));
  formData.append('peak_quality',     String(row.peak_quality ?? 0));
  formData.append('captured_at',      row.captured_at.toISOString());
  formData.append('cardiosleeve_id',  row.cardiosleeve_id ?? 'unknown');
  formData.append('hw_id',           hwId);
  formData.append('site_id',          siteId);
  formData.append('app_version',      row.app_version);

  let resp: Response;
  try {
    resp = await fethwithTimeout(
      `${endpoint}/v1/captures/submit`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    formData,
      },
      60_000,  // 60 s — audio upload over rural connectivity can be slow
    );
  } catch (networkErr) {
    // Network-level failure (no connectivity, DNS failure, timeout)
    throw Object.assign(networkErr as Error, { retryable: true });
  }

  // ── 409 idempotency hit ───────────────────────────────────────────────────
  if (resp.status === 409) {
    const body = await resp.json();
    const resultResp = await fethwithTimeout(
      `${endpoint}${body.result_url}`,
      { headers: { Authorization: `Bearer ${token}` } },
      10_000,
    );
    if (!resultResp.ok) throw new Error(`Stage2 result fetch after 409 returned ${resultResp.status}`);
    return await resultResp.json() as Stage2Response;
  }

  // ── Non-retryable errors ──────────────────────────────────────────────────
  if (resp.status === 400 || resp.status === 413) {
    const body = await resp.text();
    throw Object.assign(
      new Error(`Stage2 rejected upload: HTTP ${resp.status} — ${body}`),
      { retryable: false },
    );
  }

  if (resp.status === 401 || resp.status === 403) {
    throw Object.assign(
      new Error('Stage2 auth failed — site token may be expired or revoked'),
      { retryable: false, authFailure: true },
    );
  }

  // ── 429 rate limit ────────────────────────────────────────────────────────
  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '60', 10);
    throw Object.assign(
      new Error(`Stage2 rate limited — retry after ${retryAfter}s`),
      { retryable: true, retryAfterMs: retryAfter * 1000 },
    );
  }

  // ── 5xx server errors ─────────────────────────────────────────────────────
  if (resp.status >= 500) {
    throw Object.assign(
      new Error(`Stage2 server error: HTTP ${resp.status}`),
      { retryable: true },
    );
  }

  if (!resp.ok) {
    throw new Error(`Stage2 unexpected HTTP ${resp.status}`);
  }

  const result = await resp.json();

  // ── 202 async ─────────────────────────────────────────────────────────────
  if (result.status === 'processing') {
    return await pollUntilDone(endpoint, token, result.job_id, result.poll_after_seconds ?? 20);
  }

  // ── 200 synchronous result ────────────────────────────────────────────────
  return result as Stage2Response;
}

// ─── Polling ──────────────────────────────────────────────────────────────────

const MAX_POLLS  = 12;
const POLL_GAP_S = 20;

async function pollUntilDone(
  endpoint:        string,
  token:           string,
  jobId:           string,
  initialDelaySec: number,
): Promise<Stage2Response> {
  await sleep(initialDelaySec * 1000);

  for (let i = 0; i < MAX_POLLS; i++) {
    let resp: Response;
    try {
      resp = await fethwithTimeout(
        `${endpoint}/v1/captures/${jobId}/result`,
        { headers: { Authorization: `Bearer ${token}` } },
        5_000,
      );
    } catch {
      await sleep(POLL_GAP_S * 1000);
      continue;
    }

    if (resp.status === 404 || resp.status === 410) {
      throw Object.assign(new Error('Stage2 job not found — will resubmit'), { resubmit: true });
    }

    if (!resp.ok) {
      throw new Error(`Stage2 poll returned HTTP ${resp.status}`);
    }

    const body = await resp.json();
    if (body.verdict) return body as Stage2Response;

    await sleep((body.poll_after_seconds ?? POLL_GAP_S) * 1000);
  }

  throw new Error('Stage2 polling timed out');
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface DailyMetrics {
  sessions_opened:      number;
  sessions_closed:      number;
  pcg_captures_total:   number;
  pcg_normal:           number;
  pcg_abnormal:         number;
  pcg_inconclusive:     number;
  ecg_captures_total:   number;
  stage2_queued:        number;
  stage2_confirmed:     number;
  stage2_pending:       number;
  stage2_failed:        number;
}

export async function submitDailyMetrics(date: string, counts: DailyMetrics): Promise<void> {
  try {
    const { endpoint, token, siteId, hwId } = await getStage2Config();
    const { SettingsService } = await import('./settingsService');
    const appVersion = await SettingsService.get('app_version') ?? 'unknown';

    const resp = await fethwithTimeout(
      `${endpoint}/v1/metrics/daily`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          site_id:      siteId,
          date,
          hw_id:       hwId,
          counts,
          app_version:  appVersion,
          reported_at:  new Date().toISOString(),
        }),
      },
      15_000,
    );

    // 409 = already submitted for this date — that's fine, server uses last-write-wins
    if (!resp.ok && resp.status !== 409) {
      console.warn(`[Metrics] Daily submit returned HTTP ${resp.status}`);
    }
  } catch (err) {
    // Metrics failure is non-critical — log and move on
    console.warn('[Metrics] Failed to submit daily metrics:', err);
  }
}

// ─── Roster sync ──────────────────────────────────────────────────────────────

export interface RosterEntry {
  hw_id:        string;
  name:          string;
  active:        boolean;
  last_modified: string;
}

export async function fetchRoster(): Promise<RosterEntry[]> {
  const { endpoint, token, siteId } = await getStage2Config();

  const resp = await fethwithTimeout(
    `${endpoint}/v1/roster/${siteId}`,
    { headers: { Authorization: `Bearer ${token}` } },
    10_000,
  );

  if (!resp.ok) throw new Error(`Roster fetch returned HTTP ${resp.status}`);

  const body = await resp.json();
  return body.roster as RosterEntry[];
}

// ─── Shared utility ───────────────────────────────────────────────────────────

function fethwithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

### 6.6 Error Taxonomy and App Action

Every error path has a defined app response. The sync worker checks the `retryable` flag on thrown errors to decide whether to burn a retry attempt:

| Condition | HTTP status / cause | `retryable` | App action |
|---|---|---|---|
| Bad audio file or missing required field | 400 | No | Mark `'failed'` immediately. Retrying the same payload will always fail. Log full response body for debugging. |
| Auth token expired or revoked | 401 / 403 | No | Mark `'failed'`. Set a persistent `auth_failure` flag in settings. Show "Sync paused — contact supervisor" banner in the Settings sync status panel. Do not block capture. |
| Capture already processed (idempotency) | 409 | No (fetch result) | Fetch result from `result_url`. Write to `stage2_results`. Mark `'done'`. This is a successful recovery, not a failure. |
| File too large | 413 | No | Mark `'failed'`. This should not happen given our 240 KB average — if it does, the recording was malformed. |
| Rate limited | 429 | Yes | Set `next_retry_at = now + Retry-After header value`. Do not increment `attempts`. |
| Server error | 5xx | Yes | Standard exponential backoff. Increment `attempts`. |
| Network timeout or no connectivity | Network error | Yes | Standard backoff. Do not increment `attempts` if health check also failed (implies site-wide outage, not a per-capture issue). |
| Polling timed out (no result after 12 polls) | — | Yes | Increment `attempts`. The next retry will resubmit the audio file. Server handles idempotency via 409. |
| Job not found during polling | 404 / 410 | Yes, `resubmit: true` | Reset `attempts = 0`, `next_retry_at = NULL`. Full resubmit on next flush. Does not burn the retry budget. |
| audio file missing from filesystem | — | No | Mark `'failed'`. The recording was deleted externally. Nothing to upload. Log the missing path for audit. |
| `stage2_endpoint` or `stage2_token` not set | — | No | Abort flush entirely. This is a deployment error. Surface "Stage 2 not configured" in Settings. |

---

### 6.7 Rate Limiting

Nginx applies rate limits to protect the inference pipeline:

| Endpoint | Limit | Scope |
|---|---|---|
| `POST /v1/captures/submit` | 10 req/min | Per site token |
| `GET /v1/captures/*/result` | 60 req/min | Per site token |
| `GET /v1/health` | 120 req/min | Per IP |
| `POST /v1/metrics/daily` | 5 req/min | Per site token |
| `GET /v1/roster/*` | 10 req/min | Per site token |
| `POST /auth/login` | 10 req/min | Per IP |

At 25 patients/day with ~20% abnormal rate, the app generates ~5 submissions/day per site — nowhere near the limits. The limits exist to protect against misbehaving app builds or a stolen token being used for abuse.

---

## 7. TypeScript Data Models

```typescript
// src/types/db.ts

export interface DbPatient {
  id:            string;
  study_code:    string;
  name:          string | null;
  date_of_birth: string | null;       // 'YYYY-MM-DD'
  sex:           'M' | 'F' | 'O' | null;
  rhd_history:   'yes' | 'no' | 'unknown' | null;
  height_cm:     number | null;
  weight_kg:     number | null;
  bp_sys:        number | null;
  bp_dia:        number | null;
  registered_by: string;
  site_id:       string;
  deleted_at:    number | null;
  created_at:    number;
  updated_at:    number;
}

export interface DbSession {
  id:         string;
  patient_id: string;
  hw_id:     string;
  site_id:    string;
  opened_at:  number;
  closed_at:  number | null;
}

export interface DbCapture {
  id:               string;
  session_id:       string;
  patient_id:       string;
  modality:         'pcg' | 'ecg';
  site:             string;
  posture:          'sitting' | 'supine' | 'left-lateral' | null;
  recording_path:   string;
  recording_sha256: string;
  duration_ms:      number;
  peak_quality:     number;
  cardiosleeve_id:  string;
  app_version:      string;
  captured_at:      number;
}

export interface DbStage1Result {
  id:            string;
  capture_id:    string;
  model_version: string;
  verdict:       'normal' | 'abnormal' | 'inconclusive';
  confidence:    number;
  raw_logits:    string;              // JSON array
  inference_ms:  number;
  run_at:        number;
}

export interface DbStage2Result {
  id:              string;
  capture_id:      string;
  remote_job_id:   string;
  verdict:         'normal' | 'abnormal-as-confirmed' | 'inconclusive';
  confidence:      number;
  additional_data: string | null;    // JSON blob
  received_at:     number;
}

export interface DbSyncQueueItem {
  id:              string;
  capture_id:      string;
  status:          'pending' | 'uploading' | 'done' | 'failed';
  attempts:        number;
  queued_at:       number;
  last_attempt_at: number | null;
  next_retry_at:   number | null;
  last_error:      string | null;
}

/** Denormalised view model for History screen — result of a JOIN query */
export interface PatientSummaryView {
  patient:       DbPatient;
  latestSession: DbSession | null;
  hsVerdict:     'normal' | 'abnormal-pending' | 'abnormal-confirmed' | 'inconclusive' | 'none';
  hrStatus:      'captured' | 'none';
  pendingSyncs:  number;
  failedSyncs:   number;
}
```

---

## 8. Storage Service Public API

```typescript
// src/services/storage.ts — public interface

// Lifecycle
openDb(): Promise<void>
db(): SQLiteDatabase   // throws if openDb() not called

// Patients
getPatient(id: string): Promise<DbPatient | null>
searchPatients(query: string): Promise<DbPatient[]>
upsertPatient(p: Omit<DbPatient, 'created_at' | 'updated_at'>): Promise<void>
softDeletePatient(id: string): Promise<void>

// Sessions
openSession(patientId: string, hwId: string, siteId: string): Promise<DbSession>
closeSession(sessionId: string): Promise<void>
getLatestSession(patientId: string): Promise<DbSession | null>

// Captures
createCapture(c: Omit<DbCapture, 'id' | 'captured_at'>): Promise<DbCapture>
getCapturesForSession(sessionId: string): Promise<DbCapture[]>

// Stage 1
saveStage1Result(r: Omit<DbStage1Result, 'id' | 'run_at'>): Promise<void>
getStage1Result(captureId: string): Promise<DbStage1Result | null>

// Stage 2
saveStage2Result(r: Omit<DbStage2Result, 'id' | 'received_at'>): Promise<void>
getStage2Result(captureId: string): Promise<DbStage2Result | null>

// History
getPatientSummaries(filter?: FilterOption): Promise<PatientSummaryView[]>

// Settings
getSetting(key: string): Promise<string | null>
setSetting(key: string, value: string): Promise<void>

// Cleanup
pruneCompletedSyncItems(olderThanDays?: number): Promise<void>   // default 30
```

---

## 9. Security

| Layer | Mechanism | Rationale |
|---|---|---|
| Database at rest | SQLCipher AES-256, key from Android Keystore | Clinical data on a tablet that could be lost or shared |
| Audio files at rest | App private directory (no world-readable) | Android sandbox; same key scope as DB |
| Stage 2 token | Stored in SQLCipher `settings` table (not in plaintext SharedPrefs) | Token compromise = all sites' data accessible; must be protected |
| Data in transit | HTTPS/TLS 1.2+ only | Non-negotiable for any health data |
| Patient PII in transit | Only `study_code` travels to Stage 2 | Real name and DOB stay on device |
| hw authentication | Local PIN — hw is authenticated to the device, not to Stage 2 | Simpler for field deployment; `hw_id` in Stage 2 requests provides audit trail |

---

## 10. Server-Side Architecture

> The server-side backend — PostgreSQL schema, FastAPI implementation, authentication layers, de-identified export, model version management, dashboard API, deployment, and Docker Compose configuration — is fully specified in [`Dashboard/docs/BACKEND.md`](../../Dashboard/docs/BACKEND.md). That document is the authoritative reference for everything that runs on the cloud VM.

This mobile app document covers only what runs on the Android device: the SQLite schema, file storage, Stage 1 inference, sync worker, and the HTTP client contract for each endpoint the app calls.

---

## 11. Migration from Current Flat Schema

The current `storage.ts` has one `patients` table with result columns flat on the patient row (`hs`, `hr`, `hsSite`, etc.). The migration to the normalised schema is handled as schema version 1 (the first migration), because there are no records to preserve yet in this phase.

If the migration happens after real pilot data has been collected:
1. Schema version 1 creates all six new tables.
2. A one-time `backfillLegacyData()` function reads the flat `patients` table and synthesises `sessions` + `captures` + `stage1_results` rows for each patient that has a non-`'none'` `hs` or `hr` value.
3. The legacy columns (`hs`, `hr`, `hsSite`, etc.) remain on `patients` and are no longer written to, but they are not dropped until the backfill is validated (schema version 2).
4. Existing screens continue reading the flat `Patient` type via a compatibility shim that joins the new tables and derives the legacy shape. This shim is removed once screens are migrated.

---

## 12. Open Questions (Genuinely External — Cannot Be Decided Here)

| # | Question | Who decides | Blocked implementation |
|---|---|---|---|
| 1 | Which fields does the IRB approve for patient records? Specifically: is `name` permitted, or study code only? Is DOB permitted or just year of birth? | IRB / ethics committee | Whether `name` and `date_of_birth` columns are nullable vs. removed entirely from the schema |
| 2 | What is the Stage 2 API endpoint URL and auth token value? | Stage 2 service team | `settings.stage2_endpoint` and `settings.stage2_token` values at deployment |
| 3 | Does the Rijuven CardioSleeve SDK silently upload data to Rijuven's servers? | Rijuven (SDK review) | Whether an outbound firewall rule or SDK wrapper is needed to enforce local-only data sovereignty |
| 4 | What is the CardioSleeve's native PCG sample rate and ECG sample rate? | Rijuven hardware spec | Audio file format and `duration_ms` calculation |
| 5 | Is the pilot longitudinal (patients return for follow-up) or cross-sectional? | Clinical team | Whether `sessions` table complexity is needed now or can be deferred |
| 6 | Does the Stage 2 API use synchronous (200) or async (202) responses, and does it support idempotency keys? | Stage 2 service team | Polling implementation in `stage2Api.ts` |

---

