import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { InviteRow, Screen, Text } from '@/components';
import { useInvites } from '@/lib/invites';

/** Every pending invite, newest first. The People tab shows only the first two. */
export default function Invites() {
  const { invites, refresh } = useInvites();
  useFocusEffect(useCallback(() => refresh(), [refresh]));

  return (
    <Screen title="Invites" onBack={() => router.back()}>
      {invites.length === 0 ? (
        <Text variant="small">No invites right now.</Text>
      ) : (
        <View>
          {invites.map((invite, index) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              onAccepted={(groupId) => {
                refresh();
                router.replace({ pathname: '/groups/[id]', params: { id: groupId } });
              }}
              onDeclined={refresh}
              divider={index < invites.length - 1}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
