import { formatAmount, formatCents, parseCents, type Cents } from '@spendly/ledger';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PaymentMethod } from '@/lib/data';
import { deviceDecimalSeparator } from '@/lib/locale';
import { MAX_AMOUNT_CENTS, normalizeAmount } from '@/lib/split';
import { space } from '@/theme';

import { Button } from './Button';
import { Chip } from './Chip';
import { Text } from './Text';
import { TextField } from './TextField';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'venmo', label: 'Venmo' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

interface AmountFormProps {
  label: string;
  submitLabel: string;
  /** Filled in to start; partial amounts can be typed over it. */
  initialCents: Cents;
  /** Amounts above this are refused, e.g. more than someone owes when forgiving. */
  maxCents?: Cents;
  /** Ask how it was paid. */
  withMethod?: boolean;
  /** Muted line under the field, e.g. what happens on submit. */
  hint?: string;
  /** Throw an Error with a message to show if it fails. */
  onSubmit: (amountCents: Cents, method: PaymentMethod | null) => Promise<void>;
  onCancel: () => void;
}

/** An amount, optionally how it was paid, and Cancel / submit buttons. */
export function AmountForm({
  label,
  submitLabel,
  initialCents,
  maxCents,
  withMethod = false,
  hint,
  onSubmit,
  onCancel,
}: AmountFormProps) {
  const [separator] = useState(deviceDecimalSeparator);
  const [text, setText] = useState(
    initialCents > 0 ? formatAmount(initialCents).replace('.', separator) : '',
  );
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cents = parseCents(normalizeAmount(text.trim(), separator));
    const limit = Math.min(maxCents ?? MAX_AMOUNT_CENTS, MAX_AMOUNT_CENTS);
    if (cents === null || cents === 0) {
      setError(`Enter an amount like 12${separator}34.`);
      return;
    }
    if (cents > limit) {
      setError(`That’s more than ${formatCents(limit)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(cents, method);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        label={label}
        value={text}
        onChangeText={(next) => {
          setText(next);
          setError(null);
        }}
        keyboardType="decimal-pad"
        error={error}
        {...(hint ? { hint } : {})}
        autoFocus
      />
      {withMethod ? (
        <View style={styles.methods}>
          <Text variant="small">How?</Text>
          <View style={styles.chips}>
            {METHODS.map((m) => (
              <Chip
                key={m.value}
                label={m.label}
                selected={method === m.value}
                onPress={() => setMethod(method === m.value ? null : m.value)}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
        <View style={styles.action}>
          <Button label={submitLabel} onPress={() => void submit()} loading={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
  methods: {
    gap: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
  },
  action: {
    flex: 1,
  },
});
