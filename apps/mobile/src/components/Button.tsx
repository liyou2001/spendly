import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, sizes, space } from '@/theme';

import { Text } from './Text';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Primary is solid orange; secondary is outlined. */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Shows a spinner and ignores taps. */
  loading?: boolean;
  /** Before the label, e.g. a sign-in provider's logo. */
  leading?: ReactNode;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  leading,
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
        <ActivityIndicator color={primary ? colors.onAccent : colors.ink} />
      ) : (
        <View style={styles.content}>
          {leading}
          <Text variant="bodyMedium" style={primary ? styles.primaryLabel : undefined}>
            {label}
          </Text>
        </View>
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
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.background,
    borderWidth: sizes.hairline,
    borderColor: colors.controlBorder,
  },
  primaryLabel: {
    color: colors.onAccent,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
});
