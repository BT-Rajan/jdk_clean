/**
 * Design tokens ported 1:1 from frontend/src/index.css's "Obsidian &
 * Champagne" @theme block, so this app stays in sync with the web app's
 * look. If index.css's tokens ever change, mirror the change here too.
 */
export const colors = {
  ink950: '#05050a',
  ink900: '#0b0b12',
  ink800: '#12121c',
  ink700: '#1a1a28',
  ink600: '#262638',

  gold100: '#faf3e2',
  gold200: '#f1d999',
  gold300: '#e4c37e',
  gold400: '#d4af6a',
  gold500: '#c39a4e',
  gold600: '#b9873c',
  gold700: '#8f6a2c',

  violet500: '#6a4fb3',
  violet600: '#4c3480',

  // Tailwind defaults the web app borrows for alerts/status (red/emerald/sky)
  red200: '#fecaca',
  red400: '#f87171',
  red500: '#ef4444',
  emerald200: '#a7f3d0',
  emerald400: '#34d399',
  emerald500: '#10b981',
  sky200: '#bae6fd',
  sky400: '#38bdf8',
  sky500: '#0ea5e9',

  white: '#ffffff',
} as const;

/** rgba(white, alpha) helpers -- stand-ins for the web app's
 * color-mix(in oklab, white N%, transparent) utilities. Not a perfect
 * oklab match, but visually equivalent for a UI this size. */
export const whiteAlpha = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;
export const blackAlpha = (alpha: number) => `rgba(0, 0, 0, ${alpha})`;

export const fonts = {
  // Falls back to system serif/sans until @expo-google-fonts loads --
  // see App.tsx's useFonts() call.
  display: 'PlayfairDisplay_600SemiBold',
  displayMedium: 'PlayfairDisplay_500Medium',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
};

export const radii = {
  md: 10,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 999,
};

/** Approximates the web app's glass-panel / glass-inset utilities --
 * React Native has no backdrop-filter, so this leans on translucent
 * fill + border to read as "glass" against the dark ink background. */
export const glass = {
  panel: {
    backgroundColor: whiteAlpha(0.06),
    borderWidth: 1,
    borderColor: whiteAlpha(0.12),
  },
  panelStrong: {
    backgroundColor: whiteAlpha(0.09),
    borderWidth: 1,
    borderColor: whiteAlpha(0.16),
  },
  inset: {
    backgroundColor: whiteAlpha(0.04),
    borderWidth: 1,
    borderColor: whiteAlpha(0.1),
  },
};

/** Mirrors Button.tsx's `shadow-glow-gold` utility (a soft gold ambient
 * shadow around primary CTAs), using RN's shadow/elevation props. */
export const glowGold = {
  shadowColor: colors.gold500,
  shadowOpacity: 0.45,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
};
