import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, sizes, space } from '@/theme';

import { Text } from './Text';

type IconName = ComponentProps<typeof Feather>['name'];

const icons: Record<string, IconName> = {
  index: 'home',
  budget: 'pie-chart',
  people: 'users',
  me: 'user',
};

/** Home, Budget, +, People, Me. The + opens Add expense instead of being a tab of its own. */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const tabs = state.routes.map((route, index) => {
    const focused = state.index === index;
    const label = descriptors[route.key]?.options.title ?? route.name;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        style={styles.tab}
      >
        <View style={[styles.iconPill, focused && styles.iconPillActive]}>
          <Feather
            name={icons[route.name] ?? 'circle'}
            size={sizes.icon}
            color={focused ? colors.ink : colors.muted}
          />
        </View>
        <Text variant="caption" style={focused ? styles.labelActive : undefined}>
          {label}
        </Text>
      </Pressable>
    );
  });

  // The + sits in the middle, after Home and Budget.
  tabs.splice(2, 0, <AddButton key="add" />);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>{tabs}</View>
  );
}

function AddButton() {
  return (
    <View style={styles.tab}>
      <Pressable
        onPress={() => router.push('/add-expense')}
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
      >
        <Feather name="plus" size={26} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.divider,
    paddingTop: space.sm,
    paddingHorizontal: space.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.touch + 12,
    gap: 2,
  },
  iconPill: {
    width: 56,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: colors.accentPale,
  },
  labelActive: {
    color: colors.ink,
  },
  add: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPressed: {
    opacity: 0.8,
  },
});
