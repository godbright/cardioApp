import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { Colors } from '../theme/colors';
import { WaveformIcon, ChevronLeft, SettingsIcon, MenuIcon } from './Icons';

interface HeaderProps {
  title: string;
  canBack?: boolean;
  onBack?: () => void;
}

export default function Header({ title, canBack = false, onBack }: HeaderProps) {
  const { state, goBack, navigate, openSideNav } = useApp();
  const insets = useSafeAreaInsets();

  const connDot =
    state.conn === 'connected'    ? Colors.green :
    state.conn === 'reconnecting' ? Colors.amber  :
    Colors.statusNone;

  const connLabel =
    state.conn === 'connected'    ? state.deviceName :
    state.conn === 'reconnecting' ? 'Reconnecting…'  :
    'Not found';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        {canBack ? (
          <TouchableOpacity style={styles.iconBtn} onPress={onBack ?? goBack}>
            <ChevronLeft size={20} color={Colors.white} />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.iconBtn} onPress={openSideNav} accessibilityLabel="Open navigation menu">
              <MenuIcon size={18} color="#DCE3EC" strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.logoBox}>
              <WaveformIcon size={22} color={Colors.white} />
            </View>
          </>
        )}

        <Text style={styles.title} numberOfLines={1}>{title}</Text>

        <View style={styles.right}>
          <TouchableOpacity
            style={styles.connPill}
            onPress={() => navigate('settings')}
            accessibilityLabel={`Bluetooth: ${connLabel}`}
          >
            <View style={[styles.dot, { backgroundColor: connDot }]} />
            <Text style={styles.connLabel} numberOfLines={1}>{connLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={() => navigate('settings')}>
            <SettingsIcon size={19} color="#DCE3EC" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.navy,
    flexShrink: 0,
  },
  inner: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 14,
  },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'IBMPlexSans-SemiBold', fontWeight: '600',
    color: Colors.white,
    letterSpacing: -0.2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 'auto',
  },
  connPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  connLabel: {
    fontSize: 13,
    color: '#DCE3EC',
    fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
    maxWidth: 130,
  },
});
