import { StyleSheet, View } from 'react-native';

import { colors, radius, sizes, space } from '@/theme';

import { Text } from './Text';

interface TagProps {
  label: string;
  /**
   * "accent" is pale orange, for "You" tags. "neutral" is outlined. "white" is a solid white
   * bubble, for tags that sit on the pale orange key block (e.g. a category).
   */
  tone?: 'accent' | 'neutral' | 'white';
}

export function Tag({ label, tone = 'neutral' }: TagProps) {
  return (
    <View style={[styles.tag, styles[tone]]}>
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
  white: {
    backgroundColor: colors.background,
  },
  label: {
    color: colors.ink,
  },
});
