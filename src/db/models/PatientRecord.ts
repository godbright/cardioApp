import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class PatientRecord extends Model {
  static table = 'patients';

  @field('study_code')    studyCode!: string;
  @field('name')          name!: string | null;
  @field('date_of_birth') dateOfBirth!: string | null;
  @field('sex')           sex!: string | null;
  @field('rhd_history')   rhdHistory!: string | null;
  @field('height_cm')     heightCm!: number | null;
  @field('weight_kg')     weightKg!: number | null;
  @field('bp_sys')        bpSys!: number | null;
  @field('bp_dia')        bpDia!: number | null;
  @field('registered_by') registeredBy!: string;
  @field('site_id')       siteId!: string;
  @field('deleted_at')    deletedAt!: number | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
