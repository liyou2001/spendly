// Scanning a receipt: take or pick a photo, shrink it on the phone, upload it to your private
// folder, and have the extract-receipt Edge Function read it into a draft.
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { UserFacingError } from './data';
import type { ScanResult } from './receipts';
import { supabase } from './supabase';

/** Claude reads images up to about this many pixels on the long edge; larger ones are scaled. */
const LONG_EDGE = 1568;

export interface Photo {
  uri: string;
  width: number;
  height: number;
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
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
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
    context.resize(
      height >= width ? { width: null, height: LONG_EDGE } : { width: LONG_EDGE, height: null },
    );
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/** Shrinks, uploads and reads the photo. Throws a UserFacingError with what to do if it can't. */
export async function scanReceipt(userId: string, photo: Photo): Promise<ScanResult> {
  const uri = await shrink(photo);
  const path = `${userId}/${randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, await new File(uri).arrayBuffer(), { contentType: 'image/jpeg' });
  if (uploadError) throw new UserFacingError('Couldn’t upload the photo. Check your connection.');

  const { data, error } = await supabase.functions.invoke<ScanResult>('extract-receipt', {
    body: { path },
  });
  if (error || !data) {
    // The function deletes photos it reads; one that never got that far is deleted here.
    void supabase.storage.from('receipts').remove([path]);
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
  return data;
}
