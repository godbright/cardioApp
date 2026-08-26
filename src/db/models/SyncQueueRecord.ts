import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class SyncQueueRecord extends Model {
  static table = 'sync_queue';

  @field('capture_id')      captureId!: string;
  @field('status')          status!: 'pending' | 'uploading' | 'done' | 'failed';
  @field('attempts')        attempts!: number;
  @date('queued_at')        queuedAt!: Date;
  @date('last_attempt_at') lastAttemptAt!: Date | null;
  @date('next_retry_at')   nextRetryAt!: Date | null;
  @field('last_error')      lastError!: string | null;
}
