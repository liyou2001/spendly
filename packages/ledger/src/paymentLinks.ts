// Links that open Venmo, PayPal or Cash App with the amount filled in. There's no payment API:
// the person pays in their own app.
import { formatAmount } from './cents';
import type { Cents } from './types';

/** Someone's usernames in payment apps; null where they haven't added one. */
export interface PaymentHandles {
  venmo: string | null;
  paypal: string | null;
  cashtag: string | null;
}

export interface PaymentAppLink {
  app: 'venmo' | 'paypal' | 'cashapp';
  /** "Venmo", "PayPal", "Cash App". */
  label: string;
  url: string;
}

/**
 * A link for each app the person paid can take, Venmo first, then PayPal, then Cash App. The
 * note goes only to Venmo (the others don't take one), so keep it vague: it can show in feeds.
 */
export function paymentAppLinks(
  handles: PaymentHandles,
  amountCents: Cents,
  note: string,
): PaymentAppLink[] {
  const amount = formatAmount(amountCents);
  const links: PaymentAppLink[] = [];
  if (handles.venmo) {
    const params = `txn=pay&amount=${amount}&note=${encodeURIComponent(note)}&audience=private`;
    links.push({
      app: 'venmo',
      label: 'Venmo',
      url: `https://venmo.com/${encodeURIComponent(handles.venmo)}?${params}`,
    });
  }
  if (handles.paypal) {
    links.push({
      app: 'paypal',
      label: 'PayPal',
      url: `https://paypal.me/${encodeURIComponent(handles.paypal)}/${amount}USD`,
    });
  }
  if (handles.cashtag) {
    const tag = handles.cashtag.replace(/^\$/, '');
    links.push({
      app: 'cashapp',
      label: 'Cash App',
      url: `https://cash.app/$${encodeURIComponent(tag)}/${amount}`,
    });
  }
  return links;
}
