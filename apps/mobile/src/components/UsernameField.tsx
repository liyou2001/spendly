import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';

import type { UsernameCheck } from '@/lib/usernameCheck';
import { colors, space } from '@/theme';

import { Text } from './Text';
import { FormMessage, TextField } from './TextField';

interface UsernameFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  check: UsernameCheck;
  /** Shown while the field is empty. */
  hint?: string;
}

/** A Spendly username input that says, as you type, whether it's found, free or taken. */
export function UsernameField({ label, value, onChangeText, check, hint }: UsernameFieldProps) {
  return (
    <View style={styles.field}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder="@username"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        maxLength={21}
      />
      <Status check={check} hint={hint} value={value} />
    </View>
  );
}

function Status({
  check,
  hint,
  value,
}: {
  check: UsernameCheck;
  hint?: string | undefined;
  value: string;
}) {
  switch (check.status) {
    case 'empty':
      return hint ? <Text variant="small">{hint}</Text> : null;
    case 'checking':
      return <Text variant="small">Checking…</Text>;
    case 'found':
      return (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <Feather name="check-circle" size={16} color={colors.ink} />
          <Text variant="bodyMedium" style={styles.flex}>
            {check.user.displayName} <Text variant="small">@{check.user.username}</Text>
          </Text>
        </View>
      );
    case 'available':
      return (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <Feather name="check-circle" size={16} color={colors.ink} />
          <Text variant="small" style={styles.flex}>
            @{value.trim().replace(/^@/, '').toLowerCase()} is available
          </Text>
        </View>
      );
    case 'notFound':
      return <FormMessage message="No one has that username." />;
    case 'taken':
      return <FormMessage message="That username is taken." />;
    case 'invalid':
      return <FormMessage message={check.message} />;
    case 'error':
      return <FormMessage message="Couldn’t check right now. Check your connection." />;
  }
}

const styles = StyleSheet.create({
  field: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  flex: {
    flex: 1,
  },
});
