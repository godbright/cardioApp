import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loginThunk, clearAuthError } from '../store/slices/authSlice';
import { WaveformIcon } from '../components/Icons';
import { Colors } from '../theme/colors';

export default function LoginScreen() {
  const { signIn } = useApp();
  const dispatch = useAppDispatch();
  const { status, profile, errorMsg } = useAppSelector(s => s.auth);

  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [id, setId] = useState('');
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState('');

  // When Redux auth succeeds, bridge to AppContext navigation.
  useEffect(() => {
    if (status === 'authenticated' && profile) {
      signIn(profile.workerId, undefined);
    }
  }, [status, profile, signIn]);

  function handleSignIn() {
    const trimId = id.trim();
    if (!trimId) {
      setLocalError('Enter your CHW ID to continue.');
      return;
    }
    if (!pin) {
      setLocalError('Enter your PIN to continue.');
      return;
    }
    setLocalError('');
    dispatch(clearAuthError());
    dispatch(loginThunk({ workerId: trimId, pin })).unwrap().catch(() => {
      // error is in Redux state — no local handling needed
    });
  }

  const isLoading = status === 'loading';
  const displayError = localError || errorMsg;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: height }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.center}>
        <View style={styles.card}>
          {/* Logo / brand header */}
          <View style={styles.cardHeader}>
            <View style={styles.logoBox}>
              <WaveformIcon size={32} color={Colors.white} />
            </View>
            <View>
              <Text style={styles.brand}>CMU-AFRICA AI  HEALTH LAB</Text>
              <Text style={styles.brandSub}>RHD SCREENING</Text>
            </View>
          </View>

          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.subheading}>
            Use the CHW ID on your credentials card and the PIN provided during your onboarding.
          </Text>

          {/* CHW ID */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>CHW ID</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. AUWAS"
              placeholderTextColor={Colors.textMute}
              value={id}
              onChangeText={t => { setId(t); setLocalError(''); dispatch(clearAuthError()); }}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
              editable={!isLoading}
              accessibilityLabel="CHW ID"
            />
          </View>

          {/* PIN */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>PIN</Text>
            <TextInput
              style={[styles.input, styles.inputMono]}
              placeholder="••••"
              placeholderTextColor={Colors.textMute}
              value={pin}
              onChangeText={t => { setPin(t); setLocalError(''); dispatch(clearAuthError()); }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
              editable={!isLoading}
              accessibilityLabel="PIN"
            />
          </View>

          {displayError ? <Text style={styles.errorText}>{displayError}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, isLoading && styles.btnDisabled]}
            onPress={handleSignIn}
            disabled={isLoading}
            accessibilityLabel="Sign in"
          >
            {isLoading
              ? <ActivityIndicator color={Colors.white} size="small" />
              : <Text style={styles.btnText}>Sign in</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot your PIN? Contact your supervisor.</Text>
          </TouchableOpacity>

          <View style={styles.divider} />
          <Text style={styles.note}>
            No self-registration — CHW accounts are created by the site coordinator and linked to the ethics-approved roster.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 32,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 26,
  },
  logoBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 17,
    fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
    color: Colors.textDark,
    letterSpacing: -0.3,
  },
  brandSub: {
    fontSize: 12,
    color: Colors.textMute,
    marginTop: 1,
  },
  heading: {
    fontSize: 23,
    fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
    color: Colors.textDark,
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 14,
    color: Colors.textMute,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 22,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
    color: Colors.textDark,
    marginBottom: 7,
  },
  input: {
    height: 46,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 9,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.textDark,
    backgroundColor: Colors.bgWarm,
  },
  inputMono: {
    fontFamily: 'IBMPlexMono-Regular',
    letterSpacing: 3,
    fontSize: 18,
  },
  errorText: {
    fontSize: 13,
    color: Colors.red,
    marginBottom: 10,
  },
  btn: {
    height: 48,
    backgroundColor: Colors.navy,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontSize: 15,
    fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
    color: Colors.white,
    letterSpacing: 0.2,
  },
  forgotBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  forgotText: {
    fontSize: 13,
    color: Colors.skyBlue,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginTop: 20,
    marginBottom: 14,
  },
  note: {
    fontSize: 12,
    color: Colors.textMute,
    textAlign: 'center',
    lineHeight: 17,
  },
});
