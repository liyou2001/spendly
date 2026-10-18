import { router } from 'expo-router';

import { Button, Screen, Text } from '@/components';

// Placeholder until Step 5 (splitting an expense). Opened by the + in the tab bar.
export default function AddExpense() {
  return (
    <Screen title="Add expense" edges={['top', 'bottom', 'left', 'right']}>
      <Text variant="body">Entering and splitting a receipt will happen here.</Text>
      <Button label="Close" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
