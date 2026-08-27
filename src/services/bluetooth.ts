/**
 * Bluetooth service — real implementation using react-native-bluetooth-classic.
 *
 * The CardioSleeve uses standard Bluetooth Classic (not BLE). This module
 * handles permission requests, auto-connect to the last-paired device, manual
 * discovery, and the raw data stream.
 *
 * The byte-parsing layer (CardioSleeveDataParser) is isolated below so that
 * swapping in the Rijuven protocol is a one-file change — callers don't change.
 *
 * REQUIRES: npm install react-native-bluetooth-classic
 * Then rebuild the Android app: npx react-native run-android
 */

import { PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';
import { SettingsService } from './settingsService';

// ─── Public types ─────────────────────────────────────────────────────────────

export type BtStatus = 'connected' | 'reconnecting' | 'notfound';

export interface RawSample {
  pcg: number;   // normalized [-1, 1]
  ecg: number;   // normalized [-1, 1]
  ts:  number;   // monotonic ms
}

// Re-export so Settings screen can type device lists without importing the lib.
export type { BluetoothDevice };

// ─── Module-level state ───────────────────────────────────────────────────────

type StatusCallback = (status: BtStatus, deviceName?: string) => void;
type DataCallback   = (sample: RawSample) => void;

let _statusCb:         StatusCallback | null = null;
let _dataCb:           DataCallback   | null = null;
let _connectedDevice:  BluetoothDevice | null = null;
let _dataSubscription: { remove(): void } | null = null;
let _disconnectSub:    { remove(): void } | null = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _emit(status: BtStatus, deviceName?: string) {
  _statusCb?.(status, deviceName);
}

async function _requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    // Android 12+ — BLUETOOTH_SCAN and BLUETOOTH_CONNECT are dangerous permissions.
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(results).every(
      r => r === PermissionsAndroid.RESULTS.GRANTED,
    );
  } else {
    // Android < 12 — only ACCESS_FINE_LOCATION is dangerous (needed for discovery).
    // BLUETOOTH and BLUETOOTH_ADMIN are declared in the manifest as normal permissions.
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title:         'Location permission needed for Bluetooth',
        message:
          'This app uses Bluetooth to connect to the CardioSleeve. ' +
          'Android requires location permission to discover nearby devices.',
        buttonNeutral:  'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'Allow',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
}

function _tearDownStream() {
  _dataSubscription?.remove();
  _dataSubscription = null;
}

function _tearDownDisconnect() {
  _disconnectSub?.remove();
  _disconnectSub = null;
}

async function _attachToDevice(device: BluetoothDevice): Promise<boolean> {
  try {
    _tearDownStream();
    _tearDownDisconnect();

    // Android's RFCOMM stack commonly throws "read ret: -1" on the first
    // attempt even for properly bonded devices. One retry after a short
    // pause resolves it in the vast majority of cases.
    let connectedDevice: BluetoothDevice;
    try {
      connectedDevice = await device.connect();
    } catch (firstErr) {
      console.warn('[BT] First connect attempt failed, retrying in 800 ms…', firstErr);
      await new Promise(resolve => setTimeout(resolve, 800));
      connectedDevice = await device.connect(); // throws → caught by outer try/catch
    }

    _connectedDevice = connectedDevice;

    // Persist so auto-connect can find it on next launch.
    await SettingsService.setLastPairedDeviceId(device.address);

    // Listen for raw data frames from the CardioSleeve.
    // CardioSleeveDataParser.parse() returns null until the Rijuven protocol
    // is documented — at that point only the parser body changes.
    _dataSubscription = connectedDevice.onDataReceived((event: any) => {
      const sample = CardioSleeveDataParser.parse(event.data);
      if (sample) _dataCb?.(sample);
    });

    // Handle unexpected disconnects — attempt silent reconnect.
    _disconnectSub = RNBluetoothClassic.onDeviceDisconnected(() => {
      _tearDownStream();
      _connectedDevice = null;
      _emit('reconnecting');
      // Short delay before retry so the device has time to become discoverable again.
      setTimeout(() => BluetoothService.retry(), 3000);
    });

    _emit('connected', connectedDevice.name ?? connectedDevice.address);
    return true;
  } catch (err) {
    console.warn('[BT] _attachToDevice failed:', err);
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const BluetoothService = {

  /** Register status + data callbacks before calling autoConnect(). */
  onStatus(cb: StatusCallback) { _statusCb = cb; },
  onData(cb: DataCallback)     { _dataCb   = cb; },

  /**
   * Called once at app launch (from App.tsx).
   * Silently tries to reconnect to the last paired CardioSleeve.
   * Never blocks the UI — status updates come through the onStatus callback.
   */
  async autoConnect(): Promise<void> {
    const granted = await _requestPermissions();
    if (!granted) { _emit('notfound'); return; }

    const enabled = await RNBluetoothClassic.isBluetoothEnabled().catch(() => false);
    if (!enabled) { _emit('notfound'); return; }

    _emit('reconnecting');

    try {
      const bonded = await RNBluetoothClassic.getBondedDevices();
      if (bonded.length === 0) { _emit('notfound'); return; }

      // 1. Try the device we last successfully connected to.
      const lastId = await SettingsService.getLastPairedDeviceId();
      let target = lastId
        ? (bonded.find(d => d.address === lastId) ?? null)
        : null;

      // 2. Fall back to any bonded device whose name contains 'CardioSleeve'.
      if (!target) {
        target = bonded.find(d => d.name?.includes('CardioSleeve') ?? false) ?? null;
      }

      if (!target) { _emit('notfound'); return; }

      const ok = await _attachToDevice(target);
      if (!ok) _emit('notfound');
    } catch (err) {
      console.warn('[BT] autoConnect error:', err);
      _emit('notfound');
    }
  },

  /**
   * Manual retry — triggered from the capture gate screen when the CHW taps
   * "Retry connection". Behaves like autoConnect but can also be called mid-session.
   */
  async retry(): Promise<void> {
    await BluetoothService.autoConnect();
  },

  /**
   * Connect to a specific device by MAC address.
   * Called from the Settings screen when the CHW taps a device in the paired list.
   */
  async connectToDevice(address: string): Promise<void> {
    _emit('reconnecting');
    try {
      const bonded = await RNBluetoothClassic.getBondedDevices();
      const device = bonded.find(d => d.address === address);
      if (!device) { _emit('notfound'); return; }
      const ok = await _attachToDevice(device);
      if (!ok) _emit('notfound');
    } catch (err) {
      console.warn('[BT] connectToDevice error:', err);
      _emit('notfound');
    }
  },

  /** Explicit disconnect (e.g. from Settings). */
  async disconnect(): Promise<void> {
    _tearDownStream();
    _tearDownDisconnect();
    if (_connectedDevice) {
      await _connectedDevice.disconnect().catch(() => {});
      _connectedDevice = null;
    }
    _emit('notfound');
  },

  /**
   * Returns the list of devices already bonded (paired) at the OS level.
   * Called by the Settings screen to populate the "My paired devices" list.
   */
  async getPairedDevices(): Promise<BluetoothDevice[]> {
    const granted = await _requestPermissions();
    if (!granted) return [];
    return RNBluetoothClassic.getBondedDevices().catch(() => []);
  },

  /**
   * Removes the OS-level bond for the given device address.
   * If the device is currently connected, it is disconnected first.
   * Returns true if the bond was removed, false if the device was not bonded.
   */
  async forgetDevice(address: string): Promise<boolean> {
    const granted = await _requestPermissions();
    if (!granted) return false;
    if (_connectedDevice?.address === address) {
      await BluetoothService.disconnect();
    }
    return RNBluetoothClassic.unpairDevice(address).catch(() => false);
  },

  /**
   * Scans for discoverable Bluetooth devices in range.
   * Android discovery runs for ~12 seconds then resolves.
   * The device must be in discoverable mode (typical for new pairings).
   */
  async startDiscovery(): Promise<BluetoothDevice[]> {
    const granted = await _requestPermissions();
    if (!granted) return [];
    return RNBluetoothClassic.startDiscovery().catch(() => []);
  },

  async stopDiscovery(): Promise<void> {
    await RNBluetoothClassic.cancelDiscovery().catch(() => {});
  },

  /**
   * Requests the user to enable Bluetooth if it is off.
   * Returns true if Bluetooth is (or becomes) enabled.
   */
  async requestBluetoothEnabled(): Promise<boolean> {
    return RNBluetoothClassic.requestBluetoothEnabled().catch(() => false);
  },

  getStatus(): BtStatus {
    return _connectedDevice ? 'connected' : 'notfound';
  },

  getConnectedDevice(): BluetoothDevice | null {
    return _connectedDevice;
  },
};

// ─── CardioSleeveDataParser ───────────────────────────────────────────────────
// Isolated from BluetoothService so that when Rijuven's protocol documentation
// arrives, only this module changes — nothing in the Bluetooth layer or callers.

export const CardioSleeveDataParser = {
  /**
   * Parse a raw frame from the CardioSleeve data stream into a RawSample.
   * Returns null if the frame is malformed, incomplete, or the protocol is
   * not yet implemented.
   *
   * TODO: implement once the Rijuven SDK / protocol spec is received.
   */
  parse(_frame: any): RawSample | null {
    return null;
  },
};
