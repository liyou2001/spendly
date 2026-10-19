import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { friendlyError, respondToInvite, type Invite } from '@/lib/data';
import { colors, sizes, space } from '@/theme';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Text } from './Text';
import { FormMessage } from './TextField';

interface InviteRowProps {
  invite: Invite;
  /** Called after accepting, with the group to open. */
  onAccepted: (groupId: string) => void;
  onDeclined: () => void;
  divider?: boolean;
}

/** "Leo (@leo) invited you to Apartment", with Decline and Accept. */
export function InviteRow({ invite, onAccepted, onDeclined, divider = true }: InviteRowProps) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    setBusy(accept ? 'accept' : 'decline');
    setError(null);
    try {
      const groupId = await respondToInvite(invite.id, accept);
      if (accept) onAccepted(groupId);
      else onDeclined();
    } catch (e) {
      setError(friendlyError(e as Error));
      setBusy(null);
    }
  }

  return (
    <View style={[styles.row, divider && styles.divider]}>
      <View style={styles.top}>
        <Avatar name={invite.invitedByName} size={36} />
        <View style={styles.text}>
          <Text variant="body">
            <Text variant="bodyMedium">{invite.invitedByName}</Text> (@{invite.invitedByUsername})
            invited you to <Text variant="bodyMedium">{invite.groupName}</Text>
          </Text>
          <Text variant="small">
            You’ll join as {invite.addedAs} and see your share of its expenses.
          </Text>
        </View>
      </View>
      {error ? <FormMessage message={error} /> : null}
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            label="Decline"
            variant="secondary"
            onPress={() => void respond(false)}
            loading={busy === 'decline'}
            disabled={busy === 'accept'}
          />
        </View>
        <View style={styles.action}>
          <Button
            label="Accept"
            onPress={() => void respond(true)}
            loading={busy === 'accept'}
            disabled={busy === 'decline'}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: space.md,
    paddingVertical: space.md,
  },
  divider: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.divider,
  },
  top: {
    flexDirection: 'row',
    gap: space.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
  },
  action: {
    flex: 1,
  },
});
