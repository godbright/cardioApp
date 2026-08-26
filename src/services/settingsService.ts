import database from '../db';
import AppSettingRecord from '../db/models/AppSettingRecord';

// Well-known preference keys — add here as new settings are introduced.
export type SettingKey =
  | 'language'           // e.g. 'en' | 'rw' | 'fr' | 'sw'
  | 'videoGuidesEnabled' // 'true' | 'false'
  | 'lastPairedDeviceId' // Bluetooth device ID string
  | 'stage2Endpoint'     // Base URL for the CardioSleeve backend, e.g. 'https://api.cardiosleeve.rw'
  | 'stage2Token'        // Long-lived site JWT (Bearer token) for this device
  | 'hwId'               // Legacy: CHW-based device identity. Superseded by deviceId in Path 2.
  | 'deviceId'           // Physical tablet identifier, e.g. CHUK-T01 — from device provisioning QR
  | 'siteId'             // Site identifier (e.g. 'CHUK') — stored from QR provisioning, matches site JWT claim

// Defaults applied when a key has never been written.
const DEFAULTS: Record<SettingKey, string> = {
  language:           'en',
  videoGuidesEnabled: 'true',
  lastPairedDeviceId: '',
  stage2Endpoint:     '',
  stage2Token:        '',
  hwId:               '',
  deviceId:           '',
  siteId:             '',
};

async function getAll(): Promise<Record<SettingKey, string>> {
  const collection = database.get<AppSettingRecord>('app_settings');
  const records = await collection.query().fetch();
  const result = { ...DEFAULTS };
  for (const rec of records) {
    result[rec.key as SettingKey] = rec.value;
  }
  return result;
}

async function get(key: SettingKey): Promise<string> {
  const collection = database.get<AppSettingRecord>('app_settings');
  const records = await collection.query().fetch();
  const match = records.find(r => r.key === key);
  return match ? match.value : DEFAULTS[key];
}

async function set(key: SettingKey, value: string): Promise<void> {
  const collection = database.get<AppSettingRecord>('app_settings');
  const records = await collection.query().fetch();
  const existing = records.find(r => r.key === key);

  await database.write(async () => {
    if (existing) {
      await existing.update(rec => {
        rec.value = value;
      });
    } else {
      await collection.create(rec => {
        rec.key   = key;
        rec.value = value;
      });
    }
  });
}

async function getLanguage(): Promise<string> {
  return get('language');
}

async function setLanguage(lang: string): Promise<void> {
  return set('language', lang);
}

async function getVideoGuidesEnabled(): Promise<boolean> {
  const val = await get('videoGuidesEnabled');
  return val !== 'false';
}

async function setVideoGuidesEnabled(enabled: boolean): Promise<void> {
  return set('videoGuidesEnabled', enabled ? 'true' : 'false');
}

async function getLastPairedDeviceId(): Promise<string> {
  return get('lastPairedDeviceId');
}

async function setLastPairedDeviceId(deviceId: string): Promise<void> {
  return set('lastPairedDeviceId', deviceId);
}

async function getStage2Endpoint(): Promise<string> { return get('stage2Endpoint'); }
async function setStage2Endpoint(url: string): Promise<void> { return set('stage2Endpoint', url); }

async function getStage2Token(): Promise<string> { return get('stage2Token'); }
async function setStage2Token(token: string): Promise<void> { return set('stage2Token', token); }

async function getHwId(): Promise<string> { return get('hwId'); }
async function setHwId(id: string): Promise<void> { return set('hwId', id); }

async function getDeviceId(): Promise<string> { return get('deviceId'); }
async function setDeviceId(id: string): Promise<void> { return set('deviceId', id); }

async function getSiteId(): Promise<string> { return get('siteId'); }
async function setSiteId(id: string): Promise<void> { return set('siteId', id); }

export const SettingsService = {
  getAll,
  get,
  set,
  getLanguage,
  setLanguage,
  getVideoGuidesEnabled,
  setVideoGuidesEnabled,
  getLastPairedDeviceId,
  setLastPairedDeviceId,
  getStage2Endpoint,
  setStage2Endpoint,
  getStage2Token,
  setStage2Token,
  getHwId,
  setHwId,
  getDeviceId,
  setDeviceId,
  getSiteId,
  setSiteId,
};
