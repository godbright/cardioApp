# CLAUDE.md — CardioSleeve RHD SCREENING Mobile App

## Project identity
This is the patient-facing/health-worker-facing mobile application for the project described in *"Closing the Diagnostic Latency: AI-Driven Phonocardiographic Screening for Asymptomatic Aortic Stenosis in Resource-Limited Settings"*. This file is the persistent reference for Claude Code across the full build. Read it in full before starting work each session, and treat it as the source of truth over any single conversational instruction that contradicts it — flag the contradiction rather than silently picking one.

This is a research prototype intended for clinical pilot use at CHUK and King Faisal Hospital, operated primarily by community health workers (CHWs) with minimal technical training, in settings with intermittent or no internet connectivity. Every design and engineering decision should be weighed against that operating context, not against what would be ideal in a well-resourced hospital.

## The clinical problem, in one paragraph
Aortic Stenosis in Sub-Saharan Africa is disproportionately driven by Rheumatic Heart Disease, striking children and young adults rather than the elderly degenerative-calcific population that dominates global AS research and tooling. Untreated severe symptomatic AS carries a mean survival of roughly 2–3 years. Current diagnostic pathways typically catch valvular disease only after irreversible myocardial damage. This app exists to close that gap with a low-cost, offline-capable, objective screening tool that a CHW can operate without a stethoscope-trained ear.

## System architecture overview

The app is one piece of a four-part pipeline. Understand where the app's responsibility starts and ends:

1. **CardioSleeve (hardware)** — Rijuven's Bluetooth-connected stethoscope attachment. Captures synchronized ECG + phonocardiogram (PCG) data. Fully offline at the point of capture. *Not built by us — we integrate with it.*
2. **Stage 1 — on-device TinyML screener ("The Net")** — A quantized MobileNetV3-Small model (distilled from a CNN-BiLSTM teacher trained on PhysioNet/CinC2016 + CirCor DigiScope) runs directly on the device. Binary classification: normal vs. abnormal heart sound. Tuned for high sensitivity. Runs fully offline. *This app embeds and runs this model — it does not train it.*
3. **Stage 2 — cloud-based confirmatory model ("The Filter")** — A higher-capacity CNN-BiLSTM model hosted in the cloud. Only recordings flagged abnormal by Stage 1 are synced here. Confirms AS suspicion and prioritizes referral. Tuned for high specificity. Requires connectivity. *This app calls this as a remote API when online — it does not run this model locally.*
4. **Mobile app (this project)** — Connects to the CardioSleeve over standard Bluetooth, guides the CHW through heart sound acquisition using real-time voice and visual feedback, runs Stage 1 inference locally, manages the offline-first sync queue to Stage 2, and delivers results by voice and on screen. **This is the scope of this CLAUDE.md.**

Do not blur these boundaries. If a task seems to require training or modifying the ML models themselves, that is out of scope for this app's codebase — the app consumes a trained, exported TFLite model as an asset and a documented cloud API contract, not the training pipeline.

## Core user workflow

The app is designed around a single, repeatable screening session that a CHW can execute without clinical training. The CHW may open the app for many reasons — reviewing pending results, checking the sync queue, looking up a previous patient — and should never be forced through a Bluetooth connection step just to do those things. Bluetooth connection happens in the background at launch and is surfaced as a persistent status indicator, not as a blocking screen. The default landing screen is History/Queue.

**On every app launch:** the app attempts to auto-reconnect to the last-paired CardioSleeve silently in the background. A persistent connection indicator in the navigation header (connected / reconnecting... / not found) keeps the CHW informed at all times without interrupting their current task. The explicit device pairing flow (for first-time setup or switching to a different CardioSleeve) is accessible from Settings, not from a startup screen.

**On first launch only:** before anything else, the app presents a one-time language selection screen. This is the only blocking step at launch, and it exists specifically to ensure no voice guidance fires before the CHW's language is set. Once set, the language preference is persisted and the CHW goes straight to History/Queue on all subsequent launches. Language can always be changed from Settings.

The repeatable per-patient workflow, which a CHW enters from History/Queue, is:

1. **Patient** — The CHW creates a new patient record or selects an existing one before any capture begins. *What data is collected here, what prior patient information is recorded, and exactly when in the workflow data entry occurs are open questions — see Open Questions. Do not assume a field set or entry point without team and IRB confirmation.* The patient record is the anchor for all subsequent captures in the session.

3. **Patient Session Hub** — After a patient is identified, the app presents a hub screen showing two independent capture options for that patient:
   - **Heart Sound** (PCG / auscultation) — drives Stage 1 on-device inference for RHD SCREENING.
   - **Heart Rhythm** (ECG lead) — captures the synchronized ECG signal from the CardioSleeve. *The analysis pipeline for ECG data is an open question — see Open Questions.*

   Each card shows its current status: not yet captured / captured (result pending) / result received. The CHW taps either card to begin that capture; both are associated with the same patient record and can be done in any order. Neither modality is mandatory per session — the CHW completes whichever the session requires and marks the patient done. After completing one capture and viewing its result, the app returns the CHW to this hub so they can optionally capture the other modality or move on.

4. **Select position** — Before any guide or capture begins, the CHW selects the specific target position for this capture:
   - **Auscultation (Heart Sound)**: selects which cardiac valve site to auscultate (e.g., aortic area, mitral apex, pulmonary area, tricuspid area, Erb's point). The sites available and their clinical priority for RHD SCREENING are defined by the clinical team — do not hardcode a list without their input. See Open Questions.
   - **ECG Lead (Heart Rhythm)**: selects which lead configuration to capture. The available leads depend on the CardioSleeve's hardware capabilities — do not assume a lead set until the Rijuven SDK or protocol documentation confirms what the device supports. See Open Questions.

   This selection drives everything that follows: the guide video shown, the voice positioning instructions spoken, and any position-specific signal quality criteria. Each valve site and each lead is a distinct entry in the content catalog — there is no single generic positioning guide.

5. **Guide (optional)** — If video positioning guidance is enabled in Settings, the app plays the instructional video for the specific valve site or lead selected in the previous step. This is not one generic video — it is a per-position video asset (e.g., a short clip showing correct CardioSleeve placement at the aortic area, or correct electrode placement for Lead II). The CHW can replay or skip it. The clinical team must produce or source one video per supported position; the app provides the playback mechanism keyed to the position selection.

6. **Position** — If the CardioSleeve is not connected when the CHW reaches this step, the app surfaces a focused inline prompt ("Connect your CardioSleeve to continue") with a visible reconnecting state and a manual retry button. This is the only point in the workflow where Bluetooth connection is a blocking gate — and it is shown here, when it is actually needed, not at app launch. Once connected, the CHW places the CardioSleeve on the patient and the app immediately begins real-time signal assessment, using voice guidance specific to the selected valve site or lead placement (e.g., "Place the sensor at the right side of the upper chest, close to the breastbone" for the aortic area; different instructions for each other site or lead). *The specific positioning scripts per valve site and per lead require clinical team input — see Open Questions.*

7. **Acquire** — The app continuously assesses incoming signal quality using DSP algorithms. Voice and visual feedback tell the CHW whether the signal is good enough to record or whether repositioning is needed. When quality is sufficient, the app prompts the CHW — either automatically triggering a recording or confirming the CHW's manual trigger. If quality drops during a recording, the app prompts repositioning rather than silently capturing unusable audio.

8. **Screen** — Once a clean recording is captured, Stage 1 on-device inference runs immediately for PCG captures, with no connectivity required. The result is displayed and spoken within seconds. ECG analysis behavior is an open question pending definition of the ECG processing pipeline.

9. **Report** — The modality-specific result is spoken and displayed, tagged with the valve site or lead that was captured. The CHW is then returned to the Patient Session Hub. Normal PCG results allow the CHW to proceed to the next modality or the next patient. Abnormal PCG results are queued for Stage 2 confirmation. The CHW always knows which modalities are complete, which are pending, and whether any results are awaiting cloud confirmation.

10. **Confirm (when connected)** — Queued abnormal PCG recordings sync to Stage 2 in the background when connectivity returns. The Stage 2 result updates the patient record and triggers a follow-up voice notification if the CHW still has the app open.

11. **Review** — The History/Queue screen shows all patients with their session status. Each patient row is expandable to show the individual status of each modality (Heart Sound / Heart Rhythm), so a CHW can track which captures are complete, which are pending cloud confirmation, and which need recapture.

## Target platform and tooling
- **React Native + TypeScript**, bare CLI workflow (not Expo Go — Bluetooth and on-device ML inference both require native modules that Expo Go's sandbox does not support). If the project later needs Expo tooling for other reasons, use a custom dev client, not Expo Go.
- **Primary target: Android tablet** (landscape-first, larger touch targets), with full support for Android smartphones. Most CHWs will use tablets — lower cost, easier to hold during examination — but the layout must not break on phone form factors. Design tablet-first; validate phone rendering at each screen milestone.
- Minimum Android API level should target what is realistic for low-cost devices actually available in-market in Rwanda — confirm a realistic minimum SDK with the team before locking dependencies that require very recent APIs.

## Voice guidance for health care workers

Voice guidance is a first-class feature, not a polish-layer add-on. Its primary role is guiding the CHW through heart sound acquisition in real time — before and during recording — so the app can produce a clinically useful result even when operated by someone with no auscultation training.

### During acquisition
Voice guidance runs throughout the positioning and recording phase, driven by the signal quality pipeline. All positioning instructions are keyed to the specific valve site or ECG lead selected before capture begins — there is no generic positioning script.

- **Positioning guidance** — When the CardioSleeve is first placed and the signal is absent or poorly formed, the app speaks directed positioning instructions specific to the selected site or lead (e.g., "Place the sensor at the right side of the upper chest, close to the breastbone" for the aortic valve area; a different instruction for the mitral apex; a different instruction again for each ECG lead). The message catalog must contain a distinct positioning script for every supported valve site and every supported lead. Do not use a single generic placement instruction across positions — precision here is the point.
- **Ongoing quality feedback** — As the CHW repositions, the app gives continuous spoken feedback ("Signal too weak — try pressing more firmly" / "Moving in the right direction — hold still"). Feedback is specific and actionable, not generic.
- **Ready prompt** — When signal quality crosses the sufficient threshold, the app speaks a clear prompt: e.g., "Good signal — recording now" (if auto-triggering) or "Signal is good — press Record when ready" (if manual). This is the most important voice cue in the workflow: it closes the loop between quality assessment and CHW action.
- **Poor-quality recovery** — If quality drops during a recording, the app prompts repositioning immediately. After a failed or interrupted recording, the guidance restarts from the positioning phase using the same site/lead-specific instructions.

### After recording
Voice output accompanies every terminal result state, each with a distinct, actionable message:
- Normal: e.g., "Heart sounds are normal. You may continue to the next patient."
- Abnormal (pending Stage 2): e.g., "Abnormal sound detected. Recording has been sent for confirmation. Continue to the next patient."
- Abnormal (Stage 2 confirmed): e.g., "Confirmation received. Aortic stenosis is suspected. Please refer this patient."
- Inconclusive: e.g., "Recording quality was not sufficient. Please reposition and try again."

### Language and message catalog
- Plan for language support from the start. Do not hardcode English strings directly into TTS calls — route all spoken output through a single message-catalog layer so adding Kinyarwanda or other pilot-site languages is a content change, not a re-architecture. Confirm the required language(s) with the team.
- Language is selected once, on first launch, before any voice guidance fires (see Core user workflow). After that the preference is persisted and applied silently on every subsequent launch. No voice guidance should ever fire before the CHW's language preference is confirmed — treat the persisted preference as authoritative, and fall back to a language selection prompt only if no preference is stored (i.e., genuinely first launch or after a data reset).
- Pair every spoken result with the corresponding visual state — a noisy clinical environment may make audio unreliable, so voice and visuals must always be in sync.
- Voice messages should be actionable, not just descriptive. The CHW's next action matters as much as the classification result itself.

## Signal quality assessment and acquisition guidance

Signal quality gating is the core of the acquisition workflow. It runs before Stage 1 inference and drives the voice guidance system throughout the Capture screen.

The quality pipeline runs lightweight DSP checks on the incoming audio stream continuously:
- **Periodicity/envelope check** — confirms a periodic cardiac signal is present
- **Band-energy ratio** — confirms energy is in the relevant phonocardiographic frequency band
- **Clipping/RMS-floor check** — rejects recordings that are saturated or too quiet

These checks produce a continuous quality signal, not a single pass/fail at the end of a recording. The app uses this signal to drive the voice guidance system (see above) and to gate Stage 1 inference — inference only runs on recordings that passed quality checks. Poor-quality recordings prompt recapture rather than producing a meaningless result.

During **auscultation mode**, quality gating targets the PCG stream. The ECG is recorded in parallel and stored with the session, but the PCG quality signal is what drives the voice guidance and the recording trigger. During **ECG lead mode**, quality gating targets the ECG signal; the PCG stream is not active and not displayed.

Keep the signal-quality module architecturally separate from Stage 1 — it is a distinct, cheaper computational step that can be tuned independently of the inference model. Design it to accept a mode parameter (PCG or ECG) so the same pipeline can apply appropriate checks per capture context without duplicating the module.

## Bluetooth integration with the CardioSleeve

The CardioSleeve communicates over standard Bluetooth (not Bluetooth Low Energy). Bluetooth connection is a background concern, not a gating first screen — the app is fully usable for review, history, and settings without the device present.

- **Background auto-connect at launch.** On every app launch, the app silently attempts to reconnect to the last-paired CardioSleeve. Connection state is surfaced via a persistent indicator in the navigation header (connected / reconnecting... / not found), visible on every screen. No blocking connection screen, no startup delay — the CHW can go directly to History/Queue while the connection establishes in the background.
- **Pairing flow lives in Settings.** The explicit device discovery and pairing flow (for first-time setup or switching devices) is accessible only from the Bluetooth management section of Settings — not from a startup screen. If a CHW needs to pair a new CardioSleeve mid-session, they go to Settings, pair, and return to where they were.
- **Capture is the only blocking gate.** When the CHW enters the Capture screen and the device is not connected, the screen shows a focused inline prompt — "Connect your CardioSleeve to continue" — with a visible reconnecting state and a manual retry. This is the right moment to surface the issue, not app launch. Once connected, the capture flow continues without restarting.
- **SDK status is the long pole.** As of this writing, the team is awaiting an SDK/data-protocol agreement with Rijuven. Until it arrives, build and test the Bluetooth connection layer using the generic discovery and data-stream approach validated in the earlier trial, and isolate the byte-parsing logic behind a clean interface (e.g., a `CardioSleeveDataParser` module) so swapping in Rijuven's actual documented format later is a contained change, not a rewrite.
- **Pairing vs. connection failures.** Standard Bluetooth requires device pairing before data transfer. If a connection attempt succeeds but no data flows, suspect a pairing/bonding issue rather than a connection bug — surface this to the CHW clearly ("Device found but not paired — go to Settings to pair") rather than failing silently or showing a generic error.
- **Permissions.** Android 12+ requires the `BLUETOOTH_CONNECT` runtime permission; earlier Android versions use `BLUETOOTH` and `BLUETOOTH_ADMIN`. Request these at app launch with a plain-language explanation of why a heart-screening app needs Bluetooth access — CHWs are a non-technical audience and an unexplained permission prompt is a real trust risk in this context.
- **Connection resilience.** Bluetooth connections to a handheld device in clinical motion will drop. Build automatic reconnection with a calm "reconnecting..." state in the header indicator — never a silent failure that leaves a CHW unsure whether a recording was captured.

## Stage 1 on-device inference

- The app embeds the exported, quantized (INT8, TFLite) MobileNetV3-Small model as a bundled asset. Log which model version produced each result — the model will be retrained and re-exported multiple times, and clinical pilot data must be traceable back to the specific model version that scored it.
- **Per-class sensitivity matters more than aggregate accuracy.** Per the project's methodology, INT8 quantization risk falls disproportionately on the rare abnormal/AS class. Any debug or QA view should show sensitivity-relevant detail (model version, raw confidence) rather than only a binary pass/fail.
- **Low-confidence handling.** Treat a low-confidence result as a third state ("inconclusive — please re-record"), not a forced binary classification. Do not silently round an uncertain result to "normal" or "abnormal."

## Stage 2 cloud sync

- Only recordings that Stage 1 flags abnormal (and that pass signal-quality gating) get queued for Stage 2. Do not sync every recording — this wastes bandwidth and battery in a setting where both are scarce, and it contradicts the project's explicit design rationale for the two-stage cascade.
- Sync is a background, resumable process — it never blocks the CHW from continuing to screen other patients while waiting for connectivity. Queue, do not block.
- Handle the **partial-connectivity case** explicitly: rural connectivity is intermittent rather than binary, so the sync worker needs proper retry/backoff and partial-upload resilience, not just an online/offline toggle.
- The UI always shows which of three states a patient record is in: (a) Stage 1 result only, awaiting connectivity for Stage 2 confirmation; (b) Stage 1 + Stage 2 both complete; or (c) inconclusive, needs recapture. Never show an ambiguous "processing" state with no explanation of what is pending.

## Privacy and data handling

The project's own stated gap analysis flags that most mainstream stethoscope data collection ties to manufacturer cloud servers, and calls out a need for an **optional, more private storage path**. Carry this through into the app's design:

- Default to **local-first storage** of recordings and results, with cloud sync limited specifically to what Stage 2 needs (the flagged recording + minimal identifying context) rather than wholesale patient data replication to a third party's infrastructure.
- Confirm what the eventual Rijuven SDK does by default — an SDK that silently phones home to a manufacturer server would undercut this design goal and must be flagged explicitly once the SDK is in hand.
- Any patient identifier scheme should be the minimum necessary for clinical follow-up and pilot data tracking — coordinate with the team on what CHUK/King Faisal's data governance and ethics approval actually require.

## Core libraries
- **Bluetooth**: A standard Bluetooth (classic) library appropriate for the connection model used by the CardioSleeve — confirm the exact library once the Rijuven SDK or protocol documentation arrives, since classic Bluetooth data-stream integration differs from BLE and the right library depends on the connection profile used.
- **On-device ML inference**: `react-native-fast-tflite` (or the current best actively-maintained TFLite React Native binding — verify at build time, as this ecosystem changes) to load and run the quantized MobileNetV3-Small Stage 1 model.
- **Signal processing**: DSP tasks (mel-spectrogram extraction, envelope/periodicity checks, FFT for the signal-quality pipeline) are non-trivial in pure JS. Plan for a small native module (Kotlin, backed by a C/C++ DSP library or Android's audio APIs) rather than attempting real-time spectrogram computation in JavaScript — flag this as an early architectural decision, not something to discover mid-build.
- **Visualization**: `react-native-svg` for the live waveform view. During auscultation, two synchronized streams (PCG + ECG) are rendered simultaneously in a stacked layout; during ECG lead capture, only the ECG stream is shown. Keep the waveform component lightweight and stream-agnostic — it should accept a stream descriptor (label, color, data buffer) rather than being hardcoded to PCG or ECG, so the same component renders both the single-stream and dual-stream layouts without duplication. This is a clinical screening tool, not a data-viz showcase — prioritize rendering stability and update rate over visual polish.
- **Voice output**: `react-native-tts` (or platform-native TextToSpeech via a thin native bridge) for all spoken guidance. See Voice Guidance section.
- **Offline storage / sync queue**: A local embedded database (`react-native-sqlite-storage` or WatermelonDB) to queue recordings and Stage 1 results while offline, with a sync worker that flushes to Stage 2's cloud API once connectivity returns. Do not use AsyncStorage — it is not designed for structured, queryable clinical records.
- **Networking**: Standard `fetch`/axios for the Stage 2 API call, wrapped in retry-with-backoff logic — treat intermittent rural connectivity as the expected operating mode, not an edge case.

## UI/UX design system

### Color philosophy
Healthcare interfaces converge on a small set of well-evidenced conventions, and this app should follow them deliberately rather than reinvent color meaning:

- **Blue/navy as the primary, trust-signaling color** for navigation, primary buttons, and branding — ties naturally to CMU-Africa's existing presentation branding (navy + red + green plaid header).
- **Teal as a secondary accent** — calming, clinical, and distinct from pure blue.
- **Green reserved strictly for "normal/clear" results.** Always pair green with an unambiguous icon (e.g., checkmark) and a text label — roughly 8% of male users have red-green color blindness, so color alone is never sufficient for a safety-relevant state.
- **Red reserved strictly for genuine abnormal/urgent clinical findings** — not for routine warnings or generic errors. Overusing red for non-critical states desensitizes users to the cases that matter clinically. Pair red states with a distinct icon (e.g., alert triangle).
- **Neutral grays and soft off-white backgrounds**, not pure black/white — reduces eye strain over a CHW's full shift of screening patients.

### Proposed palette (hex values for implementation)
| Role | Color | Hex | Notes |
|---|---|---|---|
| Primary / navigation / brand | Deep navy | `#0B2545` | Anchors trust; echoes CMU-Africa branding |
| Primary action / CTA | Strong teal | `#0E7C86` | One consistent color for all primary buttons |
| Secondary accent | Soft sky blue | `#5AA9E6` | Secondary buttons, links, in-progress states |
| Success / normal result | Calm green | `#2E8B57` | Always paired with checkmark icon, never color-only |
| Critical / abnormal result | Clinical red | `#C8423A` | Reserved for genuine flagged results only; paired with alert icon |
| Warning / inconclusive | Amber | `#D9A441` | Distinct from both red and green; "needs recapture" state |
| Background | Warm off-white | `#F7F8FA` | Not pure white — reduces glare/eye strain |
| Body text | Soft dark slate | `#1F2933` | Not pure black |
| Borders / dividers / disabled | Cool gray | `#CBD2D9` | Low-emphasis structural elements |

Validate actual contrast ratios (WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text/UI components) once real screens are built, and adjust any combination that fails in practice.

### Typography and accessibility
- Use **tabular figures** (fixed-width digits) wherever numeric clinical data is shown, so values align cleanly and are not misread.
- Support text scaling up to 200% without breaking layout — design for this from the first screens, not as a retrofit.
- High-contrast mode should be a real, tested toggle — CHWs may work in bright outdoor light where screen glare is a real factor.
- Large touch targets throughout, consistent with tablet-first use and the possibility of gloved hands or in-motion operation.

### Core screens (initial scope)

The default landing screen after first-launch onboarding is History/Queue. No Bluetooth connection is required to reach any screen except Capture.

A persistent **connection status indicator** lives in the navigation header on every screen: shows connected (device name), reconnecting..., or not found. Tapping it from any screen opens the Bluetooth management section of Settings. This indicator is the only place the CHW needs to look to know whether the CardioSleeve is ready — no dedicated Connect screen.

1. **Language selection (first launch only)** — a one-time, blocking screen presented before the app opens for the first time. The CHW selects their language before any voice guidance can fire. On all subsequent launches this is skipped entirely; the persisted preference is applied silently. Always accessible from Settings if a change is needed.
2. **History/Queue (default landing)** — patient-level list of all sessions. Each row shows the patient identifier and an at-a-glance status summary for both modalities (Heart Sound / Heart Rhythm). Expandable to show per-modality detail: result, sync status, and whether recapture is needed. Also the entry point for starting a new patient session via a prominent "New Patient" action. Essential for CHWs managing multiple patients under intermittent connectivity.
3. **Patient** — create a new patient record or select an existing one. Fields and entry-point timing are an open question (see Open Questions) — build this screen to be flexible about which fields are required vs. optional, so the form can be adjusted once the team and IRB confirm what is required.
4. **Patient Session Hub** — the central screen for a single patient session. Shows two modality cards (Heart Sound / Heart Rhythm), each with its current status. The CHW navigates to capture from here and returns here after each result. The "Done with patient" action closes the session and returns to History/Queue.
5. **Capture** — modality- and position-aware in both layout and signal display. The selected valve site or lead is shown on screen throughout so the CHW always knows which position they are capturing. If the CardioSleeve is not connected when this screen is reached, it shows a focused inline "Connect your CardioSleeve to continue" prompt with reconnecting state and a manual retry — not a redirect to a separate screen.
   - **Auscultation (Heart Sound)**: displays two synchronized live waveforms — PCG and ECG — stacked vertically. Signal-quality gating and Stage 1 inference run on the PCG stream; the ECG is recorded and stored alongside it but is not the primary quality target in this mode.
   - **ECG Lead (Heart Rhythm)**: displays only the ECG waveform. The PCG is not the focus in this mode and should not be shown. Signal-quality feedback targets the ECG signal.

   Voice positioning instructions and the optional guide video are both keyed to the selected valve site or lead — not generic. Both modes include real-time voice and visual signal-quality guidance and a recording trigger (manual or auto based on quality threshold).
6. **Result** — modality-specific result immediately after recording (PCG: Stage 1 / Stage 2 result; ECG: TBD). Stage 2 result shown as it arrives or a clear "awaiting connectivity" state. Returns the CHW to the Patient Session Hub on dismissal.
7. **Settings** — language selection, CardioSleeve pairing and Bluetooth device management (the only place the full pairing flow lives), connectivity/sync status overview, and a toggle to enable or disable the modality-specific video positioning guides.

## What's explicitly out of scope for this app's codebase
- Training, retraining, or fine-tuning the Stage 1 or Stage 2 models — the app consumes exported artifacts only.
- Implementing the Stage 2 cloud model itself — the app is a client to that API, not its host.
- Echocardiography or any imaging-based diagnostic functionality — this app is PCG/ECG screening only.
- Patient record management beyond what's needed for this screening workflow and pilot data traceability — full EHR functionality is not this app's job.

## Open questions to track, not silently resolve
- Exact form of the eventual Rijuven SDK (compiled native library vs. protocol documentation) — determines the Bluetooth integration approach and which library best fits the connection model used by the CardioSleeve.
- Confirmed minimum Android API/SDK level based on actual device hardware available at CHUK/King Faisal.
- Confirmed target language(s) for voice guidance beyond English.
- IRB/ethics-approved data retention and identifier policy for pilot recordings.
- Final Stage 2 API contract (endpoint, payload format, auth mechanism) once that service is built.
- Specific auscultation positions and positioning instruction scripts for the voice guidance catalog — requires input from the clinical team.
- ECG lead placement guidance and the ECG analysis pipeline — the CardioSleeve captures synchronized ECG data, but what the app does with it (display only, local analysis, cloud analysis, or a separate Stage 1/2 cascade for ECG) has not been defined. Do not implement ECG analysis logic until this is agreed with the clinical and ML teams.
- **Which cardiac valve sites are in scope for auscultation** — the clinical team must specify the exact set of auscultation positions the RHD SCREENING protocol requires (e.g., aortic area, Erb's point, mitral apex, pulmonary area, tricuspid area) and their clinical priority. The app architecture supports multiple sites with per-site content, but the list must come from the clinical team, not be assumed. This also determines how many positioning scripts and guide videos need to be produced.
- **Which ECG leads are supported by the CardioSleeve** — depends on the hardware and the Rijuven SDK. Do not assume a lead set (single-lead, limb leads, precordial) until the device's capabilities are confirmed. This determines the lead selector options and the number of ECG positioning scripts and guide videos needed.
- **Whether the auscultation protocol is fixed-sequence or CHW-selectable** — the clinical team may require a defined sequence of valve sites per screening session (e.g., always aortic area then Erb's point), or may allow the CHW to select which site to capture based on clinical judgment. The app should support both patterns architecturally, but the protocol choice must be confirmed before the position-selector UX is finalized.
- **Video content for the optional positioning guide** — the clinical team needs to produce or source one short instructional video per supported valve site and one per supported ECG lead. A single generic placement video is not sufficient. The app provides the playback mechanism keyed to the position selection; it does not produce this content.

### Patient data — open questions (do not resolve silently)
These questions must be answered by the team and IRB before the Patient screen is finalized. Building assumptions into the data model before they are resolved will create migration debt on clinical pilot data.

- **When is patient data collected?** Three plausible points: (a) before any capture — the CHW enters patient details first; (b) a minimal identifier at session start with fuller demographics entered only if the result is abnormal and a referral is needed; (c) after the session — the CHW captures first and logs patient details retrospectively. The right answer depends on CHW workflow under time pressure and data completeness requirements for the pilot.
- **What prior patient data is recorded?** At minimum a patient identifier (local ID, national ID, or CHW-assigned code) and enough demographic context for clinical follow-up and pilot data analysis. Likely candidates include age/DOB, sex, and known prior RHD or cardiac diagnosis. Beyond that — symptom status, previous screening results, referral history — requires explicit confirmation from the clinical team and IRB. Do not assume a field set.
- **Is patient lookup needed (repeat visits)?** If the pilot is longitudinal and patients may return for follow-up screening, the app needs a search/lookup flow so the CHW can attach a new session to an existing patient rather than creating a duplicate record. If the pilot is purely cross-sectional, a simpler create-only flow is sufficient. Confirm the study design before building lookup infrastructure.
- **What is the minimum identifier for privacy compliance?** The ethics approval and site-specific data governance at CHUK/King Faisal determine whether names, national IDs, or only study-assigned pseudonyms are permitted. Coordinate with the team before wiring any PII into the data model.

When any of these are unresolved and block a specific implementation decision, say so explicitly rather than guessing and building on an unvalidated assumption — this is a clinical research tool, and silent assumptions compound badly here.
