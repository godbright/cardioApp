import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BluetoothService } from '../services/btAdapter';
import type { BtDevice } from '../services/btAdapter';
import { Colors } from '../theme/colors';
import { BluetoothIcon, XIcon } from './Icons';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after connectToDevice resolves — gives the parent a chance to
   *  advance state (e.g. move capturePhase from 'gate' to 'positioning'). */
  onConnected?: () => void;
}

type DeviceRow = BtDevice & { paired: boolean };

export default function BluetoothPickerModal({ visible, onClose, onConnected }: Props) {
  const [devices, setDevices]       = useState<DeviceRow[]>([]);
  const [scanning, setScanning]     = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null); // address being connected
  const [error, setError]           = useState<string | null>(null);
  const scanRef = useRef(false);

  const startScan = useCallback(async () => {
    setError(null);
    setScanning(true);
    scanRef.current = true;

    try {
      // Paired devices load immediately; discovery may take a few seconds.
      const paired = await BluetoothService.getPairedDevices().catch(() => [] as BtDevice[]);
      setDevices(paired.map(d => ({ ...d, paired: true })));

      const discovered = await BluetoothService.startDiscovery();
      if (!scanRef.current) return; // modal closed mid-scan
      const pairedAddresses = new Set(paired.map(d => d.address));
      const newFound = discovered.filter(d => !pairedAddresses.has(d.address));
      setDevices([
        ...paired.map(d => ({ ...d, paired: true })),
        ...newFound.map(d => ({ ...d, paired: false })),
      ]);
    } catch (e: any) {
      if (scanRef.current) setError(e?.message ?? 'Discovery failed');
    } finally {
      if (scanRef.current) setScanning(false);
    }
  }, []);

  // Start scan when modal opens; stop when it closes.
  useEffect(() => {
    if (visible) {
      startScan();
    } else {
      scanRef.current = false;
      BluetoothService.stopDiscovery().catch(() => {});
      setDevices([]);
      setConnecting(null);
      setError(null);
    }
  }, [visible, startScan]);

  const handleConnect = useCallback(async (device: DeviceRow) => {
    setConnecting(device.address);
    setError(null);
    try {
      await BluetoothService.connectToDevice(device.address);
      onConnected?.();
      onClose();
    } catch (e: any) {
      setError(`Could not connect to ${device.name ?? device.address}: ${e?.message ?? 'Unknown error'}`);
      setConnecting(null);
    }
  }, [onClose, onConnected]);

  const renderItem = useCallback(({ item }: { item: DeviceRow }) => {
    const isConnecting = connecting === item.address;
    const label = item.name?.trim() || item.address;
    return (
      <TouchableOpacity
        style={styles.deviceRow}
        onPress={() => !connecting && handleConnect(item)}
        activeOpacity={connecting ? 1 : 0.7}
        disabled={!!connecting}
      >
        <View style={styles.deviceIcon}>
          <BluetoothIcon size={18} color={Colors.navy} />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName} numberOfLines={1}>{label}</Text>
          {item.paired && (
            <Text style={styles.devicePaired}>Paired</Text>
          )}
        </View>
        {isConnecting ? (
          <ActivityIndicator size="small" color={Colors.teal} />
        ) : (
          <Text style={styles.connectBtn}>Connect</Text>
        )}
      </TouchableOpacity>
    );
  }, [connecting, handleConnect]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <BluetoothIcon size={20} color={Colors.navy} />
            <Text style={styles.headerTitle}>Connect CardioSleeve</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <XIcon size={16} color={Colors.textMid} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Device list */}
          {devices.length === 0 && !scanning && !error ? (
            <Text style={styles.emptyText}>No devices found. Tap Scan to try again.</Text>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={d => d.address}
              renderItem={renderItem}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}

          {/* Error */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
              onPress={startScan}
              disabled={scanning}
            >
              {scanning
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.scanBtnText}>Scan</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.textHeading,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: 8,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  deviceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.navy + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontFamily: 'IBMPlexSans-Medium',
    fontWeight: '500',
    color: Colors.textDark,
  },
  devicePaired: {
    fontSize: 12,
    fontFamily: 'IBMPlexSans-Regular',
    color: Colors.teal,
    marginTop: 2,
  },
  connectBtn: {
    fontSize: 14,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.navy,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.borderFaint,
    marginLeft: 68,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    fontSize: 14,
    fontFamily: 'IBMPlexSans-Regular',
    color: Colors.textMute,
  },
  errorText: {
    marginHorizontal: 20,
    marginTop: 8,
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Regular',
    color: Colors.red,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  scanBtn: {
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtnDisabled: {
    opacity: 0.6,
  },
  scanBtnText: {
    fontSize: 15,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.white,
  },
});
