import { useState } from 'react';

import { Button, FormMessage, Screen, Text, TextField } from '@/components';
import { friendlyError, sendFeedback } from '@/lib/data';
import { goBack } from '@/lib/navigation';

export default function Feedback() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  function edit(text: string) {
    setMessage(text);
    setError(null);
    setJustSent(false);
  }

  async function send() {
    setSending(true);
    try {
      await sendFeedback(message);
      setMessage('');
      setJustSent(true);
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen title="Send feedback" onBack={() => goBack('/me')}>
      <Text variant="body">
        Something confusing, broken or missing? Tell us in your own words. A sentence is plenty.
      </Text>
      <TextField
        label="Your feedback"
        value={message}
        onChangeText={edit}
        placeholder="e.g. I couldn’t figure out how to split just the paper towels"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        maxLength={2000}
      />
      {error ? <FormMessage message={error} /> : null}
      {justSent ? <Text variant="small">Thanks! We got it.</Text> : null}
      <Button
        label="Send"
        onPress={() => void send()}
        loading={sending}
        disabled={message.trim() === ''}
      />
    </Screen>
  );
}
