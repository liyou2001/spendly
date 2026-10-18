import { StyleSheet, View } from 'react-native';

import { KeyBlock, Screen, Text } from '@/components';
import { space } from '@/theme';

// Placeholder until Step 7 (Budget and Home).
export default function Home() {
  return (
    <Screen title="Home">
      <KeyBlock>
        <Text variant="sectionHeading">This month</Text>
        <Text variant="body">Your spending and what people owe you will show up here.</Text>
      </KeyBlock>
      <View style={styles.section}>
        <Text variant="sectionHeading">Recent</Text>
        <Text variant="small">No expenses yet. Tap + to add one.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
});
