import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Button, KeyBlock, ListRow, Screen, Section, Text } from '@/components';
import { fetchCategories, fetchProfile } from '@/lib/data';
import { useSession } from '@/lib/session';
import { unregisterPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { space } from '@/theme';

async function fetchSummary(userId: string) {
  const [profile, categories] = await Promise.all([fetchProfile(userId), fetchCategories(userId)]);
  return {
    displayName: profile.display_name,
    username: profile.username,
    categoryCount: categories.length,
  };
}

export default function Me() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const email = session?.user.email;
  const summary = useLoad(useCallback(() => fetchSummary(userId), [userId]));
  const [signingOut, setSigningOut] = useState(false);

  const displayName = summary.status === 'ready' ? summary.data.displayName : null;
  const categoryCount = summary.status === 'ready' ? summary.data.categoryCount : null;
  const username = summary.status === 'ready' ? summary.data.username : null;

  async function signOut() {
    setSigningOut(true);
    // This phone stops getting your pushes; a failure here mustn't block signing out.
    await unregisterPush().catch(() => undefined);
    // Clears the saved session even if the network call fails; the route guard then shows sign-in.
    await supabase.auth.signOut();
    setSigningOut(false);
  }

  return (
    <Screen title="Me">
      <KeyBlock style={styles.identity}>
        <Avatar name={displayName ?? email ?? '?'} size={52} onKeyBlock />
        <View style={styles.identityText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {displayName ?? ' '}
          </Text>
          {username ? (
            <Text variant="body" numberOfLines={1} selectable>
              @{username}
            </Text>
          ) : null}
          <Text variant="small" numberOfLines={1}>
            {email}
          </Text>
        </View>
      </KeyBlock>

      <Section title="Settings">
        <View>
          <ListRow
            title="Profile & payments"
            subtitle="Name, username, Venmo, PayPal, Cash App"
            onPress={() => router.push('/settings/profile')}
          />
          <ListRow
            title="Categories"
            subtitle={
              categoryCount === null
                ? 'How your spending is sorted'
                : `${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'}`
            }
            onPress={() => router.push('/settings/categories')}
            divider={false}
          />
        </View>
      </Section>

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
});
