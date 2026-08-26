import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';
import { Colors } from '../theme/colors';
import { AUSCULTATION_SITES, ECG_LEADS } from '../constants/sites';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';
import { CheckIcon } from '../components/Icons';
import GuideOverlay from './GuideOverlay';

export default function PositionSelectScreen() {
  const { state, selectSite } = useApp();
  const { modality, currentPatient, showGuide, sessionCapturedSites, sessionCapturedLeads } = state;
  const { isPortrait, width } = useOrientation();
  const S = useStrings();

  const isPcg       = modality === 'pcg';
  const cards       = isPcg ? AUSCULTATION_SITES : ECG_LEADS;
  const mLabel      = isPcg ? S.session.heartSound : S.session.heartRhythm;
  const capturedSet = new Set(isPcg ? sessionCapturedSites : sessionCapturedLeads);
  const doneCount   = capturedSet.size;
  const totalCount  = cards.length;
  const suffix      = isPcg ? S.positionSelect.progressSuffixPcg : S.positionSelect.progressSuffixEcg;

  return (
    <View style={styles.root}>
      <Header title={isPcg ? S.positionSelect.titlePcg : S.positionSelect.titleEcg} canBack />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Breadcrumb */}
        <Text style={styles.breadcrumb}>
          {mLabel} · {currentPatient?.name ?? '—'}
        </Text>

        {/* Heading */}
        <Text style={styles.heading}>
          {isPcg ? S.positionSelect.titlePcg : S.positionSelect.titleEcg}
        </Text>
        <Text style={styles.note}>
          {S.positionSelect.subtitle}
        </Text>

        {/* Progress pill — shown after at least one capture */}
        {doneCount > 0 && (
          <View style={styles.progressPill}>
            <CheckIcon size={13} color={Colors.teal} />
            <Text style={styles.progressText}>
              {doneCount} / {totalCount} {suffix}
            </Text>
          </View>
        )}

        {/* Card grid */}
        <View style={styles.grid}>
          {cards.map(card => {
            const done = capturedSet.has(card.id);
            return (
              <TouchableOpacity
                key={card.id}
                style={[
                  styles.siteCard,
                  { width: isPortrait ? (width < 600 ? '100%' : '47%') : '31%' },
                  done && styles.siteCardDone,
                ]}
                onPress={() => selectSite(card.id)}
                activeOpacity={done ? 0.6 : 0.75}
              >
                <View style={styles.cardTitleRow}>
                  <View style={[styles.letterBox, done && styles.letterBoxDone]}>
                    {done
                      ? <CheckIcon size={16} color={Colors.teal} />
                      : <Text style={styles.letterText}>{card.label.charAt(0).toUpperCase()}</Text>
                    }
                  </View>
                  <Text style={[styles.siteLabel, done && styles.siteLabelDone]}>{card.label}</Text>
                  {done && (
                    <View style={styles.capturedBadge}>
                      <Text style={styles.capturedBadgeText}>{S.positionSelect.capturedBadge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.siteInstr, done && styles.siteInstrDone]}>{card.instr}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {showGuide && <GuideOverlay />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgWarm },
  content: { padding: 24, paddingBottom: 40 },

  breadcrumb: { fontSize: 13, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textMid, marginBottom: 8 },
  heading: {
    fontSize: 27, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.textDark,
    letterSpacing: -0.27, marginBottom: 8, lineHeight: 35,
  },
  note: { fontSize: 13, color: Colors.textLight, lineHeight: 20, marginBottom: 16 },

  progressPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginBottom: 20,
    backgroundColor: `${Colors.teal}12`, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: `${Colors.teal}30`,
  },
  progressText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 13, fontWeight: '500', color: Colors.teal,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },

  siteCard: {
    minWidth: 220,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 20, gap: 14,
  },
  siteCardDone: {
    backgroundColor: `${Colors.teal}06`,
    borderColor: `${Colors.teal}40`,
    opacity: 0.85,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  letterBox: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: Colors.bgWarm, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  letterBoxDone: {
    backgroundColor: `${Colors.teal}12`,
    borderColor: `${Colors.teal}40`,
  },
  letterText: { fontSize: 16, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.textDark },

  siteLabel:      { fontSize: 16, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark, flex: 1 },
  siteLabelDone:  { color: Colors.textMid },

  capturedBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    backgroundColor: `${Colors.teal}15`, borderWidth: 1, borderColor: `${Colors.teal}35`,
  },
  capturedBadgeText: {
    fontFamily: 'IBMPlexSans-Medium', fontSize: 11, fontWeight: '500', color: Colors.teal,
  },

  siteInstr:      { fontSize: 13, color: Colors.textMid, lineHeight: 20 },
  siteInstrDone:  { color: Colors.textLight },
});
