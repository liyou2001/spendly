import { Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { addMonths, monthLabel, monthStart } from '@/lib/budget';
import { calendarDay, calendarWeeks } from '@/lib/dates';
import { colors, fonts, radius, space } from '@/theme';

import { Text } from './Text';
import { IconButton } from './TextButton';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A month calendar that opens under a date, in the dropdown color. Days after `max` can't be
 * picked. Opens on the month of `value`.
 */
export function CalendarPicker({
  value,
  max,
  onPick,
}: {
  value: string;
  /** The latest date that can be picked, e.g. today. */
  max: string;
  onPick: (date: string) => void;
}) {
  const [month, setMonth] = useState(monthStart(value));
  const latestMonth = monthStart(max);

  return (
    <View style={styles.calendar}>
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          label="Previous month"
          onPress={() => setMonth(addMonths(month, -1))}
        />
        <Text variant="bodyMedium" style={styles.title} accessibilityRole="header">
          {monthLabel(month)}
        </Text>
        {month < latestMonth ? (
          <IconButton
            icon="chevron-right"
            label="Next month"
            onPress={() => setMonth(addMonths(month, 1))}
          />
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((day, index) => (
          <Text key={index} variant="caption" style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>
      {calendarWeeks(month).map((week, row) => (
        <View key={row} style={styles.week}>
          {week.map((date, index) => {
            if (!date) return <View key={index} style={styles.cell} />;
            const { selected, today, pickable } = calendarDay(date, value, max);
            const future = !pickable;
            const day = Number(date.slice(8));
            return (
              <Pressable
                key={date}
                onPress={() => onPick(date)}
                disabled={future}
                accessibilityRole="button"
                accessibilityLabel={`${monthLabel(month).split(' ')[0]} ${day}`}
                accessibilityState={{ selected, disabled: future }}
                style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.day,
                    selected && styles.selected,
                    today && !selected && styles.today,
                  ]}
                >
                  <Text
                    variant="body"
                    style={[
                      styles.dayText,
                      selected && styles.selectedText,
                      future && styles.future,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: {
    backgroundColor: colors.accentPale,
    borderRadius: radius.button,
    padding: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  spacer: {
    width: 44,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: space.xs,
  },
  cell: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: colors.accent,
  },
  today: {
    borderWidth: 1,
    borderColor: colors.ink,
  },
  dayText: {
    fontVariant: ['tabular-nums'],
  },
  selectedText: {
    fontFamily: fonts.semibold,
    color: colors.onAccent,
  },
  future: {
    color: colors.muted,
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.6,
  },
});
