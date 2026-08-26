import { Q } from '@nozbe/watermelondb';
import database from '../db';
import WorkerProfile from '../db/models/WorkerProfile';
import { SettingsService } from './settingsService';
import { getRoster, Stage2NotConfiguredError } from './stage2Api';

export type SyncRosterResult =
  | { ok: true;  created: number; updated: number; skipped: number }
  | { ok: false; reason: 'not_configured' | 'network' | 'unknown'; message: string };

/**
 * Fetch the CHW roster from Stage 2 and write it into the local WatermelonDB.
 * Safe to call any time (after provisioning, on pull-to-refresh, at launch).
 */
export async function syncRosterNow(): Promise<SyncRosterResult> {
  let settings: Awaited<ReturnType<typeof SettingsService.getAll>>;
  try {
    settings = await SettingsService.getAll();
  } catch (e: any) {
    return { ok: false, reason: 'unknown', message: e?.message ?? 'Could not read settings' };
  }

  // Prefer the explicitly stored siteId (written from QR or manual entry).
  // Fall back to nothing — deriving from hwId is unreliable given naming conventions.
  const siteId = settings.siteId?.trim() ?? '';
  if (!siteId) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Site ID is not set — scan the provisioning QR code again or enter it manually in Settings.',
    };
  }

  let roster: Awaited<ReturnType<typeof getRoster>>;
  try {
    roster = await getRoster(siteId);
  } catch (err: any) {
    if (err instanceof Stage2NotConfiguredError) {
      return {
        ok: false,
        reason: 'not_configured',
        message: 'Stage 2 endpoint or token not configured.',
      };
    }
    return {
      ok: false,
      reason: 'network',
      message: err?.message ?? 'Failed to fetch roster from server.',
    };
  }

  const col = database.get<WorkerProfile>('worker_profiles');
  let created = 0, updated = 0, skipped = 0;

  try {
    await database.write(async () => {
      for (const entry of roster) {
        if (!entry.pin_hash) {
          console.warn(`[Roster] Skipping "${entry.hw_id}" — no pin_hash set in dashboard yet.`);
          skipped++;
          continue;
        }

        const existing = await col
          .query(Q.where('worker_id', entry.hw_id))
          .fetch();

        if (existing.length > 0) {
          await existing[0].update(p => {
            p.name    = entry.name;
            p.active  = entry.active;
            p.pinHash = entry.pin_hash!;
            p.siteId  = siteId;
          });
          console.log(`[Roster] Updated "${entry.hw_id}" (${entry.name})`);
          updated++;
        } else {
          await col.create(p => {
            (p as any).workerId = entry.hw_id;
            (p as any).name     = entry.name;
            (p as any).role     = 'hw';
            (p as any).siteId   = siteId;
            (p as any).pinHash  = entry.pin_hash;
            (p as any).active   = entry.active;
          });
          console.log(`[Roster] Created "${entry.hw_id}" (${entry.name})`);
          created++;
        }
      }
    });
  } catch (err: any) {
    return { ok: false, reason: 'unknown', message: err?.message ?? 'DB write failed' };
  }

  console.log(`[Roster] Sync done — created: ${created}, updated: ${updated}, skipped (no PIN): ${skipped}`);
  return { ok: true, created, updated, skipped };
}
