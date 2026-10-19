// Push notifications through Expo's push service. Best effort: a failed push never fails the
// request that caused it.
import type { AdminClient } from './admin.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  title: string;
  body: string;
  /** Opened in the app when the notification is tapped, e.g. "/people/<participant id>". */
  url: string;
}

export async function pushToUser(
  admin: AdminClient,
  userId: string | null,
  message: PushMessage,
): Promise<void> {
  if (!userId) return;
  try {
    const { data: tokens, error } = await admin.rpc('push_tokens_for', { p_user_id: userId });
    if (error) throw error;
    if (!tokens || tokens.length === 0) return;

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Only needed if "enhanced push security" is on for the Expo project.
        ...(Deno.env.get('EXPO_ACCESS_TOKEN')
          ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` }
          : {}),
      },
      body: JSON.stringify(
        tokens.map((to: string) => ({
          to,
          title: message.title,
          body: message.body,
          sound: 'default',
          data: { url: message.url },
        })),
      ),
    });
    if (!response.ok) throw new Error(`Expo push: ${response.status} ${await response.text()}`);

    // Forget phones that uninstalled the app or turned notifications off for good.
    const { data: tickets } = (await response.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    const gone = (tickets ?? [])
      .map((ticket, i) => (ticket.details?.error === 'DeviceNotRegistered' ? tokens[i] : null))
      .filter((token): token is string => token !== null);
    if (gone.length > 0) await admin.from('push_tokens').delete().in('token', gone);
  } catch (e) {
    console.error('Push failed', e);
  }
}

/** "Jeff says they paid you $15.00", opening Jeff in the app. */
export function claimMessage(name: string, amount: string, personId: string): PushMessage {
  return {
    title: `${name} says they paid you ${amount}`,
    body: 'Tap to confirm you got it.',
    url: `/people/${personId}`,
  };
}
