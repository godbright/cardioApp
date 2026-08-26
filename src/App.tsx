import React, { useEffect } from 'react';
import { StatusBar, LogBox, Text, TextInput, AppState } from 'react-native';
// Defensive import — NetInfo requires a native rebuild to link; fall back gracefully if the
// native module isn't present yet (e.g. JS-only reload before first `run-android`).
let NetInfo: typeof import('@react-native-community/netinfo').default | null = null;
try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  console.warn('[App] NetInfo native module not available — run `npx react-native run-android` to link it. Connectivity detection disabled until then.');
}

// Set IBM Plex Sans as the default font for all Text elements.
// Individual weights are overridden per-style via fontFamily: 'IBMPlexSans-{Weight}'.
(Text as any).defaultProps = { ...((Text as any).defaultProps ?? {}), style: { fontFamily: 'IBMPlexSans-Regular' } };
(TextInput as any).defaultProps = { ...((TextInput as any).defaultProps ?? {}), style: { fontFamily: 'IBMPlexSans-Regular' } };
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as ReduxProvider } from 'react-redux';
import { store } from './store';
import { AppProvider, useApp } from './context/AppContext';
import RootNavigator from './navigation/RootNavigator';
import { BluetoothService } from './services/bluetooth';
import { startSyncWorker, getPendingCount, getFailedCount } from './services/syncQueue';
import { DEMO_MODE } from './demo';

if (DEMO_MODE) {
  LogBox.ignoreAllLogs();
}
import { AuthService } from './services/authService';
import { SettingsService } from './services/settingsService';
import { getLatestModel, submitDailyMetrics, Stage2NotConfiguredError } from './services/stage2Api';
import { syncRosterNow } from './services/rosterService';
import { Colors } from './theme/colors';

LogBox.ignoreLogs(['new NativeEventEmitter']);

async function _runLaunchTasks(): Promise<void> {
  try {
    const settings = await SettingsService.getAll();
    console.log('[App] Launch tasks — settings:', {
      endpoint: settings.stage2Endpoint ?? '(not set)',
      deviceId: settings.deviceId ?? '(not set)',
      hasToken: !!settings.stage2Token,
    });

    const siteId = settings.siteId?.trim() ?? '';
    if (!siteId) {
      console.warn('[App] siteId not configured — roster sync skipped. Scan the provisioning QR in Settings.');
      return;
    }

    const model = await getLatestModel(siteId).catch(e => {
      console.warn('[App] Model check failed (non-fatal):', e?.message ?? e);
      return null;
    });
    if (model) {
      console.log(`[App] Latest model for ${siteId}: ${model.semver} (${model.size_bytes} bytes)`);
    }

    const result = await syncRosterNow();
    if (!result.ok) {
      console.warn('[App] Roster sync failed:', result.message);
    }
  } catch (err: any) {
    if (err instanceof Stage2NotConfiguredError) {
      console.warn('[App] Stage 2 endpoint/token not configured — roster sync skipped. Provision this device in Settings.');
      return;
    }
    console.error('[App] Launch tasks failed:', err?.message ?? err);
  }
}

async function _submitDailyMetrics(): Promise<void> {
  try {
    const settings = await SettingsService.getAll();
    const deviceId = settings.deviceId?.trim() ?? '';
    const siteId   = settings.siteId?.trim() ?? '';
    if (!siteId || !deviceId) return;

    const today = new Date().toISOString().slice(0, 10);
    const [pending, failed] = await Promise.all([getPendingCount(), getFailedCount()]);

    await submitDailyMetrics({
      site_id:             siteId,
      date:                today,
      hw_id:               deviceId,
      sessions_started:    0, // TODO: track session counter in DB
      pcg_captures:        0, // TODO: query captures table filtered by today + modality
      ecg_captures:        0,
      stage1_normal:       0,
      stage1_abnormal:     0,
      stage1_inconclusive: 0,
      sync_queue_pending:  pending,
      sync_queue_failed:   failed,
    });
  } catch (err) {
    if (err instanceof Stage2NotConfiguredError) return;
    console.warn('[App] Daily metrics failed:', err);
  }
}

function AppInner() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    // In demo mode the Bluetooth layer is bypassed — initial state already
    // reflects a connected CardioSleeve so no real scan is needed or wanted.
    if (!DEMO_MODE) {
      // Background auto-connect at every launch — no blocking screen.
      // When deviceName is provided the status callback also updates the header label.
      BluetoothService.onStatus((status, deviceName) => {
        dispatch({ type: 'SET_CONN', status });
        if (deviceName !== undefined) {
          dispatch({ type: 'SET_FIELD', key: 'deviceName', value: deviceName });
        }
        if (status === 'notfound') {
          dispatch({ type: 'SET_FIELD', key: 'deviceName', value: '' });
        }
      });
      BluetoothService.autoConnect();
    }

    // Real network detection — drives connectivity state used by the sync queue.
    // No-ops until the native module is linked (first `npx react-native run-android`).
    const unsubNetInfo = NetInfo
      ? NetInfo.addEventListener(netState => {
          const online = !!(netState.isConnected && netState.isInternetReachable !== false);
          dispatch({ type: 'PATCH', patch: { connectivity: online ? 'online' : 'offline' } });
        })
      : () => {};

    // Stage 2 background sync worker
    startSyncWorker();

    // Seed default worker profiles if the DB is empty (dev / first install).
    // Production sites replace this with a signed roster bundle.
    AuthService.seedDefaultProfiles().catch(e =>
      console.warn('[Auth] Seed failed (expected on first build):', e),
    );

    // On-launch background tasks — run after a short delay so the UI renders first.
    const launchTimer = setTimeout(() => {
      _runLaunchTasks();
    }, 3_000);

    // Daily metrics — submit when the app goes to background.
    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'background' || nextState === 'inactive') {
        _submitDailyMetrics();
      }
    });

    return () => {
      clearTimeout(launchTimer);
      appStateSub.remove();
      unsubNetInfo();
    };
  }, [dispatch]);

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor={Colors.navy}
      />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <ReduxProvider store={store}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppProvider>
            <AppInner />
          </AppProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ReduxProvider>
  );
}
