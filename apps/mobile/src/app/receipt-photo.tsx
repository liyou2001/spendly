import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet } from 'react-native';

import { Loadable, Screen, Text, TextButton } from '@/components';
import { fetchExpense, fetchGroup, receiptPhotoUrl } from '@/lib/data';
import { formatDate } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';

async function fetchPhoto(expenseId: string, userId: string) {
  const expense = await fetchExpense(expenseId);
  const photo = expense?.view === 'full' ? expense.receiptPhoto : null;
  if (!expense || !photo) throw new Error('No receipt photo');
  const [group, url] = await Promise.all([
    fetchGroup(expense.groupId),
    receiptPhotoUrl(photo.path),
  ]);
  const addedBy =
    photo.attachedBy === userId
      ? 'you'
      : (group.people.find((p) => p.userId === photo.attachedBy)?.displayName ?? 'someone');
  return { merchant: expense.merchant, date: expense.expenseDate, addedBy, url };
}

/** A receipt photo kept with an expense, fitted to the screen. Pinch to zoom on a phone. */
export default function ReceiptPhoto() {
  const { expense } = useLocalSearchParams<{ expense: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const photo = useLoad(useCallback(() => fetchPhoto(expense, userId), [expense, userId]));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (photo.status !== 'ready') {
    return (
      <Screen title="Receipt" onBack={back}>
        <Loadable load={photo} errorMessage="Couldn’t load the photo.">
          {() => null}
        </Loadable>
      </Screen>
    );
  }

  const { merchant, date, addedBy, url } = photo.data;
  return (
    <Screen title={`${merchant} receipt`} onBack={back} scroll={false}>
      <Text variant="small">
        {formatDate(date)} · added by {addedBy}
      </Text>
      <ScrollView
        style={styles.zoom}
        contentContainerStyle={styles.zoomContent}
        maximumZoomScale={4}
        minimumZoomScale={1}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={{ uri: url }}
          style={styles.photo}
          resizeMode="contain"
          accessibilityLabel={`Photo of the ${merchant} receipt`}
          accessibilityIgnoresInvertColors
        />
      </ScrollView>
      {/* Browsers have no pinch zoom inside the page; their own image view does. */}
      {Platform.OS === 'web' ? (
        <TextButton
          label="Open full size"
          icon="external-link"
          onPress={() => void Linking.openURL(url)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  zoom: {
    flex: 1,
  },
  zoomContent: {
    flexGrow: 1,
  },
  photo: {
    flex: 1,
    width: '100%',
  },
});
