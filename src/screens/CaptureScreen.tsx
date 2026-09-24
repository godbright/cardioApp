import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import WaveformView, { useWaveformBuffers } from '../components/WaveformView';
import { XIcon, BluetoothIcon, MicIcon, StopIcon } from '../components/Icons';
import { Colors } from '../theme/colors';
import { getSiteById } from '../constants/sites';
import { speak } from '../services/tts';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';
import { useCardioSQI } from '../hooks/useCardioSQI';
import { useWavRecorder } from '../hooks/useWavRecorder';
import { setLastWavResult } from '../services/recordingStore';
import { runStage1 } from '../services/stage1';
import BluetoothPickerModal from '../components/BluetoothPickerModal';
import type { CapturePhase, Posture } from '../types';

function phaseToStep(phase: CapturePhase): number {
  if (phase === 'gate' || phase === 'positioning') return 0;
  if (phase === 'ready') return 1;
  if (phase === 'recording') return 2;
  return 3;
}

export default function CaptureScreen() {
  const { state, onCancel, onRecord, setPosture, finishCapture, dispatch } = useApp();
  const { capturePhase, quality, recProgress, modality, site, posture, conn } = state;
  const insets     = useSafeAreaInsets();
  const { isPortrait } = useOrientation();
  const S          = useStrings();

  const siteInfo = site ? getSiteById(site) : null;
  const isPcg    = modality === 'pcg';

  const sqiMode  = isPcg ? 'pcg' : 'ecg';
  // Stay active through 'ready' so the debug overlay remains visible after the
  // phase transition. Deactivates when recording starts.
  const sqiActive = capturePhase === 'positioning' || capturePhase === 'ready';
  const sqa      = useCardioSQI(sqiActive, sqiMode);

  // Dynamic waveform box height — measured via onLayout so the waveform fills
  // whatever space is available in both portrait and landscape.
  const [waveBoxH, setWaveBoxH] = useState(300);

  const [pickerVisible, setPickerVisible] = useState(false);
  const onPickerConnected = useCallback(() => {
    dispatch({ type: 'PATCH', patch: { capturePhase: 'positioning' } });
  }, [dispatch]);

  // waveform is live during positioning so the CHW sees the signal while placing the device
  const waveformActive = capturePhase !== 'gate';
  const { pcgBuf, ecgBuf } = useWaveformBuffers(waveformActive, modality);

  const { startRecording, stopAndSave } = useWavRecorder();

  const phaseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a stable ref to finishCapture — updated directly during render (the
  // React-recommended "latest-value ref" pattern) so the timer always calls the
  // current closure without an effect that runs after every render.
  const finishCaptureRef = useRef(finishCapture);
  finishCaptureRef.current = finishCapture;

  // Track the last dispatched quality to skip no-op SET_QUALITY dispatches.
  // Without this, every sqa tick (40 ms) triggers a full context re-render even
  // when the displayed percentage hasn't changed — 25 unnecessary renders/sec.
  const lastDispatchedQuality = useRef(-1);

  // EMA smoother for both the displayed quality percentage AND the "ready" gate.
  //
  // Raw SQI windows are independent (each 2 s of audio computed fresh), so the
  // score can jump ±20 pts even at a stable position. With α = 0.3, a single
  // good window followed by a bad one still crosses thresholds — producing the
  // "yes/no/yes/no" toggle the CHW sees. Reducing α to 0.2 means each window
  // contributes only 20 % of the new average: roughly 4 consecutive good windows
  // are needed before the smoothed score reliably clears 0.65, which prevents
  // single-window noise from triggering (or cancelling) the ready state.
  //
  // The phase transition also uses the smoothed score (not raw sqa.ready) so the
  // gate and the display always agree — no more green bar with a "not ready" gate.
  // EMA for the DISPLAYED percentage only — keeps the number smooth on screen.
  // Never used to gate the "ready" transition (sqa.ready from C++ does that).
  const EMA_ALPHA = 0.2;
  const smoothedScoreRef = useRef(-1); // -1 = uninitialised

  // Consecutive-window counter for the ready gate.
  // sqa.ready is a per-2-second-window C++ flag. Requiring 2 consecutive YES
  // windows (~4 s of sustained good signal) prevents a single noisy window
  // from triggering the ready state — without introducing the EMA mismatch
  // that let the JS gate fire while the debug overlay still showed "ready: no".
  const consecutiveReadyRef = useRef(0);
  const CONSECUTIVE_READY_REQUIRED = 6; // ~12 s of sustained good signal at 2-s windows

  useEffect(() => {
    if (phaseTimer.current) clearInterval(phaseTimer.current);

    if (capturePhase === 'recording') {
      // Start on-device WAV capture as soon as recording phase begins.
      // Only PCG captures have meaningful audio to record.
      if (isPcg) startRecording();

      let prog = 0;
      phaseTimer.current = setInterval(() => {
        prog = Math.min(100, prog + 1);
        // Only advance the progress bar — quality stays at whatever it was when
        // recording started (SQI is inactive during recording).
        dispatch({ type: 'PATCH', patch: { recProgress: prog } });
        if (prog >= 100) {
          clearInterval(phaseTimer.current!);
          dispatch({ type: 'SET_CAPTURE_PHASE', phase: 'analyzing' });

          if (isPcg) {
            // Stop recording, run Stage 1 inference, then commit result.
            // runStage1 pads to MIN_ANALYSIS_MS internally so the 'analyzing'
            // screen is never invisible — no hard-coded timeout needed here.
            stopAndSave()
              .then(async wav => {
                if (wav) setLastWavResult(wav);
                const s1 = await runStage1(wav?.path ?? '');
                finishCaptureRef.current({
                  verdict:    s1.verdict,
                  confidence: s1.confidence.toFixed(2),
                  model:      s1.modelVersion,
                });
              })
              .catch(() => {
                // Inference error — fall through to simulated result after a delay.
                setTimeout(() => finishCaptureRef.current(), 1400);
              });
          } else {
            // ECG capture — no PCG inference.
            setTimeout(() => finishCaptureRef.current(), 1400);
          }
        }
      }, 150);
    }

    return () => { if (phaseTimer.current) clearInterval(phaseTimer.current); };
  }, [capturePhase]);

  // Drive quality bar and phase transition from real SQI data (or DEMO_MODE synthetic ramp).
  // capturePhase MUST be in the deps — without it the closure is stale and the phase
  // transition fires every 40 ms (once per sqa tick) instead of exactly once.
  useEffect(() => {
    if (!sqa) {
      // Signal lost — reset both the display smoother and the consecutive counter.
      smoothedScoreRef.current = -1;
      consecutiveReadyRef.current = 0;
      if (lastDispatchedQuality.current !== 0) {
        lastDispatchedQuality.current = 0;
        dispatch({ type: 'SET_QUALITY', quality: 0 });
      }
      return;
    }

    // ── Display: EMA-smoothed percentage ────────────────────────────────────
    // Keeps the on-screen number from jumping with each raw 2-second window.
    // This value is NEVER used to gate readiness — it is display-only.
    const raw = sqa.score;
    smoothedScoreRef.current =
      smoothedScoreRef.current < 0
        ? raw
        : EMA_ALPHA * raw + (1 - EMA_ALPHA) * smoothedScoreRef.current;

    const q = Math.round(smoothedScoreRef.current * 100);
    if (q !== lastDispatchedQuality.current) {
      lastDispatchedQuality.current = q;
      dispatch({ type: 'SET_QUALITY', quality: q });
    }

    // ── Ready gate: raw sqa.ready from C++ + consecutive-window debounce ────
    // sqa.ready is the authoritative flag — it is exactly what the debug overlay
    // shows. Tying the gate to the EMA caused the UI to say "ready" while the
    // overlay still showed "ready: no" because the EMA can cross the threshold
    // before any individual window actually qualifies.
    //
    // Requiring CONSECUTIVE_READY_REQUIRED (2) back-to-back YES windows (~4 s)
    // prevents a single noisy window from false-triggering without introducing
    // the EMA mismatch. When the overlay shows YES twice in a row, the UI agrees.
    if (sqa.ready) {
      consecutiveReadyRef.current += 1;
    } else {
      consecutiveReadyRef.current = 0;
      // Signal dropped — deactivate the Record button if it was already ready.
      // This prevents the CHW from recording on a degraded signal after the
      // initial ready gate fired. They must re-achieve the consecutive threshold.
      if (capturePhase === 'ready') {
        dispatch({ type: 'SET_CAPTURE_PHASE', phase: 'positioning' });
        speak('quality.dropped'); // "Signal lost — please reposition the sensor."
      }
    }

    if (consecutiveReadyRef.current >= CONSECUTIVE_READY_REQUIRED && capturePhase === 'positioning') {
      dispatch({ type: 'SET_CAPTURE_PHASE', phase: 'ready' });
      speak('quality.ready.manual'); // "Signal is good — press Record when ready."
    }
  }, [sqa, capturePhase]);

  const stepIdx = phaseToStep(capturePhase);
  const stepLabels = [S.capture.stepPosition, S.capture.stepAcquire, S.capture.stepRecord, S.capture.stepScreen] as const;

  // caption bar: shows the voice guidance text for the current phase
  const voiceCaptions: Partial<Record<CapturePhase, string>> = {
    positioning: S.capture.waitingSignal,
    ready:       S.capture.qualityGood,   // "Sufficient for recording"
    recording:   S.capture.recordingNow,
    analyzing:   S.capture.analysing,
  };
  const caption = voiceCaptions[capturePhase] ?? '';

  const connLabel =
    conn === 'connected'    ? S.capture.connConnected :
    conn === 'reconnecting' ? S.capture.connReconnecting :
    S.capture.connNotFound;

  const connDot =
    conn === 'connected'    ? Colors.green :
    conn === 'reconnecting' ? Colors.amber :
    Colors.red;

  const streams = isPcg
    ? [
        { label: 'PCG · HEART SOUND', color: Colors.white, buffer: pcgBuf },
        { label: 'ECG · RHYTHM',      color: Colors.white, buffer: ecgBuf },
      ]
    : [
        { label: 'ECG · RHYTHM', color: Colors.white, buffer: ecgBuf },
      ];

  // Tie qualityColor and qualityLabel to capturePhase, not the raw quality number.
  // Without this, the label can briefly say "Sufficient for recording" in green
  // while the Record button is still dim — because SET_QUALITY and SET_CAPTURE_PHASE
  // are dispatched in the same effect but may land in separate render cycles.
  // Using capturePhase as the source of truth keeps label, color, and button in sync.
  const isSignalReady = capturePhase === 'ready';

  const qualityColor =
    isSignalReady   ? Colors.green :
    quality >= 50   ? Colors.amber :
    Colors.red;

  const qualityLabel =
    isSignalReady   ? S.capture.qualityGood :       // "Sufficient for recording"
    quality >= 50   ? S.capture.qualityImproving :  // "Improving — hold steady"
    S.capture.qualityWeak;                          // "Signal too weak — reposition sensor"

  const POSTURES: { value: Posture; label: string }[] = [
    { value: 'sitting',      label: S.capture.postureSitting },
    { value: 'supine',       label: S.capture.postureSupine },
    { value: 'left-lateral', label: S.capture.postureLeft },
  ];

  // ── Acquire card content — shared between landscape and portrait (different containers) ──
  function acquireContent(compact: boolean) {
    if (capturePhase === 'recording') {
      return (
        <View style={compact ? styles.recordingStateCompact : styles.recordingState}>
          <View style={styles.recProgress}>
            <View style={[styles.recProgressFill, { width: `${recProgress}%` as any }]} />
          </View>
          {compact ? (
            <TouchableOpacity style={styles.recordBtnCompact} onPress={onRecord}>
              <StopIcon size={14} color={Colors.white} />
              <Text style={styles.recordBtnCompactLabel}>{S.capture.recordingNow}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.recordBtnRecording} onPress={onRecord}>
              <StopIcon size={26} color={Colors.white} />
              <Text style={styles.recordBtnLabel}>{S.capture.recordingNow}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    if (capturePhase === 'analyzing') {
      return (
        <View style={compact ? styles.analyzeStateCompact : styles.analyzeState}>
          <Text style={styles.analyzeText}>{S.capture.analysing}</Text>
        </View>
      );
    }
    if (compact) {
      return (
        <TouchableOpacity
          style={[styles.recordBtnCompact, capturePhase !== 'ready' && styles.recordBtnCompactDim]}
          onPress={capturePhase === 'ready' ? onRecord : undefined}
          activeOpacity={capturePhase === 'ready' ? 0.8 : 1}
        >
          <MicIcon size={16} color={capturePhase === 'ready' ? Colors.navy : 'rgba(255,255,255,0.3)'} />
          <Text style={[styles.recordBtnCompactLabel, capturePhase !== 'ready' && { color: 'rgba(255,255,255,0.35)' }]}>
            {capturePhase === 'ready' ? S.capture.tapToRecord : S.capture.waitingSignal}
          </Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.acquireCenter}>
        <TouchableOpacity
          style={[styles.recordBtnCircle, capturePhase !== 'ready' && styles.recordBtnCircleDim]}
          onPress={capturePhase === 'ready' ? onRecord : undefined}
          activeOpacity={capturePhase === 'ready' ? 0.8 : 1}
        >
          <MicIcon size={32} color={capturePhase === 'ready' ? Colors.navy : 'rgba(255,255,255,0.25)'} />
        </TouchableOpacity>
        <Text style={[styles.tapToRecord, capturePhase !== 'ready' && { color: 'rgba(255,255,255,0.35)' }]}>
          {capturePhase === 'ready' ? S.capture.tapToRecord : S.capture.waitingSignal}
        </Text>
        <Text style={styles.tapSub}>
          {isPcg ? S.capture.tapSub : S.capture.tapSubEcg}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
          <XIcon size={16} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isPcg ? S.capture.heartSound : S.capture.heartRhythm}
          {siteInfo ? ` · ${siteInfo.label}` : ''}
        </Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.deviceChip} onPress={() => setPickerVisible(true)} activeOpacity={0.7}>
          <BluetoothIcon size={13} color="rgba(255,255,255,0.6)" />
          <View style={[styles.deviceDot, { backgroundColor: connDot }]} />
          <Text style={styles.deviceName}>{connLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Stepper ───────────────────────────────────────── */}
      <View style={styles.stepper}>
        {stepLabels.map((label, i) => {
          const done   = stepIdx > i;
          const active = stepIdx === i;
          return (
            <React.Fragment key={label}>
              <View style={styles.stepItem}>
                <View style={[styles.stepCircle, done && styles.stepCircleDone, active && styles.stepCircleActive]}>
                  <Text style={[styles.stepNum, active && styles.stepNumActive, done && styles.stepNumDone]}>
                    {i + 1}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, active && styles.stepLabelActive, done && styles.stepLabelDone]}>
                  {label}
                </Text>
              </View>
              {i < 3 && <View style={[styles.stepLine, done && styles.stepLineDone]} />}
            </React.Fragment>
          );
        })}
      </View>

      {/* ── Body ──────────────────────────────────────────── */}
      {capturePhase === 'gate' ? (
        <View style={styles.gateContainer}>
          <BluetoothIcon size={36} color="rgba(255,255,255,0.3)" />
          <Text style={styles.gateTitle}>{S.capture.connectTitle}</Text>
          <Text style={styles.gateSub}>{S.capture.connectSub}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => setPickerVisible(true)}
          >
            <Text style={styles.retryBtnText}>{S.capture.retryBtn}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.activeLayout, isPortrait && styles.activeLayoutPortrait]}>

          {/* ── Waveform column ─────────────────────────────── */}
          <View style={[styles.waveformCol, isPortrait && styles.waveformColPortrait]}>
            {/*
             * onLayout measures the actual available height so WaveformView fills
             * the box regardless of orientation — fixes landscape ECG appearing at
             * the "top" of a tall box and portrait waveform being too small.
             */}
            <View
              style={styles.waveformBox}
              onLayout={e => setWaveBoxH(Math.max(80, e.nativeEvent.layout.height - 16))}
            >
              {waveBoxH > 0 && (
                <WaveformView streams={streams} height={waveBoxH} />
              )}
              {__DEV__ && sqa && (
                <View style={styles.sqiOverlay} pointerEvents="none">
                  <Text style={styles.sqiOverlayText}>
                    {`score ${sqa.score.toFixed(3)}  ready ${sqa.ready ? 'YES' : 'no'}\n`}
                    {isPcg
                      ? `ser ${sqa.serSqi.toFixed(3)}  e ${sqa.eSqi.toFixed(3)}  a ${sqa.aSqi.toFixed(3)}`
                      : `b ${sqa.bSqi.toFixed(3)}  k ${sqa.kSqi.toFixed(3)}  bas ${sqa.basSqi.toFixed(3)}`}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.captionBar}>
              <View style={styles.captionBars}>
                {[0.4, 0.7, 1.0, 0.7, 0.5].map((h, i) => (
                  <View
                    key={i}
                    style={[styles.captionBarSegment, { height: 14 * h, opacity: quality >= 50 ? 1 : 0.3 }]}
                  />
                ))}
              </View>
              <Text style={styles.captionText}>{caption}</Text>
            </View>
          </View>

          {/* ── Portrait: compact 2×2 grid below waveform ──── */}
          {isPortrait ? (
            <View style={styles.portraitGrid}>
              {/* Row 1: POSITION + SIGNAL QUALITY */}
              <View style={styles.portraitGridRow}>
                <View style={[styles.railCard, styles.portraitGridCard]}>
                  <Text style={styles.railCardLabel}>{S.capture.sectionPosition}</Text>
                  <Text style={styles.railSiteName} numberOfLines={1}>
                    {siteInfo?.label ?? site ?? '—'}
                  </Text>
                  {!!siteInfo?.instr && (
                    <Text style={styles.railSiteInstrSm} numberOfLines={1}>{siteInfo.instr}</Text>
                  )}
                </View>
                <View style={[styles.railCard, styles.portraitGridCard]}>
                  <View style={styles.qualityHeader}>
                    <Text style={styles.railCardLabel}>{S.capture.sectionQuality}</Text>
                    {capturePhase !== 'recording' && capturePhase !== 'analyzing' && (
                      <Text style={[styles.qualityScore, { color: qualityColor }]}>
                        <Text style={styles.qualityScoreNum}>{quality}</Text>/100
                      </Text>
                    )}
                  </View>
                  {capturePhase === 'recording' || capturePhase === 'analyzing' ? (
                    <Text style={[styles.qualityLabelSm, { color: Colors.teal }]} numberOfLines={1}>
                      {capturePhase === 'recording' ? S.capture.recordingNow : S.capture.analysing}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.qualityBarBg}>
                        <View style={[styles.qualityBarFill, { width: `${quality}%` as any, backgroundColor: qualityColor }]} />
                      </View>
                      <Text style={[styles.qualityLabelSm, { color: qualityColor }]} numberOfLines={1}>
                        {qualityLabel}
                      </Text>
                    </>
                  )}
                </View>
              </View>

              {/* Row 2: PATIENT POSITION + ACQUIRE */}
              <View style={styles.portraitGridRowTall}>
                <View style={[styles.railCard, styles.portraitGridCard, styles.portraitPatPosture]}>
                  <Text style={styles.railCardLabel}>{S.capture.sectionPosture}</Text>
                  <View style={styles.postureRowCompact}>
                    {POSTURES.map(pt => (
                      <TouchableOpacity
                        key={pt.value}
                        style={[styles.postureBtnCompact, posture === pt.value && styles.postureBtnActive]}
                        onPress={() => setPosture(pt.value)}
                      >
                        <Text style={[styles.postureBtnTextSm, posture === pt.value && styles.postureBtnTextActive]}
                          numberOfLines={1}
                        >
                          {pt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={[styles.railCard, styles.railCardAcquire, styles.portraitGridCard]}>
                  <Text style={styles.railCardLabel}>
                    {S.capture.sectionStep} {stepIdx + 1} · {stepLabels[stepIdx]}
                  </Text>
                  {acquireContent(true)}
                </View>
              </View>
            </View>
          ) : (
            /* ── Landscape: 4-card right rail ─────────────── */
            <View style={styles.rightRail}>
              <View style={[styles.railCard, { flex: 1.3 }]}>
                <Text style={styles.railCardLabel}>{S.capture.sectionPosition}</Text>
                <Text style={styles.railSiteName}>{siteInfo?.label ?? site ?? '—'}</Text>
                <Text style={styles.railSiteInstr}>{siteInfo?.instr ?? ''}</Text>
              </View>
              <View style={[styles.railCard, { flex: 1.4 }]}>
                <Text style={styles.railCardLabel}>{S.capture.sectionPosture}</Text>
                <View style={styles.postureRow}>
                  {POSTURES.map(pt => (
                    <TouchableOpacity
                      key={pt.value}
                      style={[styles.postureBtn, posture === pt.value && styles.postureBtnActive]}
                      onPress={() => setPosture(pt.value)}
                    >
                      <Text style={[styles.postureBtnText, posture === pt.value && styles.postureBtnTextActive]}>
                        {pt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.railNote}>{S.capture.postureNote}</Text>
              </View>
              <View style={[styles.railCard, { flex: 1.2 }]}>
                <View style={styles.qualityHeader}>
                  <Text style={styles.railCardLabel}>{S.capture.sectionQuality}</Text>
                  {capturePhase !== 'recording' && capturePhase !== 'analyzing' && (
                    <Text style={[styles.qualityScore, { color: qualityColor }]}>
                      <Text style={styles.qualityScoreNum}>{quality}</Text>/100
                    </Text>
                  )}
                </View>
                {capturePhase === 'recording' || capturePhase === 'analyzing' ? (
                  <Text style={[styles.qualityLabel, { color: Colors.teal }]}>
                    {capturePhase === 'recording' ? S.capture.recordingNow : S.capture.analysing}
                  </Text>
                ) : (
                  <>
                    <View style={styles.qualityBarBg}>
                      <View style={[styles.qualityBarFill, { width: `${quality}%` as any, backgroundColor: qualityColor }]} />
                    </View>
                    <Text style={[styles.qualityLabel, { color: qualityColor }]}>{qualityLabel}</Text>
                  </>
                )}
              </View>
              <View style={[styles.railCard, styles.railCardAcquire, { flex: 2.1 }]}>
                <Text style={styles.railCardLabel}>
                  {S.capture.sectionStep} {stepIdx + 1} · {stepLabels[stepIdx]}
                </Text>
                {acquireContent(false)}
              </View>
            </View>
          )}
        </View>
      )}

      <BluetoothPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onConnected={onPickerConnected}
      />
    </View>
  );
}

const BG       = '#0E1E35';
const CARD_BG  = 'rgba(255,255,255,0.06)';
const CARD_BDR = 'rgba(255,255,255,0.10)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600', color: Colors.white },
  deviceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  deviceDot:  { width: 7, height: 7, borderRadius: 4 },
  deviceName: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'IBMPlexSans-Regular', fontWeight: '400' },

  // ── Stepper ───────────────────────────────────────────────────────────────
  stepper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  stepItem:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepCircle: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleActive: { borderColor: Colors.white, backgroundColor: Colors.white },
  stepCircleDone:   { borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.15)' },
  stepNum:       { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'IBMPlexSans-Regular', fontWeight: '400' },
  stepNumActive: { color: Colors.navy },
  stepNumDone:   { color: 'rgba(255,255,255,0.5)' },
  stepLabel:       { fontSize: 13, color: 'rgba(255,255,255,0.3)', marginRight: 4 },
  stepLabelActive: { color: Colors.white },
  stepLabelDone:   { color: 'rgba(255,255,255,0.4)' },
  stepLine:     { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 6 },
  stepLineDone: { backgroundColor: 'rgba(255,255,255,0.3)' },

  // ── Gate ──────────────────────────────────────────────────────────────────
  gateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 },
  gateTitle: { fontSize: 22, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.white, textAlign: 'center', maxWidth: 420 },
  gateSub:   { fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 22, maxWidth: 380 },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 10,
    backgroundColor: Colors.navy, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  retryBtnText: { fontSize: 15, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.white },

  // ── Active layout ─────────────────────────────────────────────────────────
  activeLayout:         { flex: 1, flexDirection: 'row' },
  activeLayoutPortrait: { flexDirection: 'column' },

  // ── Waveform column ───────────────────────────────────────────────────────
  waveformCol:         { flex: 1, flexDirection: 'column' },
  // In portrait, waveformCol takes flex:1 (most of the screen) and the
  // compact grid below takes a fixed height — so the waveform is always the
  // dominant visual element.
  waveformColPortrait: { flex: 1 },

  waveformBox: {
    flex: 1, backgroundColor: Colors.bgWaveform,
    margin: 12, borderRadius: 12, padding: 8, overflow: 'hidden',
  },

  captionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 12, marginBottom: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  captionBars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  captionBarSegment: { width: 3, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 2 },
  captionText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 20 },

  // ── Landscape right rail ──────────────────────────────────────────────────
  rightRail: { width: 314, padding: 12, gap: 8, flexDirection: 'column' },

  // ── Portrait compact grid (fixed height below waveform) ───────────────────
  portraitGrid:     { height: 176, padding: 10, gap: 8 },
  portraitGridRow:  { flexDirection: 'row', gap: 8, height: 82 },
  portraitGridRowTall: { flexDirection: 'row', gap: 8, flex: 1 },
  portraitGridCard: { flex: 1, padding: 10, gap: 4 },
  portraitPatPosture: { justifyContent: 'space-between' },

  // ── Rail card (shared) ────────────────────────────────────────────────────
  railCard: {
    backgroundColor: CARD_BG, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: CARD_BDR, gap: 8,
  },
  railCardAcquire: { justifyContent: 'space-between' },
  railCardLabel: {
    fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400',
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2,
  },
  railSiteName:    { fontSize: 18, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.white, letterSpacing: -0.18 },
  railSiteInstr:   { fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 18 },
  railSiteInstrSm: { fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 14 },
  railNote:        { fontSize: 11, color: 'rgba(255,255,255,0.3)' },

  // ── Patient posture — landscape (full-size toggles) ───────────────────────
  postureRow: { flexDirection: 'row', gap: 6 },
  postureBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  postureBtnActive:     { backgroundColor: Colors.white, borderColor: Colors.white },
  postureBtnText:       { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'IBMPlexSans-Regular', fontWeight: '400' },
  postureBtnTextActive: { color: Colors.navy, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400' },

  // ── Patient posture — portrait (compact toggles) ──────────────────────────
  postureRowCompact: { flexDirection: 'row', gap: 4, flex: 1 },
  postureBtnCompact: {
    flex: 1, height: 30, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  postureBtnTextSm: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'IBMPlexSans-Regular', fontWeight: '400' },

  // ── Signal quality ────────────────────────────────────────────────────────
  qualityHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qualityScore:    { fontSize: 13 },
  qualityScoreNum: { fontSize: 18, fontFamily: 'IBMPlexMono-Bold', fontWeight: '700' },
  qualityBarBg:  { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  qualityBarFill:{ height: 8, borderRadius: 4 },
  qualityLabel:  { fontSize: 12, lineHeight: 17 },
  qualityLabelSm:{ fontSize: 10, lineHeight: 13 },

  // ── Record — landscape (full-size) ───────────────────────────────────────
  acquireCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  recordingState: { flex: 1, justifyContent: 'center', gap: 12 },
  recProgress: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  recProgressFill: { height: 6, backgroundColor: Colors.red, borderRadius: 3 },
  recordBtnCircle: {
    width: 70, height: 70, borderRadius: 46, backgroundColor: Colors.white,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.white, shadowOpacity: 0.18, shadowRadius: 20,
  },
  recordBtnCircleDim: { backgroundColor: 'rgba(255,255,255,0.10)' },
  recordBtnRecording: {
    height: 56, borderRadius: 10, backgroundColor: Colors.red,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10,
  },
  recordBtnLabel: { fontSize: 14, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.white },
  analyzeState:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  analyzeText:    { fontSize: 14, color: 'rgba(255,255,255,0.55)' },
  tapToRecord: {
    fontSize: 16, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
    color: Colors.white, textAlign: 'center',
  },
  tapSub: { fontSize: 12, color: 'rgba(255,255,255,0.38)', textAlign: 'center', lineHeight: 18, maxWidth: 200 },

  // ── Record — portrait (compact pill style) ────────────────────────────────
  recordBtnCompact: {
    flex: 1, height: 32, borderRadius: 8, backgroundColor: Colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  recordBtnCompactDim: { backgroundColor: 'rgba(255,255,255,0.10)' },
  recordBtnCompactLabel: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.navy },
  recordingStateCompact: { flex: 1, gap: 6, justifyContent: 'center' },
  analyzeStateCompact: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── DEV-only SQI debug overlay ────────────────────────────────────────────
  sqiOverlay: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: 6,
  },
  sqiOverlayText: {
    color: '#00ff88', fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', fontSize: 10, lineHeight: 16,
  },
});
