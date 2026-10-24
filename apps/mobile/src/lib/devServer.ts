import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * The host:port the app was loaded from, e.g. "10.141.74.104:8081". Expo Go reports it as
 * Constants.expoConfig.hostUri; in a browser (`expo start --web`) that's unset, and the page's
 * own address is the dev server's.
 */
export function devServerHostUri(): string | undefined {
  if (Platform.OS === 'web') {
    return typeof window === 'undefined' ? undefined : window.location.host;
  }
  return Constants.expoConfig?.hostUri;
}
