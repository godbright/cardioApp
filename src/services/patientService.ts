import { Q } from '@nozbe/watermelondb';
import database from '../db';
import PatientRecord       from '../db/models/PatientRecord';
import CaptureRecord       from '../db/models/CaptureRecord';
import Stage1ResultRecord from '../db/models/Stage1ResultRecord';
import Stage2ResultRecord from '../db/models/Stage2ResultRecord';
import type { Patient, HeartSoundStatus, HeartRhythmStatus } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageToDob(age: number): string {
  return `${new Date().getFullYear() - age}-01-01`;
}

function dobToAge(dob: string | null): number {
  if (!dob) return 0;
  return new Date().getFullYear() - parseInt(dob.substring(0, 4), 10);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Maps stage1 verdict → HeartSoundStatus, checking stage2_results for confirmed ones.
async function resolveHsStatus(
  captureId: string,
  verdict: 'normal' | 'abnormal' | 'inconclusive',
): Promise<HeartSoundStatus> {
  if (verdict === 'normal')       return 'normal';
  if (verdict === 'inconclusive') return 'inconclusive';

  // For abnormal: check stage2_results — if a row exists, Stage 2 has confirmed.
  const stage2Rows = await database
    .get<Stage2ResultRecord>('stage2_results')
    .query(Q.where('capture_id', captureId))
    .fetch();

  return stage2Rows.length > 0 ? 'abnormal-confirmed' : 'abnormal-pending';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function savePatient(
  patient: Patient,
  workerId: string,
  siteId: string,
): Promise<void> {
  const col      = database.get<PatientRecord>('patients');
  const existing = await col.query(Q.where('study_code', patient.id)).fetch();

  await database.write(async () => {
    if (existing.length > 0) {
      await existing[0].update(rec => {
        rec.name        = patient.name || null;
        rec.dateOfBirth = patient.age ? ageToDob(patient.age) : null;
        rec.sex         = patient.sex || null;
        rec.rhdHistory  = patient.rhd || null;
        rec.heightCm    = patient.height ?? null;
        rec.weightKg    = patient.weight ?? null;
        rec.bpSys       = patient.bpSys ?? null;
        rec.bpDia       = patient.bpDia ?? null;
        rec.deletedAt   = null; // restore soft-deleted patient if study_code is reused
      });
    } else {
      await col.create(rec => {
        rec.studyCode   = patient.id;
        rec.name        = patient.name || null;
        rec.dateOfBirth = patient.age ? ageToDob(patient.age) : null;
        rec.sex         = patient.sex || null;
        rec.rhdHistory  = patient.rhd || null;
        rec.heightCm    = patient.height ?? null;
        rec.weightKg    = patient.weight ?? null;
        rec.bpSys       = patient.bpSys ?? null;
        rec.bpDia       = patient.bpDia ?? null;
        rec.registeredBy = workerId;
        rec.siteId      = siteId;
        rec.deletedAt   = null;
      });
    }
  });
}

export async function softDeletePatient(studyCode: string): Promise<void> {
  const col     = database.get<PatientRecord>('patients');
  const records = await col.query(Q.where('study_code', studyCode)).fetch();
  if (records.length === 0) return;

  await database.write(async () => {
    await records[0].update(rec => {
      rec.deletedAt = Date.now();
    });
  });
}

export async function loadAllPatients(): Promise<Patient[]> {
  const patientsCol = database.get<PatientRecord>('patients');
  const capturesCol = database.get<CaptureRecord>('captures');
  const stage1Col   = database.get<Stage1ResultRecord>('stage1_results');

  // Defensive: match both SQL NULL and 0 as "not deleted". Some WatermelonDB
  // versions / Android builds store 0 instead of NULL for optional number
  // columns, which would make the null-only filter return nothing.
  const patientRecords = await patientsCol
    .query(
      Q.or(
        Q.where('deleted_at', null),
        Q.where('deleted_at', Q.lte(0)),
      ),
    )
    .fetch();

  if (__DEV__) {
    const total = await patientsCol.query().fetch();
    console.log(`[PatientService] DB has ${total.length} total patients, ${patientRecords.length} active (not deleted).`);
  }

  const patients: Patient[] = [];

  for (const pr of patientRecords) {
    const captures = await capturesCol
      .query(Q.where('patient_id', pr.id), Q.sortBy('captured_at', Q.desc))
      .fetch();

    const latestPcg = captures.find(c => c.modality === 'pcg') ?? null;
    const latestEcg = captures.find(c => c.modality === 'ecg') ?? null;

    // ── Resolve PCG status ────────────────────────────────────────────────────
    let hs: HeartSoundStatus = 'none';
    let hsSite:       string | undefined;
    let hsPosture:    string | undefined;
    let hsConfidence: string | undefined;
    let hsModel:      string | undefined;

    if (latestPcg) {
      hsSite    = latestPcg.site;
      hsPosture = latestPcg.posture ?? undefined;

      const stage1Rows = await stage1Col
        .query(Q.where('capture_id', latestPcg.id))
        .fetch();

      if (stage1Rows.length > 0) {
        const r = stage1Rows[0];
        hs          = await resolveHsStatus(latestPcg.id, r.verdict);
        hsConfidence = String(r.confidence);
        hsModel      = r.modelVersion;
      }
    }

    // ── Resolve ECG status ────────────────────────────────────────────────────
    const hr: HeartRhythmStatus = latestEcg ? 'ecg-captured' : 'none';
    const hrLead    = latestEcg?.site;
    const hrPosture = latestEcg?.posture ?? undefined;

    // ── Last exam date ────────────────────────────────────────────────────────
    const mostRecent = captures[0];
    const lastExam   = mostRecent ? formatDate(mostRecent.capturedAt) : '—';

    patients.push({
      id:      pr.studyCode,
      name:    pr.name ?? '',
      age:     dobToAge(pr.dateOfBirth),
      sex:     (pr.sex as Patient['sex']) ?? '',
      rhd:     (pr.rhdHistory as Patient['rhd']) ?? '',
      height:  pr.heightCm,
      weight:  pr.weightKg,
      bpSys:   pr.bpSys,
      bpDia:   pr.bpDia,
      lastExam,
      hs,
      hr,
      hsSite,
      hrLead,
      hsPosture: hsPosture as Patient['hsPosture'],
      hrPosture: hrPosture as Patient['hrPosture'],
      hsConfidence,
      hsModel,
    });
  }

  // Sort: patients with captures first (most recent first within that group),
  // then newly-created patients with no captures.
  return patients.sort((a, b) => {
    if (a.lastExam === '—' && b.lastExam !== '—') return 1;
    if (b.lastExam === '—' && a.lastExam !== '—') return -1;
    return 0;
  });
}
