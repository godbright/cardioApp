# Persistence Status — CardioSleeve App

This file tracks what data survives an app restart (persisted to SQLite via WatermelonDB)
vs. what lives only in memory and is lost when the app closes.

---

## ✅ Persisted (WatermelonDB)

| Data | Table | How |
|---|---|---|
| Worker profiles (auth roster) | `worker_profiles` | `AuthService.seedDefaultProfiles()` on launch; `AuthService.verifyPin()` on login |
| Language preference | `app_settings` key `language` | `SettingsService.setLanguage()` called from `pickLang()` in AppContext |
| Video guides toggle | `app_settings` key `videoGuidesEnabled` | `SettingsService.setVideoGuidesEnabled()` called from `toggleVideo()` in AppContext |
| Patient demographics | `patients` | `patientService.savePatient()` called from `savePatient()` in AppContext; loaded on mount via `loadAllPatients()` |
| Captures (PCG + ECG) | `captures` | `captureService.saveCapture()` called from `applyAndReturn()` in AppContext |
| Stage 1 results | `stage1_results` | Written alongside each PCG capture in `captureService.saveCapture()` |
| Sync queue (abnormal PCG) | `sync_queue` | Entry written by `captureService.saveCapture()` when Stage 1 verdict is abnormal |
| Sessions | `sessions` | Created lazily on first completed capture of a visit; closed by `closeSession()` from `doneWithPatient()` |

---

## ❌ Not Persisted — But Has a DB Table Ready

### Stage 2 Results (`stage2_results` table)

- **Status:** Stage 2 confirmation never arrives in the current build — the cloud API
  is not yet implemented and `Stage2ResultRecord` model doesn't exist yet.
- **What needs to happen:**
  - [ ] Create `Stage2ResultRecord` model
  - [ ] Register it in `db/index.ts`
  - [ ] When Stage 2 API returns a verdict, write a `stage2_results` row
  - [ ] `patientService.resolveHsStatus()` already has a placeholder comment where the
        Stage2 check goes — fill it in once the model exists
  - [ ] Update patient display status from `abnormal-pending` → `abnormal-confirmed`

## ⚠️ Wired but Needs Real Data

### recording_path / recording_sha256 on captures

- Capture rows are written with empty string placeholders for `recording_path` and
  `recording_sha256` because there is no audio file yet. When the CardioSleeve audio
  recording pipeline is implemented, these must be set to the actual file path and hash.

### Stage 1 verdict is still simulated

- `finishCapture()` in AppContext hardcodes `kind: 'abnormal'` for all PCG captures.
  The DB correctly stores whatever verdict comes through, but the verdict itself is fake
  until TFLite inference is wired to the real Stage 1 model.

### Sync queue worker not yet implemented

- `sync_queue` rows are written correctly when Stage 1 returns abnormal. But no background
  worker reads them and attempts the Stage 2 upload yet.
  - [ ] Implement sync worker that reads `pending`/`failed` rows and calls the Stage 2 API
  - [ ] On app launch, check for `pending` rows and trigger a sync attempt if online

---

## ❌ Not Persisted — No DB Table (Intentional / To Decide)

| Data | Notes |
|---|---|
| Last paired Bluetooth device ID | `SettingsService` has the key `lastPairedDeviceId` ready; nothing writes to it yet. Needs the Rijuven SDK to confirm the device identifier format before wiring in. |
| Logged-in worker session | Worker must re-enter their PIN on every app launch. This is intentional for clinical security — unattended devices should not stay unlocked. |
| Navigation view / scroll position | Ephemeral UI state — intentionally not restored on restart. |
| Form field drafts (patient entry) | Intentionally not restored — a half-filled patient form on restart would be confusing. |
| Capture phase / signal quality | Ephemeral hardware state — always starts fresh. |
| Selected / filtered patients (UI) | Ephemeral UI state. |

---

## Priority Order for Wiring DB Persistence

1. **Patients** — the most impactful gap; a restart currently wipes all screening data.
2. **Captures + Stage 1 results** — needed for accurate history display and model traceability.
3. **Sync queue** — needed for the offline-first promise; abnormal results must survive restarts.
4. **Sessions** — needed for longitudinal history (repeat visits); lower priority if pilot is cross-sectional.
5. **Stage 2 results** — depends on the cloud API being built first.
6. **Last paired device** — wire once the Rijuven SDK confirms the device ID format.
