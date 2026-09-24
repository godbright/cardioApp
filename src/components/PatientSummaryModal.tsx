import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import RNFS from 'react-native-fs';
import { Colors } from '../theme/colors';
import {
  XIcon, FileTextIcon, DownloadIcon, ShareIcon,
  HeartIcon, ActivityIcon, CheckCircleIcon, AlertTriangleIcon, AlertCircleIcon,
} from './Icons';
import type { Patient } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sexLabel(sex: string) {
  if (sex === 'F' || sex === 'Female') return 'Female';
  if (sex === 'M' || sex === 'Male')   return 'Male';
  if (sex === 'O' || sex === 'Other')  return 'Other';
  return '—';
}

function hsLabel(hs: string): { text: string; color: string; bg: string } {
  if (hs === 'normal')             return { text: 'Normal',                       color: Colors.green, bg: Colors.green + '18' };
  if (hs === 'abnormal-pending')   return { text: 'Abnormal — awaiting confirm',  color: Colors.red,   bg: Colors.red   + '18' };
  if (hs === 'abnormal-confirmed') return { text: 'Abnormal — confirmed',         color: Colors.red,   bg: Colors.red   + '18' };
  if (hs === 'inconclusive')       return { text: 'Inconclusive',                 color: Colors.amber, bg: Colors.amber + '18' };
  return { text: 'Not recorded', color: Colors.textMute, bg: Colors.bgCanvas };
}

function buildSummaryText(p: Patient): string {
  const hs = hsLabel(p.hs);
  const lines = [
    '=== PATIENT SCREENING SUMMARY ===',
    `Generated : ${new Date().toLocaleString()}`,
    '',
    '--- PATIENT DETAILS ---',
    `Study Code : ${p.id}`,
    `Name       : ${p.name}`,
    `Age        : ${p.age} years`,
    `Sex        : ${sexLabel(p.sex || '')}`,
    `Prior RHD  : ${p.rhd === 'yes' ? 'Confirmed RHD' : p.rhd === 'no' ? 'None recorded' : 'Not recorded'}`,
    p.height              ? `Height     : ${p.height} cm`           : null,
    p.weight              ? `Weight     : ${p.weight} kg`           : null,
    p.bpSys && p.bpDia    ? `Blood Press: ${p.bpSys}/${p.bpDia} mmHg` : null,
    '',
    '--- SCREENING RESULTS ---',
    `Heart Sound (PCG) : ${hs.text}`,
    p.hsSite       ? `  Valve site  : ${p.hsSite}`                                           : null,
    p.hsPosture    ? `  Posture      : ${p.hsPosture}`                                        : null,
    p.hsConfidence ? `  Confidence   : ${(parseFloat(p.hsConfidence) * 100).toFixed(0)}%`   : null,
    p.hsModel      ? `  Model        : ${p.hsModel}`                                          : null,
    `Heart Rhythm (ECG): ${p.hr === 'ecg-captured' ? 'Captured' : 'Not recorded'}`,
    p.hrLead    ? `  Lead     : ${p.hrLead}`    : null,
    p.hrPosture ? `  Posture  : ${p.hrPosture}` : null,
    '',
    `Last exam  : ${p.lastExam}`,
  ].filter((l): l is string => l !== null);
  return lines.join('\n');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  patient: Patient | null;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PatientSummaryModal({ visible, patient: p, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [sharing,     setSharing]     = useState(false);

  const handleDownload = useCallback(async () => {
    if (!p) return;
    setDownloading(true);
    const text = buildSummaryText(p);
    const filename = `patient_${p.id}_summary.txt`;
    const dest = Platform.OS === 'android'
      ? `${RNFS.DownloadDirectoryPath}/${filename}`
      : `${RNFS.DocumentDirectoryPath}/${filename}`;
    try {
      await RNFS.writeFile(dest, text, 'utf8');
      Alert.alert('Saved', `Summary saved to Downloads as ${filename}.`);
    } catch {
      Alert.alert('Download failed', 'Could not write the file to storage.');
    } finally {
      setDownloading(false);
    }
  }, [p]);

  const handleShare = useCallback(async () => {
    if (!p) return;
    setSharing(true);
    const text = buildSummaryText(p);
    const filename = `patient_${p.id}_summary_${Date.now()}.txt`;
    const path = `${RNFS.CachesDirectoryPath}/${filename}`;
    try {
      await RNFS.writeFile(path, text, 'utf8');
      await Share.share({ url: `file://${path}`, message: text, title: `Patient ${p.id} — Summary` });
    } catch {
      // user cancelled share — not an error
    } finally {
      setSharing(false);
    }
  }, [p]);

  if (!p) return null;

  const hs     = hsLabel(p.hs);
  const hasBp  = !!(p.bpSys && p.bpDia);
  const generatedAt = new Date().toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>

          {/* ── Header ──────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <FileTextIcon size={18} color={Colors.white} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Patient Summary</Text>
              <Text style={styles.headerSub}>{p.id}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <XIcon size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          {/* ── Body ────────────────────────────────────────── */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>

            {/* Patient details */}
            <View style={styles.card}>
              <SectionHeader title="PATIENT DETAILS" />
              <Row label="Study code" value={p.id} />
              <View style={styles.divider} />
              <Row label="Name"       value={p.name} />
              <View style={styles.divider} />
              <Row label="Age"        value={`${p.age} years`} />
              <View style={styles.divider} />
              <Row label="Sex"        value={sexLabel(p.sex || '')} />
              <View style={styles.divider} />
              <Row
                label="Prior RHD / cardiac dx"
                value={p.rhd === 'yes' ? 'Confirmed RHD' : p.rhd === 'no' ? 'None recorded' : 'Not recorded'}
              />
              {(p.height || p.weight || hasBp) && (
                <>
                  <View style={[styles.divider, styles.dividerStrong]} />
                  <SectionHeader title="VITALS" />
                  {p.height ? <><Row label="Height"        value={`${p.height} cm`} /><View style={styles.divider} /></> : null}
                  {p.weight ? <><Row label="Weight"        value={`${p.weight} kg`} /><View style={styles.divider} /></> : null}
                  {hasBp    ? <Row  label="Blood pressure" value={`${p.bpSys}/${p.bpDia} mmHg`} /> : null}
                </>
              )}
            </View>

            {/* Screening results */}
            <View style={styles.card}>
              <SectionHeader title="SCREENING RESULTS" />

              {/* Heart Sound */}
              <View style={styles.modalityRow}>
                <View style={[styles.modalityIcon, { backgroundColor: Colors.navy + '12' }]}>
                  <HeartIcon size={16} color={Colors.navy} />
                </View>
                <View style={styles.modalityInfo}>
                  <Text style={styles.modalityName}>Heart Sound (PCG)</Text>
                  <View style={[styles.statusPill, { backgroundColor: hs.bg }]}>
                    <Text style={[styles.statusPillText, { color: hs.color }]}>{hs.text}</Text>
                  </View>
                  {p.hsSite && (
                    <Text style={styles.modalityDetail}>Site: {p.hsSite}{p.hsPosture ? ` · ${p.hsPosture}` : ''}</Text>
                  )}
                  {p.hsConfidence && (
                    <Text style={styles.modalityDetail}>
                      Confidence: {(parseFloat(p.hsConfidence) * 100).toFixed(0)}%
                      {p.hsModel ? `  ·  Model: ${p.hsModel}` : ''}
                    </Text>
                  )}
                </View>
              </View>

              <View style={[styles.divider, styles.dividerStrong]} />

              {/* Heart Rhythm */}
              <View style={styles.modalityRow}>
                <View style={[styles.modalityIcon, { backgroundColor: Colors.navy + '12' }]}>
                  <ActivityIcon size={16} color={Colors.navy} />
                </View>
                <View style={styles.modalityInfo}>
                  <Text style={styles.modalityName}>Heart Rhythm (ECG)</Text>
                  {p.hr === 'ecg-captured' ? (
                    <>
                      <View style={[styles.statusPill, { backgroundColor: Colors.teal + '18' }]}>
                        <Text style={[styles.statusPillText, { color: Colors.teal }]}>Captured</Text>
                      </View>
                      {p.hrLead && (
                        <Text style={styles.modalityDetail}>Lead: {p.hrLead}{p.hrPosture ? ` · ${p.hrPosture}` : ''}</Text>
                      )}
                    </>
                  ) : (
                    <View style={[styles.statusPill, { backgroundColor: Colors.bgCanvas }]}>
                      <Text style={[styles.statusPillText, { color: Colors.textMute }]}>Not recorded</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Timestamp */}
            <Text style={styles.timestamp}>Generated {generatedAt}</Text>
          </ScrollView>

          {/* ── Footer ──────────────────────────────────────── */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerBtn, styles.footerBtnOutline]}
              onPress={handleDownload}
              disabled={downloading || sharing}
              activeOpacity={0.75}
            >
              {downloading
                ? <ActivityIndicator size="small" color={Colors.navy} />
                : <DownloadIcon size={16} color={Colors.navy} />}
              <Text style={[styles.footerBtnText, styles.footerBtnTextOutline]}>Download</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.footerBtn, styles.footerBtnPrimary]}
              onPress={handleShare}
              disabled={downloading || sharing}
              activeOpacity={0.75}
            >
              {sharing
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <ShareIcon size={16} color={Colors.white} />}
              <Text style={[styles.footerBtnText, styles.footerBtnTextPrimary]}>Share</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    backgroundColor: Colors.bgWarm,
    borderRadius: 18,
    overflow: 'hidden',
  },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.navy,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.white,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: 'IBMPlexSans-Regular',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Body
  body: { flexGrow: 1 },
  bodyContent: { padding: 16, gap: 12, paddingBottom: 4 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },

  sectionHeader: {
    fontSize: 10,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.textMute,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 12,
  },
  rowLabel: {
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Regular',
    color: Colors.textMid,
    flex: 1,
  },
  rowValue: {
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Medium',
    fontWeight: '500',
    color: Colors.textDark,
    textAlign: 'right',
    flex: 1,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.borderFaint,
  },
  dividerStrong: {
    backgroundColor: Colors.border,
    marginVertical: 10,
  },

  // ── Modality rows
  modalityRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  modalityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  modalityInfo: { flex: 1, gap: 6 },
  modalityName: {
    fontSize: 14,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.textDark,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontFamily: 'IBMPlexSans-Medium',
    fontWeight: '500',
  },
  modalityDetail: {
    fontSize: 12,
    fontFamily: 'IBMPlexSans-Regular',
    color: Colors.textMute,
    lineHeight: 17,
  },

  // ── Timestamp
  timestamp: {
    fontSize: 11,
    fontFamily: 'IBMPlexSans-Regular',
    color: Colors.textFaint,
    textAlign: 'center',
    paddingBottom: 4,
  },

  // ── Footer
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  footerBtn: {
    flex: 1,
    height: 46,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerBtnOutline: {
    borderWidth: 1.5,
    borderColor: Colors.navy + '55',
    backgroundColor: Colors.navy + '08',
  },
  footerBtnPrimary: {
    backgroundColor: Colors.navy,
  },
  footerBtnText: {
    fontSize: 14,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
  },
  footerBtnTextOutline: { color: Colors.navy },
  footerBtnTextPrimary: { color: Colors.white },
});
