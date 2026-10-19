// Design tokens from the Design section of CLAUDE.md. Screens and components take every
// color, font, size and spacing from here instead of hard-coding them.
import { HankenGrotesk_300Light } from '@expo-google-fonts/hanken-grotesk/300Light';
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular';
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium';
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold';
import type { TextStyle } from 'react-native';

export const colors = {
  background: '#FFFFFF',
  /** The one key block per screen, the active tab, "You" tags, avatars and open dropdowns. */
  accentPale: '#F8DFD9',
  /**
   * Coral: primary buttons, selected chips, the + button, progress bars and attention dots.
   * Bars and dots are 2.5:1 on white, so they always sit beside text saying the same thing.
   */
  accent: '#E58C76',
  /** Text. */
  ink: '#2B2420',
  /** Text and icons on `accent`. Dark, because white on it is only 2.5:1; ink is 6.1:1. */
  onAccent: '#2B2420',
  muted: '#6B5F57',
  divider: '#F1E7DF',
  controlBorder: '#E2D5CB',
} as const;

// Each weight is its own static font file (variable fonts need SDK 58), so a weight is picked
// by family name, never with fontWeight.
export const fontFiles = {
  HankenGrotesk_300Light,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
};

export const fonts = {
  light: 'HankenGrotesk_300Light',
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
} as const satisfies Record<string, keyof typeof fontFiles>;

export const type = {
  bigNumber: {
    fontFamily: fonts.light,
    fontSize: 52,
    lineHeight: 60,
    letterSpacing: 52 * -0.03,
    fontVariant: ['tabular-nums'],
    color: colors.ink,
  },
  screenTitle: { fontFamily: fonts.medium, fontSize: 26, lineHeight: 32, color: colors.ink },
  sectionHeading: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.ink },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.muted },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 17, color: colors.muted },
} as const satisfies Record<string, TextStyle>;

export const space = {
  /** Side margins on every screen. */
  gutter: 24,
  /** Between sections. */
  section: 28,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const radius = {
  keyBlock: 24,
  button: 14,
  /** Tags, avatars and the add button are fully rounded. */
  pill: 999,
} as const;

export const sizes = {
  /** Minimum height of anything tappable. */
  touch: 44,
  hairline: 1,
  icon: 22,
} as const;
