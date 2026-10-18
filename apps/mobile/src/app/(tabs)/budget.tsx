import { KeyBlock, Screen, Text } from '@/components';

// Placeholder until Step 7 (Budget and Home).
export default function Budget() {
  return (
    <Screen title="Budget">
      <KeyBlock>
        <Text variant="sectionHeading">Monthly limits</Text>
        <Text variant="body">Your categories and how much is left in each will show up here.</Text>
      </KeyBlock>
    </Screen>
  );
}
