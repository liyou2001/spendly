import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  FormMessage,
  IconButton,
  KeyBlock,
  ListRow,
  Loadable,
  Screen,
  Section,
  Text,
  TextButton,
  TextField,
} from '@/components';
import {
  addEmail,
  dismissForwardingCode,
  fetchForwardingCodes,
  fetchMyEmails,
  friendlyError,
  removeEmail,
  verifyEmail,
} from '@/lib/data';
import { useLoad } from '@/lib/useLoad';
import { space } from '@/theme';

/** The one address everyone forwards receipts to (EXPO_PUBLIC_RECEIPTS_EMAIL). */
const RECEIPTS_EMAIL = process.env.EXPO_PUBLIC_RECEIPTS_EMAIL ?? '';

async function fetchSettings() {
  const [emails, codes] = await Promise.all([fetchMyEmails(), fetchForwardingCodes()]);
  return { emails, codes };
}

export default function ForwardReceipts() {
  const settings = useLoad(useCallback(() => fetchSettings(), []));
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Addresses whose code couldn't be emailed.
  const [unsent, setUnsent] = useState<string[]>([]);

  async function act(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      settings.reload();
    } catch (e) {
      setError(friendlyError(e as Error));
    }
  }

  function noteSent(email: string, sent: boolean) {
    setUnsent((prev) => (sent ? prev.filter((e) => e !== email) : [...new Set([...prev, email])]));
  }

  async function copy(text: string) {
    await Clipboard.setStringAsync(text);
    setCopied(text);
  }

  return (
    <Screen title="Forward receipts" onBack={() => router.back()}>
      <KeyBlock>
        <Text variant="sectionHeading">Forward receipts to</Text>
        {RECEIPTS_EMAIL ? (
          <>
            <Text variant="bodyMedium" selectable>
              {RECEIPTS_EMAIL}
            </Text>
            <TextButton
              label={copied === RECEIPTS_EMAIL ? 'Copied' : 'Copy address'}
              icon={copied === RECEIPTS_EMAIL ? 'check' : 'copy'}
              onPress={() => void copy(RECEIPTS_EMAIL)}
            />
          </>
        ) : (
          <Text variant="body">Not set up yet (EXPO_PUBLIC_RECEIPTS_EMAIL).</Text>
        )}
        <Text variant="small">
          Forward an order or receipt email from one of your addresses below. It shows up under
          Needs you on Home, ready to split.
        </Text>
      </KeyBlock>

      <Loadable load={settings} errorMessage="Couldn’t load your addresses.">
        {({ emails, codes }) => (
          <>
            {codes.length > 0 ? (
              <Section
                title="Gmail forwarding code"
                description="Enter this in Gmail’s forwarding settings to finish setting it up."
              >
                {codes.map((code) => (
                  <View key={code.id} style={styles.row}>
                    <Text variant="bodyMedium" selectable style={styles.flex}>
                      {code.code}
                    </Text>
                    <TextButton
                      label={copied === code.code ? 'Copied' : 'Copy'}
                      icon="copy"
                      onPress={() => void copy(code.code)}
                    />
                    <IconButton
                      icon="x"
                      label="Done with this code"
                      onPress={() => void act(() => dismissForwardingCode(code.id))}
                    />
                  </View>
                ))}
              </Section>
            ) : null}

            <Section
              title="Your addresses"
              description="Receipts forwarded from these are yours. Each address belongs to one account."
            >
              <View>
                {emails.map((email, index) =>
                  email.verified ? (
                    <ListRow
                      key={email.email}
                      title={email.email}
                      {...(email.isSignIn ? { subtitle: 'You sign in with this' } : {})}
                      trailing={
                        email.isSignIn ? undefined : (
                          <IconButton
                            icon="trash-2"
                            label={`Remove ${email.email}`}
                            onPress={() => void act(() => removeEmail(email.email))}
                          />
                        )
                      }
                      divider={index < emails.length - 1}
                    />
                  ) : (
                    <CodeEntry
                      key={email.email}
                      email={email.email}
                      sent={!unsent.includes(email.email)}
                      onSent={(sent) => noteSent(email.email, sent)}
                      onDone={settings.reload}
                    />
                  ),
                )}
              </View>
              {error ? <FormMessage message={error} /> : null}
              <AddAddress
                onAdded={(email, sent) => {
                  noteSent(email, sent);
                  settings.reload();
                }}
              />
            </Section>

            <Section title="Forwarding automatically">
              <Text variant="small">
                In Gmail, make a filter for your receipts (for example, from
                auto-confirm@amazon.com) that forwards to the address above. Gmail sends a
                confirmation code first; it appears on this screen.
              </Text>
            </Section>
          </>
        )}
      </Loadable>
    </Screen>
  );
}

/** "Add an address": the address, then the code emailed to it. */
function AddAddress({ onAdded }: { onAdded: (email: string, sent: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return <TextButton label="Add an address" icon="plus" onPress={() => setOpen(true)} />;
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const sent = await addEmail(email);
      setOpen(false);
      setEmail('');
      onAdded(email.trim().toLowerCase(), sent);
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        label="Email address"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setError(null);
        }}
        placeholder="you@school.edu"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        error={error}
        hint="We’ll email it a 6-digit code."
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
        </View>
        <View style={styles.flex}>
          <Button
            label="Send code"
            onPress={() => void send()}
            loading={busy}
            disabled={!email.trim()}
          />
        </View>
      </View>
    </View>
  );
}

/** An address waiting for its code. */
function CodeEntry({
  email,
  sent,
  onSent,
  onDone,
}: {
  email: string;
  /** Whether the last code was emailed. */
  sent: boolean;
  onSent: (sent: boolean) => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        label={`Code sent to ${email}`}
        value={code}
        onChangeText={(text) => {
          setCode(text);
          setError(null);
        }}
        placeholder="123456"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        error={error}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button
            label={resent ? 'Sent again' : 'Send again'}
            variant="secondary"
            onPress={() =>
              void run(() =>
                addEmail(email).then((ok) => {
                  setResent(true);
                  onSent(ok);
                }),
              )
            }
            disabled={busy}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label="Verify"
            onPress={() => void run(() => verifyEmail(email, code).then(onDone))}
            loading={busy}
            disabled={code.trim().length !== 6}
          />
        </View>
      </View>
      <TextButton
        label="Remove"
        icon="x"
        onPress={() => void run(() => removeEmail(email).then(onDone))}
      />
      {error ? null : (
        <FormMessage
          message={
            sent
              ? `Check ${email} for a code from Spendly.`
              : 'Couldn’t email a code: sending email isn’t set up. Developing locally? It’s in the functions log.'
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
  form: {
    gap: space.md,
    paddingVertical: space.md,
  },
});
