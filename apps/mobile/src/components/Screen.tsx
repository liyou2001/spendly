import Feather from '@expo/vector-icons/Feather';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, sizes, space } from '@/theme';

import { Text } from './Text';

interface ScreenProps {
  title?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  /** Scrolls by default; turn off for screens that lay themselves out. */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens skip the bottom, which the tab bar covers. */
  edges?: Edge[];
  /** Shows a back arrow above the title. */
  onBack?: () => void;
}

/** White page with the 24px side margins, an optional title and 28px between sections. */
export function Screen({
  title,
  headerRight,
  children,
  scroll = true,
  edges = ['top', 'left', 'right'],
  onBack,
}: ScreenProps) {
  const back = onBack ? (
    <Pressable
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <Feather name="chevron-left" size={26} color={colors.ink} />
    </Pressable>
  ) : null;
  const header =
    title || back ? (
      <View style={styles.headerStack}>
        {back}
        {title ? (
          <View style={styles.header}>
            <Text variant="screenTitle" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {headerRight}
          </View>
        ) : null}
      </View>
    ) : null;

  return (
    <SafeAreaView edges={edges} style={styles.safeArea}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // iOS: scroll the focused field above the keyboard. Android resizes the window instead.
          automaticallyAdjustKeyboardInsets
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
  headerStack: {
    gap: space.sm,
  },
  back: {
    width: sizes.touch,
    height: sizes.touch,
    marginLeft: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
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
