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

export async function saveCapture(params: SaveCaptureParams): Promise<void> {
  const patientDbId = await getPatientDbId(params.patientStudyCode);
  const sessionId   = await getOrCreateSession(patientDbId, params.workerId, params.siteId);

  await database.write(async () => {
    const capture = await database.get<CaptureRecord>('captures').create(rec => {
      rec.sessionId       = sessionId;
      rec.patientId       = patientDbId;
      rec.modality        = params.modality;
      rec.site            = params.site;
      rec.posture         = params.posture || null;
      rec.recordingPath   = '';   // placeholder until audio recording is wired
      rec.recordingSha256 = '';   // placeholder
      rec.appVersion      = '0.1.0';
      rec.capturedAt      = new Date();
    });

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

      // Enqueue for Stage 2 only if abnormal — this is the whole point of the cascade.
      if (params.verdict === 'abnormal') {
        await database.get<SyncQueueRecord>('sync_queue').create(rec => {
          rec.captureId     = capture.id;
          rec.status        = 'pending';
          rec.attempts      = 0;
          rec.queuedAt      = new Date();
          rec.lastAttemptAt = null;
          rec.nextRetryAt   = null;
          rec.lastError     = null;
        });
      }
    }
  });
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
