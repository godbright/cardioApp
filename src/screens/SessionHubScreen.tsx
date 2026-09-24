import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal,
} from 'react-native';
import PatientSummaryModal from '../components/PatientSummaryModal';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';
import {
  HeartIcon, ActivityIcon, EditIcon, AlertTriangleIcon,
  CheckIcon, DownloadIcon, ClockIcon, FileTextIcon,
} from '../components/Icons';
import { Colors } from '../theme/colors';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';

function avatar(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 1);
}

function sexLabel(sex: string) {
  if (sex === 'F' || sex === 'Female') return 'Female';
  if (sex === 'M' || sex === 'Male')   return 'Male';
  if (sex === 'O' || sex === 'Other')  return 'Other';
  return '—';
}

type StatusDot = { color: string; label: string; textColor?: string } | null;

function resolveHsStatus(hs: string, S: ReturnType<typeof useStrings>): StatusDot {
  if (hs === 'none')               return null;
  if (hs === 'normal')             return { color: Colors.green, label: S.status.normal };
  if (hs === 'abnormal-pending')   return { color: Colors.red, label: S.status.abnormalPending,   textColor: Colors.red };
  if (hs === 'abnormal-confirmed') return { color: Colors.red, label: S.status.abnormalConfirmed, textColor: Colors.red };
  if (hs === 'inconclusive')       return { color: Colors.amber, label: S.status.inconclusive,    textColor: Colors.amber };
  return null;
}

function resolveHrStatus(hr: string, S: ReturnType<typeof useStrings>): StatusDot {
  if (hr === 'none')     return null;
  if (hr === 'captured') return { color: Colors.textDark, label: S.status.captured };
  return null;
}

export default function SessionHubScreen() {
  const {
    state, editPatient, startModality, openMeasure, openPatientHistory,
    doneWithPatient, askDelete, cancelDelete, deletePatient,
  } = useApp();
  const { currentPatient: p, confirmDelete } = state;
  const { isPortrait } = useOrientation();
  const S = useStrings();

  if (!p) return null;

  // ── Export helpers ─────────────────────────────────────────────────────────
  const [summaryVisible, setSummaryVisible] = useState(false);

  const shareCsv = useCallback(async () => {
    const headers = [
      'study_code','name','age','sex','rhd',
      'height_cm','weight_kg','bp_systolic','bp_diastolic',
      'hs_result','hs_site','hs_posture','hs_confidence','hs_model',
      'hr_result','hr_lead','hr_posture',
      'last_exam','export_timestamp',
    ];

    const escape = (v: string | number | null | undefined) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const row = [
      p.id, p.name, p.age, sexLabel(p.sex || ''),
      p.rhd === 'yes' ? 'yes' : p.rhd === 'no' ? 'no' : '',
      p.height ?? '', p.weight ?? '', p.bpSys ?? '', p.bpDia ?? '',
      p.hs, p.hsSite ?? '', p.hsPosture ?? '',
      p.hsConfidence ? (parseFloat(p.hsConfidence) * 100).toFixed(0) : '',
      p.hsModel ?? '',
      p.hr, p.hrLead ?? '', p.hrPosture ?? '',
      p.lastExam, new Date().toISOString(),
    ].map(escape).join(',');

    const csv = [headers.join(','), row].join('\n');
    const path = `${RNFS.CachesDirectoryPath}/patient_${p.id}_${Date.now()}.csv`;

    try {
      await RNFS.writeFile(path, csv, 'utf8');
      await Share.share({ url: `file://${path}`, title: `Patient ${p.id} — Data` });
    } catch {
      Alert.alert('Export failed', 'Could not write or share the CSV file.');
    }
  }, [p]);

  const hsComplete    = p.hs !== 'none';
  const hrComplete    = p.hr !== 'none';
  const capturedCount = (hsComplete ? 1 : 0) + (hrComplete ? 1 : 0);
  const hsStatus      = resolveHsStatus(p.hs, S);
  const hrStatus      = resolveHrStatus(p.hr, S);

  const rhdValue =
    p.rhd === 'yes'     ? 'Confirmed RHD' :
    p.rhd === 'no'      ? 'None recorded'  :
    'Not recorded';

  // ── Patient card ────────────────────────────────────────────────────────
  const patientCard = (
    <View style={[styles.patientCard, isPortrait && styles.patientCardPortrait]}>
      <View style={styles.avatarBox}>
        <Text style={styles.avatarText}>{avatar(p.name)}</Text>
      </View>
      <View style={styles.patientMeta}>
        <Text style={styles.patientName}>{p.name}</Text>
        <Text style={styles.patientSub}>{p.id} · {p.age} yrs · {sexLabel(p.sex || '')}</Text>
        {isPortrait && (
          <Text style={styles.lastExamInline}>{S.session.lastExam.replace('LAST ', '')}: {p.lastExam}</Text>
        )}
      </View>
      {!isPortrait && (
        <View style={styles.lastExamBox}>
          <Text style={styles.lastExamLabel}>{S.session.lastExam}</Text>
          <Text style={styles.lastExamDate}>{p.lastExam}</Text>
        </View>
      )}
      <View style={[styles.patientBtns, isPortrait && styles.patientBtnsPortrait]}>
        <TouchableOpacity style={styles.editBtn} onPress={editPatient}>
          <EditIcon size={14} color={Colors.textMid} />
          <Text style={styles.editBtnText}>{S.session.editDetails}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.historyBtn} onPress={openPatientHistory}>
          <ClockIcon size={14} color={Colors.navy} />
          <Text style={styles.historyBtnText}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.finishBtn} onPress={doneWithPatient}>
          <CheckIcon size={14} color={Colors.textMid} />
          <Text style={styles.finishBtnText}>{S.session.finishSession}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Details card content ─────────────────────────────────────────────────
  const detailsCardContent = (
    <>
      <Text style={styles.sectionLabel}>{S.session.patientDetails}</Text>
      <View style={styles.detailGrid}>
        <View style={styles.detailRow}>
          <DetailBox label="STUDY CODE" value={p.id} />
          <DetailBox label="AGE"        value={`${p.age} years`} />
        </View>
        <View style={styles.detailRow}>
          <DetailBox label="SEX"                        value={sexLabel(p.sex || '')} />
          <DetailBox label={'PRIOR RHD /\nCARDIAC DX'} value={rhdValue} />
        </View>
        <View style={styles.detailRow}>
          <DetailBox label={S.session.lastExam} value={p.lastExam} />
          <View style={styles.detailBox}>
            <View style={styles.capturedRow}>
              <Text style={styles.detailBoxLabel}>{S.session.captured}</Text>
              <Text style={styles.capturedValue}>{capturedCount} / 2</Text>
            </View>
            <View style={styles.captureBarBg}>
              <View style={[styles.captureBarFill, { width: `${capturedCount * 50}%` as any }]} />
            </View>
          </View>
        </View>
      </View>
      <View style={styles.extractSection}>
        <Text style={styles.extractTitle}>{S.session.extractRecord}</Text>
        <Text style={styles.extractNote}>{S.session.extractNote}</Text>
        <View style={styles.extractBtns}>
          <TouchableOpacity style={styles.extractBtn} onPress={() => setSummaryVisible(true)}>
            <FileTextIcon size={13} color={Colors.navy} />
            <Text style={[styles.extractBtnText, { color: Colors.navy }]}>View Summary</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.extractBtn} onPress={shareCsv}>
            <DownloadIcon size={13} color={Colors.textMid} />
            <Text style={styles.extractBtnText}>{S.session.extractCsv}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  // ── Modality cards ────────────────────────────────────────────────────────
  const heartSoundCard = (
    <ModalityCard
      sectionLabel={S.session.stage1Label}
      title={S.session.heartSound}
      description={S.session.heartSoundDesc}
      tags={S.session.heartSoundTags}
      icon={<HeartIcon size={20} color={Colors.textMid} />}
      status={hsStatus}
      hasCaptured={hsComplete}
      onStart={() => startModality('pcg')}
      onView={hsComplete ? () => openMeasure('pcg') : undefined}
      startLabel={S.session.startCapture}
      againLabel={S.session.captureAgain}
      viewLabel={S.session.viewMeasure}
    />
  );

  const heartRhythmCard = (
    <ModalityCard
      sectionLabel={S.session.rhythmLabel}
      title={S.session.heartRhythm}
      description={S.session.heartRhythmDesc}
      tags={S.session.heartRhythmTags}
      icon={<ActivityIcon size={20} color={Colors.textMid} />}
      status={hrStatus}
      hasCaptured={hrComplete}
      onStart={() => startModality('ecg')}
      onView={hrComplete ? () => openMeasure('ecg') : undefined}
      startLabel={S.session.startCapture}
      againLabel={S.session.captureAgain}
      viewLabel={S.session.viewMeasure}
    />
  );

  return (
    <View style={styles.root}>
      <Header title={S.session.title} canBack />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {patientCard}

        {isPortrait ? (
          /*
           * Portrait: details card full-width, then Heart Sound and Heart Rhythm
           * sit side-by-side in a row rather than stacking in a column.
           * This gives each modality card ~50% width — much better than three
           * equal-height stacked cards that ignore available horizontal space.
           */
          <View style={styles.portraitBody}>
            <View style={[styles.detailsCard, { width: undefined }]}>{detailsCardContent}</View>
            <View style={styles.modalityPair}>
              {heartSoundCard}
              {heartRhythmCard}
            </View>
          </View>
        ) : (
          /* Landscape: all three in a horizontal row */
          <View style={styles.threeCol}>
            <View style={styles.detailsCard}>{detailsCardContent}</View>
            {heartSoundCard}
            {heartRhythmCard}
          </View>
        )}
      </ScrollView>

      <PatientSummaryModal
        visible={summaryVisible}
        patient={p}
        onClose={() => setSummaryVisible(false)}
      />

      <Modal visible={confirmDelete} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AlertTriangleIcon size={28} color={Colors.red} />
            <Text style={styles.modalTitle}>Delete patient record?</Text>
            <Text style={styles.modalBody}>
              This will permanently remove {p.name}'s record and all associated screening data. This cannot be undone.
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={cancelDelete}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalDeleteBtn} onPress={deletePatient}>
                <Text style={styles.modalDeleteText}>Delete permanently</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── DetailBox ────────────────────────────────────────────────────────────────

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailBox}>
      <Text style={styles.detailBoxLabel}>{label}</Text>
      <Text style={styles.detailBoxValue}>{value}</Text>
    </View>
  );
}

// ─── ModalityCard ─────────────────────────────────────────────────────────────

interface ModalityCardProps {
  sectionLabel: string;
  title: string;
  description: string;
  tags: string[];
  icon: React.ReactNode;
  status: StatusDot;
  hasCaptured: boolean;
  onStart: () => void;
  onView?: () => void;
  startLabel: string;
  againLabel: string;
  viewLabel: string;
}

function ModalityCard({
  sectionLabel, title, description, tags, icon,
  status, hasCaptured, onStart, onView,
  startLabel, againLabel, viewLabel,
}: ModalityCardProps) {
  return (
    <View style={mcStyles.card}>
      <View style={mcStyles.topRow}>
        <Text style={mcStyles.sectionLabel}>{sectionLabel}</Text>
        {status && (
          <View style={mcStyles.statusRow}>
            <View style={[mcStyles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[mcStyles.statusText, { color: status.textColor ?? Colors.textDark }]}>
              {status.label}
            </Text>
          </View>
        )}
      </View>
      <View style={mcStyles.titleRow}>
        <View style={mcStyles.iconBox}>{icon}</View>
        <Text style={mcStyles.title}>{title}</Text>
      </View>
      <Text style={mcStyles.description}>{description}</Text>
      <View style={mcStyles.tags}>
        {tags.map(t => (
          <View key={t} style={mcStyles.tag}>
            <Text style={mcStyles.tagText}>{t}</Text>
          </View>
        ))}
      </View>
      <View style={mcStyles.btnRow}>
        {hasCaptured ? (
          <>
            <TouchableOpacity style={[mcStyles.btn, mcStyles.btnPrimary]} onPress={onView}>
              <Text style={mcStyles.btnPrimaryText}>{viewLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[mcStyles.btn, mcStyles.btnSecondary]} onPress={onStart}>
              <Text style={mcStyles.btnSecondaryText}>{againLabel}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[mcStyles.btn, mcStyles.btnPrimary, mcStyles.btnFull]} onPress={onStart}>
            <Text style={mcStyles.btnPrimaryText}>{startLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const mcStyles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 20, gap: 12,
    justifyContent: 'space-between',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: {
    fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400',
    color: Colors.textLight, letterSpacing: 2, textTransform: 'uppercase', flexShrink: 1,
  },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, flexShrink: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
  statusText: { fontSize: 12, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.bgWarm, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 17, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700',
    color: Colors.textDark, letterSpacing: -0.17, flex: 1,
  },
  description: { fontSize: 13, color: Colors.textMid, lineHeight: 19 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
    backgroundColor: Colors.bgWarm, borderWidth: 1, borderColor: Colors.border,
  },
  tagText: { fontSize: 11, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textMid },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flex: 1, paddingHorizontal: 6 },
  btnFull: { flex: 1 },
  btnPrimary: { backgroundColor: Colors.navy },
  btnPrimaryText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.white },
  btnSecondary: { borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  btnSecondaryText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.textDark },
});

// ─── Main styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgWarm },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },

  // ── Patient card ──────────────────────────────────────────────────────────
  patientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 16,
  },
  patientCardPortrait: { flexWrap: 'wrap' },
  avatarBox: {
    width: 50, height: 50, borderRadius: 10,
    backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.white },
  patientMeta: { flex: 1 },
  patientName: { fontSize: 18, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.textDark, letterSpacing: -0.18 },
  patientSub:  { fontSize: 13, color: Colors.textMid, marginTop: 2 },
  lastExamInline: { fontSize: 12, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textLight, marginTop: 3 },
  lastExamBox: { alignItems: 'flex-end', paddingRight: 6 },
  lastExamLabel: { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 2 },
  lastExamDate:  { fontSize: 14, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark, marginTop: 3 },
  patientBtns: { flexDirection: 'row', gap: 8 },
  patientBtnsPortrait: { width: '100%', marginTop: 4 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  editBtnText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.textDark },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.navy + '44', backgroundColor: Colors.navy + '08',
  },
  historyBtnText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.navy },
  finishBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  finishBtnText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.textDark },

  // ── Landscape three-col ────────────────────────────────────────────────────
  threeCol: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },

  // ── Portrait body ─────────────────────────────────────────────────────────
  // Details card goes full-width; HS + HR sit side-by-side below it.
  portraitBody: { gap: 14 },
  // Two modality cards in a horizontal pair
  modalityPair: { flexDirection: 'row', gap: 14, alignItems: 'stretch' },

  // ── Details card (fixed-width in landscape, full-width in portrait) ────────
  detailsCard: {
    width: 380, backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 20, gap: 0,
  },
  sectionLabel: {
    fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '600', color: Colors.textLight,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14,
  },
  detailGrid: { gap: 8, marginBottom: 20 },
  detailRow:  { flexDirection: 'row', gap: 8 },
  detailBox: {
    flex: 1, backgroundColor: Colors.bgWarm, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 5,
  },
  detailBoxLabel: {
    fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 2,
  },
  detailBoxValue: { fontSize: 15, fontFamily: 'IBMPlexSans-Regular', fontWeight: '800', color: Colors.textDark },
  capturedRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  capturedValue:  { fontSize: 17, fontFamily: 'IBMPlexMono-Bold', fontWeight: '700', color: Colors.textDark },
  captureBarBg:   { height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  captureBarFill: { height: 5, backgroundColor: Colors.navy, borderRadius: 3 },
  extractSection: { marginBottom: 12 },
  extractTitle:   { fontSize: 16, fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600', color: Colors.textDark, marginBottom: 4 },
  extractNote:    { fontSize: 13, color: Colors.textMid, lineHeight: 18, marginBottom: 12 },
  extractBtns:    { flexDirection: 'row', gap: 8 },
  extractBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  extractBtnText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.textDark },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    width: 380, backgroundColor: Colors.white, borderRadius: 16, padding: 28,
    alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, elevation: 10,
  },
  modalTitle: { fontSize: 18, fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600', color: Colors.textDark, textAlign: 'center' },
  modalBody:  { fontSize: 14, color: Colors.textMid, textAlign: 'center', lineHeight: 21 },
  modalBtns:  { flexDirection: 'row', gap: 12, marginTop: 6 },
  modalCancelBtn: {
    flex: 1, height: 44, borderRadius: 9, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, color: Colors.textMid },
  modalDeleteBtn: {
    flex: 1, height: 44, borderRadius: 9, backgroundColor: Colors.red,
    alignItems: 'center', justifyContent: 'center',
  },
  modalDeleteText: { fontSize: 14, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.white },
});
