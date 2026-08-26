# Inference Architecture Analysis — ECG + PCG Multimodal vs. Separate Models

> **Status: Design analysis for team decision.** This document examines four architectural
> options for incorporating ECG into the AI inference pipeline alongside PCG. It does not
> make a final decision — that requires sign-off from the ML team, clinical team, and a
> realistic assessment of available training data. Read this before any modelling work begins.

*Last updated: 2026-07-07*

---

## 1. Why This Decision Matters Now

The CardioSleeve captures PCG and ECG **simultaneously and in perfect temporal alignment**.
That synchronisation is rare and clinically valuable — but it creates an architecture
question that affects the ML training pipeline, the on-device TFLite model, the cloud
Stage 2 service, the app's capture screen, the upload payload, and the DB schema. Getting
this wrong early means expensive refactors on clinical pilot data.

The current plan (CLAUDE.md) treats ECG as an open question. This document closes that
question by laying out the options so the team can pick one deliberately rather than
drift into a default.

---

## 2. What ECG Adds to PCG for AS Detection

Understanding this is prerequisite to evaluating any architecture.

### 2.1 What PCG gives you alone

The phonocardiogram captures the acoustic events of the cardiac cycle. For AS, the
primary signal is a **mid-systolic ejection murmur**: a crescendo-decrescendo sound
between S1 and S2, loudest at the aortic area. A trained PCG model can detect this
pattern with reasonable sensitivity in good recordings.

**PCG's weakness:** Without a timing reference, the model must learn to locate systole
from the sound alone. This works, but it is fragile under noise, poor contact, or
atypical heart rates. Diastolic murmurs (mitral regurgitation, aortic regurgitation)
can be confused with systolic ones if cycle boundaries are ambiguous.

### 2.2 What ECG gives you alone

The electrocardiogram captures the electrical activity of the cardiac cycle. For AS,
the ECG is not diagnostic — you cannot confirm AS from ECG alone — but it provides two
useful signals:

**a) Left Ventricular Hypertrophy (LVH).**
Chronic pressure overload from AS causes the left ventricle to thicken. This produces
measurable voltage changes on ECG: elevated R-wave amplitude in lateral leads, deep S
waves in V1–V2. Standard criteria (Sokolow-Lyon: SV1 + RV5/V6 > 3.5 mV; Cornell;
Romhilt-Estes score) can be applied as rule-based checks without any ML model. LVH on
ECG in the presence of an auscultatory murmur substantially raises the pre-test
probability of haemodynamically significant AS.

**Caveat:** LVH takes years to develop. In the RHD-driven AS population at CHUK/King
Faisal — which skews younger than the degenerative-calcific AS population — LVH may
not yet be present even in severe cases. ECG-LVH is more useful as a confirmatory
signal than as a screening signal in this cohort.

**b) Cardiac cycle timing.**
The QRS complex is the most reliably detectable event in the cardiac cycle. R-peak
detection gives you beat-by-beat timing with millisecond precision. This unlocks
**ECG-guided PCG segmentation**: you know exactly where S1, systole, S2, and diastole
are in the PCG without asking the model to guess. This is clinically the most
immediately useful thing the ECG provides.

### 2.3 The synchronisation advantage

Because the CardioSleeve captures both streams simultaneously, the ECG and PCG share
a single clock. The R-peak in the ECG corresponds to a known offset in the PCG
(typically S1 follows the R-peak by ~30–80 ms depending on PR interval). This
temporal alignment is inherent and precise — it is not a property of any model, it
is a property of the hardware. Every architecture below should exploit this.

### 2.4 Summary: what combined PCG + ECG buys you

| Signal | Standalone value | Combined value |
|---|---|---|
| PCG | Detects murmur presence | Murmur character (timing, shape) confirmed by ECG phase reference |
| ECG timing | None for murmur detection | Precise S1/S2 localisation → removes a source of PCG model ambiguity |
| ECG morphology (LVH) | Weak standalone AS marker | Corroborative — raises probability when PCG already flagged murmur |
| ECG rhythm | Flags AF (which confounds PCG quality) | Allows model to flag or discard recordings with irregular rhythm |

---

## 3. The Four Architecture Options

### Option A — Unified Multimodal: one model takes both inputs everywhere

```
On-device (Stage 1)                    Cloud (Stage 2)
─────────────────────────────────      ─────────────────────────────────
PCG mel-spectrogram ──┐                PCG recording ──┐
                      ├─▶ [Joint    ]  ──▶ verdict     ├─▶ [Joint    ]  ──▶ verdict
ECG signal ───────────┘    [Model   ]                  └─▶  [Model   ]
                            normal /                        as_confirmed /
                            abnormal /                      normal /
                            inconclusive                    inconclusive
```

A single model at each stage accepts both modalities as input and produces a single
combined verdict. The local model is a multimodal TFLite network. The cloud model is
a multimodal CNN-BiLSTM or Transformer. Both models are trained on paired PCG+ECG
recordings with AS labels.

**Fusion strategies:**

*Early fusion* — concatenate or stack PCG spectrogram and ECG spectrogram into a
multi-channel input tensor before any learnt features are extracted. Simple to
implement but forces the model to learn cross-modal alignment from scratch.

*Late fusion* — run independent feature extractors on PCG and ECG, concatenate the
learned embeddings, then pass through a shared classification head. More flexible;
each branch can use an architecture suited to its modality (2D CNN for PCG
spectrogram, 1D CNN or BiLSTM for ECG).

*Cross-attention fusion* — Transformer-style attention between ECG and PCG feature
sequences, allowing the model to focus on the ECG features that correspond to
diagnostically relevant phases of the PCG. Most powerful but far too heavy for a
quantised on-device model.

**For Stage 1 (on-device), late fusion with INT8 quantisation is the only viable
multimodal approach.** The combined model is larger than the PCG-only model but not
prohibitively so if each branch stays in the MobileNetV3-Small weight class.

---

### Option B — Parallel Separate Models: independent PCG and ECG models at every stage

```
On-device (Stage 1)                    Cloud (Stage 2)
─────────────────────────────────      ─────────────────────────────────
PCG ──▶ [PCG Model] ──▶ pcg_verdict    PCG ──▶ [PCG Model] ──▶ pcg_verdict
                                                                    │
ECG ──▶ [ECG Model] ──▶ ecg_verdict    ECG ──▶ [ECG Model] ──▶ ecg_verdict
                                                                    │
Combined by rules in app:              Combined by rules on server: │
if pcg=abnormal → queue for S2         if pcg=as_confirmed → refer  │
if ecg=LVH      → add to report        if ecg=LVH          → flag   ▼
```

Two entirely independent models at each stage, each producing its own verdict. The
combination logic lives outside the models: in the app for Stage 1, on the server for
Stage 2. The combination is rule-based (explicit decision table) rather than learned.

**On-device ECG model options:**
- Rule-based LVH criteria only (Sokolow-Lyon, Cornell) — no model needed, just a
  signal processing step in the DSP native module
- Lightweight 1D CNN (<50k parameters) trained on ECG morphology classification
- AFIB/rhythm classifier to flag recordings with irregular RR intervals

**The sync_queue only queues PCG captures flagged abnormal**, same as today. ECG
findings are stored locally and included in the Stage 2 payload as metadata, but the
upload trigger remains a PCG abnormal verdict.

---

### Option C — Hybrid: PCG-first local, multimodal cloud only

```
On-device (Stage 1)           Cloud (Stage 2)
──────────────────────         ───────────────────────────────────
PCG ──▶ [PCG Model]           PCG ──────────┐
         │ abnormal?           ECG ──────────┼──▶ [Multimodal Model] ──▶ as_verdict
         │                                  │
         └─ YES → queue        (both uploaded together for S2)
```

Stage 1 remains PCG-only (current plan). The local model does not change. The ECG is
recorded and stored alongside the PCG for every capture but does not drive the Stage 1
gate. When an abnormal PCG is queued for Stage 2, **both the PCG recording and the ECG
recording are uploaded together**. The Stage 2 cloud model is multimodal — it takes
both inputs and returns a single fused verdict. The ECG contributes to Stage 2's
higher-specificity analysis but does not contribute to the Stage 1 sensitivity gate.

This is architecturally the cleanest path forward from the current state.

---

### Option D — ECG as Preprocessor Only (not a separate model)

```
On-device
──────────────────────────────────────────────────
ECG ──▶ R-peak detection (DSP, no model)
                │
                ▼
         Beat timestamps
                │
                ▼
PCG ──▶ Segmentation (split into cardiac cycles) ──▶ [PCG Model] ──▶ verdict
```

The ECG is never fed into a model. Instead, R-peak timestamps extracted from the ECG
via signal processing are used to segment the PCG into individual cardiac cycles before
the Stage 1 model runs. The PCG model sees clean, cycle-aligned input rather than a
raw 30-second stream. This removes the cycle-boundary ambiguity without requiring a
multimodal model, additional training data, or any changes to the Stage 2 API.

This is more of an enhancement to the existing pipeline than a separate architecture.
It can be combined with any of Options A–C.

---

## 4. Detailed Comparison

### 4.1 Clinical validity

| | Option A (joint everywhere) | Option B (parallel separate) | Option C (PCG local, joint cloud) | Option D (ECG preprocess) |
|---|---|---|---|---|
| Uses ECG timing for PCG segmentation | Yes (learned implicitly) | No (unless combined with D) | Partially (cloud only) | Yes (explicit, DSP) |
| Uses ECG LVH for corroboration | Yes (learned jointly) | Yes (explicit rules) | Yes (learned at cloud) | No |
| Handles single-lead ECG limitation | Depends on training data | Easier — rule-based LVH is single-lead compatible | Depends on cloud model training | Yes — R-peak works on any lead |
| Result interpretable to clinicians | Harder (black box fusion) | Easier (two separate verdicts) | Moderate | Easiest — PCG verdict unchanged |
| Risk of ECG modality confounding PCG verdict | High (joint model can learn spurious correlations) | None (independent) | Moderate | None |

### 4.2 Training data requirements

This is the most practically constraining factor.

| | Required dataset | Availability |
|---|---|---|
| Option A — joint local | Paired simultaneous PCG+ECG recordings, AS-labelled, large enough for multimodal training | **Very limited.** PhysioNet/CinC2016 is PCG-only. CirCor 2022 has some ECG but not large paired AS set. Predominantly need clinic-collected data. |
| Option A — joint cloud | Same as above | Same constraint, but larger compute budget allows bigger model |
| Option B — PCG model | PhysioNet/CinC2016, CirCor 2022 (~5,000+ recordings) | **Good.** Current plan uses these. |
| Option B — ECG model (LVH rules) | No training data — deterministic rules | **Available immediately.** |
| Option B — ECG model (1D CNN) | PTB-XL (~21,000 ECGs, LVH labels) or similar | **Good** for general ECG morphology, but not AS-specific |
| Option C — PCG local | Same as Option B PCG | **Good** |
| Option C — cloud joint | Paired PCG+ECG, AS-labelled | Same constraint as Option A cloud |
| Option D — R-peak DSP | No training data | **Available immediately.** |

**Key insight:** The training data bottleneck is specifically *paired simultaneous PCG+ECG with confirmed AS labels*. The CardioSleeve pilot will itself be one of the primary sources of this data for the RHD-driven AS population. This means:
- Options A and C (multimodal models) are best suited for **pilot phase v2**, not v1
- Options B and D are viable for **pilot phase v1** with existing public datasets
- The pilot should collect and store both modalities regardless of which option is chosen, so the paired data is available for a future multimodal model

### 4.3 On-device model size and latency

Budget tablet target: mid-range Android (~4 GB RAM, Snapdragon 680 or equivalent).
Acceptable Stage 1 inference latency: <3 seconds on a cold start.

| | Model size (estimated, INT8) | Inference latency | Risk |
|---|---|---|---|
| Option A local (late fusion) | ~2–4 MB (two MobileNetV3-Small branches + head) | ~1.5–3 s | Quantisation degrades rare-class sensitivity more on a larger model |
| Option B local (PCG model only) | ~0.8–1.2 MB (current plan) | <1 s | Low |
| Option B local (ECG model, 1D CNN) | ~0.2–0.5 MB | <0.5 s | Low |
| Option C local (PCG only) | ~0.8–1.2 MB (unchanged) | <1 s | Low |
| Option D (no ECG model) | No change | No change | None |

### 4.4 Upload payload and sync implications

| | What gets uploaded to Stage 2 | Payload size per submission |
|---|---|---|
| Option A | PCG + ECG recordings | ~240 KB PCG + ~30 KB ECG = ~270 KB |
| Option B | PCG recording + ECG verdict metadata (JSON) | ~240 KB + negligible |
| Option C | PCG + ECG recordings | ~270 KB (same as A) |
| Option D | PCG recording (unchanged) | ~240 KB (unchanged) |

Options A and C double the upload payload size. On a rural 2G or poor 3G connection,
270 KB vs. 240 KB is not significant — the bottleneck is the connection itself, not the
payload size. Negligible practical difference.

### 4.5 App architecture implications

**Capture screen:**
- All options: capture PCG and ECG simultaneously (already the plan)
- Option D: run R-peak detection in the DSP native module and feed beat timestamps into
  the PCG quality pipeline — requires changes to `SignalQualityModule.kt`
- All others: no change to capture screen beyond what is already planned

**Stage 1 inference:**
- Options A, B, D: inference runs on-device after capture
- Option C: only PCG inference runs on-device; ECG is stored but not analysed locally
- Option B with ECG model: two TFLite model calls, both on-device, both fast

**sync_queue and upload:**
- Options B and D: unchanged — only abnormal PCG recordings are queued
- Options A and C: `sync_queue` row must reference both `pcg_capture_id` and
  `ecg_capture_id`; the upload in `stage2Api.ts` sends both files in the multipart body
  (add `ecg_audio` field to the `POST /v1/captures/submit` payload)

**DB schema:**
- Options B and D: add `ecg_stage1_results` table (if ECG model is added) or store ECG
  findings as a JSON column on the existing `stage1_results` table
- Options A and C: no separate ECG result table — the joint model produces one verdict
  per session stored in the existing `stage2_results` table
- All options: `captures` table already has `modality` field (`'pcg'` | `'ecg'`) — no
  change needed there

**Result screen:**
- Options B and D: can show PCG verdict and ECG findings separately, with distinct
  clinical language for each
- Options A and C: single joint verdict — simpler display but harder to explain to the
  CHW which modality drove the result

---

## 5. Model Architecture Sketches

### 5.1 Option A — Late Fusion Local Model (TFLite INT8)

```
PCG Stream (4 kHz, 30 s)                  ECG Stream (500 Hz, 30 s)
       │                                          │
 Mel-spectrogram                         Normalise + segment
 (128 bins, 128 frames)                  (15,000 samples → fixed window)
       │                                          │
  [2D CNN branch]                         [1D CNN branch]
  MobileNetV3-Small                       3-layer Conv1D
  backbone (frozen)                       (lightweight)
       │                                          │
  PCG embedding                           ECG embedding
  (128-dim)                               (64-dim)
       │                                          │
       └──────────── Concatenate ─────────────────┘
                           │
                    [Dense 128 → 64]
                           │
                    [Softmax output]
                    normal | abnormal | inconclusive
```

Quantised to INT8: combined model ~2.5 MB. Both branches are needed for inference —
if the ECG stream is absent, the model cannot run. This is a hard dependency that
needs an explicit fallback strategy.

### 5.2 Option B — PCG Model (unchanged) + ECG Rule-Based Check

```
PCG Stream ──▶ Mel-spectrogram ──▶ MobileNetV3-Small ──▶ pcg_verdict

ECG Stream ──▶ DSP (Kotlin):
               - R-peak detection (Pan-Tompkins algorithm)
               - RR interval regularity (AF flag)
               - Sokolow-Lyon criterion: SV1 + RV5 > 3.5 mV ?
               - Cornell criterion: RaVL + SV3 > 2.0 mV (F) / 2.8 mV (M) ?
               └──▶ ecg_findings: { lvh: bool, afib: bool, rr_irregular: bool }
```

The ECG findings are stored in the DB and included in the Stage 2 upload payload as
metadata JSON. The Stage 2 server uses both the PCG audio and the ECG findings when
scoring. This gives the cloud model ECG-derived features without requiring a new
on-device ECG TFLite model.

### 5.3 Option C — PCG Local, Joint Cloud

```
On-device Stage 1:
  PCG ──▶ MobileNetV3-Small ──▶ pcg_s1_verdict (unchanged)
  ECG ──▶ stored, not analysed locally

Cloud Stage 2 (when pcg_s1 = abnormal):
  PCG recording ──┐
                  ├──▶ [CNN-BiLSTM + Cross-Attention] ──▶ joint_as_verdict
  ECG recording ──┘
```

The cloud model uses full precision (no quantisation constraint), can use
cross-attention between PCG and ECG feature sequences, and can be retrained more
easily than the on-device model.

### 5.4 Option D — R-Peak Guided PCG Segmentation

```
ECG Stream ──▶ Pan-Tompkins R-peak detector (Kotlin DSP)
                      │
                 beat_timestamps[]
                      │
PCG Stream ──▶ Segment into individual cardiac cycles using beat_timestamps
                      │
               Normalised cycle stack (e.g. 10 cycles × 512 samples)
                      │
               [PCG Model — unchanged architecture]
                      │
               pcg_verdict (better accuracy than unsegmented input)
```

This is the most conservative change. The PCG model architecture, training data
requirement, TFLite artifact, and everything downstream are unchanged. The only new
code is R-peak detection in `SignalQualityModule.kt` and a segmentation step before
inference in the TFLite runner.

---

## 6. Risk Register

| Risk | A (joint) | B (separate) | C (hybrid) | D (preprocess) |
|---|---|---|---|---|
| Insufficient paired training data | **Critical** — blocks both models | Low — PCG and ECG data available separately | **Critical** for cloud model | None |
| Single-lead ECG limits LVH detection | High | Low — rules adapted to available leads | High for cloud model | None — R-peaks work on any lead |
| On-device latency on budget tablet | High — two branches in one model | Low | None (unchanged S1) | None |
| Younger RHD cohort may not show LVH | Mitigated if model learns other ECG features | **High** — rules depend on LVH | Mitigated | Not applicable |
| ECG missing or corrupt during capture | **Blocks inference** — fallback needed | Graceful — PCG model still runs | Stage 1 unaffected | Fallback to unsegmented PCG |
| Model interpretability for ethics review | Low — joint black box | High — separate verdicts | Medium | High — only PCG model |
| Pilot data collection breaks if ECG model changes | High | Low — models are independent | Low | None |

---

## 7. Recommendation

**For pilot phase v1:** implement **Option C (Hybrid)** with **Option D's R-peak preprocessing** as a bundled enhancement.

Rationale:

1. **Stage 1 stays unchanged.** The existing MobileNetV3-Small PCG plan is not
   disrupted. No new TFLite model needs to be produced before the pilot starts. This
   is the critical path risk.

2. **R-peak segmentation is free.** The DSP native module already needs to be written
   for signal quality checks. Adding Pan-Tompkins R-peak detection there is a contained
   addition in Kotlin with no training data requirement. It gives the PCG model better
   input quality immediately.

3. **The Stage 2 cloud model becomes multimodal.** This is where there is no
   compute constraint and where the ML team has freedom to experiment. The pilot
   itself collects the paired PCG+ECG data needed to train a multimodal Stage 2 model.
   The first deployment can use a PCG-only Stage 2; it can be retrained and redeployed
   as a joint model mid-pilot without any app changes, provided the upload payload
   already includes both files.

4. **Upload both files from day one.** Even if Stage 2 is initially PCG-only,
   upload both PCG and ECG recordings in the Stage 2 payload from the first app build.
   This costs nothing (30 KB extra per submission) and means the server always has
   paired data to train the future multimodal model. Do not gate the ECG upload on
   the Stage 2 model being multimodal.

5. **ECG rule-based findings (Option B) as a local bonus.** Add Sokolow-Lyon and
   AF detection as DSP checks in `SignalQualityModule.kt` (no model needed). Store
   the results in a `ecg_findings` JSON field on the `captures` or `stage1_results`
   table. Include them in the Stage 2 payload. This gives the cloud model more signal
   without requiring an on-device ECG TFLite model.

**For pilot phase v2** (after ~6 months of paired recordings collected):
- Evaluate whether training data is sufficient for a joint Stage 1 local model
- If yes, Option A (late fusion) becomes feasible
- If no, remain on Option C and improve the Stage 2 multimodal model with pilot data

**The ECG analysis pipeline for the pilot therefore looks like this:**

```
Capture
  ├── PCG recorded + stored
  └── ECG recorded + stored
          │
          ▼
  DSP (Kotlin, no model):
    ├── R-peak timestamps → fed to PCG segmenter
    ├── RR regularity → AF flag
    └── Sokolow-Lyon / Cornell → LVH flag

          │
          ▼
  Stage 1 TFLite (PCG, segmented by R-peaks):
    └── pcg_verdict: normal | abnormal | inconclusive

          │ if abnormal
          ▼
  Sync queue entry:
    capture_id (PCG)
    ecg_capture_id (ECG)
    ecg_findings { lvh, afib, rr_irregular }

          │
          ▼
  Stage 2 upload (multipart):
    pcg_audio (WAV)
    ecg_audio (BIN)
    ecg_findings (JSON)
    [all existing metadata fields]

          │
          ▼
  Stage 2 cloud (v1 = PCG-only, v2 = joint):
    └── joint_verdict: as_confirmed | normal | inconclusive
```

---

## 8. Open Questions This Analysis Raises

| # | Question | Blocks |
|---|---|---|
| 1 | Which ECG leads does the CardioSleeve support? A single precordial lead cannot confirm Sokolow-Lyon (needs V1 + V5/V6). Cornell criterion (aVL + V3) needs limb leads. Confirm with Rijuven before implementing LVH rules. | Option B/D LVH rules |
| 2 | Does the Stage 2 ML team have capacity to train a multimodal cloud model in time for the pilot? If not, Plan C's Stage 2 stays PCG-only and the ECG upload is purely for future data collection. | Option C cloud rollout |
| 3 | What ECG labels does the pilot ethics approval cover? If the IRB consent only covers RHD SCREENING (PCG), adding ECG-based AF or LVH annotation may need a protocol amendment. | Any ECG result surfaced to CHW |
| 4 | Should ECG findings (LVH flag, AF flag) be shown to the CHW in the Result screen, or only used internally by the cloud model? A CHW showing a "possible AF" flag to a patient without clinical backup is a liability risk. | Result screen UX |
| 5 | Is the Pan-Tompkins algorithm robust enough on a single-lead CardioSleeve ECG, or does the signal quality require a more noise-tolerant R-peak detector (e.g. Hamilton-Tompkins, or a learned detector)? | Option D quality |

---

## 9. Implementation Checklist (if Recommendation is Accepted)

- [ ] Add `ecg_capture_id` reference to `sync_queue` table (migration v3)
- [ ] Add `ecg_findings` JSON column to `stage1_results` table (migration v3)
- [ ] Implement Pan-Tompkins R-peak detection in `SignalQualityModule.kt` (Kotlin)
- [ ] Wire R-peak timestamps into PCG segmentation before TFLite inference
- [ ] Implement Sokolow-Lyon + AF detection in `SignalQualityModule.kt` (only after confirming available ECG leads with Rijuven)
- [ ] Update `stage2Api.ts` to include `ecg_audio` and `ecg_findings` in multipart upload
- [ ] Update `POST /v1/captures/submit` API spec to accept `ecg_audio` (optional, backwards-compatible)
- [ ] Update server `capture_submissions` table to store `ecg_findings` JSON
- [ ] Decide with clinical team whether ECG findings appear in CHW result screen (see Open Question 4)
- [ ] Store paired PCG+ECG on server with AS confirmation labels — this is the training corpus for the future multimodal Stage 2 model
