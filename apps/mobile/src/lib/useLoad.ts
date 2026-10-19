import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export type LoadState<T> =
  { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: T };

export type Loaded<T> = LoadState<T> & {
  reload: () => void;
  /** A refresh failed, so the data shown is from an earlier load. */
  refreshFailed: boolean;
};

/**
 * Runs `load` whenever the screen comes into focus. Wrap `load` in useCallback.
 * Loaded data stays on screen while it refreshes, and only the latest load counts, so a slow
 * earlier one can't overwrite newer data.
 */
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [refreshFailed, setRefreshFailed] = useState(false);
  const latest = useRef(0);

  const run = useCallback(() => {
    const attempt = ++latest.current;
    load().then(
      (data) => {
        if (attempt !== latest.current) return;
        setState({ status: 'ready', data });
        setRefreshFailed(false);
      },
      (error: unknown) => {
        if (attempt !== latest.current) return;
        setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', error }));
        setRefreshFailed(true);
      },
    );
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      run();
      return () => {
        // A load still running when the screen loses focus is stale.
        latest.current++;
      };
    }, [run]),
  );

  return { ...state, reload: run, refreshFailed };
}
