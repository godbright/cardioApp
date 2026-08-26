import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { Colors } from '../theme/colors';

import LanguageScreen       from '../screens/LanguageScreen';
import ProvisioningScreen   from '../screens/ProvisioningScreen';
import LoginScreen          from '../screens/LoginScreen';
import HistoryScreen        from '../screens/HistoryScreen';
import PatientScreen        from '../screens/PatientScreen';
import SessionHubScreen     from '../screens/SessionHubScreen';
import PositionSelectScreen from '../screens/PositionSelectScreen';
import CaptureScreen        from '../screens/CaptureScreen';
import ResultScreen         from '../screens/ResultScreen';
import MeasurementsScreen      from '../screens/MeasurementsScreen';
import PatientHistoryScreen    from '../screens/PatientHistoryScreen';
import DashboardScreen         from '../screens/DashboardScreen';
import SettingsScreen          from '../screens/SettingsScreen';
import SideNav                 from '../components/SideNav';

// Wraps every screen with bottom safe-area padding so content never slides
// under the tablet's on-screen navigation bar. The Header component handles
// the top inset independently via its own useSafeAreaInsets call.
export default function RootNavigator() {
  const { state } = useApp();
  const insets = useSafeAreaInsets();

  // Capture screen is full-screen dark — use its own bg for the inset gap.
  const isCapture = state.view === 'capture';
  const isNavy    = state.view === 'language' || state.view === 'provisioning' || state.view === 'login';
  const bottomBg  = isCapture ? '#0E1E35' : isNavy ? Colors.navy : Colors.bgWarm;

  let screen: React.ReactElement;
  switch (state.view) {
    case 'language':     screen = <LanguageScreen />;      break;
    case 'provisioning': screen = <ProvisioningScreen />; break;
    case 'login':        screen = <LoginScreen />;        break;
    case 'history':   screen = <HistoryScreen />;         break;
    case 'patient':   screen = <PatientScreen />;         break;
    case 'hub':       screen = <SessionHubScreen />;      break;
    case 'position':  screen = <PositionSelectScreen />; break;
    case 'capture':   screen = <CaptureScreen />;         break;
    case 'result':    screen = <ResultScreen />;          break;
    case 'measure':         screen = <MeasurementsScreen />;       break;
    case 'patientHistory':  screen = <PatientHistoryScreen />;     break;
    case 'dashboard':       screen = <DashboardScreen />;          break;
    case 'settings':        screen = <SettingsScreen />;           break;
    default:          screen = <LanguageScreen />;
  }

  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom, backgroundColor: bottomBg }}>
      {screen}
      <SideNav />
    </View>
  );
}
