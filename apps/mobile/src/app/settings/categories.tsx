import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  Button,
  IconButton,
  ListRow,
  Loadable,
  Screen,
  Text,
  TextButton,
  TextField,
} from '@/components';
import { validateCategoryName } from '@/lib/categories';
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  friendlyError,
  renameCategory,
  type Category,
} from '@/lib/data';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { space } from '@/theme';

type Editing = { kind: 'none' } | { kind: 'add' } | { kind: 'edit'; id: string };

export default function CategorySettings() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const categories = useLoad(useCallback(() => fetchCategories(userId), [userId]));

  const [editing, setEditing] = useState<Editing>({ kind: 'none' });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(next: Editing, startingName = '') {
    setEditing(next);
    setName(startingName);
    setError(null);
  }
  const close = () => open({ kind: 'none' });

  /** Runs a write, then reloads the list. Errors stay on screen in the open form. */
  async function run(write: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await write();
      close();
      categories.reload();
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setBusy(false);
    }
  }

  function submit(list: Category[]) {
    const editingId = editing.kind === 'edit' ? editing.id : undefined;
    const result = validateCategoryName(name, list, editingId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (editingId) {
      const current = list.find((c) => c.id === editingId);
      if (current?.name === result.name) return close();
      void run(() => renameCategory(editingId, result.name));
    } else {
      void run(() => createCategory(result.name));
    }
  }

  function confirmDelete(category: Category) {
    Alert.alert(
      `Delete ${category.name}?`,
      'Its monthly budgets are deleted too. Categories that expenses use can’t be deleted; rename them instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void run(() => deleteCategory(category.id)),
        },
      ],
    );
  }

  return (
    <Screen title="Categories" onBack={() => goBack('/me')}>
      <Text variant="small">How your spending is sorted. Only you see these.</Text>

      <Loadable load={categories} errorMessage="Couldn’t load your categories.">
        {(list) => (
          <>
            <View>
              {list.map((category, index) =>
                editing.kind === 'edit' && editing.id === category.id ? (
                  <View key={category.id} style={[styles.form, styles.editor]}>
                    <TextField
                      label="Name"
                      value={name}
                      onChangeText={(text) => {
                        setName(text);
                        setError(null);
                      }}
                      error={error}
                      maxLength={40}
                      autoFocus
                      autoCapitalize="words"
                      returnKeyType="done"
                      onSubmitEditing={() => submit(list)}
                    />
                    <View style={styles.actions}>
                      <View style={styles.action}>
                        <Button label="Cancel" variant="secondary" onPress={close} />
                      </View>
                      <View style={styles.action}>
                        <Button label="Save" onPress={() => submit(list)} loading={busy} />
                      </View>
                    </View>
                    {/* Add expense needs at least one category to file your share under. */}
                    {list.length > 1 ? (
                      <TextButton
                        label="Delete category"
                        icon="trash-2"
                        onPress={() => confirmDelete(category)}
                        disabled={busy}
                      />
                    ) : null}
                  </View>
                ) : (
                  <ListRow
                    key={category.id}
                    title={category.name}
                    trailing={
                      <IconButton
                        icon="edit-2"
                        label={`Edit ${category.name}`}
                        onPress={() => open({ kind: 'edit', id: category.id }, category.name)}
                      />
                    }
                    divider={index < list.length - 1}
                  />
                ),
              )}
            </View>

            {editing.kind === 'add' ? (
              <View style={styles.form}>
                <TextField
                  label="New category"
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setError(null);
                  }}
                  error={error}
                  placeholder="Textbooks"
                  maxLength={40}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={() => submit(list)}
                />
                <View style={styles.actions}>
                  <View style={styles.action}>
                    <Button label="Cancel" variant="secondary" onPress={close} />
                  </View>
                  <View style={styles.action}>
                    <Button label="Add" onPress={() => submit(list)} loading={busy} />
                  </View>
                </View>
              </View>
            ) : (
              <TextButton label="Add category" icon="plus" onPress={() => open({ kind: 'add' })} />
            )}
          </>
        )}
      </Loadable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
  editor: {
    paddingVertical: space.md,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
  },
  action: {
    flex: 1,
  },
});
