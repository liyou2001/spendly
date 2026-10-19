import { localSupabaseUrl } from './devHost';

/** The payment page's dev server port (apps/pay, `npm run pay`). */
const LOCAL_PAY_PORT = 5173;

/**
 * The private payment page link for a token: EXPO_PUBLIC_PAY_PAGE_URL when set (deployed), else the
 * page's dev server on the computer running Expo. The token goes in the #fragment, which
 * browsers never send to the server hosting the page. null if there's no page to link to.
 */
export function payPageUrl(
  token: string,
  configured: string | undefined,
  hostUri: string | undefined,
): string | null {
  const base = configured?.replace(/\/$/, '') || localSupabaseUrl(hostUri, LOCAL_PAY_PORT);
  return base ? `${base}/#${token}` : null;
}
