import { formatCents, paymentAppLinks, type Cents } from '@spendly/ledger';
import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';

import type { PaymentHandles } from '@/lib/data';
import { space } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/**
 * Every way someone takes payment, side by side so the person paying picks. Each opens Venmo,
 * PayPal or Cash App with the amount filled in.
 */
export function PayOptions({
  name,
  handles,
  amountCents,
  note,
}: {
  name: string;
  handles: PaymentHandles;
  amountCents: Cents;
  note: string;
}) {
  const links = paymentAppLinks(handles, amountCents, note);
  if (links.length === 0) return null;

  return (
    <View style={styles.options}>
      <Text variant="small">Pay {formatCents(amountCents)} with any of these:</Text>
      {links.map((link) => (
        <Button
          key={link.app}
          label={`Pay with ${link.label}`}
          variant="secondary"
          onPress={() => void Linking.openURL(link.url)}
        />
      ))}
      <Text variant="small">Then tell {name} below, so it counts once they confirm.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: space.md,
  },
});
