import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class AppSettingRecord extends Model {
  static table = 'app_settings';

  @field('key')   key!:   string;
  @field('value') value!: string;   // JSON-encoded

  @readonly @date('updated_at') updatedAt!: Date;
}
