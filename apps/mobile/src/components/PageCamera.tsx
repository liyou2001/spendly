import { CameraView } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';

import type { Photo } from '@/lib/scan';
import { colors, radius, space } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';
import { FormMessage } from './TextField';

// Over plain http (e.g. the dev server on a LAN address) browsers don't offer the camera at all.
const insecure = Platform.OS === 'web' && typeof window !== 'undefined' && !window.isSecureContext;

/**
 * "Take photo" on a laptop: the camera, inside the page, since the browser's own picker only
 * offers files there. Shows the live picture, then the shot to retake or use.
 */
export function PageCamera({
  onPhoto,
  onCancel,
}: {
  onPhoto: (photo: Photo) => void;
  onCancel: () => void;
}) {
  const camera = useRef<CameraView>(null);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [mountError, setMountError] = useState(false);
  const [taking, setTaking] = useState(false);
  const [shot, setShot] = useState<Photo | null>(null);

  useEffect(() => {
    if (insecure) return;
    let live = true;
    void CameraView.isAvailableAsync().then((available) => {
      if (live) setHasCamera(available);
    });
    return () => {
      live = false;
    };
  }, []);

  async function take() {
    setTaking(true);
    try {
      const picture = await camera.current?.takePictureAsync({ imageType: 'jpg', quality: 0.9 });
      if (picture) setShot({ uri: picture.uri, width: picture.width, height: picture.height });
    } catch {
      setMountError(true);
    } finally {
      setTaking(false);
    }
  }

  const problem = insecure
    ? 'The camera only works on a secure (https) page. Choose a photo instead.'
    : hasCamera === false
      ? 'This computer doesn’t have a camera. Choose a photo instead.'
      : mountError
        ? 'Couldn’t open the camera. Allow camera access in your browser, then try again, or choose a photo instead.'
        : null;

  if (problem) {
    return (
      <View style={styles.stack}>
        <FormMessage message={problem} />
        <Button label="Back" variant="secondary" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Text variant="small">Hold the receipt flat and fill the frame with it.</Text>
      <View style={styles.frame}>
        {shot ? (
          <Image
            source={{ uri: shot.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            accessibilityLabel="The photo you took"
          />
        ) : hasCamera ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => setReady(true)}
            onMountError={() => setMountError(true)}
          />
        ) : null}
        {!shot && !ready ? (
          <View style={styles.starting}>
            <ActivityIndicator color={colors.background} />
          </View>
        ) : null}
      </View>
      {shot ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="Retake" variant="secondary" onPress={() => setShot(null)} />
          </View>
          <View style={styles.flex}>
            <Button label="Use photo" onPress={() => onPhoto(shot)} />
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} />
          </View>
          <View style={styles.flex}>
            <Button
              label="Take photo"
              onPress={() => void take()}
              disabled={!ready}
              loading={taking}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space.md,
  },
  frame: {
    aspectRatio: 4 / 3,
    borderRadius: radius.keyBlock,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  starting: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
});
