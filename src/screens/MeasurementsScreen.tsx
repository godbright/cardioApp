import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Circle } from 'react-native-svg';
import Video, { VideoRef } from 'react-native-video';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';
import { StaticTrace } from '../components/WaveformView';
import {
  HeartIcon, ActivityIcon, DownloadIcon,
  PlayIcon, PauseIcon, StopIcon, SpeakerIcon,
} from '../components/Icons';
import { Colors } from '../theme/colors';
import { AUSCULTATION_SITES, ECG_LEADS } from '../constants/sites';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { getCaptureForSite, SiteCapture } from '../services/captureService';
import { subscribeToPath } from '../services/recordingStore';
import { parseWavHeader } from '../utils/wavUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────

function SkeletonLine({ widthPct = 55, height = 13 }: { widthPct?: number; height?: number }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7,  duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={{
        height,
        width: `${widthPct}%`,
        borderRadius: height / 2,
        backgroundColor: Colors.border,
        opacity: pulse,
      }}
    />
  );
}

// ─── Static trace ─────────────────────────────────────────────────────────────

function gauss(x: number, mu: number, s: number) {
  return Math.exp(-((x - mu) ** 2) / (2 * s * s));
}

function buildStaticPoints(n: number, type: 'pcg' | 'ecg'): number[] {
  let p = 0;
  const step = 1 / (n * 0.9);
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    p += step;
    if (p > 1) p -= 1;
    let v = 0;
    if (type === 'pcg') {
      v = 0.95 * gauss(p, 0.12, 0.028) + 0.72 * gauss(p, 0.42, 0.024)
        + 0.38 * (Math.random() * 0.1 - 0.05) * gauss(p, 0.27, 0.12);
    } else {
      v = 0.13 * gauss(p, 0.02, 0.02) - 0.09 * gauss(p, 0.10, 0.009)
        + 1.0  * gauss(p, 0.125, 0.006) - 0.20 * gauss(p, 0.15, 0.009)
        + 0.24 * gauss(p, 0.33, 0.032);
    }
    samples.push(v);
  }
  return samples;
}

// ─── Interval data ────────────────────────────────────────────────────────────
// Intervals are produced by the signal-processing pipeline after a real capture.
// These placeholder values show the visual layout until the DSP pipeline is wired in.

interface Interval {
  label: string;
  ms: number;
  unit: string;
  rangeMin: number;
  rangeMax: number;
  trackMax: number;
  inRange: boolean | null;
}

const PCG_INTERVALS: Interval[] = [
  { label: 'S1 → S2',    ms: 312, unit: 'ms', rangeMin: 280, rangeMax: 360, trackMax: 500,  inRange: true  },
  { label: 'S2 → S1',    ms: 541, unit: 'ms', rangeMin: 400, rangeMax: 700, trackMax: 900,  inRange: true  },
  { label: 'RR cycle',   ms: 853, unit: 'ms', rangeMin: 600, rangeMax: 1000,trackMax: 1200, inRange: true  },
  { label: 'Heart rate', ms: 70,  unit: 'bpm', rangeMin: 60,  rangeMax: 100, trackMax: 150,  inRange: true  },
];

const ECG_INTERVALS: Interval[] = [
  { label: 'RR',  ms: 853, unit: 'ms', rangeMin: 600, rangeMax: 1000, trackMax: 1200, inRange: true  },
  { label: 'PR',  ms: 164, unit: 'ms', rangeMin: 120, rangeMax: 200,  trackMax: 300,  inRange: true  },
  { label: 'QRS', ms: 112, unit: 'ms', rangeMin: 60,  rangeMax: 100,  trackMax: 160,  inRange: false },
  { label: 'QTc', ms: 448, unit: 'ms', rangeMin: 350, rangeMax: 440,  trackMax: 550,  inRange: false },
];

// ─── Range bar ────────────────────────────────────────────────────────────────

function RangeBar({ interval }: { interval: Interval }) {
  const W = 400, H = 8, R = 4;
  const { ms, rangeMin, rangeMax, trackMax, inRange } = interval;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const rangeStartPct = clamp(rangeMin / trackMax);
  const rangeEndPct   = clamp(rangeMax / trackMax);
  const dotPct        = clamp(ms / trackMax);
  const dotColor =
    inRange === true  ? Colors.green :
    inRange === false ? Colors.red   :
    Colors.textDark;

  return (
    <View style={{ flex: 1, paddingRight: 12 }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Rect x={0} y={2} width={W} height={H - 4} rx={R} fill={Colors.border} />
        <Rect
          x={rangeStartPct * W} y={1}
          width={(rangeEndPct - rangeStartPct) * W} height={H - 2}
          rx={R} fill={Colors.green} opacity={0.3}
        />
        <Circle cx={dotPct * W} cy={H / 2} r={5} fill={dotColor} />
      </Svg>
    </View>
  );
}

// ─── Playback card ────────────────────────────────────────────────────────────
// Uses react-native-video (already installed) instead of react-native-sound.
// As a React component, its lifecycle is managed by React — no manual stop/release
// needed, no MediaPlayer state-machine races, no Double.doubleValue() NPE.

function PlaybackCard({ filePath, S }: { filePath: string; S: any }) {
  const videoRef  = useRef<VideoRef>(null);
  const [paused,   setPaused]   = useState(true);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [ready,    setReady]    = useState(false);
  const [hasError, setHasError] = useState(false);

  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

  const play  = useCallback(() => setPaused(false), []);
  const pause = useCallback(() => setPaused(true),  []);
  const stop  = useCallback(() => {
    videoRef.current?.seek(0);
    setPaused(true);
    setPosition(0);
  }, []);

  if (hasError) {
    return (
      <View style={styles.playbackCard}>
        <Text style={styles.playbackError}>Could not load recording.</Text>
      </View>
    );
  }

  return (
    <View style={styles.playbackCard}>
      {/* Invisible Video node — audio only */}
      <Video
        ref={videoRef}
        source={{ uri }}
        audioOnly
        paused={paused}
        playInBackground={false}
        onLoad={({ duration: d }) => { setDuration(d); setReady(true); }}
        onProgress={({ currentTime }) => setPosition(currentTime)}
        onEnd={() => { videoRef.current?.seek(0); setPaused(true); setPosition(0); }}
        onError={() => setHasError(true)}
        style={{ height: 0, width: 0, position: 'absolute' }}
      />

      {/* Header row — title + controls inline */}
      <View style={styles.playbackHeader}>
        <View style={styles.playbackIconBox}>
          <SpeakerIcon size={14} color={Colors.navy} />
        </View>
        <Text style={[styles.cardLabel, { flex: 1, marginBottom: 0 }]}>{S.measurements.playback}</Text>

        {!ready ? (
          <View style={styles.playbackPill}>
            <Text style={styles.playbackPillText}>Loading…</Text>
          </View>
        ) : (
          <View style={styles.playbackControls}>
            <TouchableOpacity
              style={styles.pbStopBtn}
              onPress={stop}
              disabled={paused && position === 0}
            >
              <StopIcon size={12} color={Colors.textMid} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pbPlayBtn}
              onPress={paused ? play : pause}
            >
              {!paused
                ? <PauseIcon size={14} color={Colors.white} />
                : <PlayIcon  size={14} color={Colors.white} />
              }
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.playbackProgress}>
        <View style={[
          styles.playbackProgressFill,
          { width: duration > 0 ? `${(position / duration) * 100}%` as any : '0%' },
        ]} />
      </View>

      {/* Time row */}
      <View style={styles.playbackTimes}>
        <Text style={styles.playbackTime}>{formatTime(position)}</Text>
        <Text style={styles.playbackTime}>{duration > 0 ? formatTime(duration) : '--:--'}</Text>
      </View>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MeasurementsScreen() {
  const { state, dispatch } = useApp();
  const { measureModality: mod, measureTab, currentPatient: p } = state;
  const insets = useSafeAreaInsets();
  const { isPortrait } = useOrientation();
  const S = useStrings();

  const isPcg     = mod !== 'ecg';
  const tabs      = isPcg ? AUSCULTATION_SITES : ECG_LEADS;
  const active    = tabs.find(t => t.id === measureTab) ?? tabs[0];
  const intervals = isPcg ? PCG_INTERVALS : ECG_INTERVALS;

  // ── Per-tab data — reloaded whenever the active tab or patient changes ────
  const activeTab = measureTab ?? tabs[0]?.id ?? '';

  const [siteData, setSiteData] = useState<SiteCapture>({
    playbackPath: null, verdict: null, confidence: null,
    modelVersion: null, posture: null, capturedAt: null,
  });
  const [isLoadingMeta,  setIsLoadingMeta]  = useState(true);
  const [isLoadingTrace, setIsLoadingTrace] = useState(false);
  const [hasRealTrace,   setHasRealTrace]   = useState(false);

  // Fade-in animation fired once meta data arrives.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 280, useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    // Reset to loading state whenever the tab or patient changes.
    setIsLoadingMeta(true);
    setHasRealTrace(false);
    fadeAnim.setValue(0);
    setSiteData({ playbackPath: null, verdict: null, confidence: null, modelVersion: null, posture: null, capturedAt: null });
    if (!p?.id) { setIsLoadingMeta(false); fadeIn(); return; }
    const modality: 'pcg' | 'ecg' = isPcg ? 'pcg' : 'ecg';

    const load = () =>
      getCaptureForSite(p.id, activeTab, modality)
        .then(data => {
          setSiteData(data);
          setIsLoadingMeta(false);
          fadeIn();
        })
        .catch(() => { setIsLoadingMeta(false); fadeIn(); });

    load();

    // Re-fetch once the WAV file arrives from the BLE transfer.
    if (!isPcg) return;
    return subscribeToPath(() => load());
  }, [activeTab, p?.id, isPcg]);

  const [tracePoints, setTracePoints] = useState<number[]>(() =>
    buildStaticPoints(500, isPcg ? 'pcg' : 'ecg'),
  );

  useEffect(() => {
    const path = siteData.playbackPath;
    if (!path) {
      setTracePoints(buildStaticPoints(500, isPcg ? 'pcg' : 'ecg'));
      setIsLoadingTrace(false);
      return;
    }
    setIsLoadingTrace(true);
    let cancelled = false;
    RNFS.readFile(path, 'base64')
      .then(b64 => {
        if (cancelled) return;
        const buf  = Buffer.from(b64, 'base64');
        const info = parseWavHeader(buf);
        if (!info || info.bitsPerSample !== 16) {
          setTracePoints(buildStaticPoints(500, isPcg ? 'pcg' : 'ecg'));
          setIsLoadingTrace(false);
          return;
        }
        const { dataOffset, dataLength } = info;
        const numFrames    = Math.floor(dataLength / 2);
        const POINTS       = 500;
        const stride       = Math.max(1, Math.floor(numFrames / POINTS));
        const raw: number[] = [];
        for (let i = 0; i < POINTS; i++) {
          const start = i * stride;
          const end   = Math.min(start + stride, numFrames);
          let peak = 0;
          for (let j = start; j < end; j++) {
            const byteOff = dataOffset + j * 2;
            if (byteOff + 2 > buf.length) break;
            const v = buf.readInt16LE(byteOff);
            if (Math.abs(v) > Math.abs(peak)) peak = v;
          }
          raw.push(peak);
        }
        const maxAbs = raw.reduce((m, v) => Math.max(m, Math.abs(v)), 1);
        setTracePoints(raw.map(v => v / maxAbs));
        setHasRealTrace(true);
        setIsLoadingTrace(false);
      })
      .catch(() => {
        if (!cancelled) {
          setTracePoints(buildStaticPoints(500, isPcg ? 'pcg' : 'ecg'));
          setIsLoadingTrace(false);
        }
      });
    return () => { cancelled = true; };
  }, [siteData.playbackPath, isPcg]);

  const modalityTitle = isPcg ? S.measurements.heartSound : S.measurements.heartRhythm;
  const kicker        = isPcg ? 'HEART SOUND · AUSCULTATION' : 'HEART RHYTHM · 3-LEAD ECG';

  function selectTab(id: string) {
    dispatch({ type: 'PATCH', patch: { measureTab: id } });
  }

  // ── Reusable card JSX ──────────────────────────────────────────────────────

  const traceCard = (
    <View style={styles.traceCard}>
      <View style={styles.traceCardHeader}>
        <Text style={styles.traceCardLabel}>
          {active?.label?.toUpperCase() ?? '—'} · {S.measurements.capturedTrace}
        </Text>
        {!isLoadingMeta && !isLoadingTrace && hasRealTrace
          ? <Text style={styles.traceCardScale}>{S.measurements.scale}</Text>
          : isLoadingMeta
            ? <SkeletonLine widthPct={18} height={10} />
            : null}
      </View>
      <View style={styles.traceSvgBox}>
        {isLoadingMeta || isLoadingTrace ? (
          /* Loading — show a shimmer baseline, no fake waveform */
          <View style={styles.traceShimmerBox}>
            <SkeletonLine widthPct={100} height={2} />
            <Text style={styles.traceLoadingText}>
              {isLoadingTrace ? 'Reading recording…' : 'Loading…'}
            </Text>
          </View>
        ) : (
          /* Real trace (or demo placeholder if no recording exists) */
          <StaticTrace samples={tracePoints} color={Colors.white} height={120} />
        )}
      </View>
    </View>
  );

  const intervalCard = (inPortrait: boolean) => (
    <View style={[styles.intervalCard, inPortrait && styles.intervalCardPortrait]}>
      <View style={styles.intervalHeader}>
        <Text style={styles.intervalTitle}>{S.measurements.intervalTitle}</Text>
        <View style={styles.normalRangeLegend}>
          <View style={styles.legendSwatch} />
          <Text style={styles.legendText}>{S.measurements.normalRange}</Text>
        </View>
      </View>
      {intervals.length === 0
        ? <Text style={styles.intervalPending}>Interval analysis pending — available after signal processing</Text>
        : intervals.map(iv => (
          <View key={iv.label} style={styles.intervalRow}>
            <Text style={styles.intervalLabel}>{iv.label}</Text>
            <RangeBar interval={iv} />
            <View style={styles.intervalValueBox}>
              <Text style={styles.intervalMs}>
                <Text style={[
                  styles.intervalValue,
                  iv.inRange === false && { color: Colors.red },
                  iv.inRange === true  && { color: Colors.green },
                ]}>{iv.ms}</Text>
                {' '}<Text style={styles.intervalUnit}>{iv.unit}</Text>
              </Text>
              {iv.inRange === true  && <Text style={styles.inRangeLabel}>{S.measurements.inRange}</Text>}
              {iv.inRange === false && <Text style={styles.outRangeLabel}>{S.measurements.outOfRange}</Text>}
            </View>
          </View>
        ))
      }
    </View>
  );

  // ── Per-site derived display values ─────────────────────────────────────────

  const analysisVerdict =
    siteData.verdict === 'normal'      ? 'Normal' :
    siteData.verdict === 'abnormal'    ? 'Abnormal — AS suspected' :
    siteData.verdict === 'inconclusive'? 'Inconclusive' :
    '—';

  const analysisColor =
    siteData.verdict === 'normal'      ? Colors.green :
    siteData.verdict === 'inconclusive'? Colors.amber :
    siteData.verdict === 'abnormal'    ? Colors.red   :
    Colors.textLight;

  const confidencePct = siteData.confidence != null
    ? `${Math.round(siteData.confidence * 100)}%`
    : '—';

  const capturedAtStr = siteData.capturedAt
    ? siteData.capturedAt.toLocaleDateString()
    : '—';

  const analysisBg = analysisColor + '18';

  const analysisCard = (
    <Animated.View style={[styles.analysisCard, { opacity: fadeAnim }]}>
      {/* Section header */}
      <View style={styles.analysisTop}>
        <Text style={styles.analysisKicker}>
          {isPcg ? S.measurements.murmurAnalysis : S.measurements.rhythmAnalysis}
        </Text>
        <Text style={styles.analysisTabLabel}>{active?.label ?? '—'}</Text>
      </View>

      {/* Status pill — skeleton while loading */}
      {isLoadingMeta ? (
        <View style={styles.skeletonPillRow}>
          <SkeletonLine widthPct={14} height={14} />
          <SkeletonLine widthPct={42} height={14} />
        </View>
      ) : (
        <View style={[styles.analysisPill, { backgroundColor: analysisBg }]}>
          <View style={[styles.analysisPillDot, { backgroundColor: analysisColor }]} />
          <Text style={[styles.analysisPillText, { color: analysisColor }]}>
            {analysisVerdict}
          </Text>
        </View>
      )}

      {/* Detail rows */}
      <View style={styles.analysisDivider} />
      <View style={styles.analysisDetailRow}>
        <Text style={styles.analysisDetailLabel}>Confidence</Text>
        {isLoadingMeta
          ? <SkeletonLine widthPct={28} height={12} />
          : <Text style={styles.analysisDetailValue}>
              {isPcg
                ? (siteData.confidence != null ? confidencePct : 'Pending')
                : 'Pipeline pending'}
            </Text>}
      </View>
      {(isLoadingMeta || siteData.modelVersion) && (
        <>
          <View style={styles.analysisDividerFaint} />
          <View style={styles.analysisDetailRow}>
            <Text style={styles.analysisDetailLabel}>Model</Text>
            {isLoadingMeta
              ? <SkeletonLine widthPct={32} height={12} />
              : <Text style={styles.analysisDetailValue}>{siteData.modelVersion}</Text>}
          </View>
        </>
      )}
      {(isLoadingMeta || siteData.capturedAt) && (
        <>
          <View style={styles.analysisDividerFaint} />
          <View style={styles.analysisDetailRow}>
            <Text style={styles.analysisDetailLabel}>Recorded</Text>
            {isLoadingMeta
              ? <SkeletonLine widthPct={40} height={12} />
              : <Text style={styles.analysisDetailValue}>{capturedAtStr}</Text>}
          </View>
        </>
      )}
    </Animated.View>
  );

  const summaryRows = isPcg
    ? [
        { label: 'Valve site',  value: active?.label    ?? '—' },
        { label: 'Posture',     value: siteData.posture  ?? '—' },
        { label: 'Heart rate',  value: '—'                      },
        { label: 'Confidence',  value: confidencePct             },
        { label: 'Recorded',    value: capturedAtStr             },
      ]
    : [
        { label: 'Lead',        value: active?.label    ?? '—' },
        { label: 'Posture',     value: siteData.posture  ?? '—' },
        { label: 'Heart rate',  value: '—'                     },
        { label: 'RR interval', value: '—'                     },
        { label: 'Recorded',    value: capturedAtStr            },
      ];

  const summaryCard = (
    <Animated.View style={[styles.summaryCard, { opacity: fadeAnim }]}>
      <Text style={styles.cardLabel}>{S.measurements.sessionSummary}</Text>
      {summaryRows.map((row, i, arr) => (
        <React.Fragment key={row.label}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{row.label}</Text>
            {isLoadingMeta && i > 0
              ? <SkeletonLine widthPct={38} height={12} />
              : <Text style={styles.summaryValue}>{row.value}</Text>}
          </View>
          {i < arr.length - 1 && <View style={styles.summaryDivider} />}
        </React.Fragment>
      ))}
    </Animated.View>
  );

  // The playback card is a separate component so React manages the Video
  // player lifecycle — no manual stop/release needed.
  const playbackSection = isPcg ? (
    siteData.playbackPath
      ? <PlaybackCard key={siteData.playbackPath} filePath={siteData.playbackPath} S={S} />
      : (
        <View style={styles.playbackCard}>
          <View style={styles.playbackHeader}>
            <View style={styles.playbackIconBox}>
              <SpeakerIcon size={14} color={Colors.navy} />
            </View>
            <Text style={styles.cardLabel}>{S.measurements.playback}</Text>
            <View style={styles.playbackPill}>
              <Text style={styles.playbackPillText}>Awaiting transfer…</Text>
            </View>
          </View>
          <Text style={styles.playbackNote}>
            The recording will appear here once the BLE transfer completes.
          </Text>
        </View>
      )
  ) : null;

  const downloadBtn = (
    <TouchableOpacity style={styles.downloadBtn}>
      <DownloadIcon size={14} color={Colors.navy} />
      <Text style={styles.downloadText}>{S.measurements.downloadRaw}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <Header title={modalityTitle} canBack />

      {/* ── Sub-header ────────────────────────────────── */}
      <View style={[styles.subHeader, isPortrait && styles.subHeaderPortrait]}>
        <View style={styles.subLeft}>
          <View style={styles.modalityIconBox}>
            {isPcg ? <HeartIcon size={18} color={Colors.white} /> : <ActivityIcon size={18} color={Colors.white} />}
          </View>
          <View>
            <Text style={styles.subKicker}>{kicker}</Text>
            <Text style={styles.subPatient}>
              {p?.name ?? '—'}<Text style={styles.subId}> · {p?.id ?? '—'}</Text>
            </Text>
          </View>
        </View>
        <View style={[styles.subRight, isPortrait && { alignItems: 'flex-start' }]}>
          <Text style={styles.subSessionLabel}>{S.measurements.session}</Text>
          <Text style={styles.subSessionDate}>{p?.lastExam ?? '—'}</Text>
        </View>
      </View>

      {/* ── Tab bar ───────────────────────────────────── */}
      <View style={styles.tabBarBox}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
        >
          {tabs.map(tab => {
            const isActive = tab.id === (measureTab ?? tabs[0].id);
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => selectTab(tab.id)}
              >
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {downloadBtn}
      </View>

      {/* ── Body ──────────────────────────────────────── */}
      {isPortrait ? (
        /*
         * Portrait: single ScrollView containing all cards stacked vertically.
         * The intervalCard is NOT flex:1 here — it takes its natural content
         * height so all rows are visible. The right-column cards (analysis,
         * summary, playback) render below the left-column cards.
         */
        <ScrollView
          style={styles.bodyScrollPortrait}
          contentContainerStyle={styles.bodyPortraitContent}
          showsVerticalScrollIndicator={false}
        >
          {traceCard}
          {intervalCard(true)}
          {analysisCard}
          {summaryCard}
          {downloadBtn}
          {playbackSection}
        </ScrollView>
      ) : (
        /* Landscape: two-column side-by-side layout */
        <View style={styles.body}>
          {/* Left column — trace + interval analysis (interval fills remaining height) */}
          <View style={styles.leftCol}>
            {traceCard}
            {intervalCard(false)}
          </View>

          {/* Right column — scrollable cards */}
          <ScrollView
            style={styles.rightCol}
            contentContainerStyle={styles.rightColContent}
            showsVerticalScrollIndicator={false}
          >
                  
            {analysisCard}
            {summaryCard}
        
            {playbackSection}

          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgWarm },

  // Sub-header
  subHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  subHeaderPortrait: { flexDirection: 'column', alignItems: 'flex-start', gap: 10 },
  subLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  subRight: { alignItems: 'flex-end' },
  modalityIconBox: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center',
  },
  subKicker:       { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textMid, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  subPatient:      { fontSize: 18, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.textDark, letterSpacing: -0.18 },
  subId:           { fontSize: 13, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textMid },
  subSessionLabel: { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textMid, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  subSessionDate:  { fontSize: 14, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark },

  // Tab bar
  tabBar:        { flexGrow: 0, backgroundColor: Colors.bgWarm },
  tabBarContent: { paddingHorizontal: 12, paddingVertical: 12, gap: 6, flexDirection: 'row', alignItems: 'center' },
  tab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  tabActive:      { backgroundColor: Colors.navy, borderColor: Colors.navy },
  tabLabel:       { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.textMid },
  tabLabelActive: { color: Colors.white },

  // Body — landscape
  body:     { flex: 1, flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 10, paddingTop: 10, gap: 10 },
  leftCol:  { flex: 1, gap: 10 },
  rightCol: { flex: 1 },
  rightColContent: { gap: 10, paddingBottom: 4 },

  tabBarBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: 12, backgroundColor: Colors.bgWarm,paddingVertical:12,
  },

  // Body — portrait (single scrollable column)
  bodyScrollPortrait: { flex: 1 },
  bodyPortraitContent: { padding: 14, gap: 12, paddingBottom: 40 },

  // Trace card
  traceCard: { backgroundColor: Colors.bgWaveform, borderRadius: 12, overflow: 'hidden' },
  traceCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  traceCardLabel: { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase' },
  traceCardScale: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  traceSvgBox:    { paddingHorizontal: 12, paddingBottom: 12 },

  // Interval analysis card
  // In landscape: flex:1 fills remaining height of leftCol.
  // In portrait: no flex — natural content height so all rows are visible.
  intervalCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 16,
  },
  intervalCardPortrait: {},
  intervalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  intervalTitle: { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textMid, letterSpacing: 2, textTransform: 'uppercase' },
  normalRangeLegend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 12, height: 6, borderRadius: 3, backgroundColor: Colors.green, opacity: 0.35 },
  legendText:   { fontSize: 11, color: Colors.textLight },
  intervalRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderFaint,
  },
  intervalPending:  { fontSize: 13, color: Colors.textLight, fontStyle: 'italic', paddingVertical: 12 },
  intervalLabel:    { width: 100, fontSize: 12, color: Colors.textMid },
  intervalValueBox: { width: 94, alignItems: 'flex-end' },
  intervalMs:       { fontSize: 13 },
  intervalValue:    { fontSize: 17, fontFamily: 'IBMPlexMono-Bold', fontWeight: '700', color: Colors.textDark },
  intervalUnit:     { fontSize: 11, color: Colors.textLight },
  inRangeLabel:     { fontSize: 10, color: Colors.green,  marginTop: 2 },
  outRangeLabel:    { fontSize: 10, color: Colors.red,    marginTop: 2 },

  // Analysis card
  analysisCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 8,
  },
  analysisTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  analysisKicker:   { fontSize: 10, fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600', color: Colors.textMute, letterSpacing: 1.2, textTransform: 'uppercase' },
  analysisTabLabel: { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textLight },

  // Status pill
  analysisPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    alignSelf: 'flex-start', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  analysisPillDot:  { width: 8, height: 8, borderRadius: 4 },
  analysisPillText: { fontSize: 15, fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600' },

  // Detail rows inside analysis card
  analysisDivider:      { height: 1, backgroundColor: Colors.border },
  analysisDividerFaint: { height: 1, backgroundColor: Colors.borderFaint },
  analysisDetailRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 1 },
  analysisDetailLabel:  { fontSize: 13, fontFamily: 'IBMPlexSans-Regular', color: Colors.textMid },
  analysisDetailValue:  { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.textDark },

  // Summary card
  summaryCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  cardLabel: {
    fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textLight,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6,
  },
  summaryDivider: { height: 1, backgroundColor: Colors.borderFaint },
  summaryLabel:   { fontSize: 13, fontFamily: 'IBMPlexSans-Regular', color: Colors.textMid, flex: 1 },
  summaryValue:   { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.textDark, textAlign: 'right', flex: 1 },

  // Playback card
  playbackCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 8,
  },
  playbackHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  playbackIconBox: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: Colors.navy + '12', alignItems: 'center', justifyContent: 'center',
  },
  playbackPill: {
    marginLeft: 'auto' as any, backgroundColor: Colors.bgWarm, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  playbackPillText: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 11, fontWeight: '400', color: Colors.textLight,
  },
  playbackNote: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400',
    color: Colors.textLight, fontStyle: 'italic', lineHeight: 20,
  },
  playbackError: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 12, fontWeight: '400', color: Colors.red,
  },
  playbackProgress: {
    height: 4, backgroundColor: Colors.borderLight, borderRadius: 2, overflow: 'hidden',
  },
  playbackProgressFill: {
    height: 4, backgroundColor: Colors.teal, borderRadius: 2,
  },
  playbackTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  playbackTime: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 11, fontWeight: '400', color: Colors.textLight,
  },
  playbackControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pbStopBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.bgWarm, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pbPlayBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.navy, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  pbPlayBtnDim: { backgroundColor: Colors.border, shadowOpacity: 0, elevation: 0 },
  pbSpeedNote: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 12, fontWeight: '400',
    color: Colors.textMid, flex: 1,
  },
  // Legacy rows — kept for layout reference, no longer rendered
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  playLabel: { flex: 1, fontSize: 13, color: Colors.textDark },
  playDur:   { fontSize: 12, color: Colors.textLight },

  // Download
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: 38, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  downloadText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.navy },

  // Loading / skeleton styles
  traceShimmerBox: {
    height: 120,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  traceLoadingText: {
    fontSize: 11,
    fontFamily: 'IBMPlexSans-Regular',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
  },
  skeletonPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
});
