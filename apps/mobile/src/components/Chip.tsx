import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, sizes, space } from '@/theme';

import { Text } from './Text';

interface ChipProps {
  label: string;
  onPress: () => void;
  selected?: boolean;
  /** "you" is light purple, the color reserved for "You" tags. */
  tone?: 'neutral' | 'you';
  icon?: ComponentProps<typeof Feather>['name'];
  /** Read out instead of the label, e.g. "Who it's for: All. Tap to change." */
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** A tappable, fully rounded pill for picking people, payers, categories and modes. */
export function Chip({
  label,
  onPress,
  selected = false,
  tone = 'neutral',
  icon,
  accessibilityLabel,
  accessibilityHint,
}: ChipProps) {
  const filled = selected && tone === 'neutral';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      // Chips are drawn smaller than 44pt; the hit area still meets it.
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        tone === 'you' ? styles.you : filled ? styles.selected : styles.neutral,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Feather name={icon} size={15} color={filled ? colors.onInk : colors.ink} /> : null}
      <Text
        variant="small"
        numberOfLines={1}
        style={[styles.label, filled && styles.selectedLabel]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    borderWidth: sizes.hairline,
  },
  neutral: {
    borderColor: colors.controlBorder,
    backgroundColor: colors.background,
  },
  selected: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  you: {
    borderColor: colors.accentPale,
    backgroundColor: colors.accentPale,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.ink,
  },
  selectedLabel: {
    color: colors.onInk,
  },
});
