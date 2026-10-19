import { StyleSheet, View } from 'react-native';

import { colors, radius, sizes, space } from '@/theme';

import { Text } from './Text';

interface TagProps {
  label: string;
  /** "accent" is pale orange, for "You" tags. "neutral" is outlined. */
  tone?: 'accent' | 'neutral';
}

export function Tag({ label, tone = 'neutral' }: TagProps) {
  return (
    <View style={[styles.tag, tone === 'accent' ? styles.accent : styles.neutral]}>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.md - 2,
    paddingVertical: 3,
  },
  accent: {
    backgroundColor: colors.accentPale,
  },
  neutral: {
    borderWidth: sizes.hairline,
    borderColor: colors.controlBorder,
  },
  label: {
    color: colors.ink,
  },
});
