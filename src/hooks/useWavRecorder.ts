import { NativeModules } from 'react-native';
import type { WavResult } from '../services/recordingStore';

// The native module is absent before the first `npx react-native run-android`.
// All methods are guarded so the hook is safe to use in JS-only reloads.
const WavRecorderNative = (NativeModules as any).WavRecorder as
  | { start(): void; stop(): Promise<WavResult | null> }
  | null
  | undefined;

export function useWavRecorder() {
  const startRecording = (): void => {
    WavRecorderNative?.start();
  };

  const stopAndSave = (): Promise<WavResult | null> => {
    if (!WavRecorderNative) return Promise.resolve(null);
    return WavRecorderNative.stop();
  };

  return { startRecording, stopAndSave };
}
