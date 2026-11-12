import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, Screen, Text, TextField } from '@/components';
import { goBack } from '@/lib/navigation';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

// Matches otp_length in supabase/config.toml (and the hosted project's setting).
const CODE_LENGTH = 6;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How the code is sent. Either one creates an account the first time. */
type Via = 'email' | 'phone';

type Step = { name: 'start' } | { name: 'code'; via: Via; to: string };

const WORDS = {
  email: { message: 'email', other: 'Use a different email' },
  phone: { message: 'text', other: 'Use a different number' },
} as const;

export default function SignIn() {
  const [step, setStep] = useState<Step>({ name: 'start' });
  const [via, setVia] = useState<Via>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(how: Via, to: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    // Creates the account on first sign-in; the signup trigger adds the profile,
    // Personal group and categories.
    const { error } = await supabase.auth.signInWithOtp(
      how === 'email'
        ? { email: to, options: { shouldCreateUser: true } }
        : { phone: to, options: { shouldCreateUser: true } },
    );
    setBusy(false);
    if (error) {
      setError(
        how === 'phone'
          ? 'We couldn’t text that number. Check it, or sign in with email instead.'
          : error.message,
      );
      return false;
    }
    return true;
  }

  async function submitStart() {
    let to: string;
    if (via === 'email') {
      to = email.trim().toLowerCase();
      if (!EMAIL.test(to)) {
        setError('Enter an email address like you@example.com.');
        return;
      }
    } else {
      const number = normalizePhone(phone);
      if (!number.ok || !number.phone) {
        setError(number.ok ? 'Enter your phone number.' : number.error);
        return;
      }
      to = number.phone;
    }
    if (await sendCode(via, to)) {
      setCode('');
      setStep({ name: 'code', via, to });
    }
  }

  async function submitCode(token: string, how: Via, to: string) {
    if (token.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the ${WORDS[how].message}.`);
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp(
      how === 'email' ? { email: to, token, type: 'email' } : { phone: to, token, type: 'sms' },
    );
    setBusy(false);
    // On success the session listener swaps this screen for the tabs.
    if (error) setError("That code didn't work. Check it, or send a new one.");
  }

  function onCodeChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    // Submit as soon as the whole code is in, including when it's autofilled from the message.
    if (step.name === 'code' && digits.length === CODE_LENGTH && !busy) {
      void submitCode(digits, step.via, step.to);
    }
  }

  function choose(next: Via) {
    setVia(next);
    setError(null);
  }

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        // On the web, back to the landing page; the app starts here.
        {...(Platform.OS === 'web' ? { onBack: () => goBack('/landing') } : {})}
      >
        <View style={styles.intro}>
          <Text variant="screenTitle" accessibilityRole="header">
            Spendly
          </Text>
          <Text variant="small">Budgeting that gets shared money right.</Text>
        </View>

        {step.name === 'start' ? (
          <View style={styles.form}>
            <View style={styles.choices}>
              <Chip
                label="Email"
                icon="mail"
                selected={via === 'email'}
                onPress={() => choose('email')}
                disabled={busy}
              />
              <Chip
                label="Phone"
                icon="smartphone"
                selected={via === 'phone'}
                onPress={() => choose('phone')}
                disabled={busy}
              />
            </View>
            {via === 'email' ? (
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={() => void submitStart()}
                hint="We'll email you a code to sign in. No password needed."
                error={error}
                editable={!busy}
              />
            ) : (
              <TextField
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                placeholder="(608) 555-0123"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={() => void submitStart()}
                hint="We'll text you a code to sign in. Msg and data rates may apply."
                error={error}
                editable={!busy}
              />
            )}
            <Button
              label={via === 'email' ? 'Email me a code' : 'Text me a code'}
              onPress={() => void submitStart()}
              loading={busy}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <Text variant="body">
              We sent a {CODE_LENGTH}-digit code to{' '}
              <Text variant="bodyMedium">
                {step.via === 'phone' ? formatPhone(step.to) : step.to}
              </Text>
              .
            </Text>
            <TextField
              label="Code"
              value={code}
              onChangeText={onCodeChange}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void submitCode(code, step.via, step.to)}
              error={error}
              editable={!busy}
            />
            <Button
              label="Sign in"
              onPress={() => void submitCode(code, step.via, step.to)}
              loading={busy}
            />
            <Button
              label="Send a new code"
              variant="secondary"
              disabled={busy}
              onPress={() =>
                void sendCode(step.via, step.to).then((sent) => {
                  if (sent) setNotice(`New code sent. Use the newest ${WORDS[step.via].message}.`);
                })
              }
            />
            {notice ? <Text variant="small">{notice}</Text> : null}
            <Pressable
              onPress={() => {
                setError(null);
                setNotice(null);
                setStep({ name: 'start' });
              }}
              accessibilityRole="button"
              hitSlop={space.md}
              style={styles.link}
            >
              <Text variant="small" style={styles.linkText}>
                {WORDS[step.via].other}
              </Text>
            </Pressable>
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.background,
  },
  intro: {
    marginTop: space.section * 2,
    gap: space.xs,
  },
  form: {
    gap: space.lg,
  },
  choices: {
    flexDirection: 'row',
    gap: space.sm,
  },
  link: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    color: colors.ink,
    textDecorationLine: 'underline',
  },
});
