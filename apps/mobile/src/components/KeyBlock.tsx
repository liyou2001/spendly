import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '@/theme';

interface KeyBlockProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** The light purple block that holds the one key thing on a screen. Use at most one per screen. */
export function KeyBlock({ children, style }: KeyBlockProps) {
  return <View style={[styles.block, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.accentPale,
    borderRadius: radius.keyBlock,
    padding: space.gutter,
    gap: space.sm,
  },
});
