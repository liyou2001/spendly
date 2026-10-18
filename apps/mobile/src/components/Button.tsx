import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { colors, radius, sizes, space } from '@/theme';

import { Text } from './Text';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Primary is solid ink; secondary is outlined. */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Shows a spinner and ignores taps. */
  loading?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const primary = variant === 'primary';
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.onInk : colors.ink} />
      ) : (
        <Text variant="bodyMedium" style={primary ? styles.primaryLabel : undefined}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    minWidth: sizes.touch,
    borderRadius: radius.button,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.ink,
  },
  secondary: {
    backgroundColor: colors.background,
    borderWidth: sizes.hairline,
    borderColor: colors.controlBorder,
  },
  primaryLabel: {
    color: colors.onInk,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
});
