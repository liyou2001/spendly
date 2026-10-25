import { router, type Href } from 'expo-router';

/**
 * Back to the previous screen, or to `fallback` when there isn't one: on the web, a refresh or
 * a link straight to a screen leaves no history to go back to.
 */
export function goBack(fallback: Href = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
