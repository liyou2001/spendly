import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Button,
  IconButton,
  InviteRow,
  KeyBlock,
  ListRow,
  Loadable,
  Money,
  Screen,
  Section,
  Text,
} from '@/components';
import { fetchBalances, fetchGroups, fetchPayments, type Group } from '@/lib/data';
import { formatDate } from '@/lib/dates';
import { joinNames } from '@/lib/labels';
import { useInvites } from '@/lib/invites';
import { buildPeopleView, statusLine, type PersonBalance } from '@/lib/people';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { colors, space } from '@/theme';

/** "You, Jeff and Maya", "You, Jeff and 3 others", or "Just you". */
function memberSummary(group: Group, userId: string | undefined): string {
  const names = group.people.map((p) => (p.userId === userId ? 'You' : p.displayName));
  if (names.length <= 1) return 'Just you';
  if (names.length <= 3) return joinNames(names);
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

async function fetchPeople(userId: string) {
  const [groups, balances, payments] = await Promise.all([
    fetchGroups(),
    fetchBalances(),
    fetchPayments(),
  ]);
  return { groups, view: buildPeopleView({ userId, groups, balances, payments, now: new Date() }) };
}

/** At most this many invites on the People tab; the rest are one tap away on the Invites screen. */
const INVITES_SHOWN = 2;

const openGroup = (id: string) => router.push({ pathname: '/groups/[id]', params: { id } });

const openPerson = (person: PersonBalance) =>
  router.push({ pathname: '/people/[id]', params: { id: person.participantId } });

export default function People() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const people = useLoad(useCallback(() => fetchPeople(userId), [userId]));
  const newGroup = () => router.push('/groups/new');
  const [showOneOffs, setShowOneOffs] = useState(false);
  const { invites, refresh: refreshInvites } = useInvites();
  useFocusEffect(useCallback(() => refreshInvites(), [refreshInvites]));

  return (
    <Screen
      title="People"
      headerRight={<IconButton icon="plus" label="New group" onPress={newGroup} />}
    >
      {invites.length > 0 ? (
        <Section title="Invites">
          <View>
            {invites.slice(0, INVITES_SHOWN).map((invite, index) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                onAccepted={(groupId) => {
                  refreshInvites();
                  people.reload();
                  openGroup(groupId);
                }}
                onDeclined={refreshInvites}
                divider={index < INVITES_SHOWN - 1 || invites.length > INVITES_SHOWN}
              />
            ))}
            {invites.length > INVITES_SHOWN ? (
              <ListRow
                title={`See all ${invites.length} invites`}
                onPress={() => router.push('/invites')}
                divider={false}
              />
            ) : null}
          </View>
        </Section>
      ) : null}

      <Loadable load={people} errorMessage="Couldn’t load your balances.">
        {({ groups, view }) => {
          const shared = groups.filter((g) => !g.isPersonal);
          const regular = groups.filter((g) => !g.isOneOff);
          const oneOffs = groups.filter((g) => g.isOneOff);
          return (
            <>
              {shared.length === 0 ? (
                <KeyBlock>
                  <Text variant="sectionHeading">Split with roommates</Text>
                  <Text variant="body">
                    Make a group for your apartment or a trip, add the people in it, and split
                    purchases with them. They don’t need the app.
                  </Text>
                  <Button label="New group" onPress={newGroup} />
                </KeyBlock>
              ) : (
                <KeyBlock style={styles.totals}>
                  <View style={styles.total}>
                    <Text variant="small">Owed to you</Text>
                    <Money cents={view.owedToMeCents} variant="screenTitle" />
                  </View>
                  <View style={styles.total}>
                    <Text variant="small">You owe</Text>
                    <Money cents={view.iOweCents} variant="screenTitle" />
                  </View>
                </KeyBlock>
              )}

              {shared.length > 0 && view.groups.length === 0 ? (
                <Text variant="small">Everyone’s settled up.</Text>
              ) : null}

              {view.groups.map((group) => (
                <Section key={group.groupId} title={group.name}>
                  <View>
                    {group.people.map((person, index) => (
                      <ListRow
                        key={person.participantId}
                        title={person.name}
                        subtitle={statusLine(person)}
                        leading={<Avatar name={person.name} size={36} />}
                        trailing={<Money cents={Math.abs(person.netCents)} variant="bodyMedium" />}
                        onPress={() => openPerson(person)}
                        divider={index < group.people.length - 1}
                      />
                    ))}
                  </View>
                </Section>
              ))}

              {view.recentlySettled.length > 0 ? (
                <Section title="Recently settled">
                  <View>
                    {view.recentlySettled.map((person, index) => (
                      <ListRow
                        key={person.participantId}
                        title={person.name}
                        subtitle={`Settled ${formatDate((person.lastSettledAt ?? '').slice(0, 10))} · ${person.groupName}`}
                        leading={<Avatar name={person.name} size={36} />}
                        onPress={() => openPerson(person)}
                        divider={index < view.recentlySettled.length - 1}
                      />
                    ))}
                  </View>
                </Section>
              ) : null}

              <Section title="Groups">
                <View>
                  {regular.map((group, index) => (
                    <ListRow
                      key={group.id}
                      title={group.name}
                      subtitle={memberSummary(group, userId)}
                      leading={<Avatar name={group.name} size={36} />}
                      onPress={() => openGroup(group.id)}
                      divider={index < regular.length - 1 || oneOffs.length > 0}
                    />
                  ))}
                  {oneOffs.length > 0 ? (
                    <ListRow
                      title="Quick splits"
                      subtitle={`${oneOffs.length} ${oneOffs.length === 1 ? 'outing' : 'outings'} without a group`}
                      trailing={
                        <Feather
                          name={showOneOffs ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color={colors.muted}
                        />
                      }
                      onPress={() => setShowOneOffs(!showOneOffs)}
                      chevron={false}
                      divider={showOneOffs}
                    />
                  ) : null}
                  {showOneOffs
                    ? oneOffs.map((group, index) => (
                        <ListRow
                          key={group.id}
                          title={group.name}
                          subtitle={memberSummary(group, userId)}
                          leading={<Avatar name={group.name} size={36} />}
                          onPress={() => openGroup(group.id)}
                          divider={index < oneOffs.length - 1}
                        />
                      ))
                    : null}
                </View>
              </Section>
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  totals: {
    flexDirection: 'row',
    gap: space.lg,
  },
  total: {
    flex: 1,
    gap: space.xs,
  },
});
