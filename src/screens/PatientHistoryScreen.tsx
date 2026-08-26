import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';
import {
  HeartIcon, ActivityIcon, CheckIcon, AlertTriangleIcon,
  AlertCircleIcon, ChevronRight,
} from '../components/Icons';
import { Colors } from '../theme/colors';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';
import type { Patient } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type HistVerdict =
  | 'normal'
  | 'abnormal-confirmed'
  | 'abnormal-pending'
  | 'inconclusive'
  | 'ecg';

interface HistCapture {
  id:          string;
  modality:    'pcg' | 'ecg';
  site:        string;
  posture:     string;
  verdict:     HistVerdict;
  confidence?: number;
  model?:      string;
  stage2?:     'confirmed' | 'pending' | null;
}

interface HistSession {
  id:        string;
  date:      string;
  isCurrent: boolean;
  captures:  HistCapture[];
}

// ─── Derive history from the patient's stored state ───────────────────────────
// This reflects what was actually recorded on the device. When WatermelonDB
// captures/sessions tables are fully populated, this function is replaced by
// a real query — the screen structure stays the same.

function buildHistory(p: Patient): HistSession[] {
  const hasHs = p.hs !== 'none';
  const hasHr = p.hr !== 'none';
  if (!hasHs && !hasHr) return [];

  const captures: HistCapture[] = [];

  if (hasHs) {
    captures.push({
      id: 'c-hs',
      modality: 'pcg',
      site: p.hsSite ?? '—',
      posture: p.hsPosture ?? 'sitting',
      verdict: p.hs as HistVerdict,
      confidence: p.hsConfidence ? parseFloat(p.hsConfidence) : undefined,
      model: p.hsModel,
      stage2:
        p.hs === 'abnormal-confirmed' ? 'confirmed' :
        p.hs === 'abnormal-pending'   ? 'pending'   :
        null,
    });
  }

  if (hasHr) {
    captures.push({
      id: 'c-hr',
      modality: 'ecg',
      site: p.hrLead ?? '—',
      posture: p.hrPosture ?? 'sitting',
      verdict: 'ecg',
    });
  }

  return [{
    id: 's1',
    date: p.lastExam,
    isCurrent: true,
    captures,
  }];
}

// ─── Verdict helpers ──────────────────────────────────────────────────────────

function verdictConfig(v: HistVerdict): { label: string; bg: string; text: string; icon: React.ReactNode } {
  switch (v) {
    case 'normal':
      return { label: 'Normal', bg: Colors.green + '1A', text: Colors.green,
        icon: <CheckIcon size={11} color={Colors.green} strokeWidth={2.5} /> };
    case 'abnormal-confirmed':
      return { label: 'Abnormal — confirmed', bg: Colors.red + '1A', text: Colors.red,
        icon: <AlertTriangleIcon size={11} color={Colors.red} strokeWidth={2.5} /> };
    case 'abnormal-pending':
      return { label: 'Abnormal — pending', bg: Colors.amber + '22', text: Colors.amber,
        icon: <AlertCircleIcon size={11} color={Colors.amber} strokeWidth={2.5} /> };
    case 'inconclusive':
      return { label: 'Inconclusive', bg: Colors.amber + '22', text: Colors.amber,
        icon: <AlertCircleIcon size={11} color={Colors.amber} strokeWidth={2.5} /> };
    case 'ecg':
      return { label: 'Captured', bg: Colors.teal + '1A', text: Colors.teal,
        icon: <CheckIcon size={11} color={Colors.teal} strokeWidth={2.5} /> };
  }
}

function postureLabel(p: string): string {
  if (p === 'sitting')      return 'Sitting';
  if (p === 'supine')       return 'Supine';
  if (p === 'left-lateral') return 'Left lateral';
  return p;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PatientHistoryScreen() {
  const { state, openMeasure } = useApp();
  const { currentPatient: p } = state;
  const { isPortrait, width } = useOrientation();
  const S = useStrings();

  if (!p) return null;

  const sessions   = buildHistory(p);
  const totalCaps  = sessions.reduce((n, s) => n + s.captures.length, 0);
  const maxWidth   = isPortrait ? undefined : Math.min(width * 0.7, 760);

  function sexLabel(sex: string) {
    if (sex === 'F' || sex === 'Female') return 'Female';
    if (sex === 'M' || sex === 'Male')   return 'Male';
    if (sex === 'O' || sex === 'Other')  return 'Other';
    return '—';
  }

  return (
    <View style={styles.root}>
      <Header title={S.patientHistory.title} canBack />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          !isPortrait && { alignItems: 'center' },
        ]}
      >
        {/* ── Patient summary banner ── */}
        <View style={[styles.patientBanner, maxWidth ? { width: maxWidth } : undefined]}>
          <View style={styles.bannerAvatar}>
            <Text style={styles.bannerAvatarText}>
              {p.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 1)}
            </Text>
          </View>
          <View style={styles.bannerMeta}>
            <Text style={styles.bannerName}>{p.name}</Text>
            <Text style={styles.bannerSub}>
              {p.id}  ·  {p.age} yrs  ·  {sexLabel(p.sex || '')}
            </Text>
          </View>
          <View style={styles.bannerStats}>
            <StatPill value={sessions.length} label={S.patientHistory.sessionCount} />
            <StatPill value={totalCaps}       label={S.patientHistory.captureCount} />
          </View>
        </View>

        {/* ── Session timeline ── */}
        {sessions.map((session, si) => (
          <View
            key={session.id}
            style={[styles.sessionBlock, maxWidth ? { width: maxWidth } : undefined]}
          >
            {/* Session header */}
            <View style={styles.sessionHeader}>
              <View style={[styles.timelineDot, { backgroundColor: session.isCurrent ? Colors.navy : Colors.border }]} />
              <View style={styles.timelineLine} />
              <Text style={[
                styles.sessionHeaderLabel,
                { color: session.isCurrent ? Colors.navy : Colors.textLight },
              ]}>
                {session.isCurrent
                  ? S.patientHistory.currentSession
                  : S.patientHistory.previousSession}
              </Text>
              <Text style={styles.sessionDate}>{session.date}</Text>
            </View>

            {/* Capture rows */}
            <View style={styles.sessionCard}>
              {session.captures.map((cap, ci) => {
                const vc = verdictConfig(cap.verdict);
                return (
                  <View key={cap.id}>
                    {ci > 0 && <View style={styles.captureDivider} />}
                    <View style={styles.captureRow}>

                      {/* Left: icon + metadata */}
                      <View style={styles.captureIconBox}>
                        {cap.modality === 'pcg'
                          ? <HeartIcon size={16} color={Colors.navy} />
                          : <ActivityIcon size={16} color={Colors.teal} />}
                      </View>

                      <View style={styles.captureMeta}>
                        {/* Title row */}
                        <View style={styles.captureTitleRow}>
                          <Text style={styles.captureTitle}>
                            {cap.modality === 'pcg'
                              ? S.patientHistory.heartSound
                              : S.patientHistory.heartRhythm}
                          </Text>
                          <Text style={styles.captureSite}>
                            {cap.modality === 'pcg'
                              ? `${S.patientHistory.site}: ${cap.site}`
                              : `${S.patientHistory.lead}: ${cap.site}`}
                          </Text>
                        </View>

                        {/* Posture */}
                        <Text style={styles.capturePosture}>
                          {S.patientHistory.posture}: {postureLabel(cap.posture)}
                        </Text>

                        {/* Confidence + model for PCG */}
                        {cap.modality === 'pcg' && cap.confidence !== undefined && (
                          <Text style={styles.captureDetail}>
                            {S.patientHistory.confidence}: {Math.round(cap.confidence * 100)}%
                            {cap.model ? `  ·  ${S.patientHistory.model}: ${cap.model}` : ''}
                          </Text>
                        )}

                        {/* Stage 2 sub-label */}
                        {cap.stage2 === 'confirmed' && (
                          <Text style={[styles.stage2Label, { color: Colors.red }]}>
                            {S.patientHistory.stage2Confirmed}
                          </Text>
                        )}
                        {cap.stage2 === 'pending' && (
                          <Text style={[styles.stage2Label, { color: Colors.amber }]}>
                            {S.patientHistory.stage2Pending}
                          </Text>
                        )}
                      </View>

                      {/* Right: verdict badge + view button */}
                      <View style={styles.captureRight}>
                        <View style={[styles.verdictBadge, { backgroundColor: vc.bg }]}>
                          {vc.icon}
                          <Text style={[styles.verdictText, { color: vc.text }]}>{vc.label}</Text>
                        </View>
                        {cap.modality === 'pcg' && cap.verdict !== 'inconclusive' && (
                          <TouchableOpacity
                            style={styles.viewBtn}
                            onPress={() => openMeasure('pcg', 'patientHistory')}
                          >
                            <Text style={styles.viewBtnText}>{S.patientHistory.viewBtn}</Text>
                            <ChevronRight size={12} color={Colors.navy} strokeWidth={2.5} />
                          </TouchableOpacity>
                        )}
                        {cap.modality === 'ecg' && (
                          <TouchableOpacity
                            style={styles.viewBtn}
                            onPress={() => openMeasure('ecg', 'patientHistory')}
                          >
                            <Text style={styles.viewBtnText}>{S.patientHistory.viewBtn}</Text>
                            <ChevronRight size={12} color={Colors.navy} strokeWidth={2.5} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}

              {session.captures.length === 0 && (
                <Text style={styles.noCaptures}>{S.patientHistory.noHistory}</Text>
              )}
            </View>

            {/* Vertical connector line between sessions */}
            {si < sessions.length - 1 && (
              <View style={styles.connectorLine} />
            )}
          </View>
        ))}

        {sessions.length === 0 && (
          <View style={[styles.emptyState, maxWidth ? { width: maxWidth } : undefined]}>
            <Text style={styles.emptyText}>{S.patientHistory.noHistory}</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgWarm },
  scrollContent: { padding: 16, gap: 0 },

  // ── Patient banner ────────────────────────────────────────────────────────
  patientBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, marginBottom: 22,
  },
  bannerAvatar: {
    width: 46, height: 46, borderRadius: 10, backgroundColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bannerAvatarText: {
    fontSize: 18, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.white,
  },
  bannerMeta: { flex: 1 },
  bannerName:  { fontSize: 16, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.textDark },
  bannerSub:   { fontSize: 12, fontFamily: 'IBMPlexSans-Regular', color: Colors.textMid, marginTop: 2 },
  bannerStats: { flexDirection: 'row', gap: 8, flexShrink: 0 },

  // ── Stat pills ─────────────────────────────────────────────────────────────
  statPill: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: Colors.bgWarm, borderRadius: 9,
    borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { fontSize: 18, fontFamily: 'IBMPlexMono-Bold', fontWeight: '700', color: Colors.navy },
  statLabel: { fontSize: 10, fontFamily: 'IBMPlexMono-Regular', color: Colors.textLight, marginTop: 1, letterSpacing: 0.5 },

  // ── Session block ──────────────────────────────────────────────────────────
  sessionBlock: { marginBottom: 4 },

  sessionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 8, paddingLeft: 2,
  },
  timelineDot: {
    width: 10, height: 10, borderRadius: 5, flexShrink: 0,
  },
  timelineLine: {
    // decorative — the vertical connector is drawn separately below the card
  },
  sessionHeaderLabel: {
    fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '600',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  sessionDate: {
    fontSize: 13, fontFamily: 'IBMPlexSans-Regular', color: Colors.textDark,
    marginLeft: 'auto',
  },

  // ── Session card ───────────────────────────────────────────────────────────
  sessionCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },

  // ── Connector between sessions ─────────────────────────────────────────────
  connectorLine: {
    width: 2, height: 16, backgroundColor: Colors.border,
    marginLeft: 6, marginVertical: 4,
  },

  // ── Capture row ────────────────────────────────────────────────────────────
  captureRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 16, gap: 12,
  },
  captureDivider: {
    height: 1, backgroundColor: Colors.border, marginHorizontal: 16,
  },
  captureIconBox: {
    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
    backgroundColor: Colors.bgWarm, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  captureMeta: { flex: 1, gap: 3 },
  captureTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  captureTitle: {
    fontSize: 14, fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600',
    color: Colors.textDark,
  },
  captureSite: {
    fontSize: 12, fontFamily: 'IBMPlexSans-Regular', color: Colors.textMid,
  },
  capturePosture: {
    fontSize: 12, fontFamily: 'IBMPlexSans-Regular', color: Colors.textLight,
  },
  captureDetail: {
    fontSize: 12, fontFamily: 'IBMPlexMono-Regular', color: Colors.textLight,
    letterSpacing: 0.2,
  },
  stage2Label: {
    fontSize: 12, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500',
    marginTop: 1,
  },
  captureRight: {
    alignItems: 'flex-end', gap: 8, flexShrink: 0, maxWidth: 160,
  },

  // ── Verdict badge ──────────────────────────────────────────────────────────
  verdictBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
  },
  verdictText: {
    fontSize: 11, fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600',
  },

  // ── View button ────────────────────────────────────────────────────────────
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7,
    borderWidth: 1.5, borderColor: Colors.navy + '44',
    backgroundColor: Colors.navy + '08',
  },
  viewBtnText: {
    fontSize: 12, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.navy,
  },

  // ── Empty / no captures ────────────────────────────────────────────────────
  noCaptures: {
    fontSize: 13, fontFamily: 'IBMPlexSans-Regular', color: Colors.textLight,
    padding: 20, textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center', paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14, fontFamily: 'IBMPlexSans-Regular', color: Colors.textLight,
  },
});
