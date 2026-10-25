import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, FormMessage, Screen, Text, TextField } from '@/components';
import { friendlyError, setMyName } from '@/lib/data';
import { useName } from '@/lib/name';
import { validateName } from '@/lib/profile';
import { space } from '@/theme';

/** Asked once, right after the first sign-in: the name people in your groups will see. */
export default function Welcome() {
  const { markNamed } = useName();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [errors, setErrors] = useState<{
    first_name?: string | undefined;
    last_name?: string | undefined;
  }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const name = validateName(first, last);
    if (!name.ok) {
      setErrors(name.errors);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await setMyName(name.first, name.last);
      markNamed();
    } catch (e) {
      setSaveError(friendlyError(e as Error));
      setSaving(false);
    }
  }

  return (
    <Screen title="What’s your name?" edges={['top', 'bottom', 'left', 'right']}>
      <Text variant="body">
        People in your groups see your full name, and so does anyone you send a payment link to.
      </Text>
      <View style={styles.fields}>
        <TextField
          label="First name"
          value={first}
          onChangeText={(text) => {
            setFirst(text);
            setErrors((prev) => ({ ...prev, first_name: undefined }));
          }}
          error={errors.first_name}
          autoComplete="given-name"
          textContentType="givenName"
          autoCapitalize="words"
          maxLength={40}
          autoFocus
        />
        <TextField
          label="Last name"
          value={last}
          onChangeText={(text) => {
            setLast(text);
            setErrors((prev) => ({ ...prev, last_name: undefined }));
          }}
          error={errors.last_name}
          autoComplete="family-name"
          textContentType="familyName"
          autoCapitalize="words"
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />
      </View>
      {saveError ? <FormMessage message={saveError} /> : null}
      <Button label="Continue" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: space.lg,
  },
});
