import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class CaptureRecord extends Model {
  static table = 'captures';

  @field('session_id')       sessionId!: string;
  @field('patient_id')       patientId!: string;
  @field('modality')         modality!: 'pcg' | 'ecg';
  @field('site')             site!: string;
  @field('posture')          posture!: string | null;
  @field('recording_path')   recordingPath!: string;
  @field('recording_sha256') recordingSha256!: string;
  @field('duration_ms')      durationMs!: number | null;
  @field('peak_quality')     peakQuality!: number | null;
  @field('cardiosleeve_id')  cardioSleeveId!: string | null;
  @field('app_version')      appVersion!: string;
  @date('captured_at') capturedAt!: Date;
}
