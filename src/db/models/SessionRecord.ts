import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class SessionRecord extends Model {
  static table = 'sessions';

  @field('patient_id') patientId!: string;
  @field('worker_id')  workerId!: string;
  @field('site_id')    siteId!: string;
  @date('opened_at')   openedAt!: Date;
  @date('closed_at')   closedAt!: Date | null;
}
