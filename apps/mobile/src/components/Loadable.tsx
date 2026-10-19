import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { Loaded } from '@/lib/useLoad';
import { colors, space } from '@/theme';

import { Button } from './Button';
import { FormMessage } from './TextField';

/** Shown when a refresh fails and earlier data is still on screen. */
export const STALE_MESSAGE = 'Couldn’t refresh. This may be out of date; check your connection.';

interface LoadableProps<T> {
  load: Loaded<T>;
  /** Shown when the first load fails, e.g. "Couldn’t load your groups." */
  errorMessage: string;
  children: (data: T) => ReactNode;
}

/** A spinner while loading, an error with "Try again" if it fails, otherwise the content. */
export function Loadable<T>({ load, errorMessage, children }: LoadableProps<T>) {
  if (load.status === 'loading') return <ActivityIndicator color={colors.ink} />;
  if (load.status === 'error') {
    return (
      <View style={styles.error}>
        <FormMessage message={errorMessage} />
        <Button label="Try again" variant="secondary" onPress={load.reload} />
      </View>
    );
  }
  return (
    <>
      {load.refreshFailed ? <FormMessage message={STALE_MESSAGE} /> : null}
      {children(load.data)}
    </>
  );
}

const styles = StyleSheet.create({
  error: {
    gap: space.md,
  },
});
