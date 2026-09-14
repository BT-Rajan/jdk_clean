import { Alert as RNAlert, Platform } from 'react-native';

/**
 * react-native-web's Alert.alert() is a complete no-op -- see
 * node_modules/react-native-web/src/exports/Alert/index.js, it's
 * `static alert() {}`, full stop. It never shows anything AND never
 * invokes a button's onPress. Anything that shows a plain heads-up
 * (no callback riding on it) just silently shows nothing on web/PWA;
 * anything that `await`s a Promise resolved from a button's onPress
 * (the "confirm, then do the thing" pattern) hangs forever on web/PWA,
 * since that resolve() is never reached -- e.g. Quick Quote's material-
 * conflict confirmation spinning forever instead of ever proceeding.
 *
 * These two helpers are the cross-platform substitutes: a real
 * window.alert/window.confirm on web, the themed native Alert
 * everywhere else.
 */

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  RNAlert.alert(title, message);
}

export function confirm(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string,
  options: { destructive?: boolean } = {},
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    RNAlert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: options.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
