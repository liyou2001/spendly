// Push notifications: "Jeff says they paid you $15.00" and notes from the payment page. The
// phone's Expo push token is saved to your account; Edge Functions send through Expo.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Show notifications that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registeredToken: string | null = null;

/**
 * Asks for permission (once) and saves this phone's token to your account. Quietly does nothing
 * where push can't work: simulators, web, Expo Go on Android, or before the project has an EAS
 * project id (`npx eas-cli init`).
 */
export async function registerForPush(): Promise<void> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
  if (!Device.isDevice || Platform.OS === 'web' || !projectId) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Payments',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', { p_token: token });
    if (error) throw error;
    registeredToken = token;
  } catch (e) {
    console.warn('Push notifications unavailable', e);
  }
}

/** Stops pushes to this phone for the account that's signing out. */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  await supabase.from('push_tokens').delete().eq('token', registeredToken);
  registeredToken = null;
}

/** Registers while signed in, and opens the screen a tapped notification points to. */
export function usePushNotifications(signedIn: boolean): void {
  useEffect(() => {
    if (signedIn) void registerForPush();
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    };
    // A tap that launched the app, then taps while it's running.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      open(response);
      void Notifications.clearLastNotificationResponseAsync();
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [signedIn]);
}
