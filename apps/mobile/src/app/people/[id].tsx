import { formatCents } from '@spendly/ledger';
import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import * as SMS from 'expo-sms';
import { useCallback, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import {
  AmountForm,
  Breakdown,
  Button,
  FormMessage,
  KeyBlock,
  ListRow,
  Loadable,
  Money,
  PayOptions,
  Screen,
  Section,
  Tag,
  Text,
  TextButton,
  TextField,
  UsernameField,
} from '@/components';
import {
  cancelInvite,
  claimPayment,
  createShareLink,
  decidePayment,
  fetchActiveShareLinks,
  fetchBalances,
  fetchGroupOf,
  fetchHandles,
  fetchPairExpenses,
  fetchPayments,
  fetchProblemReports,
  forgiveDebt,
  friendlyError,
  inviteToGroup,
  updatePersonPhone,
  recordPayment,
  resolveProblem,
  revokeShareLinks,
  type PairExpense,
  type Person,
  type Payment,
  type PaymentHandles,
} from '@/lib/data';
import { explainShare } from '@/lib/breakdown';
import { formatDate } from '@/lib/dates';
import { payPageUrl } from '@/lib/payPage';
import { normalizePhone } from '@/lib/phone';
import { expensesBehind, paymentLink, paymentNote, requestMessage } from '@/lib/requests';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { useUsernameCheck } from '@/lib/useUsernameCheck';
import { colors, sizes, space } from '@/theme';

const NO_HANDLES: PaymentHandles = { venmo: null, paypal: null, cashtag: null, zelle: null };

const METHOD_LABELS: Record<string, string> = {
  venmo: 'Venmo',
  paypal: 'PayPal',
  cashapp: 'Cash App',
  zelle: 'Zelle',
  cash: 'cash',
  other: 'other',
};

async function fetchPerson(participantId: string, userId: string) {
  const group = await fetchGroupOf(participantId);
  const me = group.people.find((p) => p.userId === userId);
  const them = group.people.find((p) => p.id === participantId);
  if (!me || !them) throw new Error('Person not found');

  const [balances, payments, expenses, handles, activeLinks, reports] = await Promise.all([
    fetchBalances(group.id),
    fetchPayments({ groupId: group.id }),
    fetchPairExpenses(group.id, me.id, them.id),
    fetchHandles([userId, ...(them.userId ? [them.userId] : [])]),
    fetchActiveShareLinks(them.id),
    fetchProblemReports(),
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
    activeLinks,
    reports: reports.filter((r) => r.from === them.id),
  };
}

/** A new private payment page link for this person, or null where there's no page to link to. */
async function newPayPageLink(participantId: string): Promise<string | null> {
  const configured = process.env.EXPO_PUBLIC_PAY_PAGE_URL;
  const hostUri = Constants.expoConfig?.hostUri;
  if (!payPageUrl('', configured, hostUri)) return null;
  return payPageUrl(await createShareLink(participantId), configured, hostUri);
}

type Form = 'none' | 'record' | 'paid' | 'forgive' | 'phone';

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
  activeLinks,
  reports,
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

  /** The request, with a new private link to the payment page (or a payment app link). */
  async function requestText(): Promise<string> {
    const behind = expensesBehind(owedToMe, netCents);
    const link =
      (await newPayPageLink(them.id)) ?? paymentLink(myHandles, netCents, paymentNote(behind));
    return requestMessage({ firstName, owedCents: netCents, expenses: behind, link });
  }

  /** Opens Messages to this number with the request filled in, or the share sheet without SMS. */
  async function textRequest(phone: string) {
    let message: string;
    try {
      message = await requestText();
    } catch (e) {
      setError(friendlyError(e as Error));
      return;
    }
    onChanged();
    try {
      if (await SMS.isAvailableAsync()) await SMS.sendSMSAsync([phone], message);
      else await Share.share({ message });
    } catch {
      setError('Couldn’t open Messages. Try again.');
    }
  }

  async function shareRequest() {
    let message: string;
    try {
      message = await requestText();
    } catch (e) {
      setError(friendlyError(e as Error));
      return;
    }
    onChanged();
    try {
      await Share.share({ message });
    } catch {
      setError('Couldn’t open sharing. Try again.');
    }
  }

  function requestPayment() {
    setError(null);
    // Without a phone number, ask for one first instead of opening a bare share sheet.
    if (them.phone) void textRequest(them.phone);
    else setForm('phone');
  }

  return (
    <>
      <Text variant="small">
        {group.name} ·{' '}
        {hasApp
          ? them.username
            ? `@${them.username}`
            : 'Has the app'
          : (them.phone ?? 'No phone number')}
      </Text>
      {hasApp ? null : <InviteToSpendly person={them} onChanged={onChanged} />}

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

      {reports.map((report) => (
        <ProblemNote
          key={report.id}
          name={firstName}
          message={report.message}
          createdAt={report.createdAt}
          onDismiss={() => act(() => resolveProblem(report.id))}
        />
      ))}

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
      ) : form === 'phone' ? (
        <PhoneForRequest
          name={firstName}
          onSave={async (phone) => {
            await updatePersonPhone(them.id, phone);
            setForm('none');
            onChanged();
            await textRequest(phone);
          }}
          onShare={() => {
            setForm('none');
            void shareRequest();
          }}
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
          <Button label="Request payment" onPress={requestPayment} />
          {myHandles.venmo || myHandles.paypal || myHandles.cashtag || myHandles.zelle ? null : (
            <Text variant="small">
              Add your Venmo, PayPal, Cash App or Zelle in Me → Profile & payments so {firstName}{' '}
              can pay you easily.
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
          <PayOptions
            name={firstName}
            handles={theirHandles}
            amountCents={-netCents}
            note={paymentNote(expensesBehind(iOwe, -netCents))}
          />
          <Button label={`I paid ${firstName}`} onPress={() => setForm('paid')} />
        </View>
      ) : null}

      {activeLinks > 0 ? (
        <PaymentLinkStatus name={firstName} onRevoke={() => act(() => revokeShareLinks(them.id))} />
      ) : null}

      {netCents !== 0 ? (
        <WhatItsFor
          expenses={
            netCents > 0 ? expensesBehind(owedToMe, netCents) : expensesBehind(iOwe, -netCents)
          }
          whose={netCents > 0 ? `${firstName}’s` : 'Your'}
        />
      ) : null}

      <History expenses={expenses} payments={payments} me={me.id} name={firstName} />
    </>
  );
}

/**
 * The expenses behind what's owed now (newest first, until they cover it), each with how the
 * owing person's part was worked out. Tap one for the whole receipt.
 */
function WhatItsFor({ expenses, whose }: { expenses: PairExpense[]; whose: string }) {
  if (expenses.length === 0) return null;
  return (
    <Section title="What it’s for" description="Tap an expense to see the whole receipt.">
      <View style={styles.bills}>
        {expenses.map((expense) => {
          const explained = explainShare(expense.lines, expense.owing, expense.amountCents);
          return (
            <View key={expense.id}>
              <ListRow
                title={expense.merchant}
                subtitle={[
                  formatDate(expense.expenseDate),
                  expense.totalCents !== null
                    ? `${whose} share of ${formatCents(expense.totalCents)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={<Money cents={expense.amountCents} variant="bodyMedium" />}
                onPress={() =>
                  router.push({ pathname: '/expenses/[id]', params: { id: expense.id } })
                }
                divider={explained === null}
              />
              {explained ? (
                <View style={styles.breakdown}>
                  <Breakdown explained={explained} whose={whose} />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Section>
  );
}

/** "Jeff can see their share from a private link", with a way to turn the link off. */
function PaymentLinkStatus({ name, onRevoke }: { name: string; onRevoke: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.claim}>
      <Text variant="small">
        {name} has a private link to see their share and say they paid. Anyone with the link can see
        it.
      </Text>
      {error ? <FormMessage message={error} /> : null}
      <TextButton
        label={busy ? 'Revoking…' : 'Revoke link'}
        icon="slash"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          setError(null);
          void onRevoke().catch((e: Error) => {
            setError(e.message);
            setBusy(false);
          });
        }}
      />
    </View>
  );
}

/** "Something looks wrong", sent from the payment page. */
function ProblemNote({
  name,
  message,
  createdAt,
  onDismiss,
}: {
  name: string;
  message: string;
  createdAt: string;
  onDismiss: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.claim}>
      <FormMessage
        message={`${name} says something looks wrong (${formatDate(createdAt.slice(0, 10))}): “${message}”`}
      />
      {error ? <FormMessage message={error} /> : null}
      <TextButton
        label="Dismiss"
        icon="check"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void onDismiss().catch((e: Error) => {
            setError(e.message);
            setBusy(false);
          });
        }}
      />
    </View>
  );
}

/** "How should we reach Jeff?": a phone number to text the request to, or another app. */
function PhoneForRequest({
  name,
  onSave,
  onShare,
  onCancel,
}: {
  name: string;
  onSave: (phone: string) => Promise<void>;
  onShare: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = normalizePhone(text);
    if (!parsed.ok || !parsed.phone) {
      setError(parsed.ok ? `Enter ${name}’s phone number.` : parsed.error);
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.phone);
    } catch (e) {
      setError(friendlyError(e as Error));
      setSaving(false);
    }
  }

  return (
    <View style={styles.claim}>
      <Text variant="sectionHeading">How should we reach {name}?</Text>
      <TextField
        label={`${name}’s phone number`}
        value={text}
        onChangeText={(next) => {
          setText(next);
          setError(null);
        }}
        error={error}
        hint="Saved to them in this group, so you won’t be asked again."
        placeholder="(608) 555-1234"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoFocus
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Share another way" variant="secondary" onPress={onShare} />
        </View>
        <View style={styles.flex}>
          <Button label="Save & text" onPress={() => void save()} loading={saving} />
        </View>
      </View>
      <TextButton label="Cancel" onPress={onCancel} />
    </View>
  );
}

/** For someone without the app here: invite their Spendly account, or see the pending invite. */
function InviteToSpendly({ person, onChanged }: { person: Person; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useUsernameCheck(username, 'find');

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpen(false);
      setUsername('');
      onChanged();
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setBusy(false);
    }
  }

  if (person.invite) {
    const invite = person.invite;
    return (
      <View style={styles.claim}>
        <Text variant="small">
          Invited{invite.username ? ` @${invite.username}` : ''} · waiting for them to accept
        </Text>
        {error ? <FormMessage message={error} /> : null}
        <TextButton
          label="Cancel invite"
          icon="x"
          onPress={() => void run(() => cancelInvite(invite.id))}
          disabled={busy}
        />
      </View>
    );
  }
  if (!open) {
    return <TextButton label="Invite to Spendly" icon="user-plus" onPress={() => setOpen(true)} />;
  }
  return (
    <View style={styles.claim}>
      <UsernameField
        label={`${person.displayName}’s Spendly username`}
        value={username}
        onChangeText={(text) => {
          setUsername(text);
          setError(null);
        }}
        check={check}
        hint="They’ll get an invite, and once they accept, see their share in their app."
      />
      {error ? <FormMessage message={error} /> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
        </View>
        <View style={styles.flex}>
          <Button
            label="Invite"
            onPress={() => {
              if (check.status === 'found') {
                const userId = check.user.userId;
                void run(() => inviteToGroup(person.id, userId));
              }
            }}
            disabled={check.status !== 'found'}
            loading={busy}
          />
        </View>
      </View>
    </View>
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
  bills: {
    gap: space.sm,
  },
  breakdown: {
    paddingLeft: space.lg,
    borderLeftWidth: sizes.hairline,
    borderLeftColor: colors.divider,
  },
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
