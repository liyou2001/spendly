// Scanning a receipt: take or pick a photo, shrink it on the phone, upload it to your private
// folder, and have the extract-receipt Edge Function read it into a draft.
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { UserFacingError } from './data';
import type { ScanAllowance, ScanResult } from './receipts';
import { supabase } from './supabase';

/** Claude reads images up to about this many pixels on the long edge; larger ones are scaled. */
const LONG_EDGE = 1568;

export interface Photo {
  uri: string;
  width: number;
  height: number;
}

/**
 * Whether "Take photo" opens the camera inside the page (PageCamera): in a browser with a mouse,
 * where the camera picker can only offer files. Phone browsers open their own camera.
 */
export function usesPageCamera(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

/** Opens the camera or the photo library. null if the person cancels. */
export async function pickReceiptPhoto(from: 'camera' | 'library'): Promise<Photo | null> {
  if (from === 'camera') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      throw new UserFacingError(
        'Spendly needs the camera to scan receipts. Allow it in Settings, or choose a photo instead.',
      );
    }
  }
  // The back camera. On web this also makes phone browsers open the camera, not a file picker.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    cameraType: ImagePicker.CameraType.back,
  };
  const result =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/**
 * A smaller JPEG of the photo, at most LONG_EDGE on its long side. Never enlarged: when the
 * picker doesn't report the size, it's measured first.
 */
async function shrink(photo: Photo): Promise<string> {
  let { width, height } = photo;
  if (width === 0 || height === 0) {
    const measured = await ImageManipulator.manipulate(photo.uri).renderAsync();
    ({ width, height } = measured);
  }
  const context = ImageManipulator.manipulate(photo.uri);
  if (Math.max(width, height) > LONG_EDGE) {
    // Give only the long edge; the other follows the photo's shape. Not `null` for the other: the
    // web version reads null as 0 and fails.
    context.resize(height >= width ? { height: LONG_EDGE } : { width: LONG_EDGE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/** The photo's bytes. expo-file-system doesn't work on web, where the photo is a blob: URL. */
async function readPhoto(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

/**
 * Shrinks, uploads and reads the photo. Throws a UserFacingError with what to do if it can't.
 * Returns where the photo is kept, to attach to the expense (or discard) when it's saved, and
 * the shrunk copy on this device, to look at again while checking the lines.
 */
export async function scanReceipt(
  userId: string,
  photo: Photo,
): Promise<ScanResult & { path: string; previewUri: string }> {
  const uri = await shrink(photo);
  const path = `${userId}/${randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, await readPhoto(uri), { contentType: 'image/jpeg' });
  if (uploadError) throw new UserFacingError('Couldn’t upload the photo. Check your connection.');

  const { data, error } = await supabase.functions.invoke<ScanResult>('extract-receipt', {
    body: { path },
  });
  if (error || !data) {
    // The function deletes photos it can't read; one that never got that far is deleted here.
    discardReceiptPhoto(path);
    // The function explains itself in { error }, e.g. the monthly limit.
    const context = (error as { context?: Response } | null)?.context;
    const message = await context
      ?.json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);
    throw new UserFacingError(
      message ?? 'Couldn’t read the receipt. Try again, or enter it by hand.',
    );
  }
  return { ...data, path, previewUri: uri };
}

/** Scans left this month, from the server, which holds the limit. null if it can't say. */
export async function fetchScanAllowance(): Promise<ScanAllowance | null> {
  const { data, error } = await supabase.functions.invoke<{
    limit: number;
    left: number | null;
    resets_on: string;
  }>('scan-allowance');
  if (error || !data || data.left === null) return null;
  return { left: data.left, limit: data.limit, resetsOn: data.resets_on };
}

/**
 * Deletes a scanned photo that won't be kept with an expense. If this fails, clean-receipts
 * deletes it within a couple of days.
 */
export function discardReceiptPhoto(path: string): void {
  void supabase.storage.from('receipts').remove([path]);
}
