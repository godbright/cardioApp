import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class WorkerProfile extends Model {
  static table = 'worker_profiles';

  @field('worker_id') workerId!: string;
  @field('name')      name!: string;
  @field('role')      role!: 'hw' | 'supervisor';
  @field('site_id')   siteId!: string;
  @field('pin_hash')  pinHash!: string;
  @field('active')    active!: boolean;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
