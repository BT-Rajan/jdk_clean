import { StyleSheet, View, ViewProps } from 'react-native';
import { glass, radii } from '../theme';

interface GlassCardProps extends ViewProps {
  strong?: boolean;
}

/** Approximates the web app's glass-panel / glass-panel-strong utility
 * classes (there's no backdrop-filter in React Native, so this is a
 * translucent-fill + border stand-in rather than a true blur). */
export function GlassCard({ strong = false, style, children, ...props }: GlassCardProps) {
  return (
    <View style={[styles.base, strong ? glass.panelStrong : glass.panel, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii['2xl'],
    padding: 18,
  },
});
