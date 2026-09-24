/**
 * btAdapter — environment-variable-driven Bluetooth stack selector.
 *
 * Set BT_STACK=ble  to use the BLE GATT stack (iPhone / CoreBluetooth peripherals).
 * Set BT_STACK=classic (or leave unset) to use Bluetooth Classic SPP (CardioSleeve).
 *
 * Usage:
 *   BT_STACK=ble npx react-native run-android
 *
 * All imports in the app should come from this file — never import directly from
 * bluetooth.ts or bleService.ts. The active stack is swapped here without touching
 * any caller.
 */

import { BluetoothService as _ClassicService } from './bluetooth';
import { BleService as _BleService } from './bleService';
import type { BtStatus, RawSample } from './bluetooth';
import { BT_STACK as _BT_STACK } from './btConfig';

// ── Active stack ──────────────────────────────────────────────────────────────
// Controlled by src/services/btConfig.ts — change BT_STACK there and rebuild.
export const BT_STACK = _BT_STACK;

// ── Shared device type ────────────────────────────────────────────────────────
// Both stacks expose devices through this minimal interface so Settings screen
// and any other UI component never needs to know which stack is active.
export interface BtDevice {
  address: string;   // MAC address (Classic) or BLE device ID (BLE)
  name:    string | null | undefined;
}

// ── Service interface ─────────────────────────────────────────────────────────
// Both implementations satisfy this shape — enforced by TypeScript below.
export type RecordingCompleteCallback = (wav: Buffer, recordingId: number) => void;

export interface IBtService {
  onStatus(cb: (status: BtStatus, deviceName?: string) => void): void;
  /** Batch callback — fires once per BLE chunk, not once per sample. */
  onData(cb: (pcm: Float32Array, ecg: Float32Array, count: number, rateHz: number) => void): void;
  onRecordingComplete(cb: RecordingCompleteCallback): void;
  autoConnect(): Promise<void>;
  retry(): Promise<void>;
  connectToDevice(address: string): Promise<void>;
  disconnect(): Promise<void>;
  getPairedDevices(): Promise<BtDevice[]>;
  startDiscovery(): Promise<BtDevice[]>;
  stopDiscovery(): Promise<void>;
  forgetDevice(address: string): Promise<boolean>;
  requestBluetoothEnabled(): Promise<boolean>;
  getStatus(): BtStatus;
  getConnectedDevice(): BtDevice | null;
}

// ── Active service export ─────────────────────────────────────────────────────
export const BluetoothService: IBtService =
  BT_STACK === 'ble' ? _BleService : _ClassicService;

// Re-export so callers can import the shared device type from one place.
export type { BtStatus, RawSample };
