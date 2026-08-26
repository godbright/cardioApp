export const Colors = {
  // ── Brand / primary ────────────────────────────────────────────────────────
  navy:        '#0B2545',   // header bar, CTA buttons, icon backgrounds
  navyHover:   '#0E2D54',
  nearBlack:   '#11151C',   // tablet bezel

  // ── Accent ─────────────────────────────────────────────────────────────────
  teal:        '#0E7C86',   // primary action / CTA
  skyBlue:     '#5AA9E6',   // secondary accent
  mint:        '#7FE0B6',   // status indicators and icons on dark backgrounds

  // ── Semantic results ───────────────────────────────────────────────────────
  green:       '#2E8B57',   // normal result — always pair with icon, never color-only
  red:         '#C8423A',   // abnormal / urgent — reserved for clinical findings
  amber:       '#D9A441',   // inconclusive / warning

  // ── Backgrounds ────────────────────────────────────────────────────────────
  bgWarm:      '#F4F6F9',   // app screen background
  bgCanvas:    '#EAEDF1',   // page canvas (table rows, list areas)
  bgCapture:   '#0B2545',   // full-screen dark capture view
  bgWaveform:  '#081A2E',   // waveform panel

  // ── Text ───────────────────────────────────────────────────────────────────
  textHeading: '#1B2733',   // dark headings on white
  textDark:    '#1F2933',   // default body text
  textMid:     '#3E4C59',   // secondary text, form labels
  textSecondary:'#4A5560',  // slightly lighter secondary
  textMute:    '#7B8794',   // muted / tertiary
  textLight:   '#8A95A1',   // captions
  textFaint:   '#9AA5B1',   // lightest foreground
  textReversed:'#A7B6C9',   // reversed text on dark backgrounds
  textRevMuted:'#DCE3EC',   // lighter reversed text

  // ── Borders / dividers ─────────────────────────────────────────────────────
  border:      '#DDE2E8',
  borderMid:   '#D4D9DF',
  borderLight: '#ECEFF2',
  borderFaint: '#F1F4F7',

  // ── Surfaces ───────────────────────────────────────────────────────────────
  white:       '#FFFFFF',   // cards, modals, inputs

  // ── Overlays (capture screen) ──────────────────────────────────────────────
  overlay05:   'rgba(255,255,255,0.05)',
  overlay08:   'rgba(255,255,255,0.08)',
  overlay10:   'rgba(255,255,255,0.10)',
  overlay13:   'rgba(255,255,255,0.13)',

  // ── Status dot colours (History / Session Hub) ─────────────────────────────
  statusNormal:   '#2E8B57',
  statusAbnormal: '#C8423A',
  statusPending:  '#D9A441',
  statusNone:     '#CBD2D9',
  statusEcg:      '#0E7C86',

  // ── Chip / tag backgrounds ─────────────────────────────────────────────────
  rhdChipBg:     '#FBF2DD',
  rhdChipBorder: '#F0E2BE',
  rhdChipText:   '#8A5A12',
} as const;
