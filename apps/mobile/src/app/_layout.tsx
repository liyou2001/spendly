import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { InvitesProvider } from '@/lib/invites';
import { NameProvider, useName } from '@/lib/name';
import { usePushNotifications } from '@/lib/push';
import { SessionProvider, useSession } from '@/lib/session';
import { useSaveTimeZone } from '@/lib/timeZone';
import { colors, fontFiles } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontFiles);

  return (
    <SessionProvider>
      <NameProvider>
        {/* If a font fails to load, carry on with the system font rather than hang on the splash. */}
        <RootNavigator fontsReady={fontsLoaded || fontError !== null} />
        <StatusBar style="dark" />
      </NameProvider>
    </SessionProvider>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { session, isLoading } = useSession();
  const { needsName } = useName();
  // Signed in, the splash stays until we know whether to ask for a name.
  const ready = fontsReady && !isLoading && needsName !== null;
  // Only once the navigator below is mounted, so a tapped notification can open its screen.
  usePushNotifications(ready && session !== null);
  useSaveTimeZone(ready && session !== null);

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  // Signed-out users can only reach sign-in; signed-in users can't. A new account first gives its
  // name (welcome). Signing in or out, or saving the name, flips the guards, and Expo Router
  // moves to the first screen that's allowed.
  return (
    // Keyed by account, so signing in as someone else starts with their invites.
    <InvitesProvider key={session?.user.id ?? 'signed-out'}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Protected guard={session !== null && !needsName}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-expense" options={{ presentation: 'modal' }} />
          <Stack.Screen name="groups/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="groups/[id]" />
          <Stack.Screen name="expenses/[id]" />
          <Stack.Screen name="receipt-photo" />
          <Stack.Screen name="settings/profile" />
          <Stack.Screen name="settings/categories" />
          <Stack.Screen name="settings/emails" />
          <Stack.Screen name="settings/feedback" />
          <Stack.Screen name="people/[id]" />
          <Stack.Screen name="invites" />
          <Stack.Screen name="activity" />
        </Stack.Protected>
        <Stack.Protected guard={session !== null && needsName === true}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        {/* On the web, signed-out visitors land here first; the app goes straight to sign-in. */}
        <Stack.Protected guard={session === null && Platform.OS === 'web'}>
          <Stack.Screen name="landing" />
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </InvitesProvider>
  );
}
