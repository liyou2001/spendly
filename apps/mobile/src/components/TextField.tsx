import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, sizes, space, type } from '@/theme';

import { Text } from './Text';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  /** Replaces the hint and marks the field with an attention dot. */
  error?: string | null | undefined;
}

export function TextField({ label, hint, error, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.field}>
      <Text variant="sectionHeading">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        {...inputProps}
      />
      {error ? <FormMessage message={error} /> : hint ? <Text variant="small">{hint}</Text> : null}
    </View>
  );
}

export function FormMessage({ message }: { message: string }) {
  return (
    <View style={styles.message} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <View style={styles.dot} />
      <Text variant="small" style={styles.messageText}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space.sm,
  },
  input: {
    ...type.body,
    minHeight: 50,
    borderWidth: sizes.hairline,
    borderColor: colors.controlBorder,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  dot: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  messageText: {
    flex: 1,
    color: colors.ink,
  },
});
