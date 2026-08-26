import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class Stage1ResultRecord extends Model {
  static table = 'stage1_results';

  @field('capture_id')    captureId!: string;
  @field('model_version') modelVersion!: string;
  @field('verdict')       verdict!: 'normal' | 'abnormal' | 'inconclusive';
  @field('confidence')    confidence!: number;
  @field('raw_logits')    rawLogits!: string | null;
  @field('inference_ms')  inferenceMs!: number | null;
  @date('run_at') runAt!: Date;
}
