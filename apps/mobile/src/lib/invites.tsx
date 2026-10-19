import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { fetchMyInvites, type Invite } from './data';

interface InvitesState {
  /** Your pending invites, newest first. */
  invites: Invite[];
  refresh: () => void;
}

const InvitesContext = createContext<InvitesState | null>(null);

/**
 * Your pending invites, shared by the tab bar's dot, the People tab and the Invites screen.
 * Loaded on sign-in and whenever the app comes back to the foreground; screens call refresh()
 * when they open and after accepting or declining.
 */
export function InvitesProvider({ children }: PropsWithChildren) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const latest = useRef(0);

  const refresh = useCallback(() => {
    const attempt = ++latest.current;
    fetchMyInvites().then(
      (list) => attempt === latest.current && setInvites(list),
      // Keep what's shown; the next refresh tries again.
      () => undefined,
    );
  }, []);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return <InvitesContext value={{ invites, refresh }}>{children}</InvitesContext>;
}

export function useInvites(): InvitesState {
  const value = use(InvitesContext);
  if (!value) throw new Error('useInvites must be used inside <InvitesProvider>');
  return value;
}
