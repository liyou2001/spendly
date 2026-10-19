import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { normalizePhone } from '@/lib/phone';
import { useUsernameCheck } from '@/lib/useUsernameCheck';
import { space } from '@/theme';

import { Button } from './Button';
import { FormMessage, TextField } from './TextField';
import { UsernameField } from './UsernameField';

interface AddPersonFormProps {
  /**
   * Resolve when added; throw (with a message to show) if it failed. `inviteUserId` is set when
   * a Spendly username was given: that account is invited to be this person.
   */
  onAdd: (displayName: string, phone: string | null, inviteUserId: string | null) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  /** Called with true while something is typed but not yet added. */
  onPendingChange?: (pending: boolean) => void;
}

/** Name, and optionally their Spendly username (to invite them) and phone. */
export function AddPersonForm({
  onAdd,
  onCancel,
  submitLabel = 'Add person',
  onPendingChange,
}: AddPersonFormProps) {
  const [fields, setFields] = useState({ name: '', username: '', phone: '' });
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const check = useUsernameCheck(fields.username, 'find');
  const found = check.status === 'found' ? check.user : null;

  function edit(field: keyof typeof fields, value: string) {
    const next = { ...fields, [field]: value };
    setFields(next);
    setNameError(null);
    setPhoneError(null);
    setFormError(null);
    onPendingChange?.(Object.values(next).some((v) => v.trim() !== ''));
  }

  async function submit() {
    const parsedPhone = normalizePhone(fields.phone);
    setPhoneError(parsedPhone.ok ? null : parsedPhone.error);

    if (fields.username.trim() && !found) {
      setFormError(
        check.status === 'checking'
          ? 'Still checking the username. Try again in a moment.'
          : 'Fix the Spendly username, or clear it.',
      );
      return;
    }
    // With a Spendly account, their own name is used unless you type one.
    const displayName = fields.name.trim() || found?.displayName || '';
    if (!displayName) setNameError('Enter their name.');
    if (!displayName || !parsedPhone.ok) return;

    setAdding(true);
    setFormError(null);
    try {
      await onAdd(displayName, parsedPhone.phone, found?.userId ?? null);
      setFields({ name: '', username: '', phone: '' });
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
        label={found ? 'Name (optional)' : 'Name'}
        value={fields.name}
        onChangeText={(text) => edit('name', text)}
        error={nameError}
        placeholder={found?.displayName ?? 'Jeff'}
        autoCapitalize="words"
        maxLength={80}
        returnKeyType="next"
      />
      <UsernameField
        label="Spendly username (optional)"
        value={fields.username}
        onChangeText={(text) => edit('username', text)}
        check={check}
        hint="If they use Spendly, they’ll get an invite and see their share in their app."
      />
      <TextField
        label="Phone (optional)"
        value={fields.phone}
        onChangeText={(text) => edit('phone', text)}
        error={phoneError}
        hint="Used to send them payment requests from your phone."
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
            label={found ? `${submitLabel} & invite` : submitLabel}
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
