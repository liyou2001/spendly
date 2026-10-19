import Feather from '@expo/vector-icons/Feather';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, sizes, space } from '@/theme';

import { Text } from './Text';

interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Makes the row tappable and shows a chevron. */
  onPress?: () => void;
  /** Thin divider under the row. Turn off for the last row in a list. */
  divider?: boolean;
}

/** One line in a list. Lists are separated by thin dividers, not cards. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  divider = true,
}: ListRowProps) {
  const content = (
    <>
      {leading}
      <View style={styles.text}>
        <Text variant="body" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress ? <Feather name="chevron-right" size={20} color={colors.muted} /> : null}
    </>
  );

  const rowStyle = [styles.row, divider && styles.divider];

  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  divider: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.divider,
  },
  pressed: {
    opacity: 0.6,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
