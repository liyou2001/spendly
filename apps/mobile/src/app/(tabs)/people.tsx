import { router } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  Button,
  IconButton,
  KeyBlock,
  ListRow,
  Loadable,
  Screen,
  Section,
  Text,
} from '@/components';
import { fetchGroups, type Group } from '@/lib/data';
import { joinNames } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';

/** "You, Jeff and Maya", "You, Jeff and 3 others", or "Just you". */
function memberSummary(group: Group, userId: string | undefined): string {
  const names = group.people.map((p) => (p.userId === userId ? 'You' : p.displayName));
  if (names.length <= 1) return 'Just you';
  if (names.length <= 3) return joinNames(names);
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

// Balances per person arrive in Step 6. For now this lists your groups.
export default function People() {
  const { session } = useSession();
  const userId = session?.user.id;
  const groups = useLoad(useCallback(() => fetchGroups(), []));
  const newGroup = () => router.push('/groups/new');

  return (
    <Screen
      title="People"
      headerRight={<IconButton icon="plus" label="New group" onPress={newGroup} />}
    >
      <Loadable load={groups} errorMessage="Couldn’t load your groups.">
        {(list) => (
          <>
            {list.every((g) => g.isPersonal) ? (
              <KeyBlock>
                <Text variant="sectionHeading">Split with roommates</Text>
                <Text variant="body">
                  Make a group for your apartment or a trip, add the people in it, and split
                  purchases with them. They don’t need the app.
                </Text>
                <Button label="New group" onPress={newGroup} />
              </KeyBlock>
            ) : null}
            <Section title="Groups">
              <View>
                {list.map((group, index) => (
                  <ListRow
                    key={group.id}
                    title={group.name}
                    subtitle={memberSummary(group, userId)}
                    leading={<Avatar name={group.name} />}
                    onPress={() =>
                      router.push({ pathname: '/groups/[id]', params: { id: group.id } })
                    }
                    divider={index < list.length - 1}
                  />
                ))}
              </View>
            </Section>
          </>
        )}
      </Loadable>
    </Screen>
  );
}
