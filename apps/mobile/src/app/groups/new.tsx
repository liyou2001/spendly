import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AddPersonForm,
  Avatar,
  Button,
  FormMessage,
  IconButton,
  ListRow,
  Screen,
  Section,
  TextField,
} from '@/components';
import { createGroup, friendlyError } from '@/lib/data';
import { space } from '@/theme';

interface NewPerson {
  key: number;
  displayName: string;
  phone: string | null;
  inviteUserId: string | null;
}

export default function NewGroup() {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [people, setPeople] = useState<NewPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingPerson, setPendingPerson] = useState(false);

  async function create() {
    const groupName = name.trim();
    if (!groupName) {
      setNameError('Give the group a name.');
      return;
    }
    if (pendingPerson) {
      setError('You typed a person but didn’t add them. Tap Add person, or clear their name.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const id = await createGroup(groupName, people);
      router.replace({ pathname: '/groups/[id]', params: { id } });
    } catch (e) {
      setError(friendlyError(e as Error));
      setCreating(false);
    }
  }

  return (
    <Screen
      title="New group"
      edges={['top', 'bottom', 'left', 'right']}
      headerRight={<IconButton icon="x" label="Close" onPress={() => router.back()} />}
    >
      <TextField
        label="Group name"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setNameError(null);
        }}
        error={nameError}
        placeholder="Apartment"
        autoCapitalize="words"
        maxLength={80}
      />

      <Section
        title="People"
        description="You’re in it already. Add the people you split with; they don’t need the app."
      >
        {people.length > 0 ? (
          <View>
            {people.map((person) => (
              <ListRow
                key={person.key}
                title={person.displayName}
                {...(person.inviteUserId
                  ? { subtitle: 'Will be invited to Spendly' }
                  : person.phone
                    ? { subtitle: person.phone }
                    : {})}
                leading={<Avatar name={person.displayName} size={36} />}
                trailing={
                  <IconButton
                    icon="x"
                    label={`Remove ${person.displayName}`}
                    onPress={() => setPeople((prev) => prev.filter((p) => p.key !== person.key))}
                  />
                }
              />
            ))}
          </View>
        ) : null}
        <AddPersonForm
          onPendingChange={(pending) => {
            setPendingPerson(pending);
            if (!pending) setError(null);
          }}
          onAdd={async (displayName, phone, inviteUserId) => {
            setPeople((prev) => [...prev, { key: Date.now(), displayName, phone, inviteUserId }]);
          }}
        />
      </Section>

      <View style={styles.footer}>
        {error ? <FormMessage message={error} /> : null}
        <Button label="Create group" onPress={() => void create()} loading={creating} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: space.md,
  },
});
