// What happens to a forwarded email once it's parsed and its sender checked, with the database,
// the model, pushes and replies passed in so every outcome can be tested.
import {
  fromIsVerified,
  gmailForwardingCode,
  pickContent,
  sentByFrom,
  verifiedSenders,
  type InboundEmail,
} from '../_shared/inbound.ts';
import type { PushMessage } from '../_shared/push.ts';
import type { ReceiptReader } from '../_shared/reader.ts';
import { extractReceipt, type Attempt, type Outcome, type Receipt } from '../_shared/receipt.ts';

export interface InboundDeps {
  /** Updates this email's inbound_emails row. */
  update(fields: Record<string, unknown>): Promise<void>;
  /** Whose verified address is first among these, if anyone's. */
  findUser(addresses: string[]): Promise<string | null>;
  saveForwardingCode(userId: string, code: string): Promise<void>;
  scansThisMonth(userId: string): Promise<number>;
  categories(userId: string): Promise<string[]>;
  recordAttempt(userId: string, attempt: Attempt): Promise<void>;
  isDuplicate(userId: string, receipt: Receipt): Promise<boolean>;
  /** Saves the draft under Needs you and returns its id. */
  saveDraft(userId: string, outcome: Extract<Outcome, { receipt: Receipt }>): Promise<string>;
  push(userId: string, message: PushMessage): Promise<void>;
  /** The "add this address" reply; it decides itself about robots and how often. */
  replyToUnknownSender(email: InboundEmail): Promise<void>;
  reader: ReceiptReader | null;
  monthlyLimit: number;
  receiptsAddress: string | undefined;
}

export async function processEmail(email: InboundEmail, deps: InboundDeps): Promise<void> {
  try {
    await deps.update({ status: 'processing' });

    // Gmail asking to confirm forwarding, if it really came from Google: show the code to
    // whoever asked.
    const forwarding = fromIsVerified(email) ? gmailForwardingCode(email) : null;
    if (forwarding) {
      const userId = await deps.findUser([forwarding.requester]);
      if (!userId) return await deps.update({ status: 'unknown_sender' });
      await deps.saveForwardingCode(userId, forwarding.code);
      await deps.update({ status: 'forwarding_code', user_id: userId });
      await deps.push(userId, {
        title: 'Gmail forwarding code',
        body: `Enter ${forwarding.code} in Gmail to finish setting up forwarding.`,
        url: '/settings/emails',
      });
      return;
    }

    const userId = await deps.findUser(verifiedSenders(email, deps.receiptsAddress));
    if (!userId) {
      await deps.update({ status: 'unknown_sender' });
      // Only to a sender we know is real and who sent it themselves: never to a forged From
      // (we'd email strangers) or to the store whose email a Gmail filter passed on.
      if (sentByFrom(email)) await deps.replyToUnknownSender(email);
      return;
    }
    await deps.update({ user_id: userId });

    if ((await deps.scansThisMonth(userId)) >= deps.monthlyLimit) {
      return await deps.update({ status: 'failed', error: 'Monthly limit reached' });
    }
    const content = pickContent(email);
    if (!content) return await deps.update({ status: 'failed', error: 'Nothing to read' });
    const reader = deps.reader;
    if (!reader) return await deps.update({ status: 'failed', error: 'No receipt reader set up' });

    const categories = await deps.categories(userId);
    const outcome = await extractReceipt(
      reader.models,
      (model) => reader.ask(model, content, categories),
      (attempt) => deps.recordAttempt(userId, attempt),
    );
    if (outcome.status !== 'ok' && outcome.status !== 'mismatch') {
      return await deps.update({
        status: 'failed',
        error: outcome.status === 'unreadable' ? outcome.problem : 'Couldn’t read it',
      });
    }
    if (await deps.isDuplicate(userId, outcome.receipt)) {
      return await deps.update({ status: 'duplicate' });
    }

    const draftId = await deps.saveDraft(userId, outcome);
    await deps.update({ status: 'drafted' });
    await deps.push(userId, {
      title: `${outcome.receipt.merchant ?? 'Your'} receipt is ready to split`,
      body: 'Check it, choose who each item is for, and save.',
      url: `/add-expense?draft=${draftId}`,
    });
  } catch (e) {
    console.error('Couldn’t read the forwarded email', e);
    await deps.update({ status: 'failed', error: String(e).slice(0, 500) });
  }
}
