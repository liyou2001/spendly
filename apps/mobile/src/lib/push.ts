// Push notifications: "Jeff says they paid you $15.00" and notes from the payment page. The
// phone's Expo push token is saved to your account; Edge Functions send through Expo.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type { NotificationResponse } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const projectId: string | null =
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Whether this build can get pushes: a real phone, an EAS project id (`npx eas-cli init`), and
 * not Expo Go on Android, which dropped remote pushes in SDK 53.
 */
const pushSupported =
  Device.isDevice &&
  Platform.OS !== 'web' &&
  projectId !== null &&
  !(inExpoGo && Platform.OS === 'android');

// expo-notifications warns as soon as it loads in Expo Go, so it's only loaded where pushes work.
let notificationsModule: Promise<typeof import('expo-notifications')> | null = null;
function loadNotifications() {
  notificationsModule ??= import('expo-notifications').then((Notifications) => {
    // Show notifications that arrive while the app is open, too.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    return Notifications;
  });
  return notificationsModule;
}

let registeredToken: string | null = null;

/** Asks for permission (once) and saves this phone's token to your account. */
export async function registerForPush(): Promise<void> {
  if (!pushSupported || !projectId) return;
  try {
    const Notifications = await loadNotifications();
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
    if (!signedIn || !pushSupported) return;
    const open = (response: NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    };

    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    void loadNotifications().then(async (Notifications) => {
      if (cancelled) return;
      // A tap that launched the app, then taps while it's running.
      open(await Notifications.getLastNotificationResponseAsync());
      void Notifications.clearLastNotificationResponseAsync();
      if (!cancelled) subscription = Notifications.addNotificationResponseReceivedListener(open);
    });
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [signedIn]);
}
