import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { supabase } from './supabase';

interface SessionState {
  session: Session | null;
  /** True until the saved session (if any) has been read from storage. */
  isLoading: boolean;
}

const SessionContext = createContext<SessionState | null>(null);

/** Keeps the Supabase session in React state. Signing in and out go through `supabase.auth`. */
export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

  useEffect(() => {
    // Fires once with the saved session (INITIAL_SESSION), then on every sign-in, refresh and
    // sign-out, including when a refresh fails because the session was revoked.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, isLoading: false });
    });
    return () => subscription.unsubscribe();
  }, []);

  return <SessionContext value={state}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
