import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, sizes, space } from '@/theme';

import { Text } from './Text';

interface TextButtonProps {
  label: string;
  onPress: () => void;
  icon?: ComponentProps<typeof Feather>['name'];
  disabled?: boolean;
}

/** A small borderless button, for secondary actions like "Add item" or "Add tax". */
export function TextButton({ label, onPress, icon, disabled = false }: TextButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dim]}
    >
      {icon ? <Feather name={icon} size={18} color={colors.ink} /> : null}
      <Text variant="bodyMedium">{label}</Text>
    </Pressable>
  );
}

/** An icon-only button with a 44pt hit area, e.g. close or remove. */
export function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.icon, pressed && styles.dim]}
    >
      <Feather name={icon} size={sizes.icon} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.touch,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
  },
  icon: {
    width: sizes.touch,
    height: sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: {
    opacity: 0.5,
  },
});
