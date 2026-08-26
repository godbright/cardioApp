import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';
import migrations from './migrations';

import WorkerProfile       from './models/WorkerProfile';
import PatientRecord       from './models/PatientRecord';
import SessionRecord       from './models/SessionRecord';
import CaptureRecord       from './models/CaptureRecord';
import Stage1ResultRecord  from './models/Stage1ResultRecord';
import Stage2ResultRecord  from './models/Stage2ResultRecord';
import SyncQueueRecord     from './models/SyncQueueRecord';
import AppSettingRecord    from './models/AppSettingRecord';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'CardioSleeveDB',
  jsi: false,  // disable JSI until native module is confirmed installed
  onSetUpError: error => {
    console.error('[DB] Setup failed:', error);
  },
});

const database = new Database({
  adapter,
  modelClasses: [
    WorkerProfile,
    PatientRecord,
    SessionRecord,
    CaptureRecord,
    Stage1ResultRecord,
    Stage2ResultRecord,
    SyncQueueRecord,
    AppSettingRecord,
  ],
});

export default database;
export {
  WorkerProfile,
  PatientRecord,
  SessionRecord,
  CaptureRecord,
  Stage1ResultRecord,
  Stage2ResultRecord,
  SyncQueueRecord,
  AppSettingRecord,
};
