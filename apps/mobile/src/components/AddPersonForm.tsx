import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { normalizePhone } from '@/lib/phone';
import { space } from '@/theme';

import { Button } from './Button';
import { FormMessage, TextField } from './TextField';

interface AddPersonFormProps {
  /** Resolve when added; throw (with a message to show) if it failed. */
  onAdd: (displayName: string, phone: string | null) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  /** Called with true while a name or phone is typed but not yet added. */
  onPendingChange?: (pending: boolean) => void;
}

export function AddPersonForm({
  onAdd,
  onCancel,
  submitLabel = 'Add person',
  onPendingChange,
}: AddPersonFormProps) {
  const [name, setNameState] = useState('');
  const [phone, setPhoneState] = useState('');

  function setName(next: string) {
    setNameState(next);
    onPendingChange?.(next.trim() !== '' || phone.trim() !== '');
  }
  function setPhone(next: string) {
    setPhoneState(next);
    onPendingChange?.(name.trim() !== '' || next.trim() !== '');
  }
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function submit() {
    const displayName = name.trim();
    const parsedPhone = normalizePhone(phone);
    setNameError(displayName ? null : 'Enter their name.');
    setPhoneError(parsedPhone.ok ? null : parsedPhone.error);
    if (!displayName || !parsedPhone.ok) return;

    setAdding(true);
    setFormError(null);
    try {
      await onAdd(displayName, parsedPhone.phone);
      setNameState('');
      setPhoneState('');
      onPendingChange?.(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Couldn’t add them. Try again.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        label="Name"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setNameError(null);
        }}
        error={nameError}
        placeholder="Jeff"
        autoCapitalize="words"
        maxLength={80}
        returnKeyType="next"
      />
      <TextField
        label="Phone (optional)"
        value={phone}
        onChangeText={(text) => {
          setPhone(text);
          setPhoneError(null);
        }}
        error={phoneError}
        hint="Used later to send them payment requests from your phone."
        placeholder="(608) 555-1234"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
      />
      {formError ? <FormMessage message={formError} /> : null}
      <View style={styles.actions}>
        {onCancel ? (
          <View style={styles.action}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} />
          </View>
        ) : null}
        <View style={styles.action}>
          <Button
            label={submitLabel}
            variant="secondary"
            onPress={() => void submit()}
            loading={adding}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
  },
  action: {
    flex: 1,
  },
});
