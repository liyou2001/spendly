import Feather from '@expo/vector-icons/Feather';
import { formatCents } from '@spendly/ledger';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import type { ComponentProps } from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Avatar, Button, KeyBlock, Text, TextButton } from '@/components';
import { colors, fonts, radius, sizes, space } from '@/theme';

// Web only: what someone sees before signing in (the app goes straight to sign-in).

const WIDE = 880;
const MAX_WIDTH = 1080;

const STEPS: { icon: ComponentProps<typeof Feather>['name']; title: string; body: string }[] = [
  {
    icon: 'camera',
    title: 'Scan the receipt',
    body: 'Take a photo or forward the email receipt. Spendly reads the items, and you check them before anything is saved.',
  },
  {
    icon: 'users',
    title: 'Split it by item',
    body: 'Paper towels three ways, oat milk just for Maya. Every share is worked out to the cent and adds up to the total.',
  },
  {
    icon: 'check-circle',
    title: 'Settle up',
    body: 'Send a payment link. Roommates see the whole bill and pay you with Venmo, PayPal or Cash App, no app needed.',
  },
];

const DIFFERENCES = [
  {
    title: 'Your budget sees your share',
    body: 'Pay $140 at Costco and only your $83 counts as your spending.',
  },
  {
    title: 'What people owe you is kept separate',
    body: 'A who-owes-whom ledger, worked out from every expense and payment.',
  },
  {
    title: 'Paying back isn’t income',
    body: 'Repayments settle debts. They never show up as spending or income in your budget.',
  },
  {
    title: 'Nothing is hidden in a group',
    body: 'Everyone in it sees each expense in full: the items, who each was for, and every share.',
  },
];

// The plan's example: Leo pays $140.00 at Costco, split by item.
const EXAMPLE = {
  total: 14000,
  items: [
    { names: 'Protein powder, graphic tee, granola bars', cents: 6800, people: ['Leo'] },
    { names: 'Paper towels, dish soap, trash bags', cents: 4500, people: ['Leo', 'Jeff', 'Maya'] },
    { names: 'Oat milk, hummus, veggie chips', cents: 2700, people: ['Maya'] },
  ],
  results: [
    { label: 'Your spending', cents: 8300 },
    { label: 'Jeff owes you', cents: 1500 },
    { label: 'Maya owes you', cents: 4200 },
  ],
};

export default function Landing() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const getStarted = () => router.push('/sign-in');

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Head>
        <title>Spendly · Split shared money the right way</title>
        <meta
          name="description"
          content="A budget for college students that gets shared money right: split receipts by item, track who owes whom, and settle up."
        />
      </Head>
      <View style={styles.column}>
        <View style={styles.nav}>
          <View style={styles.brand}>
            <Image
              source={require('../../assets/splash-icon.png')}
              style={styles.logo}
              accessibilityIgnoresInvertColors
            />
            <Text variant="bodyMedium">Spendly</Text>
          </View>
          <TextButton label="Sign in" onPress={getStarted} />
        </View>

        <View style={[styles.hero, wide && styles.heroWide]}>
          <View style={[styles.heroText, wide && styles.half]}>
            <Text style={[styles.headline, wide && styles.headlineWide]} accessibilityRole="header">
              Split shared money the right way.
            </Text>
            <Text variant="body" style={styles.lead}>
              Track your own spending, split shared purchases with roommates, and settle up. Your
              share counts in your budget; what friends owe you is tracked on its own.
            </Text>
            <View style={styles.cta}>
              <Button label="Get started" onPress={getStarted} />
              <Text variant="small">Free. Sign in with your email, no password.</Text>
            </View>
          </View>

          <View style={wide ? styles.half : null}>
            <KeyBlock>
              <Text variant="small" style={styles.inkSmall}>
                Leo paid at Costco
              </Text>
              <Text variant="bigNumber">{formatCents(EXAMPLE.total)}</Text>
              <View style={styles.exampleItems}>
                {EXAMPLE.items.map((item) => (
                  <View key={item.names} style={styles.exampleItem}>
                    <View style={styles.flex}>
                      <Text variant="small" style={styles.inkSmall}>
                        {item.names}
                      </Text>
                      <View style={styles.avatars}>
                        {item.people.map((name) => (
                          <Avatar key={name} name={name} size={22} onKeyBlock />
                        ))}
                        <Text variant="caption" style={styles.inkSmall}>
                          {item.people.length === 1
                            ? `Just ${item.people[0]}`
                            : `Split ${item.people.length} ways`}
                        </Text>
                      </View>
                    </View>
                    <Text variant="body" style={styles.amount}>
                      {formatCents(item.cents)}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.exampleResults}>
                {EXAMPLE.results.map((row) => (
                  <View key={row.label} style={styles.exampleRow}>
                    <Text variant="body" style={styles.flex}>
                      {row.label}
                    </Text>
                    <Text variant="bodyMedium" style={styles.amount}>
                      {formatCents(row.cents)}
                    </Text>
                  </View>
                ))}
              </View>
            </KeyBlock>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            How it works
          </Text>
          <View style={[styles.steps, wide && styles.stepsWide]}>
            {STEPS.map((step, i) => (
              <View key={step.title} style={[styles.step, wide && styles.stepWide]}>
                <View style={styles.stepIcon}>
                  <Feather name={step.icon} size={sizes.icon} color={colors.ink} />
                </View>
                <Text variant="bodyMedium">
                  {i + 1}. {step.title}
                </Text>
                <Text variant="small">{step.body}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            What’s different
          </Text>
          <View style={wide ? styles.grid : null}>
            {DIFFERENCES.map((item) => (
              <View key={item.title} style={[styles.difference, wide && styles.cell]}>
                <Text variant="bodyMedium">{item.title}</Text>
                <Text variant="small">{item.body}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.section, styles.closing]}>
          <Text style={styles.closingTitle}>Ready to split your first receipt?</Text>
          <View style={styles.closingButton}>
            <Button label="Get started" onPress={getStarted} />
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.brand}>
            <Image
              source={require('../../assets/splash-icon.png')}
              style={styles.footerLogo}
              accessibilityIgnoresInvertColors
            />
            <Text variant="small">Spendly · Shared money, done right</Text>
          </View>
          <TextButton label="Sign in" onPress={getStarted} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pageContent: {
    alignItems: 'center',
    paddingHorizontal: space.gutter,
    paddingBottom: space.section * 2,
  },
  column: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    gap: space.section * 2,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.lg,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  logo: {
    width: 32,
    height: 32,
  },
  hero: {
    gap: space.section,
  },
  heroWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.section * 2,
  },
  half: {
    flex: 1,
  },
  heroText: {
    gap: space.lg,
  },
  headline: {
    fontFamily: fonts.light,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: 38 * -0.02,
    color: colors.ink,
  },
  headlineWide: {
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: 52 * -0.03,
  },
  lead: {
    maxWidth: 520,
  },
  cta: {
    gap: space.sm,
    alignItems: 'flex-start',
  },
  inkSmall: {
    color: colors.ink,
  },
  exampleItems: {
    gap: space.md,
    paddingTop: space.sm,
  },
  exampleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingTop: space.xs,
  },
  exampleResults: {
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.background,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  amount: {
    fontVariant: ['tabular-nums'],
  },
  flex: {
    flex: 1,
  },
  section: {
    gap: space.xl,
  },
  sectionTitle: {
    fontFamily: fonts.medium,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
  },
  steps: {
    gap: space.xl,
  },
  stepsWide: {
    flexDirection: 'row',
  },
  step: {
    gap: space.sm,
  },
  stepWide: {
    flex: 1,
  },
  stepIcon: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radius.pill,
    borderWidth: sizes.hairline,
    borderColor: colors.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  difference: {
    gap: space.xs,
    paddingVertical: space.lg,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.divider,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.section * 2,
  },
  cell: {
    width: '45%',
    flexGrow: 1,
  },
  closing: {
    alignItems: 'center',
    paddingTop: space.section,
  },
  closingTitle: {
    fontFamily: fonts.medium,
    fontSize: 26,
    lineHeight: 32,
    color: colors.ink,
    textAlign: 'center',
  },
  closingButton: {
    minWidth: 220,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.lg,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.divider,
  },
  footerLogo: {
    width: 20,
    height: 20,
  },
});
