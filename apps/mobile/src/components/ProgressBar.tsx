import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

interface ProgressBarProps {
  /** Amount used, e.g. cents spent. */
  value: number;
  /** Amount available, e.g. the monthly limit in cents. */
  max: number;
  accessibilityLabel?: string;
}

/** Orange bar on a pale track. Full when value reaches max. */
export function ProgressBar({ value, max, accessibilityLabel }: ProgressBarProps) {
  // Only the bar's width is a fraction; the amounts themselves stay whole cents.
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
    >
      <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
});
