import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QrScanner } from '../components/QrScanner';
import { CameraIcon, WaveformIcon } from '../components/Icons';
import { Colors } from '../theme/colors';
import { SettingsService } from '../services/settingsService';
import { syncRosterNow } from '../services/rosterService';
import { useApp } from '../context/AppContext';

type Mode = 'scan' | 'manual';

export default function ProvisioningScreen() {
  const { dispatch } = useApp();
  const insets = useSafeAreaInsets();

  const [mode,        setMode]        = useState<Mode>('scan');
  const [endpoint,    setEndpoint]    = useState('');
  const [token,       setToken]       = useState('');
  const [deviceId,    setDeviceId]    = useState('');
  const [siteId,      setSiteId]      = useState('');
  const [saving,      setSaving]      = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const scanned = !!(deviceId || siteId);

  function handleQrScanned(raw: string) {
    setScannerOpen(false);
    try {
      const data = JSON.parse(raw) as { e?: string; t?: string; d?: string; s?: string };
      if (!data.e || !data.t || !data.d || !data.s) throw new Error('Incomplete payload');
      setEndpoint(data.e);
      setToken(data.t);
      setDeviceId(data.d);
      setSiteId(data.s);
    } catch {
      Alert.alert(
        'Invalid QR',
        'This is not a CardioSleeve device provisioning QR code.\n\nGenerate it from Admin → Devices in the dashboard.',
      );
    }
  }

  async function handleSave() {
    const ep = endpoint.trim();
    const tk = token.trim();
    const di = deviceId.trim();
    const si = siteId.trim();
    if (!ep || !tk || !di || !si) {
      Alert.alert('Incomplete', 'Scan the QR code or fill in all four fields to continue.');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        SettingsService.setStage2Endpoint(ep),
        SettingsService.setStage2Token(tk),
        SettingsService.setDeviceId(di),
        SettingsService.setSiteId(si),
      ]);
      dispatch({ type: 'PATCH', patch: { deviceId: di, deviceSiteId: si } });

      const result = await syncRosterNow();
      let rosterLine = '';
      if (result.ok) {
        const { created, updated, skipped } = result;
        if (created + updated > 0) {
          rosterLine = `${created} worker${created !== 1 ? 's' : ''} synced${updated > 0 ? `, ${updated} updated` : ''}${skipped > 0 ? `, ${skipped} skipped (no PIN set)` : ''}.`;
        } else if (skipped > 0) {
          rosterLine = `${skipped} worker(s) found but none have a PIN set in the dashboard yet.`;
        } else {
          rosterLine = 'Roster is empty — add workers in the dashboard.';
        }
      } else {
        rosterLine = 'Roster sync will retry on next launch.';
      }

      Alert.alert(
        'Device ready',
        `${di} has been provisioned for site ${si}.\n\n${rosterLine}`,
        [{ text: 'Continue', onPress: () => dispatch({ type: 'SET_VIEW', view: 'login' }) }],
      );
    } catch {
      Alert.alert('Error', 'Failed to save provisioning settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.logoBox}>
            <WaveformIcon size={28} color={Colors.white} />
          </View>
          <Text style={styles.brandName}>CMU-AFRICA AI  HEALTH LAB</Text>
          <Text style={styles.brandSub}>RHD SCREENING</Text>
        </View>

        <View style={styles.card}>
          <View>
            <Text style={styles.heading}>Set up this device</Text>
            <Text style={styles.sub}>
              Connect this tablet to a site. Only needs to be done once.
            </Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'scan' && styles.toggleBtnActive]}
              onPress={() => setMode('scan')}
            >
              <Text style={[styles.toggleText, mode === 'scan' && styles.toggleTextActive]}>
                Scan QR
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'manual' && styles.toggleBtnActive]}
              onPress={() => setMode('manual')}
            >
              <Text style={[styles.toggleText, mode === 'manual' && styles.toggleTextActive]}>
                Enter manually
              </Text>
            </TouchableOpacity>
          </View>

          {/* Scan mode */}
          {mode === 'scan' && (
            <View style={styles.section}>
              <TouchableOpacity style={styles.qrBtn} onPress={() => setScannerOpen(true)}>
                <CameraIcon size={18} color={Colors.white} />
                <Text style={styles.qrBtnText}>
                  {scanned ? 'Scan again' : 'Scan Provisioning QR Code'}
                </Text>
              </TouchableOpacity>

              {scanned && (
                <View style={styles.scannedBox}>
                  <Text style={styles.scannedHeader}>QR scanned — ready to provision</Text>
                  <View style={styles.scannedRow}>
                    <Text style={styles.scannedKey}>Device</Text>
                    <Text style={styles.scannedVal}>{deviceId}</Text>
                  </View>
                  <View style={styles.scannedRow}>
                    <Text style={styles.scannedKey}>Site</Text>
                    <Text style={styles.scannedVal}>{siteId}</Text>
                  </View>
                  <View style={styles.scannedRow}>
                    <Text style={styles.scannedKey}>Endpoint</Text>
                    <Text style={styles.scannedVal} numberOfLines={1}>{endpoint}</Text>
                  </View>
                </View>
              )}

              {!scanned && (
                <Text style={styles.hint}>
                  Generate the QR from Admin → Devices in the dashboard.
                </Text>
              )}
            </View>
          )}

          {/* Manual mode */}
          {mode === 'manual' && (
            <View style={styles.section}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>API Endpoint</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={endpoint}
                  onChangeText={setEndpoint}
                  placeholder="https://api.example.rw"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Site Bearer Token</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={token}
                  onChangeText={setToken}
                  placeholder="Paste JWT token from dashboard"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldRow}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Device ID</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={deviceId}
                    onChangeText={t => setDeviceId(t.toUpperCase())}
                    placeholder="CHUK-T01"
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Site ID</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={siteId}
                    onChangeText={t => setSiteId(t.toUpperCase())}
                    placeholder="CHUK"
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={styles.saveBtnText}>Provision Device</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Health workers do not need to complete this step.
        </Text>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <QrScanner onScanned={handleQrScanned} onClose={() => setScannerOpen(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.navy,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 18,
  },

  brand: {
    alignItems: 'center',
    gap: 6,
  },
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  brandName: {
    fontSize: 19,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.white,
    letterSpacing: -0.3,
  },
  brandSub: {
    fontSize: 12,
    fontFamily: 'IBMPlexSans-Regular',
    fontWeight: '400',
    color: 'rgba(255,255,255,0.5)',
  },

  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    gap: 18,
  },
  heading: {
    fontSize: 20,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.textDark,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    color: Colors.textMid,
    lineHeight: 19,
  },

  // Toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bgWarm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  toggleText: {
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Regular',
    fontWeight: '400',
    color: Colors.textMid,
  },
  toggleTextActive: {
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.textDark,
  },

  // Mode content
  section: {
    gap: 14,
  },

  // Scan mode
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: Colors.navy,
    borderRadius: 10,
    paddingVertical: 13,
  },
  qrBtnText: {
    fontSize: 14,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.white,
  },
  hint: {
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'center',
  },
  scannedBox: {
    backgroundColor: '#EAF5FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B6D9F5',
    padding: 14,
    gap: 7,
  },
  scannedHeader: {
    fontSize: 11,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  scannedRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scannedKey: {
    fontSize: 12,
    fontFamily: 'IBMPlexMono-Regular',
    fontWeight: '400',
    color: Colors.textLight,
    width: 60,
  },
  scannedVal: {
    fontSize: 12,
    fontFamily: 'IBMPlexMono-Regular',
    fontWeight: '400',
    color: Colors.textDark,
    flex: 1,
  },

  // Manual mode
  field: {
    gap: 5,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'IBMPlexMono-Regular',
    fontWeight: '400',
    color: Colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'IBMPlexMono-Regular',
    fontWeight: '400',
    color: Colors.textDark,
    backgroundColor: Colors.bgWarm,
    minHeight: 42,
  },

  // Save
  saveBtn: {
    backgroundColor: Colors.navy,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.white,
    letterSpacing: 0.1,
  },

  footer: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
});
