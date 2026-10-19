import { formatCents, paymentAppLinks, type Cents } from '@spendly/ledger';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PaymentHandles } from '@/lib/data';
import { formatPhone } from '@/lib/phone';
import { space } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';
import { TextButton } from './TextButton';

/**
 * Every way someone takes payment, side by side so the person paying picks. Venmo, PayPal and
 * Cash App open with the amount filled in; Zelle has no links, so it shows where to send it.
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
  const [copied, setCopied] = useState(false);
  const links = paymentAppLinks(handles, amountCents, note);
  if (links.length === 0 && !handles.zelle) return null;
  const zelle = handles.zelle?.startsWith('+') ? formatPhone(handles.zelle) : handles.zelle;

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
      {handles.zelle && zelle ? (
        <View style={styles.zelle}>
          <Text variant="body" style={styles.flex}>
            Zelle: send it to {zelle} in your bank’s app
          </Text>
          <TextButton
            label={copied ? 'Copied' : 'Copy'}
            icon={copied ? 'check' : 'copy'}
            onPress={() => {
              void Clipboard.setStringAsync(handles.zelle ?? '').then(() => setCopied(true));
            }}
          />
        </View>
      ) : null}
      <Text variant="small">Then tell {name} below, so it counts once they confirm.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: space.md,
  },
  zelle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
});
