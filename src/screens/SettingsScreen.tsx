import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Switch, ScrollView, StyleSheet,
  ActivityIndicator, Animated, TextInput, Alert, Modal,
} from 'react-native';
import { QrScanner } from '../components/QrScanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';
import { BluetoothIcon, LogoutIcon, ChevronDown, CameraIcon } from '../components/Icons';
import { Colors } from '../theme/colors';
import { setTtsLanguage } from '../services/tts';
import { BluetoothService, BT_STACK } from '../services/btAdapter';
import { BleService } from '../services/bleService';
import type { BtDevice } from '../services/btAdapter';
import { useOrientation } from '../hooks/useOrientation';
import { useStrings } from '../i18n/useStrings';
import type { SupportedLang } from '../services/tts';
import { SettingsService } from '../services/settingsService';
import { syncRosterNow } from '../services/rosterService';

// ── Device list with custom persistent scrollbar ──────────────────────────────
// Uses Animated.event so scroll position drives the thumb directly on the JS
// Animated layer — no setState on every scroll frame, so the outer page never
// re-renders or stutters while the inner list is being scrolled.
// The scrollbar is a flex-row sibling of the ScrollView, never overlapping content.

const LIST_MAX_H   = 264;
const VISIBLE_ROWS = 3;

function DeviceScrollList({ count, children }: { count: number; children: React.ReactNode }) {
  const animY      = useRef(new Animated.Value(0)).current;
  const [contentH,   setContentH]   = useState(0);
  const [containerH, setContainerH] = useState(LIST_MAX_H);
  const [atEnd,      setAtEnd]      = useState(false);

  const overflows = contentH > containerH + 4;
  const showMore  = overflows && !atEnd && count > VISIBLE_ROWS;

  const thumbH = overflows
    ? Math.max(32, containerH * (containerH / contentH))
    : 0;

  const thumbTranslate = animY.interpolate({
    inputRange:  [0, Math.max(1, contentH - containerH)],
    outputRange: [0, containerH - thumbH],
    extrapolate: 'clamp',
  });

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: animY } } }],
    {
      useNativeDriver: false,
      listener: (e: any) => {
        const y = e.nativeEvent.contentOffset.y;
        setAtEnd(contentH - y - containerH < 20);
      },
    },
  );

  return (
    <>
      {/* Row: [scroll content] [scrollbar track] — no overlap */}
      <View style={listSt.row}>
        <View style={listSt.scrollWrapper}>
          <ScrollView
            style={listSt.scroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onContentSizeChange={(_, h) => setContentH(h)}
            onLayout={e => setContainerH(e.nativeEvent.layout.height)}
          >
            {children}
          </ScrollView>
          {showMore && <View style={listSt.fade} pointerEvents="none" />}
        </View>

        {/* Persistent scrollbar — sibling, never overlays content */}
        {overflows && (
          <View style={listSt.track}>
            <Animated.View
              style={[listSt.thumb, {
                height: thumbH,
                transform: [{ translateY: thumbTranslate }],
              }]}
            />
          </View>
        )}
      </View>

      {showMore && (
        <View style={listSt.moreRow}>
          <ChevronDown size={12} color={Colors.textMute} />
          <Text style={listSt.moreText}>{count - VISIBLE_ROWS} more</Text>
        </View>
      )}
    </>
  );
}

const listSt = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'stretch' },
  scrollWrapper: { flex: 1, position: 'relative' },
  // maxHeight on the ScrollView directly — reliable on Android
  scroll:        { maxHeight: LIST_MAX_H },
  track: {
    width: 6,
    alignSelf: 'stretch',
    marginVertical: 6,
    marginLeft: 4,
    backgroundColor: Colors.borderLight,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    left: 1, right: 1,
    borderRadius: 2,
    backgroundColor: Colors.borderMid,
  },
  fade: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  moreRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 4,
  },
  moreText: {
    fontSize: 11, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
    color: Colors.textMute,
  },
});

// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGES: { code: SupportedLang; label: string }[] = [
  { code: 'en', label: 'English'     },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'fr', label: 'Français'    },
  { code: 'sw', label: 'Kiswahili'   },
];

export default function SettingsScreen() {
  const { state, dispatch, logout, toggleVideo, resetLaunch } = useApp();
  const { lang, conn, deviceName, videoGuidesEnabled, worker } = state;
  const insets = useSafeAreaInsets();
  const { isPortrait } = useOrientation();
  const S = useStrings();

  const [pairedDevices,  setPairedDevices]  = useState<BtDevice[]>([]);
  const [discovered,     setDiscovered]     = useState<BtDevice[]>([]);
  const [scanning,       setScanning]       = useState(false);
  const [connecting,     setConnecting]     = useState<string | null>(null);
  const [forgetting,     setForgetting]     = useState<string | null>(null);

  // Device provisioning fields
  const [endpoint,    setEndpoint]    = useState('');
  const [token,       setToken]       = useState('');
  const [deviceId,    setDeviceId]    = useState('');
  const [siteId,      setSiteId]      = useState('');
  const [provMode,      setProvMode]      = useState<'scan' | 'manual'>('scan');
  const [provSaving,   setProvSaving]   = useState(false);
  const [rosterSyncing, setRosterSyncing] = useState(false);
  const [scannerOpen,  setScannerOpen]  = useState(false);

  const loadPaired = useCallback(async () => {
    const devices = await BluetoothService.getPairedDevices();
    setPairedDevices(devices);
  }, []);

  useEffect(() => { loadPaired(); }, [loadPaired]);

  useEffect(() => {
    SettingsService.getAll().then(s => {
      setEndpoint(s.stage2Endpoint);
      setToken(s.stage2Token);
      setDeviceId(s.deviceId);
      setSiteId(s.siteId);
    }).catch(() => {});
  }, []);

  async function handleConnect(address: string) {
    setConnecting(address);
    await BluetoothService.connectToDevice(address);
    setConnecting(null);
  }

  async function handleDisconnect() {
    await BluetoothService.disconnect();
  }

  async function handleScan() {
    setScanning(true);
    setDiscovered([]);
    // In BLE mode register a progressive callback so devices appear as discovered.
    if (BT_STACK === 'ble') {
      BleService.onDiscoveredDevice(d =>
        setDiscovered(prev => prev.some(x => x.address === d.address) ? prev : [...prev, d]),
      );
    }
    const found = await BluetoothService.startDiscovery();
    if (BT_STACK === 'ble') BleService.onDiscoveredDevice(null);
    setDiscovered(found);
    setScanning(false);
  }

  function handleForget(device: BtDevice) {
    Alert.alert(
      'Forget device?',
      `Remove "${device.name ?? device.address}" from paired devices? You will need to pair it again to use it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            try {
              setForgetting(device.address);
              await BluetoothService.forgetDevice(device.address);
              await loadPaired();
            } finally {
              setForgetting(null);
            }
          },
        },
      ],
    );
  }

  async function handleStopScan() {
    await BluetoothService.stopDiscovery();
    setScanning(false);
  }

  function pickLang(code: SupportedLang) {
    setTtsLanguage(code);
    dispatch({ type: 'SET_LANG', lang: code });
  }

  const isConn    = conn === 'connected';
  const connColor = isConn ? Colors.green : conn === 'reconnecting' ? Colors.amber : Colors.red;
  const connLabel = isConn ? `Connected · ${deviceName}` : conn === 'reconnecting' ? 'Reconnecting…' : 'Not found';
  const workerAvatar = (worker ?? '?').charAt(0).toUpperCase();

  const availablePaired = pairedDevices.filter(
    d => !(isConn && d.address === BluetoothService.getConnectedDevice()?.address),
  );

  function handleQrScanned(raw: string) {
    setScannerOpen(false);
    try {
      // Device QR payload: {"e":"<endpoint>","t":"<token>","d":"<deviceId>","s":"<siteId>"}
      const data = JSON.parse(raw) as { e?: string; t?: string; d?: string; s?: string };
      if (!data.e || !data.t || !data.d || !data.s) throw new Error('Incomplete QR payload');
      setEndpoint(data.e);
      setToken(data.t);
      setDeviceId(data.d);
      setSiteId(data.s);
      Alert.alert(
        'QR Scanned',
        `Fields filled in for device "${data.d}" (site "${data.s}"). Tap Save Provisioning to apply.`,
        [{ text: 'OK' }],
      );
    } catch {
      Alert.alert('Invalid QR', 'This QR code is not a CardioSleeve device provisioning code.\n\nGenerate a QR from the Devices page in the dashboard (not the Roster page).');
    }
  }

  async function saveProvisioning() {
    setProvSaving(true);
    try {
      await Promise.all([
        SettingsService.setStage2Endpoint(endpoint.trim()),
        SettingsService.setStage2Token(token.trim()),
        SettingsService.setDeviceId(deviceId.trim()),
        SettingsService.setSiteId(siteId.trim()),
      ]);
      dispatch({ type: 'PATCH', patch: { deviceSiteId: siteId.trim() } });

      // Immediately sync the roster so CHWs can log in without restarting the app.
      const result = await syncRosterNow();
      if (result.ok) {
        const { created, updated, skipped } = result;
        const lines: string[] = ['Device provisioning settings saved.'];
        if (created + updated > 0) {
          lines.push(`Roster synced: ${created} new, ${updated} updated${skipped > 0 ? `, ${skipped} skipped (no PIN)` : ''}.`);
        } else if (skipped > 0) {
          lines.push(`Roster received but ${skipped} worker(s) have no PIN set in the dashboard yet.`);
        } else {
          lines.push('Roster is empty — no workers found for this site.');
        }
        Alert.alert('Saved', lines.join('\n'));
      } else if (result.reason === 'not_configured') {
        Alert.alert('Saved', 'Device provisioning settings saved.\n\nRoster sync skipped — check that the endpoint, token, and device ID are correct.');
      } else {
        Alert.alert('Saved', `Device provisioning settings saved.\n\nRoster sync failed: ${result.message}\n\nThe app will retry roster sync on next launch.`);
      }
    } catch {
      Alert.alert('Error', 'Failed to save provisioning settings.');
    } finally {
      setProvSaving(false);
    }
  }

  async function handleManualRosterSync() {
    setRosterSyncing(true);
    try {
      const result = await syncRosterNow();
      if (result.ok) {
        const { created, updated, skipped } = result;
        const summary = created + updated === 0
          ? skipped > 0
            ? `${skipped} worker(s) found but none have a PIN set in the dashboard yet.`
            : 'No workers found for this site.'
          : `${created} new, ${updated} updated${skipped > 0 ? `, ${skipped} skipped (no PIN)` : ''}.`;
        Alert.alert('Roster Synced', summary);
      } else {
        Alert.alert(
          'Sync Failed',
          result.reason === 'not_configured'
            ? 'Check that the endpoint, token, and device ID are saved correctly.'
            : result.message,
        );
      }
    } finally {
      setRosterSyncing(false);
    }
  }

  // ── Reusable card sections ────────────────────────────────────────────────

  const scanned = !!(deviceId || siteId);

  const provisioningCard = (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device Provisioning</Text>
        <Text style={[styles.cardNote, { marginTop: -6 }]}>
          Set by a supervisor or admin when deploying this tablet to a site.
        </Text>

        {/* Mode toggle */}
        <View style={styles.provToggle}>
          <TouchableOpacity
            style={[styles.provToggleBtn, provMode === 'scan' && styles.provToggleBtnActive]}
            onPress={() => setProvMode('scan')}
          >
            <Text style={[styles.provToggleText, provMode === 'scan' && styles.provToggleTextActive]}>
              Scan QR
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.provToggleBtn, provMode === 'manual' && styles.provToggleBtnActive]}
            onPress={() => setProvMode('manual')}
          >
            <Text style={[styles.provToggleText, provMode === 'manual' && styles.provToggleTextActive]}>
              Enter manually
            </Text>
          </TouchableOpacity>
        </View>

        {/* Scan mode */}
        {provMode === 'scan' && (
          <>
            <TouchableOpacity
              style={styles.qrScanBtn}
              onPress={() => setScannerOpen(true)}
            >
              <CameraIcon size={17} color={Colors.white} />
              <Text style={styles.qrScanBtnText}>
                {scanned ? 'Scan again' : 'Scan Provisioning QR Code'}
              </Text>
            </TouchableOpacity>

            {scanned ? (
              <View style={styles.provScannedBox}>
                <Text style={styles.provScannedHeader}>QR scanned — ready to save</Text>
                <View style={styles.provScannedRow}>
                  <Text style={styles.provScannedKey}>Device</Text>
                  <Text style={styles.provScannedVal}>{deviceId}</Text>
                </View>
                <View style={styles.provScannedRow}>
                  <Text style={styles.provScannedKey}>Site</Text>
                  <Text style={styles.provScannedVal}>{siteId}</Text>
                </View>
                <View style={styles.provScannedRow}>
                  <Text style={styles.provScannedKey}>Endpoint</Text>
                  <Text style={styles.provScannedVal} numberOfLines={1}>{endpoint}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.provHint}>
                Generate the QR from Admin → Devices in the dashboard.
              </Text>
            )}
          </>
        )}

        {/* Manual mode */}
        {provMode === 'manual' && (
          <>
            <View style={styles.provField}>
              <Text style={styles.provLabel}>API Endpoint</Text>
              <TextInput
                style={styles.provInput}
                value={endpoint}
                onChangeText={setEndpoint}
                placeholder="https://api.example.rw"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            <View style={styles.provField}>
              <Text style={styles.provLabel}>Site Bearer Token</Text>
              <TextInput
                style={styles.provInput}
                value={token}
                onChangeText={setToken}
                placeholder="Paste JWT token from Dashboard"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.provFieldRow}>
              <View style={[styles.provField, { flex: 1 }]}>
                <Text style={styles.provLabel}>Device ID</Text>
                <TextInput
                  style={styles.provInput}
                  value={deviceId}
                  onChangeText={t => setDeviceId(t.toUpperCase())}
                  placeholder="CHUK-T01"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              <View style={[styles.provField, { flex: 1 }]}>
                <Text style={styles.provLabel}>Site ID</Text>
                <TextInput
                  style={styles.provInput}
                  value={siteId}
                  onChangeText={t => setSiteId(t.toUpperCase())}
                  placeholder="CHUK"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.scanBtn, provSaving && { opacity: 0.6 }]}
          onPress={saveProvisioning}
          disabled={provSaving}
        >
          {provSaving
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Text style={styles.scanBtnText}>Save Provisioning</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.rosterSyncBtn, rosterSyncing && { opacity: 0.6 }]}
          onPress={handleManualRosterSync}
          disabled={rosterSyncing}
        >
          {rosterSyncing
            ? <ActivityIndicator size="small" color={Colors.navy} />
            : <Text style={styles.rosterSyncBtnText}>Sync Roster Now</Text>
          }
        </TouchableOpacity>
      </View>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <QrScanner
          onScanned={handleQrScanned}
          onClose={() => setScannerOpen(false)}
        />
      </Modal>
    </>
  );

  const bluetoothCard = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{S.settings.bluetooth}</Text>

      <View style={styles.deviceBox}>
        <View style={[styles.btIconBox, isConn && { borderColor: Colors.green }]}>
          <BluetoothIcon size={16} color={isConn ? Colors.green : Colors.textMid} />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>
            {isConn ? deviceName || 'CardioSleeve' : S.settings.noDevice}
          </Text>
          <Text style={[styles.deviceStatus, { color: connColor }]}>{connLabel}</Text>
        </View>
        {isConn && (
          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <Text style={styles.disconnectBtnText}>{S.settings.disconnect}</Text>
          </TouchableOpacity>
        )}
        {conn === 'reconnecting' && (
          <ActivityIndicator size="small" color={Colors.amber} />
        )}
      </View>

      {availablePaired.length > 0 && (
        <View style={styles.deviceSection}>
          <View style={styles.deviceSectionHeader}>
            <Text style={styles.deviceSectionTitle}>
              {BT_STACK === 'ble' ? 'Known BLE Devices' : S.settings.pairedDevices}
            </Text>
            <TouchableOpacity onPress={loadPaired}>
              <Text style={styles.refreshLink}>{S.settings.refresh}</Text>
            </TouchableOpacity>
          </View>
          <DeviceScrollList count={availablePaired.length}>
            <View style={styles.deviceListInner}>
              {availablePaired.map(d => (
                <View key={d.address} style={styles.deviceRow}>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{d.name ?? d.address}</Text>
                    <Text style={styles.deviceAddress}>{d.address}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.connectBtn, connecting === d.address && styles.connectBtnDisabled]}
                    onPress={() => handleConnect(d.address)}
                    disabled={connecting !== null || forgetting !== null}
                  >
                    {connecting === d.address
                      ? <ActivityIndicator size="small" color={Colors.navy} />
                      : <Text style={styles.connectBtnText}>{S.settings.connect}</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.forgetBtn, forgetting === d.address && styles.forgetBtnDisabled]}
                    onPress={() => handleForget(d)}
                    disabled={forgetting !== null || connecting !== null}
                  >
                    {forgetting === d.address
                      ? <ActivityIndicator size="small" color={Colors.red} />
                      : <Text style={styles.forgetBtnText}>Forget</Text>
                    }
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </DeviceScrollList>
        </View>
      )}

      <View style={styles.deviceSection}>
        <View style={styles.deviceSectionHeader}>
          <Text style={styles.deviceSectionTitle}>
            {scanning ? S.settings.scanning : S.settings.findDevices}
          </Text>
          {scanning
            ? <TouchableOpacity onPress={handleStopScan}>
                <Text style={styles.refreshLink}>{S.settings.stop}</Text>
              </TouchableOpacity>
            : <TouchableOpacity style={styles.scanBtn} onPress={handleScan} disabled={scanning}>
                <Text style={styles.scanBtnText}>{S.settings.scan}</Text>
              </TouchableOpacity>
          }
        </View>
        {scanning && <Text style={styles.scanNote}>{S.settings.scanNote}</Text>}
        {discovered.length > 0 && (
          <DeviceScrollList count={discovered.length}>
            <View style={styles.deviceListInner}>
              {discovered.map(d => (
                <View key={d.address} style={styles.deviceRow}>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{d.name ?? S.common.unknown}</Text>
                    <Text style={styles.deviceAddress}>{d.address}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.connectBtn, connecting === d.address && styles.connectBtnDisabled]}
                    onPress={() => handleConnect(d.address)}
                    disabled={connecting !== null}
                  >
                    {connecting === d.address
                      ? <ActivityIndicator size="small" color={Colors.navy} />
                      : <Text style={styles.connectBtnText}>{S.settings.connect}</Text>
                    }
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </DeviceScrollList>
        )}
        {!scanning && discovered.length === 0 && (
          <Text style={styles.scanNote}>{S.settings.noDevicesFound}</Text>
        )}
      </View>
    </View>
  );

  const languageCard = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{S.settings.language}</Text>
      <View style={styles.langRow}>
        {LANGUAGES.map(l => (
          <TouchableOpacity
            key={l.code}
            style={[styles.langBtn, lang === l.code && styles.langBtnActive]}
            onPress={() => pickLang(l.code)}
          >
            <Text style={[styles.langBtnText, lang === l.code && styles.langBtnTextActive]}>
              {l.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const accountCard = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{S.settings.account}</Text>
      <View style={styles.accountRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{workerAvatar}</Text>
        </View>
        <View style={styles.accountInfo}>
          <Text style={styles.accountKicker}>{S.settings.signedInAs}</Text>
          <Text style={styles.accountId}>{worker ?? '—'}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={logout}>
          <LogoutIcon size={14} color={Colors.red} />
          <Text style={styles.signOutText}>{S.settings.signOut}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Portrait layout ────────────────────────────────────────────────────────

  if (isPortrait) {
    return (
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        <Header title={S.settings.title} canBack />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Bluetooth — full width */}
          {bluetoothCard}

          {/* Device provisioning — full width */}
          {provisioningCard}

          {/* Video Guides — full width */}
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLabel}>
                <Text style={styles.cardTitle}>{S.settings.videoGuides}</Text>
                <Text style={styles.cardNote}>{S.settings.videoGuidesNote}</Text>
              </View>
              <Switch
                value={videoGuidesEnabled}
                onValueChange={toggleVideo}
                trackColor={{ false: Colors.border, true: Colors.navy }}
                thumbColor={Colors.white}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.settingRow}>
              <View style={styles.settingLabel}>
                <Text style={styles.settingTitle}>{S.settings.resetLaunch}</Text>
                <Text style={styles.settingNote}>{S.settings.resetLaunchNote}</Text>
              </View>
              <TouchableOpacity style={styles.resetBtn} onPress={resetLaunch}>
                <Text style={styles.resetBtnText}>{S.settings.reset}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Language — full width */}
          {languageCard}

          {/* Account — full width */}
          {accountCard}

        </ScrollView>
      </View>
    );
  }

  // ── Landscape layout (two columns) ────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <Header title={S.settings.title} canBack />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>

          {/* Left column */}
          <View style={styles.col}>
                {accountCard}
            {bluetoothCard}
          </View>

          {/* Right column */}
          <View style={styles.col}>
                {languageCard}
       

            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingLabel}>
                  <Text style={styles.settingTitle}>{S.settings.videoGuides}</Text>
                  <Text style={styles.settingNote}>{S.settings.videoGuidesNote}</Text>
                </View>
                <Switch
                  value={videoGuidesEnabled}
                  onValueChange={toggleVideo}
                  trackColor={{ false: Colors.border, true: Colors.navy }}
                  thumbColor={Colors.white}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.settingRow}>
                <View style={styles.settingLabel}>
                  <Text style={styles.settingTitle}>{S.settings.resetLaunch}</Text>
                  <Text style={styles.settingNote}>{S.settings.resetLaunchNote}</Text>
                </View>
                <TouchableOpacity style={styles.resetBtn} onPress={resetLaunch}>
                  <Text style={styles.resetBtnText}>{S.settings.reset}</Text>
                </TouchableOpacity>
              </View>
            </View>
        
     {provisioningCard}
        

          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bgWarm },
  content: { flexGrow: 1, padding: 20, paddingBottom: 32, gap: 16 },

  // Landscape two-column grid
  grid: { flex: 1, flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  col:  { flex: 1, gap: 16 },

  // Card shell
  card: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 20, gap: 14,
  },
  cardTitle:      { fontSize: 18, fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600', color: Colors.textDark, letterSpacing: -0.2 },
  cardNote:       { fontSize: 13, color: Colors.textMid, lineHeight: 19 },
  cardRowBetween: { flexDirection: 'row', alignItems: 'flex-start' },

  // Language
  langRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  langBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  langBtnActive:     { backgroundColor: Colors.navy, borderColor: Colors.navy },
  langBtnText:       { fontSize: 14, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark },
  langBtnTextActive: { fontSize: 14, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.white },

  // Device box
  deviceBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgWarm, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 14,
  },
  btIconBox: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  deviceInfo:   { flex: 1 },
  deviceName:   { fontSize: 14, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark },
  deviceStatus: { fontSize: 12, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', marginTop: 3 },
  disconnectBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white, flexShrink: 0,
  },
  disconnectBtnText: { fontSize: 12, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textMid },

  deviceSection:  { gap: 16 },
  deviceListInner: { gap: 10 },
  deviceSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deviceSectionTitle: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.textDark },
  refreshLink: { fontSize: 13, color: Colors.navy },

  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgWarm, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  deviceAddress: { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textLight, marginTop: 2 },

  connectBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 7, minWidth: 76, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.navy, backgroundColor: Colors.white, flexShrink: 0,
  },
  connectBtnDisabled: { borderColor: Colors.border },
  connectBtnText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.navy },

  forgetBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, minWidth: 60, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#FBBCB8', backgroundColor: Colors.white, flexShrink: 0,
  },
  forgetBtnDisabled: { borderColor: Colors.border, opacity: 0.5 },
  forgetBtnText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.red },

  scanBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 7, backgroundColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center',
  },
  scanBtnText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.white, textAlign: 'center' },
  scanNote: { fontSize: 12, color: Colors.textLight, fontStyle: 'italic' },

  // Setting rows (landscape video / reset card)
  settingRow:   { flexDirection: 'row', alignItems: 'center', gap: 16 },
  settingLabel: { flex: 1 },
  settingTitle: { fontSize: 14, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark, marginBottom: 3 },
  settingNote:  { fontSize: 13, color: Colors.textMid, lineHeight: 18 },
  divider: { height: 1, backgroundColor: Colors.borderFaint, marginVertical: -4 },

  resetBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white, flexShrink: 0,
  },
  resetBtnText: { fontSize: 12, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark },

  // Account
  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.bgWarm, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 14,
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText:    { fontSize: 18, fontFamily: 'IBMPlexSans-Bold', fontWeight: '700', color: Colors.white },
  accountInfo:   { flex: 1 },
  accountKicker: { fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400', color: Colors.textLight, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3 },
  accountId:     { fontSize: 15, fontFamily: 'IBMPlexSans-Regular', fontWeight: '400', color: Colors.textDark },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#FBBCB8', backgroundColor: Colors.white, flexShrink: 0,
  },
  signOutText: { fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500', color: Colors.red },

  // Device provisioning
  qrScanBtn: {
    backgroundColor: Colors.navy,
    borderRadius: 9, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  qrScanBtnText: {
    fontSize: 14, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500',
    color: Colors.white, letterSpacing: 0.2,
  },
  rosterSyncBtn: {
    borderWidth: 1.5, borderColor: Colors.navy, borderRadius: 9,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
  },
  rosterSyncBtnText: {
    fontSize: 13, fontFamily: 'IBMPlexSans-Medium', fontWeight: '500',
    color: Colors.navy,
  },
  // Provisioning toggle
  provToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bgWarm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
    gap: 3,
  },
  provToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  provToggleBtnActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  provToggleText: {
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Regular',
    fontWeight: '400',
    color: Colors.textMid,
  },
  provToggleTextActive: {
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.textDark,
  },
  // Scanned preview
  provScannedBox: {
    backgroundColor: '#EAF5FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B6D9F5',
    padding: 14,
    gap: 7,
  },
  provScannedHeader: {
    fontSize: 11,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  provScannedRow: { flexDirection: 'row', gap: 10 },
  provScannedKey: {
    fontSize: 12,
    fontFamily: 'IBMPlexMono-Regular',
    fontWeight: '400',
    color: Colors.textLight,
    width: 60,
  },
  provScannedVal: {
    fontSize: 12,
    fontFamily: 'IBMPlexMono-Regular',
    fontWeight: '400',
    color: Colors.textDark,
    flex: 1,
  },
  provHint: {
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'center',
  },
  provFieldRow: { flexDirection: 'row', gap: 12 },
  provField: { gap: 6 },
  provLabel: {
    fontSize: 11, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400',
    color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 1.5,
  },
  provInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: 'IBMPlexMono-Regular', fontWeight: '400',
    color: Colors.textDark, backgroundColor: Colors.bgWarm,
    minHeight: 44,
  },
});
