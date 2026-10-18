import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Avatar, Button, FormMessage, KeyBlock, Screen, Text, TextField } from '@/components';
import {
  profileColumns,
  toForm,
  validateProfile,
  type ProfileErrors,
  type ProfileForm,
} from '@/lib/profile';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; saved: ProfileForm };

async function fetchProfile(userId: string): Promise<ProfileForm | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileColumns)
    .eq('id', userId)
    .single();
  return error ? null : toForm(data);
}

export default function Me() {
  const { session } = useSession();
  const userId = session?.user.id;
  const email = session?.user.email;

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  function applyLoaded(profile: ProfileForm | null) {
    if (!profile) {
      setLoad({ status: 'error' });
      return;
    }
    setLoad({ status: 'ready', saved: profile });
    setForm(profile);
  }

  useEffect(() => {
    if (!userId) return;
    let current = true;
    void fetchProfile(userId).then((profile) => {
      if (current) applyLoaded(profile);
    });
    return () => {
      current = false;
    };
  }, [userId]);

  function retry() {
    if (!userId) return;
    setLoad({ status: 'loading' });
    void fetchProfile(userId).then(applyLoaded);
  }

  function edit(field: keyof ProfileForm, value: string) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaveError(null);
    setJustSaved(false);
  }

  async function save() {
    if (!form || !userId) return;
    const result = validateProfile(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update(result.values).eq('id', userId);
    setSaving(false);
    if (error) {
      setSaveError("Couldn't save. Check your connection and try again.");
      return;
    }
    // Show the cleaned-up values, e.g. "@leo" becomes "leo".
    const saved = toForm(result.values);
    setForm(saved);
    setLoad({ status: 'ready', saved });
    setJustSaved(true);
  }

  async function signOut() {
    setSigningOut(true);
    // Clears the saved session even if the network call fails; the route guard then shows sign-in.
    await supabase.auth.signOut();
    setSigningOut(false);
  }

  const dirty =
    load.status === 'ready' &&
    form !== null &&
    (Object.keys(form) as (keyof ProfileForm)[]).some((key) => form[key] !== load.saved[key]);

  return (
    <Screen title="Me">
      <KeyBlock style={styles.identity}>
        <Avatar
          name={load.status === 'ready' ? load.saved.display_name : (email ?? '?')}
          size={52}
          onKeyBlock
        />
        <View style={styles.identityText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {load.status === 'ready' ? load.saved.display_name : ' '}
          </Text>
          <Text variant="small" numberOfLines={1}>
            {email}
          </Text>
        </View>
      </KeyBlock>

      {load.status === 'loading' ? (
        <ActivityIndicator color={colors.ink} />
      ) : load.status === 'error' || !form ? (
        <View style={styles.section}>
          <FormMessage message="Couldn't load your profile." />
          <Button label="Try again" variant="secondary" onPress={retry} />
        </View>
      ) : (
        <>
          <View style={styles.section}>
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
          </View>

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
      )}

      <Button
        label="Sign out"
        variant="secondary"
        onPress={() => void signOut()}
        loading={signingOut}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  section: {
    gap: space.lg,
  },
  sectionIntro: {
    gap: space.xs,
  },
});
