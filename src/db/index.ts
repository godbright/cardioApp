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
  // Bridge mode (jsi: false) is the safe default — no native recompile needed.
  // Enable JSI only if the watermelondb-jsi native module is explicitly compiled
  // into the app (requires a CMakeLists entry and a full native rebuild).
  jsi: false,
  onSetUpError: error => {
    // Log loudly but do NOT throw — throwing here makes the adapter hang in
    // an unresolvable state, causing all DB reads to return empty and writes
    // to silently no-op, which manifests as data loss on every restart.
    console.error('[DB] Setup FAILED — patient data and captures will not persist until this is resolved:', error);
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
