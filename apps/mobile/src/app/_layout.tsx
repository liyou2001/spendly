import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { InvitesProvider } from '@/lib/invites';
import { SessionProvider, useSession } from '@/lib/session';
import { colors, fontFiles } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontFiles);

  return (
    <SessionProvider>
      {/* If a font fails to load, carry on with the system font rather than hang on the splash. */}
      <RootNavigator fontsReady={fontsLoaded || fontError !== null} />
      <StatusBar style="dark" />
    </SessionProvider>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { session, isLoading } = useSession();
  const ready = fontsReady && !isLoading;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  // Signed-out users can only reach sign-in; signed-in users can't. Signing in or out flips the
  // guards, and Expo Router moves to the first screen that's allowed.
  return (
    // Keyed by account, so signing in as someone else starts with their invites.
    <InvitesProvider key={session?.user.id ?? 'signed-out'}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-expense" options={{ presentation: 'modal' }} />
          <Stack.Screen name="groups/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="groups/[id]" />
          <Stack.Screen name="expenses/[id]" />
          <Stack.Screen name="settings/profile" />
          <Stack.Screen name="settings/categories" />
          <Stack.Screen name="people/[id]" />
          <Stack.Screen name="invites" />
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </InvitesProvider>
  );
}
