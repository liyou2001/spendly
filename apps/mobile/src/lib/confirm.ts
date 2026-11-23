import { Alert, Platform } from 'react-native';

/**
 * Asks before doing something that can't be undone, then does it. On the web this is the
 * browser's own confirm box: react-native-web's Alert.alert does nothing, so a button that only
 * opens an alert never acts there.
 */
export function confirmAction(options: {
  title: string;
  message: string;
  /** The button that goes ahead, e.g. "Void expense". */
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  const { title, message, confirmLabel, onConfirm } = options;
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
