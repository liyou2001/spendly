import AsyncStorage from '@react-native-async-storage/async-storage';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Where the Supabase session lives on the phone, following the encrypted option in Supabase's
// Expo guide: SecureStore (Keychain / Keystore) can't hold values over 2048 bytes and a session
// is bigger, so SecureStore holds a fresh AES-256 key for each write and AsyncStorage holds the
// session encrypted with it. expo-crypto's AES-GCM stands in for the guide's aes-js; it ships with
// Expo Go and also rejects data that was tampered with.

async function getItem(key: string): Promise<string | null> {
  const sealed = await AsyncStorage.getItem(key);
  if (sealed === null) return null;
  const keyHex = await SecureStore.getItemAsync(key);
  if (keyHex === null) return null;

  try {
    const aesKey = await AESEncryptionKey.import(keyHex, 'hex');
    const bytes = await aesDecryptAsync(AESSealedData.fromCombined(sealed), aesKey);
    return new TextDecoder().decode(bytes);
  } catch {
    // The key doesn't open the data, e.g. the app was killed between the two writes.
    // Treat it as signed out rather than crashing on launch.
    await removeItem(key);
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const aesKey = await AESEncryptionKey.generate();
  const sealed = await aesEncryptAsync(new TextEncoder().encode(value), aesKey);
  await SecureStore.setItemAsync(key, await aesKey.encoded('hex'));
  await AsyncStorage.setItem(key, String(await sealed.combined('base64')));
}

async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
  await SecureStore.deleteItemAsync(key);
}

export const secureSessionStorage = { getItem, setItem, removeItem };
