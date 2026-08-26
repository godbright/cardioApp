import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { Colors } from '../theme/colors';
import { useStrings } from '../i18n/useStrings';
import {
  WaveformIcon,
  UserIcon,
  ActivityIcon,
  SettingsIcon,
  LogoutIcon,
} from './Icons';
import type { AppView } from '../types';

const DRAWER_WIDTH = 280;
const ANIM_DURATION = 220;

interface NavItem {
  key: AppView;
  icon: React.ReactNode;
  labelKey: 'patients' | 'dashboard' | 'settings';
}

export default function SideNav() {
  const { state, navigate, logout, closeSideNav } = useApp();
  const s = useStrings();
  const insets = useSafeAreaInsets();

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state.sideNavOpen) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [state.sideNavOpen]);

  const handleNavigate = (view: AppView) => {
    closeSideNav();
    setTimeout(() => navigate(view), 10);
  };

  const handleLogout = () => {
    closeSideNav();
    setTimeout(() => logout(), 10);
  };

  const navItems: NavItem[] = [
    {
      key: 'history',
      icon: <UserIcon size={18} color="currentColor" />,
      labelKey: 'patients',
    },
    {
      key: 'dashboard',
      icon: <ActivityIcon size={18} color="currentColor" />,
      labelKey: 'dashboard',
    },
    {
      key: 'settings',
      icon: <SettingsIcon size={18} color="currentColor" />,
      labelKey: 'settings',
    },
  ];

  const isActive = (view: AppView) => state.view === view;

  if (!state.sideNavOpen) {
    return null;
  }

  return (
    <Modal
      visible={state.sideNavOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSideNav}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={closeSideNav}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX }],
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        {/* Branding header */}
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <WaveformIcon size={24} color={Colors.white} />
          </View>
          <View style={styles.brandText}>
            <Text style={styles.brandName}>{s.sidenav.appName}</Text>
            <Text style={styles.brandSub}>RHD SCREENING</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Navigation items */}
        <View style={styles.navList}>
          {navItems.map(item => {
            const active = isActive(item.key);
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.navItem, active && styles.navItemActive]}
                onPress={() => handleNavigate(item.key)}
                activeOpacity={0.75}
              >
                <View style={[styles.navIcon, active && styles.navIconActive]}>
                  {React.cloneElement(item.icon as React.ReactElement<any>, {
                    color: active ? Colors.white : Colors.textMid,
                  })}
                </View>
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                  {s.sidenav[item.labelKey]}
                </Text>
                {active && <View style={styles.activePip} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Spacer pushes logout to bottom */}
        <View style={styles.spacer} />

        <View style={styles.divider} />

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.75}>
          <View style={styles.navIcon}>
            <LogoutIcon size={18} color={Colors.red} />
          </View>
          <Text style={styles.logoutLabel}>{s.sidenav.logout}</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 37, 69, 0.40)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },

  // ── Branding ────────────────────────────────────────────────────────────────
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    gap: 1,
  },
  brandName: {
    fontSize: 15,
    fontFamily: 'IBMPlexSans-SemiBold',
    fontWeight: '600',
    color: Colors.navy,
    letterSpacing: -0.2,
  },
  brandSub: {
    fontSize: 11,
    fontFamily: 'IBMPlexSans-Regular',
    fontWeight: '400',
    color: Colors.textMute,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
    marginVertical: 8,
  },

  // ── Nav items ───────────────────────────────────────────────────────────────
  navList: {
    paddingHorizontal: 12,
    paddingTop: 4,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    gap: 12,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: Colors.navy,
  },
  navIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: Colors.bgWarm,
  },
  navIconActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  navLabel: {
    fontSize: 14,
    fontFamily: 'IBMPlexSans-Medium',
    fontWeight: '500',
    color: Colors.textMid,
    flex: 1,
  },
  navLabelActive: {
    color: Colors.white,
  },
  activePip: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.60)',
  },

  // ── Bottom area ─────────────────────────────────────────────────────────────
  spacer: {
    flex: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(200, 66, 58, 0.08)',
  },
  logoutLabel: {
    fontSize: 14,
    fontFamily: 'IBMPlexSans-Medium',
    fontWeight: '500',
    color: Colors.red,
  },
});
