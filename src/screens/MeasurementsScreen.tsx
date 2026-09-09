import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Circle } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';
import { StaticTrace } from '../components/WaveformView';
import {
  HeartIcon, ActivityIcon, AlertTriangleIcon, DownloadIcon,
  PlayIcon, PauseIcon, StopIcon, SpeakerIcon,
} from '../components/Icons';
import { Colors } from '../theme/colors';
import { AUSCULTATION_SITES, ECG_LEADS } from '../constants/sites';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { getCaptureForSite, SiteCapture } from '../services/captureService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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
// Until that pipeline is wired in, the interval card shows a "pending" empty state.

interface Interval {
  label: string;
  ms: number;
  unit: string;
  rangeMin: number;
  rangeMax: number;
  trackMax: number;
  inRange: boolean | null;
}

// Empty until real DSP results arrive — the card handles the empty-state display.
const NO_INTERVALS: Interval[] = [];

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
  const intervals = NO_INTERVALS;

  // ── Per-tab data — reloaded whenever the active tab or patient changes ────
  const activeTab = measureTab ?? tabs[0]?.id ?? '';

  const [siteData, setSiteData] = useState<SiteCapture>({
    playbackPath: null, verdict: null, confidence: null,
    modelVersion: null, posture: null, capturedAt: null,
  });

  useEffect(() => {
    if (!p?.id) return;
    const modality: 'pcg' | 'ecg' = isPcg ? 'pcg' : 'ecg';
    getCaptureForSite(p.id, activeTab, modality)
      .then(data => setSiteData(data))
      .catch(() => {/* no capture yet — keep empty state */});
  }, [activeTab, p?.id, isPcg]);

  const audio = useAudioPlayer(siteData.playbackPath);

  const tracePoints = useMemo(() => buildStaticPoints(500, isPcg ? 'pcg' : 'ecg'), [isPcg]);

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
        <Text style={styles.traceCardScale}>{S.measurements.scale}</Text>
      </View>
      <View style={styles.traceSvgBox}>
        <StaticTrace samples={tracePoints} color={Colors.white} height={120} />
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

  const analysisCard = (
    <View style={styles.analysisCard}>
      <View style={styles.analysisTop}>
        <Text style={styles.analysisKicker}>
          {isPcg ? S.measurements.murmurAnalysis : S.measurements.rhythmAnalysis}
        </Text>
        <Text style={styles.analysisTabLabel}>{active?.label ?? '—'}</Text>
      </View>
      <Text style={[styles.analysisResult, { color: analysisColor }]}>
        {analysisVerdict}
      </Text>
      <Text style={styles.analysisConf}>
        {isPcg
          ? (siteData.confidence != null ? `Confidence ${confidencePct}` : 'Confidence — pending')
          : 'ECG analysis pipeline pending'}
      </Text>
    </View>
  );

  const summaryCard = (
    <View style={styles.summaryCard}>
      <Text style={styles.cardLabel}>{S.measurements.sessionSummary}</Text>
      {(isPcg
        ? [
            { label: 'Valve site',  value: active?.label    ?? '—' },
            { label: 'Posture',     value: siteData.posture  ?? '—' },
            { label: 'Heart rate',  value: '—'                      },
            { label: 'Confidence',  value: confidencePct             },
            { label: 'Recorded',    value: capturedAtStr             },
          ]
        : [
            { label: 'Lead',           value: active?.label   ?? '—' },
            { label: 'Posture',        value: siteData.posture ?? '—' },
            { label: 'Heart rate',     value: '—'                     },
            { label: 'RR interval',    value: '—'                     },
            { label: 'Recorded',       value: capturedAtStr            },
          ]
      ).map(row => (
        <View key={row.label} style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{row.label}</Text>
          <Text style={styles.summaryValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );

  const playbackCard = (
    <View style={styles.playbackCard}>
      {/* Header */}
      <View style={styles.playbackHeader}>
        <View style={styles.playbackIconBox}>
          <SpeakerIcon size={14} color={Colors.teal} />
        </View>
        <Text style={styles.cardLabel}>{S.measurements.playback}</Text>
        {!siteData.playbackPath && (
          <View style={styles.playbackPill}>
            <Text style={styles.playbackPillText}>Awaiting transfer…</Text>
          </View>
        )}
      </View>

      {!siteData.playbackPath ? (
        <Text style={styles.playbackNote}>
          The recording will appear here once the BLE transfer completes.
        </Text>
      ) : audio.state === 'error' ? (
        <Text style={styles.playbackError}>Could not load recording.</Text>
      ) : (
        <>
          {/* Progress bar */}
          <View style={styles.playbackProgress}>
            <View style={[
              styles.playbackProgressFill,
              {
                width: audio.duration > 0
                  ? `${(audio.position / audio.duration) * 100}%` as any
                  : '0%',
              },
            ]} />
          </View>

          {/* Time row */}
          <View style={styles.playbackTimes}>
            <Text style={styles.playbackTime}>{formatTime(audio.position)}</Text>
            <Text style={styles.playbackTime}>
              {audio.duration > 0 ? formatTime(audio.duration) : '--:--'}
            </Text>
          </View>

          {/* Controls */}
          <View style={styles.playbackControls}>
            <TouchableOpacity
              style={styles.pbStopBtn}
              onPress={audio.stop}
              disabled={audio.state === 'ready' || audio.state === 'loading'}
            >
              <StopIcon size={13} color={Colors.textMid} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.pbPlayBtn,
                audio.state === 'loading' && styles.pbPlayBtnDim,
              ]}
              onPress={audio.state === 'playing' ? audio.pause : audio.play}
              disabled={audio.state === 'loading'}
            >
              {audio.state === 'playing'
                ? <PauseIcon size={18} color={Colors.white} />
                : <PlayIcon  size={18} color={Colors.white} />
              }
            </TouchableOpacity>

            <Text style={styles.pbSpeedNote}>Normal speed</Text>
          </View>
        </>
      )}
    </View>
  );

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
            {isPcg ? <HeartIcon size={22} color={Colors.white} /> : <ActivityIcon size={22} color={Colors.white} />}
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
              <View style={[styles.tabDot, { backgroundColor: isActive ? Colors.white : Colors.green }]} />
              <View>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
                <Text style={[styles.tabSub,   isActive && styles.tabSubActive]}>Captured</Text>
              </View>
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
          {isPcg && playbackCard}
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
        
            {isPcg && playbackCard}

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
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  subHeaderPortrait: { flexDirection: 'column', alignItems: 'flex-start', gap: 10 },
  subLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  subRight: { alignItems: 'flex-end' },
  modalityIconBox: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center',
  },
  subKicker:       { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textMid, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  subPatient:      { fontSize: 18, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.textDark, letterSpacing: -0.18 },
  subId:           { fontSize: 13, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textMid },
  subSessionLabel: { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textMid, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  subSessionDate:  { fontSize: 14, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark },

  // Tab bar
  tabBar:        { flexGrow: 0, backgroundColor: Colors.bgWarm },
  tabBarContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  tabActive:      { backgroundColor: Colors.navy, borderColor: Colors.navy },
  tabDot:         { width: 8, height: 8, borderRadius: 4 },
  tabLabel:       { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.textDark },
  tabLabelActive: { color: Colors.white },
  tabSub:         { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  tabSubActive:   { color: 'rgba(255,255,255,0.6)' },

  // Body — landscape
  body:     { flex: 1, flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  leftCol:  { flex: 1, gap: 12 },
  rightCol: { width: 1 },
  rightColContent: { gap: 12, paddingBottom: 8 },

  tabBarBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.bgWarm,
 borderBottomColor: Colors.border,
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
    flex: 1, backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 16,
  },
  intervalCardPortrait: { flex: undefined },
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
    backgroundColor: '#FFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#ffff', padding: 16, gap: 5,
  },
  analysisTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  analysisKicker:   { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.red, letterSpacing: 2, textTransform: 'uppercase' },
  analysisTabLabel: { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textLight },
  analysisResult: { fontSize: 20, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.red, letterSpacing: -0.3 },
  analysisConf:   { fontSize: 12, color: Colors.textMid },

  // Summary card
  summaryCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 16,
  },
  cardLabel: {
    fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textLight,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderFaint,
  },
  summaryLabel: { fontSize: 13, color: Colors.textMid },
  summaryValue: { fontSize: 13, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark },

  // Playback card
  playbackCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10,
  },
  playbackHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playbackIconBox: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: '#EBF9F9', alignItems: 'center', justifyContent: 'center',
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
  playbackControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pbStopBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.bgWarm, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pbPlayBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.teal,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.teal, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
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
});
