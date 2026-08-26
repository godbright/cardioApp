import type { TextStyle } from 'react-native';

// ── Font family names (must match file names in android/app/src/main/assets/fonts/) ──
export const Fonts = {
  sansRegular:  'IBMPlexSans-Regular',
  sansMedium:   'IBMPlexSans-Medium',
  sansSemiBold: 'IBMPlexSans-SemiBold',
  sansBold:     'IBMPlexSans-Bold',
  monoRegular:  'IBMPlexMono-Regular',
  monoBold:     'IBMPlexMono-Bold',
} as const;

type TRStyle = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'fontWeight' | 'letterSpacing' | 'lineHeight'>;

// ── Typography role constants ──────────────────────────────────────────────────
// Spread into StyleSheet.create() objects: { ...TR.cardTitle, color: Colors.textDark }
export const TR: Record<string, TRStyle> = {
  // IBM Plex Sans
  screenTitle:   { fontFamily: 'IBMPlexSans-Bold',     fontSize: 28, fontWeight: '700', letterSpacing: -0.28 },
  sectionHead:   { fontFamily: 'IBMPlexSans-Bold',     fontSize: 22, fontWeight: '700' },
  cardTitle:     { fontFamily: 'IBMPlexSans-SemiBold', fontSize: 18, fontWeight: '600' },
  cardTitleBold: { fontFamily: 'IBMPlexSans-Bold',     fontSize: 19, fontWeight: '700', letterSpacing: -0.19 },
  bodyLg:        { fontFamily: 'IBMPlexSans-Regular',  fontSize: 16, fontWeight: '400', lineHeight: 26 },
  body:          { fontFamily: 'IBMPlexSans-Regular',  fontSize: 15, fontWeight: '400', lineHeight: 24 },
  label:         { fontFamily: 'IBMPlexSans-Medium',   fontSize: 14, fontWeight: '500' },
  labelSm:       { fontFamily: 'IBMPlexSans-Medium',   fontSize: 13, fontWeight: '500' },
  caption:       { fontFamily: 'IBMPlexSans-Regular',  fontSize: 12, fontWeight: '400' },
  captionSm:     { fontFamily: 'IBMPlexSans-Regular',  fontSize: 11, fontWeight: '400' },

  // IBM Plex Mono
  // letterSpacing: 2 ≈ 0.18em at 11 px (close to the 0.2–0.28em spec)
  monoLabel:   { fontFamily: 'IBMPlexMono-Regular', fontSize: 11, fontWeight: '400', letterSpacing: 2 },
  monoLabelMd: { fontFamily: 'IBMPlexMono-Regular', fontSize: 12, fontWeight: '400', letterSpacing: 2.4 },
  monoCode:    { fontFamily: 'IBMPlexMono-Regular', fontSize: 14, fontWeight: '400', letterSpacing: 0.3 },
  clinicalVal: { fontFamily: 'IBMPlexMono-Bold',    fontSize: 18, fontWeight: '700' },
};

// Legacy aliases kept for any code that still references the old Fonts object
export const FontWeights = {
  regular:  '400' as const,
  medium:   '500' as const,
  semiBold: '600' as const,
  bold:     '700' as const,
};
