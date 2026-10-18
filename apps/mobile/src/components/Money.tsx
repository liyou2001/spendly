import { formatCents, type Cents } from '@spendly/ledger';
import { StyleSheet } from 'react-native';

import { Text, type TextProps } from './Text';

interface MoneyProps extends Omit<TextProps, 'children'> {
  /** Whole cents (Rule 1). Formatted only here, for display. */
  cents: Cents;
}

/** An amount of money in tabular figures, so digits line up in lists. */
export function Money({ cents, variant = 'body', style, ...props }: MoneyProps) {
  return (
    <Text variant={variant} style={[styles.tabular, style]} {...props}>
      {formatCents(cents)}
    </Text>
  );
}

const styles = StyleSheet.create({
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
