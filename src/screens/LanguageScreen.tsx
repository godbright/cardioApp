import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { WaveformIcon } from '../components/Icons';
import { Colors } from '../theme/colors';
import { setTtsLanguage } from '../services/tts';
import type { SupportedLang } from '../services/tts';

const LANGUAGES: { code: SupportedLang; native: string; en: string }[] = [
  { code: 'en', native: 'English',    en: 'English' },
  { code: 'rw', native: 'Kinyarwanda', en: 'Kinyarwanda' },
  { code: 'fr', native: 'Français',   en: 'French' },
  { code: 'sw', native: 'Kiswahili',  en: 'Swahili' },
];

export default function LanguageScreen() {
  const { pickLang } = useApp();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  function handlePick(code: SupportedLang) {
    setTtsLanguage(code);
    pickLang(code);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: height }]}>
      <View style={styles.center}>
        <View style={styles.logoBox}>
          <WaveformIcon size={44} color={Colors.white} />
        </View>

        <Text style={styles.title}>Choose your language</Text>
        <Text style={styles.sub}>
          Set once — voice guidance speaks in your language.{'\n'}
          Hitamo ururimi · Choisissez votre langue.
        </Text>

        <View style={styles.grid}>
          {LANGUAGES.map(lng => (
            <TouchableOpacity
              key={lng.code}
              style={styles.langBtn}
              onPress={() => handlePick(lng.code)}
              accessibilityLabel={`Select language: ${lng.en}`}
            >
              <Text style={styles.langNative}>{lng.native}</Text>
              <Text style={styles.langEn}>{lng.en}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.footnote}>
          Changeable anytime in Settings · pilot languages provisional
        </Text>
      </View>
    </View>
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
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoBox: {
    width: 70,
    height: 70,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 29,
    fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
    color: Colors.white,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  sub: {
    fontSize: 15,
    color: '#A7B6C9',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 430,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 32,
    justifyContent: 'center',
    maxWidth: 480,
  },
  langBtn: {
    width: 220,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    padding: 17,
  },
  langNative: {
    fontSize: 18,
    fontFamily: 'IBMPlexSans-Regular', fontWeight: '400',
    color: Colors.white,
  },
  langEn: {
    fontSize: 13,
    color: '#A7B6C9',
    marginTop: 3,
  },
  footnote: {
    fontSize: 11.5,
    color: '#5E7290',
    marginTop: 30,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
