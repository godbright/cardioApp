/**
 * Stage 2 sync worker — DB-backed, survives app restarts.
 *
 * captureService.ts writes a `sync_queue` row (status='pending') whenever
 * Stage 1 flags an abnormal PCG recording. This worker picks those rows up,
 * calls POST /v1/captures/submit on the backend (multipart/form-data, site JWT
 * auth), writes the Stage 2 result to `stage2_results`, and notifies AppContext
 * to refresh the patient list.
 *
 * Async polling: when the backend returns a job_id without an immediate
 * s2_verdict, the worker polls GET /v1/captures/{job_id}/result with
 * exponential backoff until the job completes or the maximum wait is exceeded.
 *
 * When STAGE2_SIMULATE is true (default in __DEV__) the HTTP calls are
 * bypassed entirely so the pipeline can be tested without a live backend.
 */

import { Q } from '@nozbe/watermelondb';
import database from '../db';
import SyncQueueRecord    from '../db/models/SyncQueueRecord';
import CaptureRecord      from '../db/models/CaptureRecord';
import PatientRecord      from '../db/models/PatientRecord';
import Stage1ResultRecord from '../db/models/Stage1ResultRecord';
import Stage2ResultRecord from '../db/models/Stage2ResultRecord';
import {
  submitCapture,
  getJobResult,
  Stage2ApiError,
  Stage2NotConfiguredError,
  type S2Verdict,
  type SubmitCaptureResponse,
} from './stage2Api';
import { SettingsService } from './settingsService';

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_ATTEMPTS       = 8;
const BACKOFF_BASE_MS    = 15_000;  // 15 s — doubles each attempt, cap ~32 min
const POLL_INTERVAL_MS   = 30_000;  // 30 s background flush cycle
const JOB_POLL_MAX_MS    = 120_000; // 2 min max wait for async Stage 2 job
const JOB_POLL_STEP_MS   = 5_000;  // 5 s between job-result polls

// ─── Module state ─────────────────────────────────────────────────────────────

let _flushing = false;
let _resultCb: ((captureId: string) => void) | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/** Register a callback that fires whenever a Stage 2 result arrives. */
export function onStage2Result(cb: (captureId: string) => void): void {
  _resultCb = cb;
}

/**
 * Start the background poll. Call once at app launch (e.g. in App.tsx).
 * Also resets rows stuck in 'uploading' from a previous crash.
 */
export function startSyncWorker(): void {
  _resetStuckUploads().catch(e => console.warn('[SyncWorker] reset stuck uploads:', e));
  _flush();
  setInterval(_flush, POLL_INTERVAL_MS);
}

/** Trigger an immediate flush without waiting for the next poll cycle. */
export function triggerFlush(): void {
  if (!_flushing) _flush();
}

/**
 * Manual sync — resets backoff timers on pending rows and revives failed rows
 * so they are eligible for the next flush regardless of retry schedule.
 * Use this for explicit user-initiated sync (e.g. "Sync Now" button).
 */
export async function forceFlush(): Promise<void> {
  const collection = database.get<SyncQueueRecord>('sync_queue');

  const [pending, failed] = await Promise.all([
    collection.query(Q.where('status', 'pending')).fetch(),
    collection.query(Q.where('status', 'failed')).fetch(),
  ]);

  const toReset = [...pending, ...failed];
  if (toReset.length > 0) {
    await database.write(async () => {
      for (const row of toReset) {
        await row.update(r => {
          r.status      = 'pending';
          r.nextRetryAt = null;   // clear backoff — eligible immediately
        });
      }
    });
  }

  _flush();
}

/** Count of recordings waiting for Stage 2 confirmation. */
export async function getPendingCount(): Promise<number> {
  const rows = await database
    .get<SyncQueueRecord>('sync_queue')
    .query(Q.where('status', 'pending'))
    .fetch();
  return rows.length;
}

/** Count of recordings that exhausted all retry attempts. */
export async function getFailedCount(): Promise<number> {
  const rows = await database
    .get<SyncQueueRecord>('sync_queue')
    .query(Q.where('status', 'failed'))
    .fetch();
  return rows.length;
}

// ─── Worker internals ─────────────────────────────────────────────────────────

async function _flush(): Promise<void> {
  if (_flushing) return;
  _flushing = true;
  try {
    const now  = Date.now();
    const rows = await database
      .get<SyncQueueRecord>('sync_queue')
      .query(
        Q.where('status', 'pending'),
        Q.or(
          Q.where('next_retry_at', null),
          Q.where('next_retry_at', Q.lte(now)),
        ),
      )
      .fetch();

    for (const row of rows) {
      await _processRow(row);
    }
  } catch (err) {
    console.warn('[SyncWorker] flush error:', err);
  } finally {
    _flushing = false;
  }
}

async function _processRow(row: SyncQueueRecord): Promise<void> {
  // Optimistic lock — mark as uploading so concurrent flushes skip this row.
  await database.write(async () => {
    await row.update(r => { r.status = 'uploading'; });
  });

  try {
    const [capture, stage1, patient] = await _loadCaptureMeta(row.captureId);
    const s2Result = await _upload(capture, stage1, patient);

    await database.write(async () => {
      await database.get<Stage2ResultRecord>('stage2_results').create(r => {
        r.captureId      = row.captureId;
        r.remoteJobId    = s2Result.job_id ?? null;
        r.verdict        = s2Result.s2_verdict ?? 'inconclusive';
        r.confidence     = s2Result.s2_confidence ?? null;
        r.additionalData = null;
        r.receivedAt     = new Date();
      });
      await row.update(r => {
        r.status    = 'done';
        r.lastError = null;
      });
    });

    console.log(
      `[SyncWorker] Stage 2 result for ${row.captureId}:`,
      s2Result.s2_verdict, `(conf=${s2Result.s2_confidence ?? 'n/a'})`,
    );
    _resultCb?.(row.captureId);

  } catch (err) {
    // Hermes bug: catch-clause variables can't be referenced inside a nested
    // async arrow function (database.write callback). Extract everything needed
    // from err before any closure boundary.
    const isConfigError = err instanceof Stage2NotConfiguredError;
    // 4xx errors (except 401/429) indicate a permanently bad payload — no point retrying.
    const isPermanent   = err instanceof Stage2ApiError
      && err.status >= 400 && err.status < 500
      && err.status !== 401 && err.status !== 429;
    const errMessage    = err instanceof Error ? err.message : String(err);
    const attempts      = (row.attempts ?? 0) + 1;
    const gaveUp        = !isConfigError && (isPermanent || attempts >= MAX_ATTEMPTS);
    const backoffMs     = BACKOFF_BASE_MS * Math.pow(2, attempts - 1);
    const nextRetry     = gaveUp || isConfigError ? null : new Date(Date.now() + backoffMs);

    await database.write(async () => {
      await row.update(r => {
        r.status        = gaveUp ? 'failed' : 'pending';
        r.attempts      = attempts;
        r.lastAttemptAt = new Date();
        r.nextRetryAt   = nextRetry;
        r.lastError     = errMessage;
      });
    });

    if (isConfigError) {
      console.warn('[SyncWorker] Stage 2 not configured — sync paused until endpoint/token are set in Settings.');
    } else if (gaveUp) {
      console.warn(`[SyncWorker] Capture ${row.captureId} permanently failed after ${MAX_ATTEMPTS} attempts.`);
    } else {
      console.warn(`[SyncWorker] Capture ${row.captureId} attempt ${attempts} failed: ${errMessage}`);
    }
  }
}

async function _loadCaptureMeta(
  captureId: string,
): Promise<[CaptureRecord, Stage1ResultRecord, PatientRecord]> {
  const capture = await database.get<CaptureRecord>('captures').find(captureId);
  const patient = await database.get<PatientRecord>('patients').find(capture.patientId);
  const stage1s = await database
    .get<Stage1ResultRecord>('stage1_results')
    .query(Q.where('capture_id', captureId))
    .fetch();
  if (!stage1s[0]) throw new Error(`No Stage 1 result found for capture ${captureId}`);
  return [capture, stage1s[0], patient];
}

// ─── Upload ───────────────────────────────────────────────────────────────────

interface S2Result {
  job_id?:       string;
  s2_verdict?:   S2Verdict;
  s2_confidence?: number;
}

async function _upload(
  capture: CaptureRecord,
  stage1:  Stage1ResultRecord,
  patient: PatientRecord,
): Promise<S2Result> {
  const hwId = await SettingsService.getHwId();

  const response: SubmitCaptureResponse = await submitCapture({
    captureId:       capture.id,
    patientRef:      patient.studyCode,
    valveSite:       capture.site,
    posture:         capture.posture ?? null,
    modelVersion:    stage1.modelVersion,
    s1Confidence:    stage1.confidence,
    s1Verdict:       stage1.verdict as 'normal' | 'abnormal' | 'inconclusive',
    s1RawLogits:     stage1.rawLogits ? JSON.parse(stage1.rawLogits) : null,
    durationMs:      capture.durationMs ?? null,
    peakQuality:     capture.peakQuality ?? null,
    appVersion:      capture.appVersion ?? '0.1.0',
    cardioSleeveId:  hwId || capture.cardioSleeveId || null,
    recordingSha256: capture.recordingSha256 ?? '',
    recordingPath:   capture.recordingPath || null,
  });

  // If Stage 2 ran synchronously, return the inline result.
  if (response.s2_verdict) {
    return {
      job_id:        response.job_id,
      s2_verdict:    response.s2_verdict,
      s2_confidence: response.s2_confidence,
    };
  }

  // Otherwise poll for the async job result.
  if (response.job_id) {
    return _pollJobResult(response.job_id);
  }

  // Stage 1 was normal — no Stage 2 job issued (shouldn't reach here because
  // only abnormal captures are enqueued, but handle gracefully).
  return { s2_verdict: 'normal' };
}

async function _pollJobResult(jobId: string): Promise<S2Result> {
  const deadline = Date.now() + JOB_POLL_MAX_MS;

  while (Date.now() < deadline) {
    await new Promise<void>(res => setTimeout(res, JOB_POLL_STEP_MS));

    const result = await getJobResult(jobId);

    if (result.status === 'complete') {
      return {
        job_id:        jobId,
        s2_verdict:    result.s2_verdict,
        s2_confidence: result.s2_confidence,
      };
    }

    if (result.status === 'failed') {
      throw new Error(`Stage 2 job ${jobId} failed on the server.`);
    }
    // status === 'pending' — keep polling
  }

  // Timed out — throw so the row goes back to pending for the next flush cycle.
  throw new Error(`Stage 2 job ${jobId} did not complete within ${JOB_POLL_MAX_MS / 1000}s.`);
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

async function _resetStuckUploads(): Promise<void> {
  const stuck = await database
    .get<SyncQueueRecord>('sync_queue')
    .query(Q.where('status', 'uploading'))
    .fetch();

  if (stuck.length === 0) return;

  await database.write(async () => {
    for (const row of stuck) {
      await row.update(r => { r.status = 'pending'; });
    }
  });

  console.log(`[SyncWorker] Reset ${stuck.length} stuck upload(s) to pending.`);
}
