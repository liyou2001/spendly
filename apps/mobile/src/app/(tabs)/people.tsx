import { KeyBlock, Screen, Text } from '@/components';

// Placeholder until Steps 5 and 6 (groups, balances).
export default function People() {
  return (
    <Screen title="People">
      <KeyBlock>
        <Text variant="sectionHeading">Who owes whom</Text>
        <Text variant="body">Your groups and balances with roommates will show up here.</Text>
      </KeyBlock>
    </Screen>
  );
}
