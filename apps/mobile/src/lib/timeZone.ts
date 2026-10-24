// The phone's time zone, saved to your profile so reminders never arrive at night.
import { useEffect } from 'react';

import { supabase } from './supabase';

/** Saves this phone's time zone once you're signed in. */
export function useSaveTimeZone(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) return;
    let zone: string | undefined;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone) return;
    void supabase.rpc('set_time_zone', { p_time_zone: zone }).then(({ error }) => {
      if (error) console.warn('Couldn’t save your time zone', error.message);
    });
  }, [signedIn]);
}
