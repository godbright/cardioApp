/**
 * BLE GATT stack — connects to a peripheral advertising the Nordic UART Service (NUS).
 *
 * iPhone setup (one-time):
 *   1. Install "LightBlue" from the App Store.
 *   2. Tap "+" → Create Virtual Device → choose "Nordic UART" template.
 *   3. Tap "Advertise" — keep LightBlue open and screen on while connecting.
 *
 * Wire format for each TX characteristic notification (12 bytes, little-endian):
 *   bytes 0–3   float32  PCG sample  (–1 to 1)
 *   bytes 4–7   float32  ECG sample  (–1 to 1)
 *   bytes 8–11  uint32   timestamp   (ms, monotonic)
 *
 * Satisfies IBtService so btAdapter.ts can swap it in without touching callers.
 */

import { Buffer } from 'buffer';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import { SettingsService } from './settingsService';
import type { BtStatus, RawSample } from './bluetooth';
import type { BtDevice } from './btAdapter';

// ── HeartLink GATT service ────────────────────────────────────────────────────
// iPhone is peripheral/GATT server. Android is central/GATT client.
// Protocol: store-and-forward chunked WAV — iPhone records first, then sends
// 2 kHz / 16-bit / mono WAV in sequential chunks. Android must ACK each chunk
// before the iPhone advances to the next one.
const HLINK_SERVICE = '710b0001-67a0-4c7c-93a9-0c7a5769f4e1';
const HLINK_AUDIO   = '710b0003-67a0-4c7c-93a9-0c7a5769f4e1'; // notify  — WAV chunks
const HLINK_CTRL    = '710b0002-67a0-4c7c-93a9-0c7a5769f4e1'; // write   — ACK channel
const HLINK_STATUS  = '710b0004-67a0-4c7c-93a9-0c7a5769f4e1'; // read    — "ready|8000|16|1"

const HLINK_SAMPLE_RATE = 2000; // Hz, confirmed by status characteristic

const CONNECT_TIMEOUT_MS = 10_000;
const SCAN_DURATION_MS   =  8_000;

// ── Singleton BleManager ──────────────────────────────────────────────────────
const manager = new BleManager();

// ── Module-level state ────────────────────────────────────────────────────────
type StatusCallback   = (status: BtStatus, name?: string) => void;
// Batch callback — fires ONCE per BLE chunk with the full decoded PCM array.
// Using per-sample callbacks (250 calls per chunk) blocks the JS thread and
// starves touch events; batching reduces that to 1 call per chunk.
type BatchDataCallback = (pcm: Float32Array, ecg: Float32Array, count: number, rateHz: number) => void;
type DeviceCallback   = (device: BtDevice) => void;

type RecordingCallback = (wav: Buffer, recordingId: number) => void;

let _statusCb:      StatusCallback    | null = null;
let _batchDataCb:   BatchDataCallback | null = null;
let _recordingCb:   RecordingCallback | null = null;
let _discoveryCb:   DeviceCallback    | null = null;  // progressive scan updates

let _connected:     Device | null = null;
let _notifySub:     { remove(): void } | null = null;
let _disconnectSub: { remove(): void } | null = null;

function _emit(s: BtStatus, name?: string) { _statusCb?.(s, name); }

function _toDevice(d: Device): BtDevice { return { address: d.id, name: d.name }; }

// ── Permissions ───────────────────────────────────────────────────────────────
async function _requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version >= 31) {
    const r = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(r).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
  }
  const r = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title:         'Location permission needed',
      message:       'Android requires location permission to scan for Bluetooth devices.',
      buttonNeutral:  'Ask Me Later',
      buttonNegative: 'Cancel',
      buttonPositive: 'Allow',
    },
  );
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

function _waitForBleReady(): Promise<boolean> {
  return new Promise(resolve => {
    const sub = manager.onStateChange(state => {
      if (state === State.PoweredOn) { sub.remove(); resolve(true); }
      if (state === State.PoweredOff || state === State.Unsupported || state === State.Unauthorized) {
        sub.remove(); resolve(false);
      }
    }, /* emitCurrentState */ true);
  });
}

// ── Connect internals ─────────────────────────────────────────────────────────

function _tearDown() {
  _notifySub?.remove();     _notifySub     = null;
  _disconnectSub?.remove(); _disconnectSub = null;
}

/**
 * Takes an already-connected Device, discovers services, subscribes to the
 * HeartLink WAV audio characteristic, and implements the ACK protocol.
 *
 * HeartLink is store-and-forward: iPhone records a WAV file, then streams it
 * in chunks. Android must ACK each chunk (write 9 bytes to HLINK_CTRL) before
 * the next chunk is sent. Without ACKs the transfer stalls after chunk 0.
 *
 * Do NOT call device.connect() here — the device is already connected.
 */
async function _setup(device: Device): Promise<boolean> {
  try {
    _tearDown();

    // Request larger MTU — default 23B ATT frame leaves only 14B payload after
    // the 9-byte HLink header, giving ~7 int16 samples per chunk at 2 kHz.
    // 512B gives ~250 samples per chunk, making the transfer practical.
    let negotiatedMtu = 23;
    try {
      const mtuDevice = await device.requestMTU(512);
      negotiatedMtu = (mtuDevice as any).mtu ?? 512;
      console.log('[BLE] MTU negotiated:', negotiatedMtu);
    } catch (e: any) {
      console.warn('[BLE] MTU negotiation failed, using default 23B:', e?.message);
    }

    const ready = await device.discoverAllServicesAndCharacteristics();
    _connected  = ready;
    await SettingsService.setLastPairedDeviceId(device.id);
    console.log('[BLE] services discovered for', device.name ?? device.id);

    // WAV reassembly state — reset on each new recording ID.
    let _currentRecordingId = -1;
    let _headerConsumed     = false;
    // Accumulate WAV file bytes (9+ from each chunk) across the full recording.
    const _wavChunks: Buffer[] = [];

    // Send ACK: 0xA1 + recordingId (uint32 BE) + sequence (uint32 BE).
    const sendAck = (recordingId: number, sequence: number) => {
      const ack = Buffer.alloc(9);
      ack[0] = 0xA1;
      ack.writeUInt32BE(recordingId, 1);
      ack.writeUInt32BE(sequence, 5);
      ready.writeCharacteristicWithoutResponseForService(
        HLINK_SERVICE, HLINK_CTRL, ack.toString('base64'),
      ).catch(e => console.warn('[BLE] ACK write failed:', e?.message));
    };

    _notifySub = ready.monitorCharacteristicForService(
      HLINK_SERVICE,
      HLINK_AUDIO,
      (err, char) => {
        if (err) { console.warn('[BLE] audio notify error:', err.message); return; }
        if (!char?.value) return;

        const buf = Buffer.from(char.value, 'base64');
        if (buf.length < 9) return;

        const recordingId = buf.readUInt32BE(0);
        const sequence    = buf.readUInt32BE(4);
        const flags       = buf[8];
        const isFirst     = !!(flags & 0x01);
        const isFinal     = !!(flags & 0x02);

        // New recording — reset reassembly state.
        if (isFirst || recordingId !== _currentRecordingId) {
          _currentRecordingId = recordingId;
          _headerConsumed     = false;
          _wavChunks.length   = 0;
        }

        // Accumulate raw WAV bytes (9+ from every chunk, in order).
        _wavChunks.push(buf.slice(9));

        // Find start of raw PCM in this chunk's payload (bytes 9+).
        let pcmOffset = 9;
        if (!_headerConsumed) {
          // First payload chunk starts with the WAV file (begins "RIFF").
          // Search for the "data" subchunk marker to locate the PCM data.
          pcmOffset = _findPcmDataOffset(buf, 9);
          _headerConsumed = true;
        }

        // Decode int16 LE PCM samples into a typed array and fire ONE batch
        // callback per chunk. Calling _dataCb once per sample (250 calls per
        // chunk × 60 chunks/s = 15 000 JS calls/s) blocks the JS thread and
        // starves touch events — batching reduces this to 1 call per chunk.
        const sampleCount = Math.max(0, Math.floor((buf.length - pcmOffset) / 2));
        if (sampleCount > 0 && _batchDataCb) {
          const pcmArr = new Float32Array(sampleCount);
          const ecgArr = new Float32Array(sampleCount); // ECG not carried in this stream
          for (let s = 0; s < sampleCount; s++) {
            pcmArr[s] = buf.readInt16LE(pcmOffset + s * 2) / 32768.0;
          }
          _batchDataCb(pcmArr, ecgArr, sampleCount, HLINK_SAMPLE_RATE);
        }

        // Log only on first and final chunk to avoid 60+ console bridge crossings/s.
        if (isFirst || isFinal) {
          console.log(
            `[BLE] recId=${recordingId} seq=${sequence}` +
            `${isFirst ? ' FIRST' : ''}${isFinal ? ' FINAL' : ''}` +
            ` samples=${sampleCount}`,
          );
        }

        // ACK this chunk so iPhone sends the next one.
        sendAck(recordingId, sequence);

        // On final chunk: concatenate and fire the recording callback.
        if (isFinal && _recordingCb) {
          const wav = Buffer.concat(_wavChunks);
          console.log(`[BLE] recording ${recordingId} complete — ${wav.length} bytes WAV`);
          _recordingCb(wav, recordingId);
        }
      },
    );

    _disconnectSub = manager.onDeviceDisconnected(device.id, (err) => {
      console.log('[BLE] disconnected', device.id, err?.message);
      _tearDown();
      _connected = null;
      _emit('reconnecting');
      setTimeout(() => BleService.retry(), 3_000);
    });

    _emit('connected', device.name ?? device.id);
    console.log('[BLE] connected to', device.name ?? device.id);
    return true;
  } catch (err: any) {
    console.warn('[BLE] _setup failed:', err?.message ?? err);
    return false;
  }
}

/**
 * Locates the raw PCM data inside a WAV file buffer.
 * Searches for the "data" subchunk marker and skips its 8-byte header.
 * Falls back to a standard 44-byte offset if the marker isn't found.
 */
function _findPcmDataOffset(buf: Buffer, start: number): number {
  for (let i = start; i + 8 <= buf.length; i++) {
    if (buf[i] === 0x64 && buf[i+1] === 0x61 && buf[i+2] === 0x74 && buf[i+3] === 0x61) {
      return i + 8; // skip "data" (4) + chunk size (4)
    }
  }
  return start + 44; // fallback: standard PCM WAV header
}

// ── Timeout helper ────────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[BLE] ${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const BleService = {

  onStatus(cb: StatusCallback)             { _statusCb     = cb; },
  onData(cb: BatchDataCallback)            { _batchDataCb  = cb; },
  /** Fires with the complete WAV Buffer when HLink delivers a full recording. */
  onRecordingComplete(cb: RecordingCallback) { _recordingCb = cb; },
  /** Called by Settings screen to receive devices as they are discovered. */
  onDiscoveredDevice(cb: DeviceCallback | null) { _discoveryCb = cb; },

  async autoConnect(): Promise<void> {
    // Only attempt if the user has previously paired a device.
    // On first launch (no saved device), stay silent — the CHW must discover
    // and connect explicitly from Settings.
    const lastId = await SettingsService.getLastPairedDeviceId();
    if (!lastId) return; // no prior pairing — do not emit notfound, just stay quiet

    const granted = await _requestPermissions();
    if (!granted) { _emit('notfound'); return; }
    const ready = await _waitForBleReady();
    if (!ready)   { _emit('notfound'); return; }

    _emit('reconnecting');
    console.log('[BLE] autoConnect → reconnecting to paired device', lastId);

    // Cancel any stale connection state before attempting.
    await manager.cancelDeviceConnection(lastId).catch(() => {});
    try {
      const device = await withTimeout(
        manager.connectToDevice(lastId, { autoConnect: false }),
        CONNECT_TIMEOUT_MS,
        'autoConnect',
      );
      const ok = await _setup(device);
      if (!ok) _emit('notfound');
    } catch (err: any) {
      console.warn('[BLE] autoConnect failed:', err?.message ?? err);
      _emit('notfound');
    }
  },

  async retry(): Promise<void> { await BleService.autoConnect(); },

  async connectToDevice(address: string): Promise<void> {
    _emit('reconnecting');
    console.log('[BLE] connectToDevice', address);
    try {
      const device = await withTimeout(
        manager.connectToDevice(address, { autoConnect: false }),
        CONNECT_TIMEOUT_MS,
        'connectToDevice',
      );
      const ok = await _setup(device);
      if (!ok) _emit('notfound');
    } catch (err: any) {
      console.warn('[BLE] connectToDevice failed:', err?.message ?? err);
      _emit('notfound');
    }
  },

  async disconnect(): Promise<void> {
    _tearDown();
    if (_connected) {
      await _connected.cancelConnection().catch(() => {});
      _connected = null;
    }
    _emit('notfound');
  },

  /**
   * BLE has no OS-level bonded-device list. Returns the last known device so
   * Settings screen can offer a quick-reconnect row.
   */
  async getPairedDevices(): Promise<BtDevice[]> {
    const lastId = await SettingsService.getLastPairedDeviceId();
    if (!lastId) return [];
    if (_connected) return [_toDevice(_connected)];
    return [{ address: lastId, name: null }];
  },

  /**
   * Scans for 8 seconds. Devices are delivered progressively via
   * onDiscoveredDevice() as they appear, AND the full list resolves at the end.
   */
  async startDiscovery(): Promise<BtDevice[]> {
    const granted = await _requestPermissions();
    if (!granted) return [];
    const ready = await _waitForBleReady();
    if (!ready) return [];

    return new Promise(resolve => {
      const found = new Map<string, BtDevice>();

      // Filter: show named devices OR any device advertising the HLink service UUID.
      // iOS rotates private BLE addresses and may omit the device name from
      // background advertisements — the service UUID is the reliable identifier.
      manager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
        if (err) { console.warn('[BLE] scan error:', err.message); return; }
        if (!device) return;
        const hasName   = !!device.name;
        const isHLink   = device.serviceUUIDs?.some(
          u => u.toLowerCase() === HLINK_SERVICE.toLowerCase(),
        );
        if (!hasName && !isHLink) return;
        const d: BtDevice = {
          address: device.id,
          name:    device.name ?? 'HLink',
        };
        if (!found.has(d.address)) {
          found.set(d.address, d);
          _discoveryCb?.(d);
          console.log('[BLE] discovered:', d.name, d.address);
        }
      });

      setTimeout(() => {
        manager.stopDeviceScan();
        resolve(Array.from(found.values()));
      }, SCAN_DURATION_MS);
    });
  },

  async stopDiscovery(): Promise<void> {
    manager.stopDeviceScan();
  },

  async forgetDevice(address: string): Promise<boolean> {
    if (_connected?.id === address) await BleService.disconnect();
    const lastId = await SettingsService.getLastPairedDeviceId();
    if (lastId === address) await SettingsService.setLastPairedDeviceId('');
    return true;
  },

  async requestBluetoothEnabled(): Promise<boolean> {
    return _waitForBleReady();
  },

  getStatus(): BtStatus {
    return _connected ? 'connected' : 'notfound';
  },

  getConnectedDevice(): BtDevice | null {
    return _connected ? _toDevice(_connected) : null;
  },
};

