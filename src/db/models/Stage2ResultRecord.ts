import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class Stage2ResultRecord extends Model {
  static table = 'stage2_results';

  @field('capture_id')      captureId!: string;
  @field('remote_job_id')   remoteJobId!: string | null;
  @field('verdict')         verdict!: string;          // 'abnormal-as-confirmed' | 'normal' | 'inconclusive'
  @field('confidence')      confidence!: number | null;
  @field('additional_data') additionalData!: string | null;
  @date('received_at')      receivedAt!: Date;
}
