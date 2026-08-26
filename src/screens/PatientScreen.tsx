import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal,
} from 'react-native';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';
import {
  SearchIcon, ChevronRight, AlertCircleIcon, TrashIcon, AlertTriangleIcon,
} from '../components/Icons';
import { Colors } from '../theme/colors';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';

function statusDotColor(p: { hs: string; hr: string }): string {
  if (p.hs === 'abnormal-confirmed' || p.hs === 'abnormal-pending') return Colors.red;
  if (p.hs === 'normal') return Colors.green;
  if (p.hs === 'inconclusive') return Colors.amber;
  if (p.hr === 'captured') return Colors.statusEcg;
  return Colors.statusNone;
}

export default function PatientScreen() {
  const { state, dispatch, savePatient, openPatient, nextCode, cancelDelete, deletePatient, goBack } = useApp();
  const {
    editing, formName, formAge, formSex, formRhd,
    formHeight, formWeight, formBpSys, formBpDia, formError,
    patients, currentPatient, confirmDelete,
  } = state;

  const [search, setSearch] = useState('');
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const { isPortrait } = useOrientation();
  const S = useStrings();

  // True when any form field differs from the saved patient record.
  // Only meaningful in edit mode — create mode is always enabled.
  const isDirty = useMemo(() => {
    if (!editing || !currentPatient) return false;
    return (
      formName   !== (currentPatient.name   || '')                          ||
      formAge    !== (currentPatient.age    ? String(currentPatient.age)    : '') ||
      formSex    !== (currentPatient.sex    || '')                          ||
      formRhd    !== (currentPatient.rhd    || '')                          ||
      formHeight !== (currentPatient.height ? String(currentPatient.height) : '') ||
      formWeight !== (currentPatient.weight ? String(currentPatient.weight) : '') ||
      formBpSys  !== (currentPatient.bpSys  ? String(currentPatient.bpSys)  : '') ||
      formBpDia  !== (currentPatient.bpDia  ? String(currentPatient.bpDia)  : '')
    );
  }, [editing, currentPatient, formName, formAge, formSex, formRhd,
      formHeight, formWeight, formBpSys, formBpDia]);

  // In edit mode the save button is only active when something changed.
  const isSaveDisabled = editing && !isDirty;

  // Back pressed in edit mode — prompt if dirty.
  function handleBack() {
    if (isDirty) {
      setShowUnsavedModal(true);
    } else {
      goBack();
    }
  }

  const SEX_OPTIONS = [
    { value: 'F', label: S.patient.sexFemale },
    { value: 'M', label: S.patient.sexMale },
    { value: 'O', label: S.patient.sexOther },
  ];

  const RHD_OPTIONS = [
    { value: 'yes',     label: S.common.yes     },
    { value: 'no',      label: S.common.no      },
    { value: 'unknown', label: S.common.unknown  },
  ];

  const studyCode = editing && currentPatient ? currentPatient.id : nextCode();

  function setField(key: string, val: string) {
    dispatch({ type: 'PATCH', patch: { [key]: val, formError: '' } });
  }

  const displayedPatients = patients.filter(p => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  // ── Patient list rows (shared between portrait and landscape) ─────────────
  const patientRows = displayedPatients.length === 0 ? (
    <Text style={styles.returnEmpty}>
      {search.trim() ? S.patient.noMatch : S.patient.noPatients}
    </Text>
  ) : (
    <>
      {displayedPatients.map((p, idx) => (
        <TouchableOpacity
          key={p.id}
          style={[
            styles.returnRow,
            idx < displayedPatients.length - 1 && styles.returnRowDivider,
          ]}
          onPress={() => openPatient(p)}
        >
          <View style={[styles.statusDot, { backgroundColor: statusDotColor(p) }]} />
          <View style={styles.returnInfo}>
            <Text style={styles.returnName}>{p.name}</Text>
            <Text style={styles.returnId}>{p.id}</Text>
          </View>
          <ChevronRight size={14} color={Colors.textLight} />
        </TouchableOpacity>
      ))}
    </>
  );

  // ── Search box (reused in both layouts) ──────────────────────────────────
  const searchBox = (
    <View style={styles.searchBox}>
      <SearchIcon size={15} color={Colors.textLight} />
      <TextInput
        style={styles.searchInput}
        placeholder={S.patient.searchHint}
        placeholderTextColor={Colors.textLight}
        value={search}
        onChangeText={setSearch}
      />
    </View>
  );

  // ── Return card header ────────────────────────────────────────────────────
  const returnHeader = (
    <View style={styles.returnCardHeader}>
      <Text style={styles.returnHeading}>{S.patient.returningTitle}</Text>
      <Text style={styles.returnSub}>{S.patient.returningSub}</Text>
    </View>
  );

  // ── Form card ────────────────────────────────────────────────────────────
  const formCard = (
    <View style={styles.formCard}>
      <View style={styles.formCardHeader}>
        <Text style={styles.formHeading}>
          {editing ? S.patient.editTitle : S.patient.newTitle}
        </Text>
        <Text style={styles.formSub}>{S.patient.formSubtitle}</Text>
      </View>

      {/* Full name + Study code */}
      <View style={styles.nameRow}>
        <View style={styles.nameField}>
          <Text style={styles.label}>{S.patient.fullName} <Text style={styles.req}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder={S.patient.fullNameHint}
            placeholderTextColor={Colors.textFaint}
            value={formName}
            onChangeText={t => setField('formName', t)}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.codeField}>
          <Text style={styles.label}>{S.patient.studyCode}</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{studyCode}</Text>
          </View>
        </View>
      </View>

      {/* Age + Sex */}
      <View style={styles.ageSexRow}>
        <View style={styles.ageField}>
          <Text style={styles.label}>{S.patient.ageYears} <Text style={styles.req}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="—"
            placeholderTextColor={Colors.textFaint}
            value={formAge}
            onChangeText={t => setField('formAge', t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
        <View style={styles.sexField}>
          <Text style={styles.label}>{S.patient.sex} <Text style={styles.req}>*</Text></Text>
          <View style={styles.toggleGroup}>
            {SEX_OPTIONS.map(s => (
              <TouchableOpacity
                key={s.value}
                style={[styles.toggleBtn, formSex === s.value && styles.toggleBtnActive]}
                onPress={() => setField('formSex', s.value)}
              >
                <Text style={[styles.toggleBtnText, formSex === s.value && styles.toggleBtnTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Known prior RHD */}
      <View>
        <Text style={styles.label}>{S.patient.rhdLabel}</Text>
        <View style={styles.toggleGroup}>
          {RHD_OPTIONS.map(r => (
            <TouchableOpacity
              key={r.value}
              style={[styles.toggleBtn, formRhd === r.value && styles.toggleBtnActive]}
              onPress={() => setField('formRhd', r.value)}
            >
              <Text style={[styles.toggleBtnText, formRhd === r.value && styles.toggleBtnTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Vitals */}
      <View style={styles.vitalsSection}>
        <Text style={styles.vitalsKicker}>
          {S.patient.vitals} <Text style={styles.vitalsOptional}>{S.patient.vitalsOptional}</Text>
        </Text>
        <View style={styles.vitalsRow}>
          <View style={styles.vitalField}>
            <Text style={styles.label}>{S.patient.heightCm}</Text>
            <TextInput
              style={styles.input}
              placeholder="—"
              placeholderTextColor={Colors.textFaint}
              value={formHeight}
              onChangeText={t => setField('formHeight', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
          <View style={styles.vitalField}>
            <Text style={styles.label}>{S.patient.weightKg}</Text>
            <TextInput
              style={styles.input}
              placeholder="—"
              placeholderTextColor={Colors.textFaint}
              value={formWeight}
              onChangeText={t => setField('formWeight', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
          <View style={styles.bpField}>
            <Text style={styles.label}>{S.patient.bloodPressure}</Text>
            <View style={styles.bpInputRow}>
              <TextInput
                style={[styles.input, styles.bpHalf]}
                placeholder="Sys"
                placeholderTextColor={Colors.textFaint}
                value={formBpSys}
                onChangeText={t => setField('formBpSys', t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.bpSlash}>/</Text>
              <TextInput
                style={[styles.input, styles.bpHalf]}
                placeholder="Dia"
                placeholderTextColor={Colors.textFaint}
                value={formBpDia}
                onChangeText={t => setField('formBpDia', t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Error */}
      {!!formError && (
        <View style={styles.errorBox}>
          <AlertCircleIcon size={15} color={Colors.red} />
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      )}

      {/* Primary CTA */}
      <TouchableOpacity
        style={[styles.saveBtn, isSaveDisabled && styles.saveBtnDisabled]}
        onPress={savePatient}
        disabled={isSaveDisabled}
      >
        <Text style={styles.saveBtnText}>
          {editing ? S.patient.saveBtn : S.patient.createBtn}
        </Text>
      </TouchableOpacity>

      {/* Danger zone (edit only) */}
      {editing && (
        <View style={styles.dangerZone}>
          <Text style={styles.dangerKicker}>{S.patient.dangerZone}</Text>
          <View style={styles.dangerRow}>
            <View style={styles.dangerInfo}>
              <Text style={styles.dangerTitle}>{S.patient.deleteTitle}</Text>
              <Text style={styles.dangerNote}>{S.patient.deleteNote}</Text>
            </View>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => dispatch({ type: 'SET_FIELD', key: 'confirmDelete', value: true })}
            >
              <TrashIcon size={13} color={Colors.red} />
              <Text style={styles.deleteBtnText}>{S.patient.deleteBtn}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // ── Root render ──────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <Header
        title={editing ? S.patient.editTitle : S.patient.newTitle}
        canBack
        onBack={editing ? handleBack : undefined}
      />

      {editing ? (
        /* Edit mode — centred scrollable single column */
        <ScrollView
          contentContainerStyle={styles.editContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {formCard}
        </ScrollView>

      ) : isPortrait ? (
        /*
         * Portrait — outer ScrollView, cards stack vertically.
         * Returning patient list renders all rows inline (no inner ScrollView)
         * so the outer ScrollView handles all scrolling.
         */
        <ScrollView
          contentContainerStyle={styles.portraitContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {formCard}
          <View style={styles.returnCardPortrait}>
            {returnHeader}
            {searchBox}
            <View style={styles.returnListPortrait}>
              {patientRows}
            </View>
          </View>
        </ScrollView>

      ) : (
        /*
         * Landscape — true side-by-side layout using a View (not ScrollView)
         * so flex children get real height.
         * Form: left column, flex:1, with its own ScrollView.
         * Returning patient: right column, fixed 360px, fills full height.
         * Inner list is a ScrollView that fills remaining card space.
         */
        <View style={styles.landscapeBody}>
          <ScrollView
            style={styles.formCol}
            contentContainerStyle={styles.formColContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {formCard}
          </ScrollView>

          <View style={styles.returnCol}>
            <View style={styles.returnCardLandscape}>
              {returnHeader}
              {searchBox}
              <ScrollView
                style={styles.returnListLandscape}
                showsVerticalScrollIndicator={false}
              >
                {patientRows}
              </ScrollView>
            </View>
          </View>
        </View>
      )}

      {/* ── Unsaved changes modal ── */}
      <Modal
        visible={showUnsavedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnsavedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconWrap, styles.modalIconWrapAmber]}>
              <AlertTriangleIcon size={24} color={Colors.amber} />
            </View>
            <Text style={styles.modalTitle}>{S.patient.unsavedTitle}</Text>
            <Text style={styles.modalBody}>{S.patient.unsavedBody}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowUnsavedModal(false); goBack(); }}
              >
                <Text style={styles.modalCancelText}>{S.patient.discardBtn}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={() => { setShowUnsavedModal(false); savePatient(); }}
              >
                <Text style={styles.modalSaveText}>{S.patient.saveBtn}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete confirmation modal ── */}
      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <TrashIcon size={24} color={Colors.red} />
            </View>
            <Text style={styles.modalTitle}>{S.patient.deleteConfirmTitle}</Text>
            <Text style={styles.modalBody}>
              {currentPatient?.name
                ? `${S.patient.deleteConfirmBody} "${currentPatient.name}"?`
                : S.patient.deleteConfirmBody}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={cancelDelete}>
                <Text style={styles.modalCancelText}>{S.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalDelete} onPress={deletePatient}>
                <TrashIcon size={14} color={Colors.white} />
                <Text style={styles.modalDeleteText}>{S.patient.deleteBtn}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgCanvas },

  // ── Edit mode ─────────────────────────────────────────────────────────────
  editContent: { padding: 24, paddingBottom: 40 },

  // ── Portrait ──────────────────────────────────────────────────────────────
  portraitContent:     { padding: 16, gap: 16, paddingBottom: 40 },
  returnCardPortrait:  {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 22,
  },
  returnListPortrait: { marginTop: 4 },

  // ── Landscape ─────────────────────────────────────────────────────────────
  landscapeBody:   { flex: 1, flexDirection: 'row', padding: 16, gap: 14 },
  formCol:         { flex: 1 },
  formColContent:  { paddingBottom: 12 },
  returnCol:       { width: 340 },
  returnCardLandscape: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 22,
  },
  returnListLandscape: { flex: 1, marginTop: 4 },

  // ── Form card ─────────────────────────────────────────────────────────────
  formCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 24, gap: 20,
  },
  formCardHeader: { gap: 5 },
  formHeading: {
    fontFamily: 'IBMPlexSans-Bold', fontSize: 21, fontWeight: '700',
    color: Colors.textHeading, letterSpacing: -0.25,
  },
  formSub: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400',
    color: Colors.textMid, lineHeight: 19,
  },

  // ── Field helpers ─────────────────────────────────────────────────────────
  label: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 13, fontWeight: '500',
    color: Colors.textDark, marginBottom: 7,
  },
  req:   { color: Colors.red },
  input: {
    height: 48, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 9,
    paddingHorizontal: 13,
    fontFamily: 'IBMPlexSans-Regular', fontSize: 15, fontWeight: '400',
    color: Colors.textDark, backgroundColor: Colors.white,
  },

  // ── Name row ──────────────────────────────────────────────────────────────
  nameRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  nameField: { flex: 1 },
  codeField: { width: 170 },
  codeBox: {
    height: 48, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 9,
    paddingHorizontal: 13, justifyContent: 'center',
    backgroundColor: Colors.bgCanvas,
  },
  codeText: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 15, fontWeight: '400',
    color: Colors.textDark, letterSpacing: 0.8,
  },

  // ── Age + sex ─────────────────────────────────────────────────────────────
  ageSexRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  ageField:  { width: 160 },
  sexField:  { flex: 1 },

  // ── Toggle groups ─────────────────────────────────────────────────────────
  toggleGroup: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1, height: 48, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleBtnActive:     { backgroundColor: Colors.bgCanvas, borderColor: Colors.borderMid },
  toggleBtnText:       { fontFamily: 'IBMPlexSans-Regular', fontSize: 14, fontWeight: '400', color: Colors.textMid },
  toggleBtnTextActive: { fontFamily: 'IBMPlexSans-Medium', fontSize: 14, fontWeight: '500', color: Colors.textDark },

  // ── Vitals ────────────────────────────────────────────────────────────────
  vitalsSection: { gap: 10 },
  vitalsKicker: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 11, fontWeight: '400',
    color: Colors.textMid, letterSpacing: 2, textTransform: 'uppercase',
  },
  vitalsOptional: { fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textLight, letterSpacing: 0 },
  vitalsRow:  { flexDirection: 'row', gap: 12 },
  vitalField: { flex: 1 },
  bpField:    { flex: 1.5 },
  bpInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bpHalf:     { flex: 1 },
  bpSlash:    { fontFamily: 'IBMPlexSans-Regular', fontSize: 20, color: Colors.textLight, marginBottom: 2 },

  // ── Error ─────────────────────────────────────────────────────────────────
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF0EE', borderRadius: 9, padding: 12,
    borderLeftWidth: 3, borderLeftColor: Colors.red,
  },
  errorText: {
    flex: 1, fontFamily: 'IBMPlexSans-Regular', fontSize: 13,
    fontWeight: '400', color: Colors.red,
  },

  // ── CTA button ────────────────────────────────────────────────────────────
  saveBtn: {
    height: 52, backgroundColor: Colors.navy, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.38,
  },
  saveBtnText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 16, fontWeight: '500',
    color: Colors.white, letterSpacing: 0.1,
  },

  // ── Danger zone ───────────────────────────────────────────────────────────
  dangerZone:  { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 20, gap: 10 },
  dangerKicker: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 11, fontWeight: '400',
    color: Colors.red, letterSpacing: 2, textTransform: 'uppercase',
  },
  dangerRow:  { flexDirection: 'row', alignItems: 'center' },
  dangerInfo: { flex: 1, marginRight: 16 },
  dangerTitle: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 14, fontWeight: '400',
    color: Colors.textDark, marginBottom: 3,
  },
  dangerNote: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 12, fontWeight: '400',
    color: Colors.textLight, lineHeight: 18,
  },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9,
    borderWidth: 1.5, borderColor: '#FBBCB8', backgroundColor: Colors.white,
  },
  deleteBtnText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 13, fontWeight: '500',
    color: Colors.red,
  },

  // ── Returning patient card — shared elements ───────────────────────────────
  returnCardHeader: { gap: 5, marginBottom: 16 },
  returnHeading: {
    fontFamily: 'IBMPlexSans-Bold', fontSize: 19, fontWeight: '700',
    color: Colors.textHeading, letterSpacing: -0.2,
  },
  returnSub: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400',
    color: Colors.textMid, lineHeight: 19,
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 44, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 9,
    paddingHorizontal: 13, backgroundColor: Colors.bgCanvas, marginBottom: 4,
  },
  searchInput: {
    flex: 1, fontFamily: 'IBMPlexSans-Regular', fontSize: 14,
    fontWeight: '400', color: Colors.textDark,
  },

  // ── Patient rows ──────────────────────────────────────────────────────────
  returnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 2,
  },
  returnRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  statusDot:  { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  returnInfo: { flex: 1 },
  returnName: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 14, fontWeight: '400',
    color: Colors.textDark,
  },
  returnId: {
    fontFamily: 'IBMPlexMono-Regular', fontSize: 12, fontWeight: '400',
    color: Colors.textLight, marginTop: 2, letterSpacing: 0.3,
  },
  returnEmpty: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 13, fontWeight: '400',
    color: Colors.textLight, fontStyle: 'italic', marginTop: 12,
  },

  // ── Delete confirmation modal ─────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCard: {
    width: 360, backgroundColor: Colors.white, borderRadius: 16,
    padding: 28, alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  modalIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#FFF0EE', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: 'IBMPlexSans-Bold', fontSize: 18, fontWeight: '700',
    color: Colors.textHeading, textAlign: 'center',
  },
  modalBody: {
    fontFamily: 'IBMPlexSans-Regular', fontSize: 14, fontWeight: '400',
    color: Colors.textMid, textAlign: 'center', lineHeight: 21,
  },
  modalActions: {
    flexDirection: 'row', gap: 10, marginTop: 8, width: '100%',
  },
  modalCancel: {
    flex: 1, height: 48, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 15, fontWeight: '500',
    color: Colors.textDark,
  },
  modalDelete: {
    flex: 1, height: 48, borderRadius: 10, backgroundColor: Colors.red,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  modalDeleteText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 15, fontWeight: '500',
    color: Colors.white,
  },
  modalIconWrapAmber: {
    backgroundColor: '#FFF8EC',
  },
  modalSave: {
    flex: 1, height: 48, borderRadius: 10, backgroundColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 15, fontWeight: '500',
    color: Colors.white,
  },
});
