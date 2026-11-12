import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, FormMessage, Screen, Text, TextField } from '@/components';
import { readAuthRedirect } from '@/lib/authRedirect';
import { googleSignInEnabled, signInWithGoogle } from '@/lib/googleSignIn';
import { goBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

// Matches otp_length in supabase/config.toml (and the hosted project's setting).
const CODE_LENGTH = 6;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = { name: 'email' } | { name: 'code'; email: string };

export default function SignIn() {
  const [step, setStep] = useState<Step>({ name: 'email' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // On the web, Google comes back to this page. A session in the URL signs in on its own; an
  // error (e.g. the email is another account's receipt address) starts out shown here.
  const [error, setError] = useState<string | null>(() => {
    if (Platform.OS !== 'web') return null;
    const outcome = readAuthRedirect(window.location.href);
    return outcome?.kind === 'error' ? outcome.message : null;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Google is offered (and first) only once the project says it's switched on, so it's never a
  // dead button; until then it's email alone.
  const [googleOn, setGoogleOn] = useState(false);
  const [chosen, setChosen] = useState<'google' | 'email'>('google');
  const tab = googleOn ? chosen : 'email';
  const [googleBusy, setGoogleBusy] = useState(false);

  function choose(next: 'google' | 'email') {
    setChosen(next);
    setError(null);
  }

  useEffect(() => {
    void googleSignInEnabled().then(setGoogleOn);
  }, []);

  async function continueWithGoogle() {
    setError(null);
    setNotice(null);
    setGoogleBusy(true);
    const problem = await signInWithGoogle();
    // On success the session listener swaps this screen for the app (or the name screen).
    setGoogleBusy(false);
    if (problem) setError(problem);
  }

  async function sendCode(to: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    // Creates the account on first sign-in; the signup trigger adds the profile,
    // Personal group and categories.
    const { error } = await supabase.auth.signInWithOtp({
      email: to,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }

  async function submitEmail() {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) {
      setError('Enter an email address like you@example.com.');
      return;
    }
    if (await sendCode(address)) {
      setCode('');
      setStep({ name: 'code', email: address });
    }
  }

  async function submitCode(token: string, to: string) {
    if (token.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: to, token, type: 'email' });
    setBusy(false);
    // On success the session listener swaps this screen for the tabs.
    if (error) setError("That code didn't work. Check it, or send a new one.");
  }

  function onCodeChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    // Submit as soon as the whole code is in, including when it's autofilled from the email.
    if (step.name === 'code' && digits.length === CODE_LENGTH && !busy) {
      void submitCode(digits, step.email);
    }
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
        <View style={styles.column}>
          <View style={styles.intro}>
            <Text variant="screenTitle" accessibilityRole="header">
              Spendly
            </Text>
            <Text variant="small">Budgeting that gets shared money right.</Text>
          </View>

          {step.name === 'email' ? (
            <View style={styles.form}>
              {googleOn ? (
                <View style={styles.tabs}>
                  <Chip
                    label="Google"
                    selected={tab === 'google'}
                    onPress={() => choose('google')}
                    disabled={busy || googleBusy}
                  />
                  <Chip
                    label="Email"
                    icon="mail"
                    selected={tab === 'email'}
                    onPress={() => choose('email')}
                    disabled={busy || googleBusy}
                  />
                </View>
              ) : null}
              {tab === 'google' ? (
                <View style={styles.google}>
                  <Button
                    label="Continue with Google"
                    variant="secondary"
                    leading={
                      <Image
                        source={require('../../assets/google-g.png')}
                        style={styles.googleLogo}
                        accessibilityIgnoresInvertColors
                      />
                    }
                    onPress={() => void continueWithGoogle()}
                    loading={googleBusy}
                  />
                  {error ? <FormMessage message={error} /> : null}
                  <Text variant="small">
                    Already have an account? Use the same email you signed up with.
                  </Text>
                </View>
              ) : (
                <>
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
                    onSubmitEditing={() => void submitEmail()}
                    hint="We'll email you a code to sign in. No password needed."
                    error={error}
                    editable={!busy}
                  />
                  <Button
                    label="Email me a code"
                    onPress={() => void submitEmail()}
                    loading={busy}
                  />
                </>
              )}
            </View>
          ) : (
            <View style={styles.form}>
              <Text variant="body">
                We sent a {CODE_LENGTH}-digit code to <Text variant="bodyMedium">{step.email}</Text>
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
                onSubmitEditing={() => void submitCode(code, step.email)}
                error={error}
                editable={!busy}
              />
              <Button
                label="Sign in"
                onPress={() => void submitCode(code, step.email)}
                loading={busy}
              />
              <Button
                label="Send a new code"
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  void sendCode(step.email).then((sent) => {
                    if (sent) setNotice('New code sent. Use the newest email.');
                  })
                }
              />
              {notice ? <Text variant="small">{notice}</Text> : null}
              <Pressable
                onPress={() => {
                  setError(null);
                  setNotice(null);
                  setStep({ name: 'email' });
                }}
                accessibilityRole="button"
                hitSlop={space.md}
                style={styles.link}
              >
                <Text variant="small" style={styles.linkText}>
                  Use a different email
                </Text>
              </Pressable>
            </View>
          )}
        </View>
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
  // A phone's width, even in a wide browser window.
  column: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: space.section,
  },
  tabs: {
    flexDirection: 'row',
    gap: space.sm,
  },
  google: {
    gap: space.md,
  },
  googleLogo: {
    width: 18,
    height: 18,
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
