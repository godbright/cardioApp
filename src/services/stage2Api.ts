/**
 * Stage 2 API client — wraps POST /v1/captures/submit and GET /v1/captures/{job_id}/result.
 *
 * Auth: the backend uses a long-lived site JWT (Bearer token) stored in the
 * encrypted settings table under key 'stage2Token', issued by the admin via
 * scripts/generate_site_jwt.py. All mobile endpoints require this token in the
 * Authorization header; no per-user login is needed from the tablet.
 *
 * The submit endpoint accepts multipart/form-data. When an audio file is
 * attached the backend validates its SHA-256; when no recording path exists yet
 * (audio pipeline not wired) the file field is omitted and sha256 is sent as an
 * empty string — the backend will store it but skips S3 upload validation.
 *
 * Async job flow:
 *   POST /v1/captures/submit  →  { capture_id, verdict (s1), s2_verdict?, job_id? }
 *   If s2_verdict is present the backend ran Stage 2 synchronously.
 *   If only job_id is present, poll GET /v1/captures/{job_id}/result until
 *   status === 'complete' or 'failed'.
 */

import { SettingsService } from './settingsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type S2Verdict = 'normal' | 'abnormal-as-confirmed' | 'inconclusive';

export interface SubmitCaptureParams {
  captureId:      string;   // WatermelonDB capture UUID (idempotency key)
  patientRef:     string;   // study code / patient_ref
  valveSite:      string;   // valve site id, e.g. 'aortic', 'erbs-point'
  posture:        string | null;
  modelVersion:   string;   // Stage 1 model semver
  s1Confidence:   number;   // Stage 1 confidence [0,1]
  s1Verdict:      'normal' | 'abnormal' | 'inconclusive';
  s1RawLogits:    number[] | null;
  durationMs:     number | null;
  peakQuality:    number | null;
  appVersion:     string;
  cardioSleeveId: string | null;
  recordingSha256: string;   // empty string when audio pipeline is not wired
  recordingPath:  string | null;  // local file path; null → no file attached
}

export interface SubmitCaptureResponse {
  capture_id:   string;
  verdict:      'normal' | 'abnormal' | 'inconclusive';
  s2_verdict?:  S2Verdict;
  s2_confidence?: number;
  job_id?:      string;
  message:      string;
}

export interface JobResultResponse {
  capture_id:    string;
  job_id:        string;
  status:        'pending' | 'complete' | 'failed';
  s2_verdict?:   S2Verdict;
  s2_confidence?: number;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class Stage2ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'Stage2ApiError';
  }
}

export class Stage2NotConfiguredError extends Error {
  constructor() {
    super('Stage 2 endpoint or token not configured. Go to Settings to provision this device.');
    this.name = 'Stage2NotConfiguredError';
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function _getConfig(): Promise<{ endpoint: string; token: string }> {
  const [endpoint, token] = await Promise.all([
    SettingsService.getStage2Endpoint(),
    SettingsService.getStage2Token(),
  ]);
  if (!endpoint || !token) throw new Stage2NotConfiguredError();
  return { endpoint: endpoint.replace(/\/$/, ''), token };
}

async function _apiFetch<T>(
  path: string,
  init: RequestInit,
  token: string,
  baseUrl: string,
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const d = body?.detail;
      if (typeof d === 'string') {
        detail = d;
      } else if (Array.isArray(d) && d.length > 0) {
        // FastAPI validation errors: detail is [{loc, msg, type}, ...]
        detail = d.map((e: { loc?: string[]; msg?: string }) =>
          `${e.loc?.slice(-1)[0] ?? '?'}: ${e.msg ?? JSON.stringify(e)}`
        ).join('; ');
      } else if (d != null) {
        detail = JSON.stringify(d);
      }
    } catch { /* ignore parse errors */ }
    throw new Stage2ApiError(res.status, detail);
  }

  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit a capture for Stage 2 analysis.
 *
 * Sends multipart/form-data to POST /v1/captures/submit.
 * When recordingPath is non-null the audio file is attached; otherwise only
 * the metadata fields are sent (the backend accepts this for dev/simulation
 * captures where audio hasn't been wired yet).
 */
export async function submitCapture(
  params: SubmitCaptureParams,
): Promise<SubmitCaptureResponse> {
  const { endpoint, token } = await _getConfig();

  // Guard: confidence must be a finite number. A null/NaN here means Stage 1
  // didn't complete — sending "null" or "NaN" causes Python float() to raise
  // ValueError → 422. Fail fast with a clear message so the sync queue marks
  // this row failed rather than retrying a permanently-broken payload.
  const confidence = params.s1Confidence;
  if (confidence == null || !isFinite(confidence)) {
    throw new Error(
      `Cannot submit capture ${params.captureId}: s1_confidence is ${confidence} — Stage 1 inference may not have completed`,
    );
  }

  const form = new FormData();
  form.append('capture_id',       params.captureId);
  form.append('patient_ref',      params.patientRef);
  form.append('valve_site',       params.valveSite);
  form.append('model_version',    params.modelVersion);
  form.append('s1_confidence',    String(confidence));
  form.append('verdict',          params.s1Verdict);
  form.append('recording_sha256', params.recordingSha256);
  form.append('app_version',      params.appVersion);

  if (params.posture)        form.append('posture',          params.posture);
  if (params.durationMs)     form.append('duration_ms',      String(params.durationMs));
  if (params.peakQuality)    form.append('peak_quality',     String(params.peakQuality));
  if (params.cardioSleeveId) form.append('cardiosleeve_id',  params.cardioSleeveId);
  if (params.s1RawLogits)    form.append('s1_raw_logits',    JSON.stringify(params.s1RawLogits));

  if (params.recordingPath) {
    // React Native FormData on Android requires a file:// URI; bare paths are
    // rejected by the native networking layer. RNFS stores bare paths, so prefix.
    const fileUri = params.recordingPath.startsWith('file://')
      ? params.recordingPath
      : `file://${params.recordingPath}`;
    form.append('audio', {
      uri:  fileUri,
      name: `${params.captureId}.wav`,
      type: 'audio/wav',
    } as unknown as Blob);
  }

  return _apiFetch<SubmitCaptureResponse>(
    '/v1/captures/submit',
    { method: 'POST', body: form },
    token,
    endpoint,
  );
}

/**
 * Poll for an async Stage 2 job result.
 * Returns the job result regardless of status — the caller decides when to stop.
 */
export async function getJobResult(jobId: string): Promise<JobResultResponse> {
  const { endpoint, token } = await _getConfig();
  return _apiFetch<JobResultResponse>(
    `/v1/captures/${jobId}/result`,
    { method: 'GET' },
    token,
    endpoint,
  );
}

/**
 * Fetch the latest active Stage 1 model version for this site.
 * Returns null when no model is activated for the site yet.
 */
export async function getLatestModel(siteId: string): Promise<{
  semver: string;
  tflite_sha256: string;
  size_bytes: number;
} | null> {
  const { endpoint, token } = await _getConfig();
  try {
    return await _apiFetch(
      `/v1/model/latest/${encodeURIComponent(siteId)}`,
      { method: 'GET' },
      token,
      endpoint,
    );
  } catch (err) {
    if (err instanceof Stage2ApiError && err.status === 204) return null;
    throw err;
  }
}

/**
 * Fetch the CHW roster for this site so the device can verify worker IDs
 * and pull updated names.
 */
export interface RosterEntry {
  hw_id:    string;
  name:     string;
  active:   boolean;
  pin_hash: string | null;
}

export async function getRoster(siteId: string): Promise<RosterEntry[]> {
  const { endpoint, token } = await _getConfig();
  const data = await _apiFetch<{ total: number; items: RosterEntry[] }>(
    `/v1/roster/${encodeURIComponent(siteId)}`,
    { method: 'GET' },
    token,
    endpoint,
  );
  return data.items;
}

/**
 * Post daily aggregate metrics for a site/date/hw_id combination.
 * Safe to call repeatedly — the backend upserts.
 */
export async function submitDailyMetrics(metrics: {
  site_id:              string;
  date:                 string;  // YYYY-MM-DD
  hw_id:                string;
  sessions_started:     number;
  pcg_captures:         number;
  ecg_captures:         number;
  stage1_normal:        number;
  stage1_abnormal:      number;
  stage1_inconclusive:  number;
  sync_queue_pending:   number;
  sync_queue_failed:    number;
}): Promise<void> {
  const { endpoint, token } = await _getConfig();
  await _apiFetch<unknown>(
    '/v1/metrics/daily',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics),
    },
    token,
    endpoint,
  );
}
