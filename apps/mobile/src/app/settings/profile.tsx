import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, FormMessage, Loadable, Screen, Text, TextField } from '@/components';
import { fetchProfile, friendlyError, updateProfile } from '@/lib/data';
import { toForm, validateProfile, type ProfileErrors, type ProfileForm } from '@/lib/profile';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { space } from '@/theme';

export default function ProfileSettings() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const profile = useLoad(useCallback(() => fetchProfile(userId), [userId]));

  return (
    <Screen title="Profile & payments" onBack={() => router.back()}>
      <Loadable load={profile} errorMessage="Couldn’t load your profile.">
        {(saved) => <ProfileEditor userId={userId} initial={saved} />}
      </Loadable>
    </Screen>
  );
}

function ProfileEditor({ userId, initial }: { userId: string; initial: ProfileForm }) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  function edit(field: keyof ProfileForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaveError(null);
    setJustSaved(false);
  }

  async function save() {
    const result = validateProfile(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      await updateProfile(userId, result.values);
      // Show the cleaned-up values, e.g. "@leo" becomes "leo".
      const cleaned = toForm(result.values);
      setForm(cleaned);
      setSaved(cleaned);
      setJustSaved(true);
    } catch (e) {
      setSaveError(friendlyError(e as Error));
    } finally {
      setSaving(false);
    }
  }

  const dirty = (Object.keys(form) as (keyof ProfileForm)[]).some(
    (key) => form[key] !== saved[key],
  );

  return (
    <>
      <TextField
        label="Display name"
        value={form.display_name}
        onChangeText={(text) => edit('display_name', text)}
        hint="What people in your groups see."
        error={errors.display_name}
        autoComplete="name"
        textContentType="name"
        maxLength={80}
      />

      <View style={styles.section}>
        <View style={styles.sectionIntro}>
          <Text variant="sectionHeading">Getting paid</Text>
          <Text variant="small">
            {"Roommates use these to pay you back. Leave any you don't use blank."}
          </Text>
        </View>
        <TextField
          label="Venmo"
          value={form.venmo_username}
          onChangeText={(text) => edit('venmo_username', text)}
          placeholder="username"
          hint="Your username, without the @."
          error={errors.venmo_username}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="PayPal"
          value={form.paypal_username}
          onChangeText={(text) => edit('paypal_username', text)}
          placeholder="username"
          hint="The name in your paypal.me link."
          error={errors.paypal_username}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Cash App"
          value={form.cashapp_tag}
          onChangeText={(text) => edit('cashapp_tag', text)}
          placeholder="$cashtag"
          hint="Your $cashtag."
          error={errors.cashapp_tag}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {saveError ? <FormMessage message={saveError} /> : null}
        {justSaved ? <Text variant="small">Saved.</Text> : null}
        <Button label="Save" onPress={() => void save()} loading={saving} disabled={!dirty} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
  },
  sectionIntro: {
    gap: space.xs,
  },
});
