import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, space } from '@/theme';

import { Text } from './Text';

interface ScreenProps {
  title?: string;
  /** Shown to the right of the title, e.g. an icon button. */
  headerRight?: ReactNode;
  children: ReactNode;
  /** Scrolls by default; turn off for screens that lay themselves out. */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens skip the bottom, which the tab bar covers. */
  edges?: Edge[];
}

/** White page with the 24px side margins, an optional title and 28px between sections. */
export function Screen({
  title,
  headerRight,
  children,
  scroll = true,
  edges = ['top', 'left', 'right'],
}: ScreenProps) {
  const header = title ? (
    <View style={styles.header}>
      <Text variant="screenTitle" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {headerRight}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={edges} style={styles.safeArea}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: space.gutter,
    paddingTop: space.lg,
    paddingBottom: space.section,
    gap: space.section,
  },
  fill: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  title: {
    flexShrink: 1,
  },
});
