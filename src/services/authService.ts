import CryptoJS from 'crypto-js';
import database, { WorkerProfile } from '../db';

// PIN hash scheme: SHA-256("CARDIOSLEEVE:<workerId>:<pin>")
// The prefix binds the hash to this app, preventing a leaked hash
// from being reused against other systems that use the same PIN.
function hashPin(workerId: string, pin: string): string {
  return CryptoJS.SHA256(`CARDIOSLEEVE:${workerId}:${pin}`).toString();
}

export interface WorkerProfileData {
  id: string;
  workerId: string;
  name: string;
  role: 'hw' | 'supervisor';
  siteId: string;
}

export const AuthService = {
  async verifyPin(workerId: string, pin: string): Promise<WorkerProfileData | null> {
    const collection = database.get<WorkerProfile>('worker_profiles');
    const results = await collection.query().fetch();

    console.log(
      `[Auth] verifyPin called — DB has ${results.length} worker profile(s):`,
      results.map(r => `"${r.workerId}" active=${r.active} pinHashSet=${!!r.pinHash}`),
    );
    console.log(`[Auth] Looking up CHW ID: "${workerId}"`);

    const profile = results.find(
      r => r.workerId.toLowerCase() === workerId.toLowerCase() && r.active,
    );

    if (!profile) {
      console.warn(
        `[Auth] CHW ID "${workerId}" not found (or inactive) in local DB.` +
        ` Available IDs: [${results.map(r => `"${r.workerId}"`).join(', ')}]`,
      );
      return null;
    }

    console.log(`[Auth] Found profile for "${profile.workerId}". Checking PIN hash...`);
    const expected = hashPin(profile.workerId, pin);
    const match = expected === profile.pinHash;
    console.log(`[Auth] PIN hash match: ${match}`);
    if (!match) return null;

    return {
      id: profile.id,
      workerId: profile.workerId,
      name: profile.name,
      role: profile.role,
      siteId: profile.siteId,
    };
  },

  // Call once at app startup. Seeds the dev/testing worker (HW-001 / PIN 1234)
  // and the supervisor (SUP-001 / PIN 9999) if the table is empty.
  // Production deployment replaces these with site-specific rosters loaded
  // from a signed JSON bundle supplied by the site coordinator.
  async seedDefaultProfiles(): Promise<void> {
    const collection = database.get<WorkerProfile>('worker_profiles');
    const count = (await collection.query().fetch()).length;
    if (count > 0) return;

    await database.write(async () => {
      await collection.create(p => {
        (p as any).workerId  = 'HW-001';
        (p as any).name      = 'Demo Health Worker';
        (p as any).role      = 'hw';
        (p as any).siteId    = 'CHUK';
        (p as any).pinHash   = hashPin('HW-001', '1234');
        (p as any).active    = true;
      });
      await collection.create(p => {
        (p as any).workerId  = 'SUP-001';
        (p as any).name      = 'Site Supervisor';
        (p as any).role      = 'supervisor';
        (p as any).siteId    = 'CHUK';
        (p as any).pinHash   = hashPin('SUP-001', '9999');
        (p as any).active    = true;
      });
    });
  },

  async createProfile(opts: {
    workerId: string;
    name: string;
    role: 'hw' | 'supervisor';
    siteId: string;
    pin: string;
  }): Promise<void> {
    const collection = database.get<WorkerProfile>('worker_profiles');
    await database.write(async () => {
      await collection.create(p => {
        (p as any).workerId  = opts.workerId;
        (p as any).name      = opts.name;
        (p as any).role      = opts.role;
        (p as any).siteId    = opts.siteId;
        (p as any).pinHash   = hashPin(opts.workerId, opts.pin);
        (p as any).active    = true;
      });
    });
  },
};
