import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { PlayIcon, VideoIcon, XIcon } from '../components/Icons';
import { Colors } from '../theme/colors';
import { getSiteById } from '../constants/sites';
import { useStrings } from '../i18n/useStrings';

export default function GuideOverlay() {
  const { state, startCaptureFromGuide, dispatch } = useApp();
  const { site, modality } = state;
  const S = useStrings();

  const siteInfo = site ? getSiteById(site) : null;
  const mLabel   = modality === 'pcg' ? S.common.auscultation : S.history.colHeartRhythm;

  function skip() {
    dispatch({ type: 'PATCH', patch: { showGuide: false } });
    startCaptureFromGuide();
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Close / skip */}
          <TouchableOpacity style={styles.closeBtn} onPress={skip}>
            <XIcon size={16} color={Colors.textMid} />
          </TouchableOpacity>

          {/* Tag */}
          <View style={styles.tagRow}>
            <VideoIcon size={13} color={Colors.teal} />
            <Text style={styles.tag}>{mLabel} · Placement guide</Text>
          </View>

          {/* Site label */}
          <Text style={styles.siteLabel}>{siteInfo?.label ?? site ?? '—'}</Text>
          <Text style={styles.siteInstr}>{siteInfo?.instr ?? ''}</Text>

          {/* Video placeholder */}
          <View style={styles.videoBox}>
            <PlayIcon size={32} color="rgba(255,255,255,0.7)" />
            <Text style={styles.videoPlaceholder}>
              Guide video · {siteInfo?.label ?? site}
            </Text>
            <Text style={styles.videoNote}>
              Clinical team to supply positioning video for each site.
            </Text>
          </View>

          {/* Actions */}
          <TouchableOpacity style={styles.startBtn} onPress={startCaptureFromGuide}>
            <Text style={styles.startBtnText}>{S.session.startCapture}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={skip}>
            <Text style={styles.skipText}>{S.session.skipGuide}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(11,37,69,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    width: 520, backgroundColor: Colors.white, borderRadius: 18, padding: 30,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 28, elevation: 12,
  },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgWarm,
    alignItems: 'center', justifyContent: 'center',
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  tag: { fontSize: 12, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.teal, textTransform: 'uppercase', letterSpacing: 0.6 },
  siteLabel: { fontSize: 22, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark, letterSpacing: -0.3, marginBottom: 6 },
  siteInstr: { fontSize: 14, color: Colors.textMid, lineHeight: 21, marginBottom: 20 },
  videoBox: {
    height: 220, backgroundColor: '#0B2545', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 22, gap: 10,
  },
  videoPlaceholder: { fontSize: 16, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: 'rgba(255,255,255,0.65)' },
  videoNote: { fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', maxWidth: 300 },
  startBtn: {
    height: 48, backgroundColor: Colors.navy, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  startBtnText: { fontSize: 15, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.white },
  skipText: { fontSize: 13, color: Colors.textMid, textAlign: 'center' },
});
