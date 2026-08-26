import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import {
  CheckIcon, AlertTriangleIcon, AlertCircleIcon,
  ActivityIcon, HeartIcon, SpeakerIcon, DownloadIcon,
} from '../components/Icons';
import { Colors } from '../theme/colors';
import { getSiteById, AUSCULTATION_SITES, ECG_LEADS } from '../constants/sites';
import { speakResult } from '../services/tts';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatBox({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={statStyles.box}>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, mono && statStyles.valueMono]}>{value}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={drStyles.row}>
      <Text style={drStyles.label}>{label}</Text>
      <Text style={drStyles.value}>{value}</Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ResultScreen() {
  const { state, nextCapture, returnToHub, retryCapture, finishSession } = useApp();
  const { result, modality, site, posture, currentPatient } = state;
  const insets = useSafeAreaInsets();
  const { isPortrait } = useOrientation();
  const S = useStrings();

  const siteInfo = site ? getSiteById(site) : null;

  useEffect(() => {
    if (!result) return;
    speakResult(result.kind, result.online ?? false);
  }, []);

  if (!result || !currentPatient) return null;

  const isEcg          = result.kind === 'ecg';
  const isNormal       = result.kind === 'normal';
  const isAbnormal     = result.kind === 'abnormal';
  const isInconclusive = result.kind === 'inconclusive';
  const isPcg          = modality === 'pcg';

  // ── Session progress ────────────────────────────────────────────────────────
  // Compute which positions have been (or will be) captured after this result.
  const allPositions   = isPcg ? AUSCULTATION_SITES : ECG_LEADS;
  const doneSoFar      = isPcg ? state.sessionCapturedSites : state.sessionCapturedLeads;
  // Include current site in the "done" set only for conclusive results.
  const doneAfterThis  = isInconclusive
    ? new Set(doneSoFar)
    : new Set([...doneSoFar, site ?? '']);
  const remaining      = allPositions.filter(p => !doneAfterThis.has(p.id));
  const allDone        = remaining.length === 0;
  const nextPos        = remaining[0]; // undefined when all done

  // ── Header palette ──────────────────────────────────────────────────────────
  const headerBg =
    isNormal      ? Colors.green  :
    isAbnormal    ? Colors.red    :
    isInconclusive ? Colors.amber :
    Colors.navy;                   // ECG — navy, not a diagnostic result

  const headerIconColor = Colors.white;

  const headerIcon =
    isPcg && isNormal     ? <HeartIcon         size={26} color={headerIconColor} /> :
    isPcg && isAbnormal   ? <AlertTriangleIcon size={26} color={headerIconColor} /> :
    isPcg && isInconclusive ? <AlertCircleIcon size={26} color={headerIconColor} /> :
    <ActivityIcon size={26} color={Colors.mint} />;   // ECG uses mint on navy

  // ── Labels ─────────────────────────────────────────────────────────────────
  const kicker =
    isNormal      ? 'HEART SOUND · STAGE 1' :
    isAbnormal    ? (result.online ? 'HEART SOUND · STAGE 2 CONFIRMED' : 'HEART SOUND · PENDING STAGE 2') :
    isInconclusive ? 'HEART SOUND · INCONCLUSIVE' :
    'HEART RHYTHM · ECG';

  const headline =
    isNormal      ? S.result.headlineNormal :
    isAbnormal    ? S.result.headlineAbnormal :
    isInconclusive ? S.result.headlineInconc :
    S.result.ecgTitle;

  const voiceMessage =
    isNormal
      ? S.result.normalSub
      : isAbnormal && result.online
      ? S.result.abnormalConfSub
      : isAbnormal
      ? S.result.abnormalPendingSub
      : isInconclusive
      ? S.result.inconclusiveSub
      : S.result.ecgSub;

  const siteLabel  = siteInfo?.label ?? site ?? '—';
  const postureStr = posture ?? '—';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Result header ───────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: headerBg }]}>
        <View style={[styles.iconCircle, isEcg && styles.iconCircleEcg]}>
          {headerIcon}
        </View>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.patientMeta}>
            {currentPatient.name}
            {'  ·  '}
            <Text style={styles.patientId}>{currentPatient.id}</Text>
          </Text>
        </View>

        {/* Stage 2 pill for abnormal */}
        {isAbnormal && (
          <View style={[styles.stage2Pill,
            { backgroundColor: result.online ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.10)' }]}>
            <View style={[styles.stage2PillDot,
              { backgroundColor: result.online ? Colors.white : 'rgba(255,255,255,0.5)' }]} />
            <Text style={styles.stage2PillText}>
              {result.online ? S.result.stage2Complete : S.result.stage2Awaiting}
            </Text>
          </View>
        )}
      </View>

      {/* ── Body — two-col landscape, single-col portrait ─── */}
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={[styles.body, isPortrait && styles.bodyPortrait]}
        showsVerticalScrollIndicator={false}
      >

        {/* Left / main result panel */}
        <View style={[styles.leftCol, isPortrait && styles.leftColPortrait]}>
          <View style={styles.leftContent}>

            {/* Stat row — key capture metadata */}
            <View style={styles.statRow}>
              <StatBox
                label={isPcg ? 'VALVE SITE' : 'ECG LEAD'}
                value={siteLabel}
              />
              <StatBox label="POSTURE"  value={postureStr} />
              <StatBox label="DURATION" value="~30 sec" />
              {isPcg && result.confidence && (
                <StatBox label="CONFIDENCE" value={result.confidence} mono />
              )}
            </View>

            {/* Voice guidance card */}
            <View style={styles.voiceCard}>
              <View style={styles.voiceHeader}>
                <View style={styles.voiceIconBox}>
                  <SpeakerIcon size={14} color={Colors.textMid} />
                </View>
                <Text style={styles.voiceLabel}>SPOKEN GUIDANCE</Text>
              </View>
              <Text style={styles.voiceText}>"{voiceMessage}"</Text>
            </View>

            {/* ECG-specific info card */}
            {isEcg && (
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={[styles.infoStatus, { backgroundColor: '#EAFAF2', borderColor: '#B6E8D0' }]}>
                    <View style={[styles.infoStatusDot, { backgroundColor: Colors.green }]} />
                    <Text style={[styles.infoStatusText, { color: Colors.green }]}>{S.result.storedLocally}</Text>
                  </View>
                </View>
                <Text style={styles.infoBody}>
                  The rhythm signal was recorded and stored with this patient session.
                  {'\n\n'}
                  The analysis pipeline for ECG data is pending definition by the clinical and ML teams — see Open Questions in CLAUDE.md.
                </Text>
              </View>
            )}

            {/* Stage 2 sync card (abnormal PCG) */}
            {isAbnormal && (
              <View style={[styles.stage2Card,
                { borderColor: result.online ? Colors.red : Colors.amber }]}>
                <View style={[styles.stage2CardDot,
                  { backgroundColor: result.online ? Colors.red : Colors.amber }]} />
                <View style={styles.stage2CardBody}>
                  <Text style={styles.stage2CardTitle}>{S.result.stage2CloudConf}</Text>
                  <Text style={[styles.stage2CardStatus,
                    { color: result.online ? Colors.red : Colors.amber }]}>
                    {result.online ? S.result.confirmedAsSuspected : S.result.queuedAwaiting}
                  </Text>
                  {!result.online && (
                    <Text style={styles.stage2CardNote}>
                      {S.result.queuedNote}
                    </Text>
                  )}
                </View>
              </View>
            )}

          </View>

          {/* Action buttons */}
          <View style={styles.btnArea}>
            {isInconclusive ? (
              // Inconclusive: primary = try again (goes back to position select,
              // site stays unmarked so the CHW can retry or pick another).
              <>
                <TouchableOpacity style={styles.recaptureBtn} onPress={retryCapture}>
                  <Text style={styles.recaptureBtnText}>{S.result.tryAgain}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={returnToHub}>
                  <Text style={styles.ghostBtnText}>{S.result.backToOverview}</Text>
                </TouchableOpacity>
              </>
            ) : allDone ? (
              // All positions captured — emphasise completion, offer Finish Session.
              <>
                <TouchableOpacity style={styles.doneBtn} onPress={returnToHub}>
                  <CheckIcon size={16} color={Colors.white} />
                  <Text style={styles.doneBtnText}>
                    {isPcg ? S.result.doneHs : S.result.doneEcg}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={finishSession}>
                  <Text style={styles.ghostBtnText}>{S.session.finishSession}</Text>
                </TouchableOpacity>
              </>
            ) : (
              // More positions remain — primary drives the CHW to the next one.
              <>
                <TouchableOpacity style={styles.nextBtn} onPress={nextCapture}>
                  <Text style={styles.nextBtnText}>
                    {isPcg ? S.result.nextValve : S.result.nextLead}
                    {nextPos ? `: ${nextPos.label}` : ''}
                  </Text>
                  <Text style={styles.nextBtnArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={returnToHub}>
                  <Text style={styles.ghostBtnText}>{S.result.backToOverview}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Right / recording detail panel */}
        <View style={[styles.rightCol, isPortrait && styles.rightColPortrait]}>
          <Text style={styles.detailHead}>RECORDING DETAIL</Text>

          <DetailRow label="Modality"    value={isPcg ? 'Auscultation (PCG + ECG)' : 'ECG lead only'} />
          <DetailRow label="Site / lead" value={siteLabel} />
          <DetailRow label="Posture"     value={postureStr} />
          <DetailRow label="Session"     value={currentPatient.lastExam} />

          {isPcg && (
            <>
              <View style={styles.detailDivider} />
              <Text style={styles.detailHead}>STAGE 1 INFERENCE</Text>
              <DetailRow label="Model"        value={result.model ?? 'v1.0.0'} />
              <DetailRow label="Quantisation" value="INT8 TFLite" />
              {result.confidence && (
                <DetailRow label="Confidence" value={result.confidence} />
              )}
              <DetailRow label="Result"       value={
                isNormal ? 'Normal' : isAbnormal ? 'Abnormal' : 'Inconclusive'
              } />
            </>
          )}

          {isEcg && (
            <>
              <View style={styles.detailDivider} />
              <Text style={styles.detailHead}>STORAGE</Text>
              <DetailRow label="Status"   value="Stored locally" />
              <DetailRow label="Analysis" value="Pending definition" />
            </>
          )}

          {/* Export row */}
          <View style={styles.detailDivider} />
          <TouchableOpacity style={styles.exportBtn}>
            <DownloadIcon size={13} color={Colors.textMid} />
            <Text style={styles.exportBtnText}>Export record</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Stat box styles ──────────────────────────────────────────────────────────

const statStyles = StyleSheet.create({
  box: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 6,
  },
  label: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 10, fontWeight: '400',
    color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 1.5,
  },
  value: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 15, fontWeight: '400',
    color: Colors.textDark,
  },
  valueMono: {
    fontFamily: 'IBMPlexMono-Bold', fontSize: 18, fontWeight: '700',
  },
});

// ─── Detail row styles ────────────────────────────────────────────────────────

const drStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    gap: 8,
  },
  label: { fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400', color: Colors.textMid, flex: 1 },
  value: { fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400', color: Colors.textDark, textAlign: 'right', maxWidth: '55%' },
});

// ─── Main styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgWarm },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 18,
    paddingHorizontal: 28, paddingTop: 20, paddingBottom: 22,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconCircleEcg: {
    backgroundColor: 'rgba(127,224,182,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(127,224,182,0.25)',
  },
  headerText: { flex: 1 },
  kicker: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 11, fontWeight: '400',
    color: 'rgba(255,255,255,0.65)', letterSpacing: 2, textTransform: 'uppercase',
    marginBottom: 6,
  },
  headline: {
    fontFamily: 'IBMPlexSans-Bold', fontSize: 27, fontWeight: '700',
    color: Colors.white, letterSpacing: -0.27,
  },
  patientMeta: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 14, fontWeight: '400',
    color: 'rgba(255,255,255,0.65)', marginTop: 5,
  },
  patientId: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 13, fontWeight: '400',
  },

  stage2Pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    flexShrink: 0,
  },
  stage2PillDot:  { width: 7, height: 7, borderRadius: 4 },
  stage2PillText: { fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400', color: Colors.white },

  // ── Body ──────────────────────────────────────────────────────────────────
  bodyScroll:   { flex: 1 },
  body:         { flexDirection: 'row', padding: 20, gap: 16 },
  bodyPortrait: { flexDirection: 'column' },

  leftCol:         { flex: 1, gap: 0 },
  leftColPortrait: { flex: undefined },
  leftContent:     { gap: 14, paddingBottom: 8 },

  statRow: { flexDirection: 'row', gap: 10 },

  // Voice card
  voiceCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 18, gap: 10,
  },
  voiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceIconBox: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: Colors.bgWarm, alignItems: 'center', justifyContent: 'center',
  },
  voiceLabel: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 10, fontWeight: '400',
    color: Colors.textLight, letterSpacing: 2, textTransform: 'uppercase',
  },
  voiceText: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 15, fontWeight: '400',
    color: Colors.textDark, lineHeight: 24, fontStyle: 'italic',
  },

  // ECG info card
  infoCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 18, gap: 12,
  },
  infoRow: { flexDirection: 'row', gap: 10 },
  infoStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  infoStatusDot:  { width: 7, height: 7, borderRadius: 4 },
  infoStatusText: { fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400' },
  infoBody: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 14, fontWeight: '400',
    color: Colors.textMid, lineHeight: 22,
  },

  // Stage 2 card
  stage2Card: {
    flexDirection: 'row', gap: 14,
    backgroundColor: Colors.white, borderRadius: 12, padding: 18, borderWidth: 1.5,
  },
  stage2CardDot:  { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  stage2CardBody: { flex: 1, gap: 4 },
  stage2CardTitle: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 14, fontWeight: '400', color: Colors.textDark,
  },
  stage2CardStatus: { fontFamily: 'IBMPlexSans-Medium', fontSize: 14, fontWeight: '500' },
  stage2CardNote: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400',
    color: Colors.textMid, lineHeight: 19, marginTop: 4,
  },

  // Actions
  btnArea: { gap: 10, paddingTop: 4 },

  // "Next: [Valve/Lead]" — navy, full width, arrow on right
  nextBtn: {
    height: 52, backgroundColor: Colors.navy, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  nextBtnText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 16, fontWeight: '500', color: Colors.white, flex: 1,
  },
  nextBtnArrow: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 22, color: 'rgba(255,255,255,0.6)', marginLeft: 8,
  },

  // "Done — Complete" — teal, full width, check on left
  doneBtn: {
    height: 52, backgroundColor: Colors.teal, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  doneBtnText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 16, fontWeight: '500', color: Colors.white,
  },

  // Ghost — outline only, used as secondary action
  ghostBtn: {
    height: 44, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  ghostBtnText: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 14, fontWeight: '400', color: Colors.textMid,
  },

  // "Try Again" — amber, for inconclusive
  recaptureBtn: {
    height: 52, backgroundColor: Colors.amber, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  recaptureBtnText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 16, fontWeight: '500', color: Colors.white,
  },

  // ── Right column ──────────────────────────────────────────────────────────
  rightCol: {
    width: 292, backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 20,
  },
  rightColPortrait: { width: undefined },
  detailHead: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 11, fontWeight: '400',
    color: Colors.textLight, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6,
  },
  detailDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 16 },

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 9,
    backgroundColor: Colors.bgWarm, marginTop: 4,
  },
  exportBtnText: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400', color: Colors.textMid,
  },
});
