import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  PermissionsAndroid, Platform, Alert,
} from 'react-native';
import { RNCamera } from 'react-native-camera';
import { Colors } from '../theme/colors';

interface Props {
  onScanned: (data: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScanned, onClose }: Props) {
  const [hasPerm, setHasPerm] = useState<boolean | null>(null);
  const [scanned,  setScanned] = useState(false);
  const didScan = useRef(false);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  async function requestCameraPermission() {
    if (Platform.OS !== 'android') {
      setHasPerm(true);
      return;
    }
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'CardioSleeve needs camera access to scan provisioning QR codes.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      setHasPerm(result === PermissionsAndroid.RESULTS.GRANTED);
    } catch {
      setHasPerm(false);
    }
  }

  function handleBarCode({ data }: { data: string }) {
    if (didScan.current) return;
    didScan.current = true;
    setScanned(true);
    onScanned(data);
  }

  if (hasPerm === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!hasPerm) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>
          Camera permission is required to scan QR codes.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={requestCameraPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <RNCamera
        style={StyleSheet.absoluteFill}
        type={RNCamera.Constants.Type.back}
        flashMode={RNCamera.Constants.FlashMode.off}
        captureAudio={false}
        onBarCodeRead={scanned ? undefined : handleBarCode}
        barCodeTypes={[RNCamera.Constants.BarCodeType.qr]}
        androidCameraPermissionOptions={null}
      />

      {/* Aim overlay */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>
          Point at the QR code on the dashboard screen
        </Text>
      </View>

      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>✕  Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1, backgroundColor: Colors.bgWarm,
    alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 16,
  },
  msg:       { fontSize: 15, color: Colors.textDark, textAlign: 'center', lineHeight: 22 },
  btn:       { backgroundColor: Colors.navy, borderRadius: 9, paddingVertical: 12, paddingHorizontal: 24 },
  btnText:   { color: Colors.white, fontSize: 14, fontWeight: '600' },
  cancelBtn: { marginTop: 4 },
  cancelText:{ color: Colors.textMute, fontSize: 14 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  frame: {
    width: 220, height: 220,
    borderWidth: 2.5, borderColor: Colors.white,
    borderRadius: 12, backgroundColor: 'transparent',
  },
  hint: {
    color: Colors.white, fontSize: 13, textAlign: 'center',
    paddingHorizontal: 32, opacity: 0.85,
  },
  closeBtn: {
    position: 'absolute', top: 48, right: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16,
  },
  closeBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
});
