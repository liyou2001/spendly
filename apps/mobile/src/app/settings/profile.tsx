import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  FormMessage,
  Loadable,
  Screen,
  Text,
  TextField,
  UsernameField,
} from '@/components';
import {
  fetchAutoConfirmDays,
  fetchProfile,
  friendlyError,
  setAutoConfirmDays,
  updateProfile,
} from '@/lib/data';
import { toForm, validateProfile, type ProfileErrors, type ProfileForm } from '@/lib/profile';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { useUsernameCheck } from '@/lib/useUsernameCheck';
import { colors, space } from '@/theme';

export default function ProfileSettings() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const profile = useLoad(useCallback(() => fetchProfile(userId), [userId]));

  return (
    <Screen title="Profile & payments" onBack={() => router.back()}>
      <Loadable load={profile} errorMessage="Couldn’t load your profile.">
        {(saved) => <ProfileEditor userId={userId} initial={saved} />}
      </Loadable>
      <AutoConfirm userId={userId} />
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

  // Your saved username counts as available, so an unchanged one never blocks saving.
  const usernameCheck = useUsernameCheck(form.username, 'available', saved.username);
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

      <UsernameField
        label="Username"
        value={form.username}
        onChangeText={(text) => edit('username', text)}
        check={usernameCheck}
      />
      {errors.username ? <FormMessage message={errors.username} /> : null}
      <Text variant="small">People add you to their groups with your username.</Text>

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
        <TextField
          label="Zelle"
          value={form.zelle_contact}
          onChangeText={(text) => edit('zelle_contact', text)}
          placeholder="Email or phone number"
          hint="The email or US phone number your Zelle uses."
          error={errors.zelle_contact}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <View style={styles.warning}>
          <Feather name="alert-triangle" size={16} color={colors.ink} style={styles.warningIcon} />
          <Text variant="small" style={styles.warningText}>
            Zelle has no usernames, so this email or phone number is shown as is: to people in your
            groups, and on payment links you send. Anyone you forward a link to can see it too. Only
            add it if you’re OK sharing it.
          </Text>
        </View>
        {saveError ? <FormMessage message={saveError} /> : null}
        {justSaved ? <Text variant="small">Saved.</Text> : null}
        <Button
          label="Save"
          onPress={() => void save()}
          loading={saving}
          disabled={!dirty || usernameCheck.status !== 'available'}
        />
      </View>
    </>
  );
}

const AUTO_CONFIRM_CHOICES = [
  { days: null, label: 'Off' },
  { days: 3, label: 'After 3 days' },
  { days: 7, label: 'After 7 days' },
];

/** Optional, off by default: "I paid" claims to you confirm themselves after a few days. */
function AutoConfirm({ userId }: { userId: string }) {
  const load = useLoad(useCallback(() => fetchAutoConfirmDays(userId), [userId]));
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(days: number | null) {
    setBusy(true);
    setError(null);
    try {
      await setAutoConfirmDays(userId, days);
      setChosen(days);
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionIntro}>
        <Text variant="sectionHeading">Confirm payments automatically</Text>
        <Text variant="small">
          When someone says they paid you, it counts once you tap Got it. You can have it count on
          its own if you haven’t answered after a few days.
        </Text>
      </View>
      <Loadable load={load} errorMessage="Couldn’t load this setting.">
        {(saved) => {
          const current = chosen === undefined ? saved : chosen;
          return (
            <View style={styles.chips}>
              {AUTO_CONFIRM_CHOICES.map((choice) => (
                <Chip
                  key={choice.label}
                  label={choice.label}
                  selected={current === choice.days}
                  disabled={busy}
                  onPress={() => void choose(choice.days)}
                />
              ))}
            </View>
          );
        }}
      </Loadable>
      {error ? <FormMessage message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  warning: {
    flexDirection: 'row',
    gap: space.sm,
  },
  warningIcon: {
    marginTop: 1,
  },
  warningText: {
    flex: 1,
    color: colors.ink,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  section: {
    gap: space.lg,
  },
  sectionIntro: {
    gap: space.xs,
  },
});
