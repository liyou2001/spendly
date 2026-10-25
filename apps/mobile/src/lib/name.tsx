import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

interface NameState {
  /** null while checking; true until you've given your first and last name. */
  needsName: boolean | null;
  /** After saving your name: on to the app. */
  markNamed: () => void;
}

const NameContext = createContext<NameState | null>(null);

/**
 * Whether the signed-in account has a first and last name yet. New accounts don't, and are
 * asked before anything else (the welcome screen), so groups never show the start of an email.
 */
export function NameProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  // Remembers whose name was checked, so switching accounts checks again.
  const [checked, setChecked] = useState<{ userId: string; needsName: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void supabase
      .from('profiles')
      .select('first_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        // If it can't be checked (offline), don't lock anyone out: Profile still asks for it.
        setChecked({ userId, needsName: !error && !data?.first_name });
      });
    return () => {
      live = false;
    };
  }, [userId]);

  const needsName = !userId ? false : checked?.userId === userId ? checked.needsName : null;
  const markNamed = () => {
    if (userId) setChecked({ userId, needsName: false });
  };

  return <NameContext value={{ needsName, markNamed }}>{children}</NameContext>;
}

export function useName(): NameState {
  const value = use(NameContext);
  if (!value) throw new Error('useName must be used inside <NameProvider>');
  return value;
}
