import Feather from '@expo/vector-icons/Feather';
import { formatCents } from '@spendly/ledger';
import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Breakdown,
  Button,
  Chip,
  KeyBlock,
  ListRow,
  Money,
  ProgressBar,
  Tag,
  Text,
  TextButton,
} from '@/components';
import { TAB_ICONS } from '@/components/TabBar';
import {
  COSTCO_TOTAL_CENTS,
  costcoBreakdown,
  costcoShare,
  type ExamplePerson,
} from '@/lib/costcoExample';
import { goBack } from '@/lib/navigation';
import { colors, radius, sizes, space } from '@/theme';

// A short tour of the core features. New accounts see it once after giving their name; Me → Help
// opens it again. Each card shows a piece of a real screen, built from the same components, with
// the plan's Costco example: what Leo sees after splitting it with Jeff and Maya.

/** Keeps the cards readable in a wide browser window. */
const COLUMN_WIDTH = 480;

const jeffBreakdown = costcoBreakdown('Jeff');

const BUDGET = [
  // Leo's share of the Costco trip.
  { name: 'Groceries', spentCents: costcoShare('Leo'), budgetCents: 30000 },
  { name: 'Dining', spentCents: 4250, budgetCents: 15000 },
];

const amountsOf = (line: (typeof BUDGET)[number]) =>
  `${formatCents(line.spentCents)} of ${formatCents(line.budgetCents)}`;

const PAGES: {
  title: string;
  body: string;
  picture: string;
  Example: ComponentType;
  snapshotStyle?: ViewStyle;
}[] = [
  {
    title: 'Your share is what counts',
    body: 'Pay for everyone and only your share counts in your budget. What the others owe you is tracked separately.',
    picture: `The Costco expense: your share ${formatCents(costcoShare('Leo'))}, Jeff owes you ${formatCents(costcoShare('Jeff'))}, Maya owes you ${formatCents(costcoShare('Maya'))}, total ${formatCents(COSTCO_TOTAL_CENTS)}.`,
    Example: ExpenseScreen,
  },
  {
    title: 'Add an expense',
    body: 'Tap the + in the middle of the tab bar at the bottom whenever you buy something.',
    picture: 'The tab bar: Home, Budget, the + button, People and Me.',
    Example: TabBarPicture,
    snapshotStyle: { paddingTop: 96, paddingHorizontal: 0, paddingBottom: space.sm },
  },
  {
    title: 'Scan it or type it in',
    body: 'Take or choose a photo of the receipt and Spendly fills in the items for you to check before anything is saved. Or type in each item, or just the total.',
    picture: 'Add expense: Take photo, Choose photo, and Itemized or Just a total.',
    Example: AddExpenseScreen,
  },
  {
    title: 'Split it by item',
    body: 'Each item is split among just the people it’s for, to the cent. Jeff pays a third of the paper towels, dish soap and trash bags, and nothing for the rest.',
    picture: `How Jeff’s ${formatCents(costcoShare('Jeff'))} was worked out: ${(jeffBreakdown?.items ?? []).map((row) => `${row.title} ${formatCents(row.cents)}`).join(', ')}.`,
    Example: SplitScreen,
  },
  {
    title: 'Groups see everything',
    body: 'Everyone in a group sees each expense in full: the items, who each was for and every share. Nobody outside the group sees any of it.',
    picture: `The Apartment group: Jeff owes you ${formatCents(costcoShare('Jeff'))}, Maya owes you ${formatCents(costcoShare('Maya'))}, and the Costco expense.`,
    Example: GroupScreen,
  },
  {
    title: 'Settle up',
    body: 'Request payment sends Jeff a link with the whole bill, and he can pay you with Venmo, PayPal or Cash App without the app. Paying back settles the debt; it never counts as income.',
    picture: `Jeff’s page: Jeff owes you ${formatCents(costcoShare('Jeff'))}, with Request payment and Jeff paid me.`,
    Example: PersonScreen,
  },
  {
    title: 'Track your spending',
    body: 'Everything you spend, shared or just yours, is sorted into categories like Groceries and Dining. Set a monthly limit for each and see how you’re doing on the Budget tab.',
    picture: `Budget categories: ${BUDGET.map((line) => `${line.name} ${amountsOf(line)}`).join(', ')}.`,
    Example: BudgetScreen,
  },
];

export default function Tutorial() {
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(0);
  const last = page === PAGES.length - 1;
  const close = () => goBack('/');

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const shown = Math.round(event.nativeEvent.contentOffset.x / width);
    if (shown !== page && shown >= 0 && shown < PAGES.length) setPage(shown);
  }

  function show(index: number) {
    pager.current?.scrollTo({ x: index * width, animated: true });
    setPage(index);
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        {last ? <View style={styles.headerSpace} /> : <TextButton label="Skip" onPress={close} />}
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {PAGES.map(({ title, body, picture, Example, snapshotStyle }) => (
          <ScrollView
            key={title}
            style={{ width }}
            contentContainerStyle={styles.pageContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.column}>
              <Snapshot label={picture} style={snapshotStyle}>
                <Example />
              </Snapshot>
              <View style={styles.words}>
                <Text variant="screenTitle" accessibilityRole="header">
                  {title}
                </Text>
                <Text variant="body">{body}</Text>
              </View>
            </View>
          </ScrollView>
        ))}
      </ScrollView>

      <View style={[styles.column, styles.footer]}>
        <View style={styles.progress}>
          {/* The text says the same, so screen readers skip the dots. */}
          <View
            style={styles.dots}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {PAGES.map(({ title }, index) => (
              <View key={title} style={[styles.dot, index === page && styles.dotActive]} />
            ))}
          </View>
          <Text variant="small">
            {page + 1} of {PAGES.length}
          </Text>
        </View>
        <View style={styles.buttons}>
          {page > 0 ? (
            <View style={styles.flex}>
              <Button label="Previous" variant="secondary" onPress={() => show(page - 1)} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <Button
              label={last ? 'Get started' : 'Next'}
              onPress={() => (last ? close() : show(page + 1))}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * A framed piece of a real screen. It's a picture: nothing in it can be tapped, and screen
 * readers hear `label` instead of buttons that do nothing.
 */
function Snapshot({
  label,
  style,
  children,
}: {
  label: string;
  style?: ViewStyle | undefined;
  children: ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.snapshot, style]}
    >
      {children}
    </View>
  );
}

const nothing = () => undefined;

// As on the expense screen, or with a chevron as on the group screen.
function OwesRow({ person, chevron = false }: { person: ExamplePerson; chevron?: boolean }) {
  return (
    <View style={chevron ? styles.balance : styles.row}>
      <Text variant="body" style={styles.flex}>
        {person} owes you
      </Text>
      <Money cents={costcoShare(person)} variant="bodyMedium" />
      {chevron ? <Feather name="chevron-right" size={18} color={colors.muted} /> : null}
    </View>
  );
}

// The expense screen (expenses/[id].tsx): the top of it.
function ExpenseScreen() {
  return (
    <>
      <View style={styles.titleBlock}>
        <Text variant="screenTitle">Costco</Text>
        <Text variant="small">Sat, Oct 17 · Apartment · paid by you</Text>
      </View>
      <KeyBlock>
        <Text variant="sectionHeading">Your share</Text>
        <Money cents={costcoShare('Leo')} variant="bigNumber" />
        <Tag label="Groceries" tone="white" />
        <View style={styles.rows}>
          <OwesRow person="Jeff" />
          <OwesRow person="Maya" />
          <View style={styles.row}>
            <Text variant="body" style={styles.flex}>
              Total
            </Text>
            <Money cents={COSTCO_TOTAL_CENTS} variant="bodyMedium" />
          </View>
        </View>
      </KeyBlock>
    </>
  );
}

const TABS = [
  { route: 'index', label: 'Home' },
  { route: 'budget', label: 'Budget' },
  { route: 'people', label: 'People' },
  { route: 'me', label: 'Me' },
];

// The tab bar (components/TabBar.tsx) at the bottom of the screen, on Home.
function TabBarPicture() {
  const tabs = TABS.map((tab, index) => {
    const focused = index === 0;
    return (
      <View key={tab.route} style={styles.tab}>
        <View style={[styles.iconPill, focused && styles.iconPillActive]}>
          <Feather
            name={TAB_ICONS[tab.route] ?? 'circle'}
            size={sizes.icon}
            color={focused ? colors.ink : colors.muted}
          />
        </View>
        <Text variant="caption" style={focused ? styles.ink : undefined}>
          {tab.label}
        </Text>
      </View>
    );
  });
  tabs.splice(
    2,
    0,
    <View key="add" style={styles.tab}>
      <View style={styles.plus}>
        <Feather name="plus" size={26} color={colors.onAccent} />
      </View>
    </View>,
  );
  return <View style={styles.tabBar}>{tabs}</View>;
}

// Add expense (add-expense.tsx): the scan buttons and how the items are entered.
function AddExpenseScreen() {
  return (
    <>
      <View style={styles.stack}>
        <Text variant="small">Have the receipt? Scan it to fill this in.</Text>
        <View style={styles.wrap}>
          <TextButton label="Take photo" icon="camera" onPress={nothing} />
          <TextButton label="Choose photo" icon="image" onPress={nothing} />
        </View>
      </View>
      <View style={styles.stack}>
        <Text variant="sectionHeading">Items</Text>
        <View style={styles.wrap}>
          <Chip label="Itemized" icon="list" selected onPress={nothing} />
          <Chip label="Just a total" icon="hash" onPress={nothing} />
        </View>
      </View>
    </>
  );
}

// The expense screen's breakdown of one person's share.
function SplitScreen() {
  if (!jeffBreakdown) return null;
  return (
    <View>
      <Text variant="sectionHeading">
        How Jeff’s {formatCents(jeffBreakdown.totalCents)} was worked out
      </Text>
      <Breakdown explained={jeffBreakdown} whose="Jeff’s" />
    </View>
  );
}

// The group screen (groups/[id].tsx): who owes whom and its expenses.
function GroupScreen() {
  return (
    <>
      <Text variant="screenTitle">Apartment</Text>
      <KeyBlock>
        <Text variant="sectionHeading">Who owes whom</Text>
        <OwesRow person="Jeff" chevron />
        <OwesRow person="Maya" chevron />
      </KeyBlock>
      <View>
        <Text variant="sectionHeading">Expenses</Text>
        <ListRow
          title="Costco"
          subtitle={`Sat, Oct 17 · your share of ${formatCents(COSTCO_TOTAL_CENTS)}`}
          trailing={<Money cents={costcoShare('Leo')} />}
          onPress={nothing}
          divider={false}
        />
      </View>
    </>
  );
}

// A person's page (people/[id].tsx) when they owe you.
function PersonScreen() {
  return (
    <>
      <Text variant="screenTitle">Jeff</Text>
      <KeyBlock>
        <Text variant="sectionHeading">Jeff owes you</Text>
        <Money cents={costcoShare('Jeff')} variant="bigNumber" />
      </KeyBlock>
      <View style={styles.stack}>
        <Button label="Request payment" onPress={nothing} />
        <Button label="Jeff paid me" variant="secondary" onPress={nothing} />
      </View>
    </>
  );
}

// The Budget tab's category rows ((tabs)/budget.tsx).
function BudgetScreen() {
  return (
    <View>
      <Text variant="sectionHeading">Categories</Text>
      {BUDGET.map((line, index) => (
        <View
          key={line.name}
          style={[styles.budgetRow, index < BUDGET.length - 1 && styles.budgetDivider]}
        >
          <View style={styles.budgetTop}>
            <Text variant="body" style={styles.flex}>
              {line.name}
            </Text>
            <Text variant="bodyMedium" style={styles.tabular}>
              {amountsOf(line)}
            </Text>
          </View>
          <ProgressBar
            value={line.spentCents}
            max={line.budgetCents}
            accessibilityLabel={`${line.name}: ${amountsOf(line)}`}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: space.gutter,
  },
  headerSpace: {
    height: sizes.touch,
  },
  pageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.gutter,
    paddingVertical: space.lg,
  },
  column: {
    width: '100%',
    maxWidth: COLUMN_WIDTH,
    alignSelf: 'center',
  },
  snapshot: {
    gap: space.lg,
    padding: space.xl,
    borderWidth: sizes.hairline,
    borderColor: colors.controlBorder,
    borderRadius: radius.keyBlock,
    backgroundColor: colors.background,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  words: {
    gap: space.sm,
    paddingTop: space.section,
  },
  footer: {
    gap: space.lg,
    paddingHorizontal: space.gutter,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.controlBorder,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.accent,
  },
  buttons: {
    flexDirection: 'row',
    gap: space.md,
  },
  titleBlock: {
    gap: space.sm,
  },
  stack: {
    gap: space.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  rows: {
    gap: space.xs,
    paddingTop: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  balance: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  // As in components/TabBar.tsx.
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
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
  ink: {
    color: colors.ink,
  },
  plus: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetRow: {
    gap: space.sm,
    paddingVertical: space.md,
  },
  budgetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  budgetDivider: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.divider,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  flex: {
    flex: 1,
  },
});
