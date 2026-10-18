import { StyleSheet, View } from 'react-native';

import { colors, fonts, radius } from '@/theme';

import { Text } from './Text';

interface AvatarProps {
  name: string;
  size?: number;
  /** White circle instead, for avatars that sit on the pale orange KeyBlock. */
  onKeyBlock?: boolean;
}

/** First letter of a name in a pale orange circle. */
export function Avatar({ name, size = 40, onKeyBlock = false }: AvatarProps) {
  // Array.from splits by code point, so a name starting with an accented or non-Latin letter works.
  const initial = (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase();

  return (
    <View
      accessibilityLabel={name}
      style={[styles.circle, onKeyBlock && styles.onKeyBlock, { width: size, height: size }]}
    >
      <Text
        style={[styles.initial, { fontSize: size * 0.42, lineHeight: size * 0.5 }]}
        importantForAccessibility="no"
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.pill,
    backgroundColor: colors.accentPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onKeyBlock: {
    backgroundColor: colors.background,
  },
  initial: {
    fontFamily: fonts.medium,
    color: colors.ink,
  },
});
