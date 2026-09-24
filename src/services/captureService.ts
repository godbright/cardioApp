import { Q } from '@nozbe/watermelondb';
import database from '../db';
import PatientRecord      from '../db/models/PatientRecord';
import SessionRecord      from '../db/models/SessionRecord';
import CaptureRecord      from '../db/models/CaptureRecord';
import Stage1ResultRecord from '../db/models/Stage1ResultRecord';
import SyncQueueRecord    from '../db/models/SyncQueueRecord';

export interface SaveCaptureParams {
  patientStudyCode: string;
  modality:         'pcg' | 'ecg';
  site:             string;
  posture:          string;
  workerId:         string;
  siteId:           string;
  // Stage 1 result — PCG only; absent for ECG (analysis pipeline pending)
  verdict?:      'normal' | 'abnormal' | 'inconclusive';
  confidence?:   number;
  modelVersion?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getPatientDbId(studyCode: string): Promise<string> {
  const records = await database
    .get<PatientRecord>('patients')
    .query(Q.where('study_code', studyCode))
    .fetch();

  if (records.length === 0) {
    throw new Error(`[CaptureService] Patient not found in DB: ${studyCode}. Call savePatient first.`);
  }
  return records[0].id;
}

// Returns the WatermelonDB ID of an open session for (patient, today),
// creating one if none exists.
async function getOrCreateSession(
  patientDbId: string,
  workerId:    string,
  siteId:      string,
): Promise<string> {
  const sessionsCol = database.get<SessionRecord>('sessions');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const open = await sessionsCol
    .query(
      Q.where('patient_id', patientDbId),
      Q.where('opened_at',  Q.gte(todayStart.getTime())),
      Q.where('closed_at',  null),
    )
    .fetch();

  if (open.length > 0) return open[0].id;

  let sessionId = '';
  await database.write(async () => {
    const session = await sessionsCol.create(rec => {
      rec.patientId = patientDbId;
      rec.workerId  = workerId;
      rec.siteId    = siteId;
      rec.openedAt  = new Date();
      rec.closedAt  = null;
    });
    sessionId = session.id;
  });
  return sessionId;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns the WatermelonDB id of the new capture row. */
export async function saveCapture(params: SaveCaptureParams): Promise<string> {
  const patientDbId = await getPatientDbId(params.patientStudyCode);
  const sessionId   = await getOrCreateSession(patientDbId, params.workerId, params.siteId);

  let captureId = '';
  await database.write(async () => {
    const capture = await database.get<CaptureRecord>('captures').create(rec => {
      rec.sessionId       = sessionId;
      rec.patientId       = patientDbId;
      rec.modality        = params.modality;
      rec.site            = params.site;
      rec.posture         = params.posture || null;
      rec.recordingPath   = '';   // filled in by updateRecordingPath once WAV arrives
      rec.recordingSha256 = '';
      rec.appVersion      = '0.1.0';
      rec.capturedAt      = new Date();
    });
    captureId = capture.id;

    if (params.modality === 'pcg' && params.verdict) {
      await database.get<Stage1ResultRecord>('stage1_results').create(rec => {
        rec.captureId    = capture.id;
        rec.modelVersion = params.modelVersion ?? 'v0.0.0-sim';
        rec.verdict      = params.verdict!;
        rec.confidence   = params.confidence ?? 0;
        rec.rawLogits    = null;
        rec.inferenceMs  = null;
        rec.runAt        = new Date();
      });

      // sync_queue is created in updateRecordingPath once the WAV file exists on disk,
      // so the sync worker never sees a queue row with an empty recording_path.
    }
  });
  return captureId;
}

/**
 * Fallback for the captureId timing race: returns the WatermelonDB id of the
 * most recent PCG capture whose recording_path is still empty, captured within
 * the last 5 minutes. Returns '' when nothing qualifies.
 */
export async function findUnpatchedCapture(): Promise<string> {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 min window
  const rows = await database
    .get<CaptureRecord>('captures')
    .query(
      Q.where('modality',         'pcg'),
      Q.where('recording_path',   ''),
      Q.where('captured_at',      Q.gte(cutoff)),
      Q.sortBy('captured_at',     Q.desc),
      Q.take(1),
    )
    .fetch();
  return rows[0]?.id ?? '';
}

/**
 * Patches an existing capture record with the on-disk WAV path and its SHA-256
 * hash once the BLE transfer completes. Called from onRecordingComplete after
 * the file has been written to device storage.
 */
export async function updateRecordingPath(
  captureId: string,
  recordingPath: string,
  recordingSha256: string,
): Promise<void> {
  if (!captureId) return;
  // Use .find() for primary-key lookup — Q.where('id', ...) bypasses
  // WatermelonDB's internal ID index and can misbehave on some builds.
  let record: CaptureRecord | null = null;
  try {
    record = await database.get<CaptureRecord>('captures').find(captureId);
  } catch {
    console.warn('[CaptureService] updateRecordingPath — captureId not found:', captureId);
    return;
  }
  if (!record) {
    console.warn('[CaptureService] updateRecordingPath — captureId returned null:', captureId);
    return;
  }

  // After patching the path, check whether this capture needs a sync_queue entry.
  // We create the queue row here (not in saveCapture) so the sync worker is never
  // handed a row whose recording_path is still empty.
  const s1Results = await database
    .get<Stage1ResultRecord>('stage1_results')
    .query(Q.where('capture_id', captureId))
    .fetch();
  const isAbnormal = s1Results.length > 0 && s1Results[0].verdict === 'abnormal';

  let existingQueue: SyncQueueRecord[] = [];
  if (isAbnormal) {
    existingQueue = await database
      .get<SyncQueueRecord>('sync_queue')
      .query(Q.where('capture_id', captureId))
      .fetch();
  }

  await database.write(async () => {
    await record!.update(rec => {
      rec.recordingPath   = recordingPath;
      rec.recordingSha256 = recordingSha256;
    });
    if (isAbnormal && existingQueue.length === 0) {
      await database.get<SyncQueueRecord>('sync_queue').create(rec => {
        rec.captureId     = captureId;
        rec.status        = 'pending';
        rec.attempts      = 0;
        rec.queuedAt      = new Date();
        rec.lastAttemptAt = null;
        rec.nextRetryAt   = null;
        rec.lastError     = null;
      });
    }
  });
}

// ── Per-site data for MeasurementsScreen ──────────────────────────────────────

export interface SiteCapture {
  playbackPath:  string | null;
  verdict:       'normal' | 'abnormal' | 'inconclusive' | null;
  confidence:    number | null;
  modelVersion:  string | null;
  posture:       string | null;
  capturedAt:    Date | null;
}

const EMPTY_SITE_CAPTURE: SiteCapture = {
  playbackPath: null, verdict: null, confidence: null,
  modelVersion: null, posture: null, capturedAt: null,
};

/**
 * Fetch the most recent capture for a given patient / site / modality and
 * its Stage 1 result. Returns an empty record if nothing has been captured yet.
 */
export async function getCaptureForSite(
  patientStudyCode: string,
  site:             string,
  modality:         'pcg' | 'ecg',
): Promise<SiteCapture> {
  const patientDbId = await getPatientDbId(patientStudyCode).catch(() => null);
  if (!patientDbId) return { ...EMPTY_SITE_CAPTURE };

  const captures = await database
    .get<CaptureRecord>('captures')
    .query(
      Q.where('patient_id', patientDbId),
      Q.where('site',       site),
      Q.where('modality',   modality),
      Q.sortBy('captured_at', Q.desc),
      Q.take(1),
    )
    .fetch();

  if (captures.length === 0) return { ...EMPTY_SITE_CAPTURE };
  const cap = captures[0];

  // recordingPath already points to the playable WAV (_play.wav) written by App.tsx.
  const playbackPath = cap.recordingPath || null;

  const s1s = await database
    .get<Stage1ResultRecord>('stage1_results')
    .query(Q.where('capture_id', cap.id))
    .fetch();
  const s1 = s1s[0] ?? null;

  return {
    playbackPath,
    verdict:      s1?.verdict      ?? null,
    confidence:   s1?.confidence   ?? null,
    modelVersion: s1?.modelVersion ?? null,
    posture:      cap.posture,
    capturedAt:   cap.capturedAt,
  };
}

export async function closeSession(patientStudyCode: string): Promise<void> {
  const patientDbId = await getPatientDbId(patientStudyCode).catch(() => null);
  if (!patientDbId) return; // patient not in DB yet — nothing to close

  const sessionsCol = database.get<SessionRecord>('sessions');
  const open = await sessionsCol
    .query(
      Q.where('patient_id', patientDbId),
      Q.where('closed_at',  null),
    )
    .fetch();

  if (open.length === 0) return;

  await database.write(async () => {
    await open[0].update(rec => {
      rec.closedAt = new Date();
    });
  });
}
