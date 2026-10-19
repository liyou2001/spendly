import { formatCents } from '@spendly/ledger';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as SMS from 'expo-sms';
import { useCallback, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import {
  AmountForm,
  Button,
  FormMessage,
  KeyBlock,
  ListRow,
  Loadable,
  Money,
  Screen,
  Section,
  Tag,
  Text,
  TextButton,
} from '@/components';
import {
  claimPayment,
  decidePayment,
  fetchBalances,
  fetchGroupOf,
  fetchHandles,
  fetchPairExpenses,
  fetchPayments,
  forgiveDebt,
  friendlyError,
  recordPayment,
  type PairExpense,
  type Payment,
  type PaymentHandles,
} from '@/lib/data';
import { formatDate } from '@/lib/dates';
import { expensesBehind, paymentLink, paymentNote, requestMessage } from '@/lib/requests';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { space } from '@/theme';

const NO_HANDLES: PaymentHandles = { venmo: null, paypal: null, cashtag: null };

const METHOD_LABELS: Record<string, string> = {
  venmo: 'Venmo',
  paypal: 'PayPal',
  cashapp: 'Cash App',
  cash: 'cash',
  other: 'other',
};

async function fetchPerson(participantId: string, userId: string) {
  const group = await fetchGroupOf(participantId);
  const me = group.people.find((p) => p.userId === userId);
  const them = group.people.find((p) => p.id === participantId);
  if (!me || !them) throw new Error('Person not found');

  const [balances, payments, expenses, handles] = await Promise.all([
    fetchBalances(group.id),
    fetchPayments({ groupId: group.id }),
    fetchPairExpenses(group.id, me.id, them.id),
    fetchHandles([userId, ...(them.userId ? [them.userId] : [])]),
  ]);
  const owed = (from: string, to: string) =>
    balances.find((b) => b.from === from && b.to === to)?.amountCents ?? 0;

  return {
    group,
    me,
    them,
    /** Positive: they owe you. Negative: you owe them. */
    netCents: owed(them.id, me.id) - owed(me.id, them.id),
    payments: payments.filter(
      (p) => (p.from === them.id && p.to === me.id) || (p.from === me.id && p.to === them.id),
    ),
    expenses,
    myHandles: handles[userId] ?? NO_HANDLES,
    theirHandles: (them.userId && handles[them.userId]) || NO_HANDLES,
  };
}

type Form = 'none' | 'record' | 'paid' | 'forgive';

export default function PersonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const person = useLoad(useCallback(() => fetchPerson(id, userId), [id, userId]));

  return (
    <Screen
      title={person.status === 'ready' ? person.data.them.displayName : ''}
      onBack={() => router.back()}
    >
      <Loadable load={person} errorMessage="Couldn’t load this person.">
        {(data) => <PersonView {...data} onChanged={person.reload} />}
      </Loadable>
    </Screen>
  );
}

function PersonView({
  group,
  me,
  them,
  netCents,
  payments,
  expenses,
  myHandles,
  theirHandles,
  onChanged,
}: Awaited<ReturnType<typeof fetchPerson>> & { onChanged: () => void }) {
  const [form, setForm] = useState<Form>('none');
  const [error, setError] = useState<string | null>(null);
  const firstName = them.displayName.split(' ')[0] ?? them.displayName;
  const hasApp = them.userId !== null;
  const claimsToMe = payments.filter((p) => p.status === 'claimed' && p.to === me.id);
  const claimsFromMe = payments.filter((p) => p.status === 'claimed' && p.from === me.id);
  const owedToMe = expenses.filter((e) => e.direction === 'theyOwe' && !e.voided);
  const iOwe = expenses.filter((e) => e.direction === 'iOwe' && !e.voided);

  async function act(run: () => Promise<void>) {
    try {
      await run();
      setForm('none');
      setError(null);
      onChanged();
    } catch (e) {
      throw new Error(friendlyError(e as Error));
    }
  }

  async function requestPayment() {
    const behind = expensesBehind(owedToMe, netCents);
    const link = paymentLink(myHandles, netCents, paymentNote(behind));
    const message = requestMessage({ firstName, owedCents: netCents, expenses: behind, link });
    try {
      if (them.phone && (await SMS.isAvailableAsync())) {
        await SMS.sendSMSAsync([them.phone], message);
      } else {
        await Share.share({ message });
      }
    } catch {
      setError('Couldn’t open Messages. Try again.');
    }
  }

  async function payThem() {
    const link = paymentLink(theirHandles, -netCents, paymentNote(expensesBehind(iOwe, -netCents)));
    if (link) await Linking.openURL(link);
  }

  const payApp = theirHandles.venmo
    ? 'Venmo'
    : theirHandles.paypal
      ? 'PayPal'
      : theirHandles.cashtag
        ? 'Cash App'
        : null;

  return (
    <>
      <Text variant="small">
        {group.name} · {hasApp ? 'Has the app' : (them.phone ?? 'No phone number')}
      </Text>

      <KeyBlock>
        <Text variant="sectionHeading">
          {netCents > 0
            ? `${firstName} owes you`
            : netCents < 0
              ? `You owe ${firstName}`
              : 'You’re settled up'}
        </Text>
        <Money cents={Math.abs(netCents)} variant="bigNumber" />
        {claimsFromMe.map((claim) => (
          <Text key={claim.id} variant="small">
            You said you paid {formatCents(claim.amountCents)} · waiting for {firstName} to confirm
          </Text>
        ))}
      </KeyBlock>

      {claimsToMe.map((claim) => (
        <ClaimToConfirm
          key={claim.id}
          claim={claim}
          name={firstName}
          onDecide={(accept) => act(() => decidePayment(claim.id, accept))}
        />
      ))}

      {error ? <FormMessage message={error} /> : null}

      {form === 'record' ? (
        <AmountForm
          label={`${firstName} paid you`}
          submitLabel="Record payment"
          initialCents={Math.max(netCents, 0)}
          withMethod
          hint="Counts right away. You can record part of what they owe."
          onSubmit={(amountCents, method) =>
            act(() =>
              recordPayment({ groupId: group.id, from: them.id, to: me.id, amountCents, method }),
            )
          }
          onCancel={() => setForm('none')}
        />
      ) : form === 'paid' ? (
        <AmountForm
          label={`You paid ${firstName}`}
          submitLabel={hasApp ? 'I paid' : 'Record payment'}
          initialCents={Math.max(-netCents, 0)}
          withMethod
          hint={
            hasApp
              ? `${firstName} confirms it before it counts.`
              : `${firstName} doesn’t have the app, so this counts right away.`
          }
          onSubmit={(amountCents, method) =>
            act(() =>
              hasApp
                ? claimPayment({ groupId: group.id, to: them.id, amountCents, method })
                : recordPayment({
                    groupId: group.id,
                    from: me.id,
                    to: them.id,
                    amountCents,
                    method,
                  }),
            )
          }
          onCancel={() => setForm('none')}
        />
      ) : form === 'forgive' ? (
        <AmountForm
          label={`Forgive ${firstName}`}
          submitLabel="Forgive"
          initialCents={netCents}
          maxCents={netCents}
          hint="They won’t owe it anymore, and it counts as your own spending."
          onSubmit={(amountCents) => act(() => forgiveDebt(group.id, them.id, amountCents))}
          onCancel={() => setForm('none')}
        />
      ) : netCents > 0 ? (
        <View style={styles.actions}>
          <Button label="Request payment" onPress={() => void requestPayment()} />
          {myHandles.venmo || myHandles.paypal || myHandles.cashtag ? null : (
            <Text variant="small">
              Add your Venmo, PayPal or Cash App in Me → Profile & payments to include a payment
              link.
            </Text>
          )}
          <Button
            label={`${firstName} paid me`}
            variant="secondary"
            onPress={() => setForm('record')}
          />
          <TextButton label="Forgive" icon="heart" onPress={() => setForm('forgive')} />
        </View>
      ) : netCents < 0 ? (
        <View style={styles.actions}>
          {payApp ? <Button label={`Pay with ${payApp}`} onPress={() => void payThem()} /> : null}
          <Button
            label={`I paid ${firstName}`}
            variant={payApp ? 'secondary' : 'primary'}
            onPress={() => setForm('paid')}
          />
        </View>
      ) : null}

      <History expenses={expenses} payments={payments} me={me.id} name={firstName} />
    </>
  );
}

function ClaimToConfirm({
  claim,
  name,
  onDecide,
}: {
  claim: Payment;
  name: string;
  onDecide: (accept: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setBusy(accept ? 'yes' : 'no');
    try {
      await onDecide(accept);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(null);
    }
  }

  const method = claim.method ? ` by ${METHOD_LABELS[claim.method] ?? claim.method}` : '';
  return (
    <View style={styles.claim}>
      <FormMessage
        message={`${name} says they paid you ${formatCents(claim.amountCents)}${method} on ${formatDate(claim.createdAt.slice(0, 10))}.`}
      />
      {error ? <FormMessage message={error} /> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button
            label="Didn’t get it"
            variant="secondary"
            onPress={() => void decide(false)}
            loading={busy === 'no'}
            disabled={busy === 'yes'}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label="Got it"
            onPress={() => void decide(true)}
            loading={busy === 'yes'}
            disabled={busy === 'no'}
          />
        </View>
      </View>
    </View>
  );
}

function paymentTitle(payment: Payment, me: string, name: string): string {
  const fromMe = payment.from === me;
  if (payment.kind === 'forgiveness') return fromMe ? `${name} forgave you` : `You forgave ${name}`;
  const base = fromMe ? `You paid ${name}` : `${name} paid you`;
  if (payment.status === 'claimed') return `${base} · waiting to confirm`;
  if (payment.status === 'rejected') return `${base} · not received`;
  return base;
}

function History({
  expenses,
  payments,
  me,
  name,
}: {
  expenses: PairExpense[];
  payments: Payment[];
  me: string;
  name: string;
}) {
  const rows = [
    ...expenses.map((e) => ({ kind: 'expense' as const, date: e.expenseDate, expense: e })),
    ...payments.map((p) => ({
      kind: 'payment' as const,
      date: p.createdAt.slice(0, 10),
      payment: p,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Section title="History">
      {rows.length === 0 ? (
        <Text variant="small">Nothing between you yet.</Text>
      ) : (
        <View>
          {rows.map((row, index) =>
            row.kind === 'expense' ? (
              <ListRow
                key={`e-${row.expense.id}`}
                title={row.expense.merchant}
                subtitle={`${formatDate(row.date)} · ${
                  row.expense.direction === 'theyOwe' ? `${name}’s share` : 'your share'
                }`}
                trailing={
                  row.expense.voided ? (
                    <Tag label="Voided" />
                  ) : (
                    <Money cents={row.expense.amountCents} />
                  )
                }
                onPress={() =>
                  router.push({ pathname: '/expenses/[id]', params: { id: row.expense.id } })
                }
                divider={index < rows.length - 1}
              />
            ) : (
              <ListRow
                key={`p-${row.payment.id}`}
                title={paymentTitle(row.payment, me, name)}
                subtitle={[
                  formatDate(row.date),
                  row.payment.method ? METHOD_LABELS[row.payment.method] : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={<Money cents={row.payment.amountCents} />}
                divider={index < rows.length - 1}
              />
            ),
          )}
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space.md,
  },
  claim: {
    gap: space.md,
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
});
