import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, sizes, space } from '@/theme';

import { Text } from './Text';

interface SectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /** A thin line above, for long forms where sections need to stand apart. */
  divided?: boolean;
  children: ReactNode;
}

/** A 15px section heading over its content. Screens put 28px between sections. */
export function Section({ title, description, action, divided = false, children }: SectionProps) {
  return (
    <View style={[styles.section, divided && styles.divided]}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text variant="sectionHeading" accessibilityRole="header">
            {title}
          </Text>
          {description ? <Text variant="small">{description}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.md,
  },
  divided: {
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.divider,
    paddingTop: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
});
