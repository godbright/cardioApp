/**
 * Local SQLite storage.
 * Wraps react-native-sqlite-storage with typed helpers for the app's
 * data model. AsyncStorage is intentionally NOT used — it is not designed
 * for structured, queryable clinical records.
 */

import SQLite from 'react-native-sqlite-storage';
import type { Patient } from '../types';

SQLite.enablePromise(true);

let _db: SQLite.SQLiteDatabase | null = null;

export async function openDb(): Promise<void> {
  _db = await SQLite.openDatabase({ name: 'cardiosleeve.db', location: 'default' });
  await _db.executeSql(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER,
      sex TEXT,
      lastExam TEXT,
      hs TEXT DEFAULT 'none',
      hr TEXT DEFAULT 'none',
      rhd TEXT,
      height REAL,
      weight REAL,
      bpSys INTEGER,
      bpDia INTEGER,
      hsSite TEXT,
      hrLead TEXT,
      hsPosture TEXT,
      hrPosture TEXT,
      hsConfidence TEXT,
      hsModel TEXT,
      createdAt INTEGER DEFAULT (strftime('%s','now')),
      updatedAt INTEGER DEFAULT (strftime('%s','now'))
    )
  `);
}

function db(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('[Storage] DB not opened — call openDb() at app launch');
  return _db;
}

export async function getAllPatients(): Promise<Patient[]> {
  const [result] = await db().executeSql('SELECT * FROM patients ORDER BY updatedAt DESC');
  const rows: Patient[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    rows.push(result.rows.item(i) as Patient);
  }
  return rows;
}

export async function upsertPatient(p: Patient): Promise<void> {
  await db().executeSql(`
    INSERT INTO patients (id, name, age, sex, lastExam, hs, hr, rhd, height, weight,
      bpSys, bpDia, hsSite, hrLead, hsPosture, hrPosture, hsConfidence, hsModel, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, strftime('%s','now'))
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, age=excluded.age, sex=excluded.sex, lastExam=excluded.lastExam,
      hs=excluded.hs, hr=excluded.hr, rhd=excluded.rhd, height=excluded.height,
      weight=excluded.weight, bpSys=excluded.bpSys, bpDia=excluded.bpDia,
      hsSite=excluded.hsSite, hrLead=excluded.hrLead, hsPosture=excluded.hsPosture,
      hrPosture=excluded.hrPosture, hsConfidence=excluded.hsConfidence,
      hsModel=excluded.hsModel, updatedAt=strftime('%s','now')
  `, [p.id, p.name, p.age, p.sex, p.lastExam, p.hs, p.hr, p.rhd ?? null,
      p.height ?? null, p.weight ?? null, p.bpSys ?? null, p.bpDia ?? null,
      p.hsSite ?? null, p.hrLead ?? null, p.hsPosture ?? null, p.hrPosture ?? null,
      p.hsConfidence ?? null, p.hsModel ?? null]);
}

export async function deletePatient(id: string): Promise<void> {
  await db().executeSql('DELETE FROM patients WHERE id = ?', [id]);
}
